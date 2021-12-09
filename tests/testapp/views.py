from django.utils.html import format_html, mark_safe
from django.views import generic

from content_editor.contents import contents_for_item

from .models import AbstractRichText, Article, Download, Page, PageText, RichText


def render_items(items):
    for item in items:
        if isinstance(item, AbstractRichText):
            yield mark_safe(item.text)
        elif isinstance(item, Download):
            yield format_html('<a href="{}">{}</a>', item.file, item.file)


class ArticleView(generic.DetailView):
    model = Article

    def get_context_data(self, **kwargs):
        contents = contents_for_item(self.object, [RichText, Download])

        return super().get_context_data(
            content={
                region.key: mark_safe("".join(render_items(contents[region.key])))
                for region in self.object.regions
            },
            **kwargs
        )


class PageView(generic.DetailView):
    model = Page

    def get_context_data(self, **kwargs):
        contents = contents_for_item(
            self.object, [PageText], inherit_from=filter(None, [self.object.parent])
        )
        return super().get_context_data(
            content={
                region.key: mark_safe("".join(render_items(contents[region.key])))
                for region in self.object.regions
            },
            **kwargs
        )
