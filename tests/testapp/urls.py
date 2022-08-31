from django.contrib import admin
from django.urls import path, re_path

from .views import ArticleView, PageView


urlpatterns = [
    re_path(r"^admin/", admin.site.urls),
    path("articles/<int:pk>/", ArticleView.as_view(), name="article_detail"),
    path("pages/<int:pk>/", PageView.as_view(), name="page_detail"),
]
