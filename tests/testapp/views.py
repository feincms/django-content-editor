from django.utils.html import format_html, mark_safe
from django.views import generic

from content_editor.renderer import PluginRenderer
from content_editor.utils import (
    collect_contents_for_item, collect_contents_for_mptt_item
)

from .models import Article, RichText, Download, Bla, Page, PageText


renderer = PluginRenderer()
renderer.register(
    RichText,
    lambda plugin: mark_safe(plugin.text),
)
renderer.register(
    PageText,
    lambda plugin: mark_safe(plugin.text),
)
renderer.register(
    Download,
    lambda plugin: format_html(
        '<a href="{}">{}</a>',
        plugin.file,
        plugin.file,
    ),
)


class ArticleView(generic.DetailView):
    model = Article

    def get_context_data(self, **kwargs):
        contents = collect_contents_for_item(
            self.object, [RichText, Download, Bla])
        return super(ArticleView, self).get_context_data(
            content={
                region.key: renderer.render(contents[region.key])
                for region in self.object.regions
            },
            **kwargs)


class PageView(generic.DetailView):
    model = Page

    def get_context_data(self, **kwargs):
        contents = collect_contents_for_mptt_item(
            self.object, [PageText])
        return super(PageView, self).get_context_data(
            content={
                region.key: renderer.render(contents[region.key])
                for region in self.object.regions
            },
            **kwargs)
