from django.conf.urls import url
from django.contrib import admin

from .views import ArticleView, PageView


urlpatterns = [
    url(r"^admin/", admin.site.urls),
    url(r"^articles/(?P<pk>\d+)/$", ArticleView.as_view(), name="article_detail"),
    url(r"^pages/(?P<pk>\d+)/$", PageView.as_view(), name="page_detail"),
]
