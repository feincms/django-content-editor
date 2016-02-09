from __future__ import absolute_import, unicode_literals

from django.contrib.auth.models import User
from django.test import TestCase
# from django.utils import timezone

try:
    from django.urls import reverse
except ImportError:  # pragma: no cover
    from django.core.urlresolvers import reverse

from content_editor.models import ContentProxy, MPTTContentProxy

from testapp.models import Article, RichText, Download, Page, PageText


class ContentEditorTest(TestCase):
    def login(self):
        u = User(
            username='test',
            is_active=True,
            is_staff=True,
            is_superuser=True)
        u.set_password('test')
        u.save()
        self.assertTrue(self.client.login(username='test', password='test'))

    def test_stuff(self):
        # Smoke test some stuff
        article = Article.objects.create(
            title='Test',
        )
        richtext = article.testapp_richtext_set.create(
            text='<p>bla</p>',
            region='main',
            ordering=10,
        )

        with self.assertNumQueries(2):  # Two content types.
            content = ContentProxy(article, plugins=[RichText, Download])

            self.assertEqual(content.main[0], richtext)
            self.assertEqual(content.main[0].parent, article)

        self.assertEqual(len(content.main), 1)
        self.assertEqual(len(content.sidebar), 0)
        self.assertRaises(AttributeError, lambda: content.bla)

        response = self.client.get(article.get_absolute_url())
        self.assertContains(response, '<h1>Test</h1>')
        self.assertContains(response, '<p>bla</p>')

    def test_admin(self):
        self.login()
        response = self.client.get(reverse('admin:testapp_article_add'))

        self.assertContains(response, 'content-editor-script', 1)
        self.assertContains(response, 'class="richtext"', 1)
        self.assertContains(
            response,
            '[&quot;testapp_richtext&quot;, &quot;Rich text&quot;]',
            1,
        )
        self.assertContains(
            response,
            '[&quot;testapp_download&quot;, &quot;Download&quot;]',
            1,
        )
        self.assertContains(
            response,
            '[[&quot;main&quot;, &quot;main region&quot;],'
            ' [&quot;sidebar&quot;, &quot;sidebar region&quot;]',
            1,
        )

    def test_empty(self):
        article = Article.objects.create(
            title='Test',
        )

        with self.assertNumQueries(2):
            content = ContentProxy(article, plugins=[RichText, Download])

        self.assertEqual(content.main, [])

        with self.assertNumQueries(0):
            content = ContentProxy(article, plugins=[])

        self.assertEqual(content.main, [])

    def test_hierarchy(self):
        page = Page.objects.create(title='root')
        child = page.children.create(title='child 1')
        page.refresh_from_db()
        child.refresh_from_db()

        self.assertEqual(
            list(child.get_ancestors()),
            [page],
        )

        page.testapp_pagetext_set.create(
            region='main',
            ordering=10,
            text='page main text',
        )
        page.testapp_pagetext_set.create(
            region='sidebar',
            ordering=20,
            text='page sidebar text',
        )

        with self.assertNumQueries(2):
            content = MPTTContentProxy(child, plugins=[PageText])
            self.assertEqual(
                content.main,
                [],
            )
            self.assertEqual(
                [c.text for c in content.sidebar],
                ['page sidebar text'],
            )

            self.assertEqual(content.sidebar[0].parent, page)

        child.testapp_pagetext_set.create(
            region='sidebar',
            ordering=10,
            text='child sidebar text',
        )

        child.testapp_pagetext_set.create(
            region='main',
            ordering=20,
            text='child main text',
        )

        with self.assertNumQueries(2):
            content = MPTTContentProxy(child, plugins=[PageText])
            self.assertEqual(
                [c.text for c in content.main],
                ['child main text'],
            )
            self.assertEqual(
                [c.text for c in content.sidebar],
                ['child sidebar text'],
            )

            self.assertEqual(content.sidebar[0].parent, child)
