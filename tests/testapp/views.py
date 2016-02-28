from django.views import generic

from content_editor.utils import collect_contents_for_item


class ContentView(generic.DetailView):
    plugins = ()

    def get_context_data(self, **kwargs):
        return super(ContentView, self).get_context_data(
            content=collect_contents_for_item(self.object, self.plugins),
            **kwargs)
