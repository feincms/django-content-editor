from django.views import generic

from content_editor.models import ContentProxy

from .models import Article, RichText, Download


class ArticleView(generic.DetailView):
    model = Article

    def get_context_data(self, **kwargs):
        return super(ArticleView, self).get_context_data(
            content=ContentProxy(
                self.object,
                plugins=[RichText, Download],
            ),
            **kwargs)
