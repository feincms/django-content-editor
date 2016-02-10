from django.views import generic

from content_editor.models import ContentProxy


class ContentView(generic.DetailView):
    plugins = ()

    def get_context_data(self, **kwargs):
        return super(ContentView, self).get_context_data(
            content=ContentProxy(
                self.object,
                plugins=self.plugins,
            ),
            **kwargs)
