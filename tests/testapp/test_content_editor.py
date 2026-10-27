import pytest
from django import forms
from django.contrib import admin
from django.contrib.auth.models import User
from django.core.exceptions import ImproperlyConfigured
from django.db import connection
from django.http import QueryDict
from django.test import RequestFactory
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from pytest_django.asserts import assertContains, assertNotContains

from content_editor.admin import CloneForm, ContentEditorInline
from content_editor.contents import contents_for_item
from content_editor.models import Region
from testapp.models import (
    Article,
    Download,
    Page,
    PageContainer,
    PageText,
    RichText,
    Thing,
)


@pytest.fixture
def user():
    u = User.objects.create(
        username="test", is_active=True, is_staff=True, is_superuser=True
    )
    u.set_password("test")
    u.save()
    return u


@pytest.fixture
def client(client, user):
    client.login(username="test", password="test")
    return client


@pytest.mark.django_db
def test_stuff(client):
    article = Article.objects.create(title="Test")
    richtext = article.testapp_richtext_set.create(
        text="<p>bla</p>", region="main", ordering=10
    )
    article.testapp_download_set.create(file="bla.pdf", region="main", ordering=20)

    with CaptureQueriesContext(connection) as ctx:
        contents = contents_for_item(article, plugins=[RichText, Download])
        assert len(ctx.captured_queries) == 2  # Two content types

        assert contents.main[0] == richtext
        assert contents.main[0].parent == article

    assert len(contents.main) == 2
    assert len(contents.sidebar) == 0
    assert len(contents.bla) == 0  # No AttributeError

    response = client.get(article.get_absolute_url())
    assertContains(response, "<h1>Test</h1>")
    assertContains(response, "<p>bla</p>")

    # Test for Contents.__iter__
    contents = contents_for_item(article, plugins=[RichText, Download])
    assert not contents._sorted
    assert len(list(contents)) == 2
    assert contents._sorted
    assert len(list(contents)) == 2

    # Contents.__len__ also means that a Contents instance may be falsy
    assert len(contents) == 2
    assert contents
    assert not contents_for_item(article, [])

    # Regions may be limited
    contents = contents_for_item(
        article,
        plugins=[RichText, Download],
        regions=[Region(key="other", title="other")],
    )
    assert list(contents) == []


@pytest.mark.django_db
def test_admin(client):
    response = client.get(reverse("admin:testapp_article_add"))

    assertContains(
        response, '<script id="content-editor-context" type="application/json">'
    )
    assertContains(response, 'class="richtext"', 1)
    assertContains(
        response,
        "&quot;prefix&quot;: &quot;testapp_richtext_set&quot;",
    )

    # The editor loads as ES modules through an import map.
    assertContains(response, 'type="importmap"')
    assertContains(response, "content-editor/context")
    assertContains(response, 'src="/static/content_editor/index.js" type="module"')

    # The pre-refactor monolith is no longer referenced.
    assertNotContains(response, "content_editor/content_editor.js")

    article = Article.objects.create(title="Test")

    response = client.get(reverse("admin:testapp_article_change", args=(article.pk,)))
    assertContains(response, 'value="Test"', 1)


def test_invalid_region_objects():
    with pytest.raises(ImproperlyConfigured):
        Region(key="regions", title="regions")
    with pytest.raises(ImproperlyConfigured):
        Region(key="_private", title="private")
    with pytest.raises(ImproperlyConfigured):
        Region(key="content-main", title="content")
    with pytest.raises(TypeError):
        Region(key="valid")  # title is missing


def test_hashable_types():
    _mapping = {Region(key="hello", title="Hello"): Region(key="world", title="World")}


@pytest.mark.parametrize(
    "options",
    [
        {"fieldsets": [("Text", {"fields": ["text"]})]},
        {"fields": ["text"]},
        {},
    ],
)
def test_structural_fields_are_added(options):
    """region, ordering and depth are added to the inline's form if missing,
    as hidden fields."""
    inline_class = type(
        "RichTextInline", (ContentEditorInline,), {"model": RichText, **options}
    )
    inline = inline_class(Article, admin.AdminSite())
    request = RequestFactory().get("/")
    request.user = User(is_active=True, is_superuser=True)

    fieldsets = inline.get_fieldsets(request)
    assert fieldsets[-1][1]["fields"][-3:] == ["region", "ordering", "depth"]
    form = inline.get_formset(request).form
    for field in ("region", "ordering", "depth"):
        assert isinstance(form.base_fields[field].widget, forms.HiddenInput)


def test_depth_is_only_added_if_it_exists():
    inline = ContentEditorInline.create(model=Thing, fk_name="article")(
        Article, admin.AdminSite()
    )
    request = RequestFactory().get("/")
    request.user = User(is_active=True, is_superuser=True)
    assert inline.get_fields(request)[-2:] == ["region", "ordering"]


@pytest.mark.django_db
def test_container_in_context(client):
    response = client.get(reverse("admin:testapp_page_add"))
    assertContains(response, '"container": true', 1)
    assertContains(response, '"container": false', 1)


def plugin_post_data(prefix, rows):
    data = {
        f"{prefix}-TOTAL_FORMS": len(rows),
        f"{prefix}-INITIAL_FORMS": 0,
        f"{prefix}-MIN_NUM_FORMS": 0,
        f"{prefix}-MAX_NUM_FORMS": 1000,
    }
    for index, row in enumerate(rows):
        data |= {f"{prefix}-{index}-{key}": value for key, value in row.items()}
    return data


@pytest.mark.django_db
def test_depths_are_normalized_when_saving(client):
    response = client.post(
        reverse("admin:testapp_page_add"),
        {
            "title": "Page",
            "parent": "",
            **plugin_post_data(
                "testapp_pagecontainer_set",
                [{"region": "main", "ordering": 10, "depth": 0, "title": "S"}],
            ),
            **plugin_post_data(
                "testapp_pagetext_set",
                [
                    {"region": "main", "ordering": 20, "depth": 3, "text": "a"},
                    {"region": "main", "ordering": 30, "depth": 2, "text": "b"},
                    {"region": "main", "ordering": 40, "depth": 0, "text": "c"},
                    {"region": "sidebar", "ordering": 50, "depth": 1, "text": "d"},
                ],
            ),
        },
    )
    assert response.status_code == 302

    page = Page.objects.get()
    assert page.testapp_pagecontainer_set.get().depth == 0
    assert [
        (text.text, text.depth)
        for text in page.testapp_pagetext_set.order_by("ordering")
    ] == [("a", 1), ("b", 1), ("c", 0), ("d", 0)]


@pytest.mark.django_db
def test_depths_are_not_normalized_with_sections():
    article = Article.objects.create(title="Test")
    text = article.testapp_richtext_set.create(region="main", ordering=10, depth=2)
    request = RequestFactory().get("/")
    request.user = User(is_active=True, is_superuser=True)
    admin.site._registry[Article]._normalize_depths(request, article)
    text.refresh_from_db()
    assert text.depth == 2


@pytest.mark.django_db
def test_clone_keeps_relative_depths():
    page = Page.objects.create(title="Test")
    container = page.testapp_pagecontainer_set.create(region="main", ordering=10)
    a = page.testapp_pagetext_set.create(region="main", ordering=20, depth=1)
    inner = page.testapp_pagecontainer_set.create(region="main", ordering=30, depth=1)
    b = page.testapp_pagetext_set.create(region="main", ordering=40, depth=2)
    c = page.testapp_pagetext_set.create(region="main", ordering=50, depth=0)

    post = QueryDict(mutable=True)
    post["_clone_region"] = "sidebar"
    post["_clone_ordering"] = 100
    post["_clone_depth"] = 1
    for plugin in [container, a, inner, b, c]:
        post.appendlist("_clone", f"{plugin._meta.label_lower}:{plugin.pk}")

    form = CloneForm(post)
    assert form.is_valid(), form.errors
    assert form.process() == 5

    cloned = sorted(
        [
            *page.testapp_pagecontainer_set.filter(region="sidebar"),
            *page.testapp_pagetext_set.filter(region="sidebar"),
        ],
        key=lambda plugin: plugin.ordering,
    )
    assert [plugin.depth for plugin in cloned] == [1, 2, 2, 3, 1]

    # Without a depth, the roots end up at depth 0
    post["_clone_depth"] = ""
    post.setlist(
        "_clone", [f"testapp.pagecontainer:{inner.pk}", f"testapp.pagetext:{b.pk}"]
    )
    form = CloneForm(post)
    assert form.is_valid(), form.errors
    form.process()
    assert [
        plugin.depth
        for plugin in PageContainer.objects.filter(region="sidebar").order_by("pk")
    ] == [1, 2, 0]
    assert PageText.objects.filter(region="sidebar").order_by("pk").last().depth == 1
