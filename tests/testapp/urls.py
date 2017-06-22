from __future__ import absolute_import, unicode_literals

from django.contrib import admin

from .views import ArticleView, PageView


try:
    from django.urls import url
except ImportError:  # pragma: no cover
    from django.conf.urls import url


urlpatterns = [
    url(r'^admin/', admin.site.urls),
    url(
        r'^articles/(?P<pk>\d+)/$',
        ArticleView.as_view(),
        name='article_detail',
    ),
    url(
        r'^pages/(?P<pk>\d+)/$',
        PageView.as_view(),
        name='page_detail',
    ),
]
