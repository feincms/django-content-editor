from django.contrib import admin
from django.urls import re_path

from .views import ArticleView, PageView


urlpatterns = [
    re_path(r"^admin/", admin.site.urls),
    re_path(r"^articles/(?P<pk>\d+)/$", ArticleView.as_view(), name="article_detail"),
    re_path(r"^pages/(?P<pk>\d+)/$", PageView.as_view(), name="page_detail"),
]
