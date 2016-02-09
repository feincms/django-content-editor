from __future__ import absolute_import, unicode_literals

import os

from django.conf import settings
from django.contrib import admin
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.views.static import serve
from django.views import generic

try:
    from django.urls import url
except ImportError:  # pragma: no cover
    from django.conf.urls import url

from testapp.models import Page


admin.autodiscover()


urlpatterns = [
    url(r'^admin/', admin.site.urls),
    url(
        r'^media/(?P<path>.*)$',
        serve,
        {
            'document_root': os.path.join(
                settings.BASE_DIR,
                'media',
            ),
        },
    ),
    url(
        r'^pages/(?P<pk>\d+)/$',
        generic.DetailView.as_view(model=Page),
        name='page_detail',
    ),
] + staticfiles_urlpatterns()
