import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from content_editor.contents import Contents, contents_for_item
from content_editor.models import Region
from testapp.models import Article, Download, Page, PageText, RichText


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
def test_inheritance():
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


def test_invalid_content_regions():
    c = Contents([Region(key="main", title="main")])

    assert c.blub == []
    assert c["blub"] == []

    with pytest.raises(AttributeError):
        _read = c._blub
    with pytest.raises(KeyError):
        c["_blub"]
