import pytest

from content_editor.migrations_utils import compute_depths
from testapp.models import (
    Article,
    ArticleLink,
    CloseSection,
    Download,
    JSONPlugin,
    JSONSpacer,
    JSONText,
    Page,
    PageText,
    RichText,
    Section,
)


@pytest.mark.django_db
def test_compute_depths():
    article = Article.objects.create(title="Test")
    other = Article.objects.create(title="Other")

    def create(model, region, ordering, parent=article):
        return model.objects.create(parent=parent, region=region, ordering=ordering)

    main = [
        create(RichText, "main", 10),
        create(Section, "main", 20),
        create(RichText, "main", 30),
        create(Section, "main", 40),
        create(Download, "main", 50),
        create(CloseSection, "main", 60),
        create(RichText, "main", 70),
        create(CloseSection, "main", 80),
        create(RichText, "main", 90),
        create(Section, "main", 100),
        create(RichText, "main", 110),
    ]
    create(CloseSection, "sidebar", 10)
    sidebar = create(RichText, "sidebar", 20)
    other_text = create(RichText, "main", 10, parent=other)

    compute_depths(
        plugins=[RichText, Download],
        openers=[Section],
        closers=[CloseSection],
    )

    assert not CloseSection.objects.exists()
    depths = []
    for plugin in main:
        if isinstance(plugin, CloseSection):
            continue
        plugin.refresh_from_db()
        depths.append(plugin.depth)
    assert depths == [0, 0, 1, 1, 2, 1, 0, 0, 1]

    sidebar.refresh_from_db()
    other_text.refresh_from_db()
    assert sidebar.depth == other_text.depth == 0


@pytest.mark.django_db
def test_compute_depths_uses_parent():
    """Other foreign keys to the content model don't group the plugins."""
    article = Article.objects.create(title="Test")
    other = Article.objects.create(title="Other")
    Section.objects.create(parent=article, region="main", ordering=10)
    link = ArticleLink.objects.create(
        parent=article, region="main", ordering=20, article=other
    )

    compute_depths(plugins=[ArticleLink], openers=[Section], closers=[])

    link.refresh_from_db()
    assert link.depth == 1


@pytest.mark.django_db
def test_compute_depths_several_content_models():
    """Plugins of different content models sharing a primary key aren't
    nested into each other."""
    article = Article.objects.create(title="Test")
    page = Page.objects.create(pk=article.pk, title="Test")
    Section.objects.create(parent=article, region="main", ordering=10)
    text = PageText.objects.create(parent=page, region="main", ordering=20)

    compute_depths(plugins=[PageText], openers=[Section], closers=[])

    text.refresh_from_db()
    assert text.depth == 0


@pytest.mark.django_db
def test_compute_depths_json_plugins():
    """JSON plugin proxies share a table; openers and closers among them are
    selected using querysets."""
    article = Article.objects.create(title="Test")
    Section.objects.create(parent=article, region="main", ordering=10)
    JSONText.objects.create(
        parent=article, region="main", ordering=20, data={"text": "inside"}
    )
    JSONSpacer.objects.create(parent=article, region="main", ordering=30, data={})
    JSONText.objects.create(
        parent=article, region="main", ordering=40, data={"text": "after"}
    )

    with pytest.raises(ValueError, match="is a proxy model"):
        compute_depths(plugins=[], openers=[], closers=[JSONSpacer])
    assert JSONPlugin.objects.count() == 3

    compute_depths(
        plugins=[JSONPlugin],
        openers=[Section],
        closers=[JSONPlugin.objects.filter(type="json_spacer")],
    )
    assert list(
        JSONPlugin.objects.order_by("ordering").values_list("type", "depth")
    ) == [("json_text", 1), ("json_text", 0)]
