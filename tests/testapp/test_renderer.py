from collections import deque

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.template import Context
from django.template.loader import render_to_string
from django.utils.html import format_html, mark_safe
from pytest_django.asserts import assertHTMLEqual

from content_editor.contents import contents_for_item
from content_editor.models import Region
from content_editor.renderer import (
    PluginNotRegisteredError,
    RegionRenderer,
    template_renderer,
)
from testapp.models import (
    Article,
    Download,
    JSONTeaser,
    JSONText,
    Page,
    PageContainer,
    PageText,
    RichText,
)


@pytest.fixture
def article():
    a = Article.objects.create(title="Test")
    RichText.objects.create(parent=a, region="main", ordering=10, text="<p>Hello</p>")
    Download.objects.create(parent=a, region="main", ordering=20, file="a.pdf")
    Download.objects.create(parent=a, region="main", ordering=30, file="b.pdf")
    RichText.objects.create(parent=a, region="main", ordering=40, text="<p>World</p>")
    return a


def template_region_renderer():
    renderer = RegionRenderer()
    renderer.register(RichText, template_renderer("renderer/richtext.html"))
    renderer.register(Download, template_renderer("renderer/download.html"))
    return renderer


@pytest.mark.django_db
def test_basic_rendering(article):
    renderer = template_region_renderer()
    expected = (
        '<div class="rt"><p>Hello</p></div> <a href="a.pdf">x</a>'
        ' <a href="b.pdf">x</a> <div class="rt"><p>World</p></div>'
    )

    regions = renderer.regions_from_item(article, timeout=1)
    assertHTMLEqual(regions.render("main", Context({"outer": "x"})), expected)

    # The result is cached
    RichText.objects.create(parent=article, region="main", ordering=50, text="!")
    regions = renderer.regions_from_item(article, timeout=1)
    assertHTMLEqual(regions.render("main", Context({"outer": "x"})), expected)
    assert [region.key for region in regions.regions] == ["main", "sidebar"]


@pytest.mark.django_db
def test_render_region_tag(article):
    renderer = template_region_renderer()
    assertHTMLEqual(
        render_to_string(
            "renderer/regions.html",
            {"regions": renderer.regions_from_item(article), "outer": "y"},
        ),
        '<div class="rt"><p>Hello</p></div> <a href="a.pdf">y</a>'
        ' <a href="b.pdf">y</a> <div class="rt"><p>World</p></div>',
    )


@pytest.mark.django_db
def test_unconfigured_exception(article):
    renderer = RegionRenderer()
    contents = contents_for_item(article, plugins=[RichText, Download])
    regions = renderer.regions_from_contents(contents)
    with pytest.raises(PluginNotRegisteredError):
        regions.render("main", None)
    with pytest.raises(PluginNotRegisteredError):
        # All regions are rendered at once
        regions.render("does_not_exist", None)
    with pytest.raises(PluginNotRegisteredError):
        renderer.marks(contents.main[0])


@pytest.mark.django_db
def test_subregions(article):
    class DownloadsRenderer(RegionRenderer):
        def handle_downloads(self, plugins, context):
            return format_html(
                '<div class="downloads">{}</div>',
                mark_safe(
                    "".join(
                        self.render_plugin(plugin, context)
                        for plugin in self.takewhile_subregion(plugins, "downloads")
                    )
                ),
            )

    renderer = DownloadsRenderer()
    renderer.register(RichText, lambda plugin, context: mark_safe(plugin.text))
    renderer.register(
        Download, lambda plugin, context: plugin.file, subregion="downloads"
    )

    regions = renderer.regions_from_item(article)
    assertHTMLEqual(
        regions.render("main", None),
        '<p>Hello</p> <div class="downloads">a.pdfb.pdf</div> <p>World</p>',
    )


@pytest.mark.django_db
def test_marks(article):
    class MarksRenderer(RegionRenderer):
        def render_region(self, *, region, contents, context):
            def _render():
                plugins = deque(contents[region.key])
                while plugins:
                    for mark in ("downloads", "stuff"):
                        if items := list(self.takewhile_mark(plugins, mark=mark)):
                            yield format_html(
                                '<div class="{}">{}</div>',
                                mark,
                                mark_safe(
                                    "".join(
                                        self.render_plugin(plugin, context)
                                        for plugin in items
                                    )
                                ),
                            )

            return mark_safe("".join(_render()))

    renderer = MarksRenderer()
    renderer.register(
        RichText,
        lambda plugin, context: mark_safe(plugin.text),
        marks={"stuff"},
    )
    renderer.register(
        Download,
        lambda plugin, context: plugin.file,
        marks=lambda plugin: {"downloads"},
    )

    regions = renderer.regions_from_item(article)
    assertHTMLEqual(
        regions.render("main", None),
        '<div class="stuff"><p>Hello</p></div><div class="downloads">a.pdfb.pdf</div><div class="stuff"><p>World</p></div>',
    )


def test_invalid_renderer():
    renderer = RegionRenderer()
    with pytest.raises(
        ImproperlyConfigured, match=r"has less than the two required arguments"
    ):
        renderer.register(RichText, lambda plugin: "")


def test_static_renderer():
    renderer = RegionRenderer()
    renderer.register(RichText, "static")
    assert renderer.render_plugin(RichText(), None) == "static"


def test_fetch():
    renderer = RegionRenderer()
    renderer.register(RichText, template_renderer("renderer/richtext.html"))
    renderer.register(
        Download, template_renderer("renderer/download.html"), fetch=False
    )

    assert renderer.plugins() == [RichText]
    assert renderer.plugins(fetch=False) == [RichText, Download]


def test_register_unregister():
    richtext_renderer = template_renderer("renderer/richtext.html")
    download_renderer = template_renderer("renderer/download.html")

    richtext_cfg = (RichText, richtext_renderer, "default", {"default"}, True)
    download_cfg = (Download, download_renderer, "default", {"default"}, True)

    renderer = RegionRenderer()
    renderer.register(RichText, richtext_renderer)
    renderer.register([Download], download_renderer)  # Register as list

    with pytest.warns(UserWarning, match="has already been registered"):
        renderer.register(Download, download_renderer)

    r2 = renderer.copy()
    r2.unregister(RichText)

    r3 = renderer.copy()
    r3.unregister(keep=[Download])

    assert renderer._plugins == {RichText: richtext_cfg, Download: download_cfg}
    assert r2._plugins == {Download: download_cfg}
    assert r3._plugins == {Download: download_cfg}

    with pytest.raises(ImproperlyConfigured):
        renderer.unregister(Download, keep=[RichText])
    with pytest.raises(ImproperlyConfigured):
        renderer.unregister()


def test_render_regions():
    renderer = RegionRenderer()
    renderer.register(RichText, lambda plugin, context: plugin.text)
    regions = [Region(key="main", title="Main"), Region(key="side", title="Side")]
    assert renderer.render_regions(
        regions=regions,
        contents={"main": [RichText(text="a"), RichText(text="b")], "side": []},
        context=None,
    ) == {"main": "ab", "side": ""}


def test_proxy_warning():
    renderer = RegionRenderer()
    with pytest.warns(UserWarning, match="is a proxy"):
        renderer.register(JSONText, "")
    renderer.register(JSONTeaser, "", fetch=False)


def container_renderer():
    renderer = RegionRenderer()
    renderer.register(PageText, lambda plugin, context: plugin.text)
    renderer.register(
        PageContainer,
        lambda plugin, context, children: f"<section>{children}</section>",
    )
    return renderer


def render_main(renderer, plugins):
    return renderer.render_region(
        region=Region(key="main", title="Main"),
        contents={"main": plugins},
        context=None,
    )


def test_containers():
    renderer = container_renderer()

    def text(text, depth=0):
        return PageText(text=text, depth=depth)

    def container(depth=0):
        return PageContainer(depth=depth)

    assert render_main(renderer, [container()]) == "<section></section>"
    assert (
        render_main(
            renderer,
            [
                text("A"),
                container(),
                text("B", 1),
                container(1),
                text("C", 2),
                text("D"),
            ],
        )
        == "A<section>B<section>C</section></section>D"
    )
    # Plugins belong to the closest preceding container with a lower depth
    assert (
        render_main(renderer, [container(), text("A", 1), text("B", 3)])
        == "<section>AB</section>"
    )
    assert render_main(renderer, [text("A"), text("B", 1)]) == "AB"

    # Rendering a container outside a region renders it without children
    assert renderer.render_plugin(container(), None) == "<section></section>"


def test_container_renderer_arguments():
    renderer = RegionRenderer()
    with pytest.raises(
        ImproperlyConfigured, match=r"has less than the three required arguments"
    ):
        renderer.register(PageContainer, lambda plugin, context: "")


@pytest.mark.django_db
def test_container_templates():
    page = Page.objects.create(title="Test")
    tabs = page.testapp_pagecontainer_set.create(region="main", ordering=10)
    page.testapp_pagetext_set.create(region="main", ordering=20, depth=1, text="A")
    page.testapp_pagecontainer_set.create(
        region="main", ordering=30, depth=1, title="Inner"
    )
    page.testapp_pagetext_set.create(region="main", ordering=40, depth=2, text="B")

    renderer = RegionRenderer()
    renderer.register(PageText, lambda plugin, context: plugin.text)
    renderer.register(
        PageContainer,
        lambda plugin, context, children: template_renderer(
            "renderer/tabs.html" if plugin == tabs else "renderer/container.html"
        )(plugin, context, children),
    )

    assertHTMLEqual(
        renderer.regions_from_item(page).render("main", Context()),
        """
        <div class="tabs">
          <h2>A</h2><div>A</div>
          <h2>Inner</h2><div><section>B</section></div>
        </div>
        """,
    )


def test_subregions_in_containers():
    class TextsRenderer(RegionRenderer):
        def handle_texts(self, plugins, context):
            texts = "".join(
                self.render_plugin(plugin, context)
                for plugin in self.takewhile_subregion(plugins, "texts")
            )
            yield f"<div>{texts}</div>"

    renderer = TextsRenderer()
    renderer.register(PageText, lambda plugin, context: plugin.text, subregion="texts")
    renderer.register(
        PageContainer,
        lambda plugin, context, children: f"<section>{children}</section>",
    )

    # Subregions never cross container boundaries
    assert (
        render_main(
            renderer,
            [
                PageContainer(),
                PageText(text="A", depth=1),
                PageText(text="B", depth=1),
                PageText(text="C"),
                PageText(text="D"),
            ],
        )
        == "<section><div>AB</div></section><div>CD</div>"
    )


def test_json_containers():
    class JSONRenderer(RegionRenderer):
        def render_siblings(self, plugins, context):
            return list(self.handle(plugins, context))

        def handle_texts(self, plugins, context):
            yield {
                "type": "texts",
                "texts": [
                    self.render_plugin(plugin, context)
                    for plugin in self.takewhile_subregion(plugins, "texts")
                ],
            }

    renderer = JSONRenderer()
    renderer.register(
        PageText,
        lambda plugin, context: {"type": "text", "text": plugin.text},
        subregion=lambda plugin: "texts" if plugin.text.islower() else "default",
    )
    renderer.register(
        PageContainer,
        lambda plugin, context, children: {
            "type": "container",
            "children": children.rendered,
            "first": children[0].rendered if children else None,
        },
    )

    assert render_main(
        renderer,
        [
            PageText(text="A"),
            PageContainer(),
            PageText(text="b", depth=1),
            PageText(text="c", depth=1),
            PageContainer(depth=1),
            PageText(text="D"),
        ],
    ) == [
        {"type": "text", "text": "A"},
        {
            "type": "container",
            "children": [
                {
                    "type": "texts",
                    "texts": [
                        {"type": "text", "text": "b"},
                        {"type": "text", "text": "c"},
                    ],
                },
                {"type": "container", "children": [], "first": None},
            ],
            "first": {"type": "text", "text": "b"},
        },
        {"type": "text", "text": "D"},
    ]
