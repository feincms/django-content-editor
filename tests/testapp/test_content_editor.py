import pytest
from django.contrib.auth.models import User
from django.core.exceptions import ImproperlyConfigured
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from pytest_django.asserts import assertContains

from content_editor.contents import contents_for_item
from content_editor.models import Region
from testapp.models import Article, Download, RichText


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
