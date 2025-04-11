import pytest
from django.contrib import admin
from django.contrib.auth.models import User
from django.core import checks
from django.core.exceptions import ImproperlyConfigured
from django.db import connection, models
from django.test.utils import CaptureQueriesContext, isolate_apps
from django.urls import reverse
from pytest_django.asserts import assertContains

from content_editor.admin import ContentEditor, ContentEditorInline
from content_editor.contents import Contents, contents_for_item
from content_editor.models import Region
from testapp.models import Article, Download, Page, PageText, RichText


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

    article = Article.objects.create(title="Test")

    response = client.get(reverse("admin:testapp_article_change", args=(article.pk,)))
    assertContains(response, 'value="Test"', 1)


@pytest.mark.django_db
def test_empty():
    article = Article.objects.create(title="Test")

    with CaptureQueriesContext(connection) as ctx:
        contents = contents_for_item(article, plugins=[RichText, Download])
        assert len(ctx.captured_queries) == 2

    assert contents.main == []

    with CaptureQueriesContext(connection) as ctx:
        contents = contents_for_item(article, plugins=[])
        assert len(ctx.captured_queries) == 0

    assert contents.main == []


@pytest.mark.django_db
def test_unknown_regions():
    article = Article.objects.create(title="Test")
    for idx, region in enumerate(("", "notexists", "main")):
        RichText.objects.create(
            parent=article, ordering=idx, region=region, text="Test"
        )

    contents = contents_for_item(article, plugins=[RichText])
    assert len(contents._unknown_region_contents) == 2


@pytest.mark.django_db
def test_inheritance(client):
    page = Page.objects.create(title="root")
    child = page.children.create(title="child 1")

    with CaptureQueriesContext(connection) as ctx:
        contents = contents_for_item(child, plugins=[PageText], inherit_from=[page])
        assert len(ctx.captured_queries) == 1
        assert contents.main == []
        assert contents.sidebar == []

    page.testapp_pagetext_set.create(region="main", ordering=10, text="page main text")
    page.testapp_pagetext_set.create(
        region="sidebar", ordering=20, text="page sidebar text"
    )

    with CaptureQueriesContext(connection) as ctx:
        contents = contents_for_item(child, plugins=[PageText], inherit_from=[page])
        assert len(ctx.captured_queries) == 1
        assert contents.main == []
        assert [c.text for c in contents.sidebar] == ["page sidebar text"]
        assert contents.sidebar[0].parent == page

    child.testapp_pagetext_set.create(
        region="sidebar", ordering=10, text="child sidebar text"
    )
    child.testapp_pagetext_set.create(
        region="main", ordering=20, text="child main text"
    )

    with CaptureQueriesContext(connection) as ctx:
        contents = contents_for_item(child, plugins=[PageText], inherit_from=[page])
        assert len(ctx.captured_queries) == 1
        assert [c.text for c in contents.main] == ["child main text"]
        assert [c.text for c in contents.sidebar] == ["child sidebar text"]
        assert contents.sidebar[0].parent == child

    response = client.get(child.get_absolute_url())
    assertContains(response, "child main text")
    assertContains(response, "child sidebar text")


@isolate_apps()
def test_model_checks():
    class Model(models.Model):
        name = models.CharField()

        def __str__(self):
            return self.name

    class ModelAdmin(ContentEditor):
        model = Model
        inlines = []

    assert ModelAdmin(Model, admin.AdminSite()).check() == [
        checks.Error(
            "ContentEditor models require a non-empty 'regions' attribute or property.",
            obj=ModelAdmin,
            id="content_editor.E002",
        )
    ]


def test_inline_checks():
    assert admin.ModelAdmin(Article, admin.AdminSite()).check() == []

    class RichTextInline(ContentEditorInline):
        model = RichText
        # Purposefully construct an inline with missing region
        # and ordering fields
        fieldsets = [(None, {"fields": ("text",)})]

    class InvalidRegionsStringInline(ContentEditorInline):
        model = RichText
        regions = "main"

    class InvalidRegionsCallableInline(ContentEditorInline):
        model = RichText

        def regions(self, all_regions):
            return "main"

    class ValidRegionsGeneratorInline(ContentEditorInline):
        model = RichText

        def regions(self, all_regions):
            yield "main"

    class ArticleAdmin(ContentEditor):
        model = Article
        inlines = [
            RichTextInline,
            InvalidRegionsStringInline,
            InvalidRegionsCallableInline,
            ValidRegionsGeneratorInline,
        ]

    assert ArticleAdmin(Article, admin.AdminSite()).check() == [
        checks.Error(
            "fieldsets must contain both 'region' and 'ordering'.",
            obj=RichTextInline,
            id="content_editor.E001",
        ),
        checks.Error(
            "regions must be 'None' or an iterable. Current value is 'main'.",
            obj=InvalidRegionsStringInline,
            id="content_editor.E003",
        ),
        checks.Error(
            "regions must be 'None' or an iterable. Current value is 'main'.",
            obj=InvalidRegionsCallableInline,
            id="content_editor.E003",
        ),
    ]


def test_invalid_region_objects():
    with pytest.raises(ImproperlyConfigured):
        Region(key="regions", title="regions")
    with pytest.raises(ImproperlyConfigured):
        Region(key="_private", title="private")
    with pytest.raises(ImproperlyConfigured):
        Region(key="content-main", title="content")
    with pytest.raises(TypeError):
        Region(key="valid")  # title is missing


def test_invalid_content_regions():
    c = Contents([Region(key="main", title="main")])

    assert c.blub == []
    assert c["blub"] == []

    with pytest.raises(AttributeError):
        _read = c._blub
    with pytest.raises(KeyError):
        c["_blub"]


def test_hashable_types():
    _mapping = {Region(key="hello", title="Hello"): Region(key="world", title="World")}
