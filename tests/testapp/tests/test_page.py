from __future__ import absolute_import, unicode_literals

from django.contrib.auth.models import User
from django.test import TestCase
# from django.utils import timezone

try:
    from django.urls import reverse
except ImportError:  # pragma: no cover
    from django.core.urlresolvers import reverse

from content_editor.models import ContentProxy

from testapp.models import Page, Richtext


class ContentEditorTest(TestCase):
    def setUp(self):
        u = User(
            username='test',
            is_active=True,
            is_staff=True,
            is_superuser=True)
        u.set_password('test')
        u.save()

    def login(self):
        self.assertTrue(self.client.login(username='test', password='test'))

    def test_stuff(self):
        # Smoke test some stuff
        page = Page.objects.create(
            title='Test',
        )
        page.testapp_richtext_set.create(
            text='bla',
            region='main',
            ordering=10,
        )

        content = ContentProxy(page, plugins=[Richtext])

        self.assertEqual(len(content.main), 1)
        self.assertEqual(len(content.sidebar), 0)
        self.assertRaises(AttributeError, lambda: content.bla)

    def test_admin(self):
        self.login()
        response = self.client.get(reverse('admin:testapp_page_add'))

        self.assertContains(response, 'content-editor-script', 1)
        self.assertContains(response, 'class="richtext"', 1)
