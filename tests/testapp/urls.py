from __future__ import absolute_import, unicode_literals

from django.contrib import admin

try:
    from django.urls import url
except ImportError:  # pragma: no cover
    from django.conf.urls import url

from .models import Article, RichText, Download, Page, PageText
from .views import ContentView


admin.autodiscover()


urlpatterns = [
    url(r'^admin/', admin.site.urls),
    url(
        r'^articles/(?P<pk>\d+)/$',
        ContentView.as_view(
            model=Article,
            plugins=[RichText, Download],
        ),
        name='article_detail',
    ),
    url(
        r'^pages/(?P<pk>\d+)/$',
        ContentView.as_view(
            model=Page,
            plugins=[PageText],
        ),
        name='page_detail',
    ),
]
