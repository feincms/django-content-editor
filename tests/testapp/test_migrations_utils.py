import pytest

from content_editor.migrations_utils import compute_depths
from testapp.models import Article, CloseSection, Download, RichText, Section


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
        Article,
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
