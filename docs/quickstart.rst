==========
Quickstart
==========

Example: articles with rich text plugins
=========================================

First comes a models file which defines a simple article model with
support for adding rich text and download content blocks.

``app/models.py``:

.. code-block:: python

    from django.db import models
    from django_prose_editor.fields import ProseEditorField

    from content_editor.models import Region, create_plugin_base


    class Article(models.Model):
        title = models.CharField(max_length=200)
        pub_date = models.DateField(blank=True, null=True)

        # The ContentEditor requires a "regions" attribute or property
        # on the model. Our example hardcodes regions; if you need
        # different regions depending on other factors have a look at
        # feincms3's TemplateMixin.
        regions = [
            Region(key="main", title="main region"),
            Region(key="sidebar", title="sidebar region"),
        ]

        def __str__(self):
            return self.title


    # create_plugin_base does nothing outlandish, it only defines an
    # abstract base model with the following attributes:
    # - a parent ForeignKey with a related_name that is guaranteed to
    #   not clash
    # - a region CharField containing the region key defined above
    # - an ordering IntegerField for ordering plugin items
    # - a get_queryset() classmethod returning a queryset for the
    #   Contents class and its helpers (a good place to add
    #   select_related and #   prefetch_related calls or anything
    #   similar)
    # That's all. Really!
    ArticlePlugin = create_plugin_base(Article)


    class RichText(ArticlePlugin):
        text = ProseEditorField(
            extensions={
                "Bold": True,
                "Italic": True,
                "BulletList": True,
                "OrderedList": True,
                "Link": True,
            },
            sanitize=True,
        )

        class Meta:
            verbose_name = "rich text"
            verbose_name_plural = "rich texts"


    class Download(ArticlePlugin):
        file = models.FileField(upload_to="downloads/%Y/%m/")

        class Meta:
            verbose_name = "download"
            verbose_name_plural = "downloads"


Next, the admin integration. Plugins are integrated as
``ContentEditorInline`` inlines, a subclass of ``StackedInline`` that
does not do all that much except serve as a marker that those inlines
should be treated a bit differently, that is, the content blocks should
be added to the content editor where inlines of different types can be
edited and ordered.

``app/admin.py``:

.. code-block:: python

    from django.contrib import admin

    from content_editor.admin import ContentEditor, ContentEditorInline

    from app import models


    @admin.register(models.Article)
    class ArticleAdmin(ContentEditor):
        inlines = [
            ContentEditorInline.create(model=models.RichText),
            ContentEditorInline.create(model=models.Download),
        ]


Rich text editor integration
============================

The example above uses `django-prose-editor`_ for rich text editing. This editor
integrates seamlessly with the content editor without requiring any additional
JavaScript configuration, as it uses Django's built-in ``formset:added`` event.

The content editor also emits two signals: ``content-editor:activate`` and
``content-editor:deactivate``. These are useful if you need to integrate
JavaScript widgets that don't work well with Django's standard formset events.
Since content blocks can be dynamically added and reordered using drag-and-drop,
some widgets may need special handling when moved.

.. note::

   django-prose-editor works out of the box with the content editor since it
   uses Django's standard formset events. No additional JavaScript is needed.


Here's a possible view implementation:

``app/views.py``:

.. code-block:: python

    from django.shortcuts import get_object_or_404, render
    from django.utils.html import format_html, mark_safe

    from content_editor.contents import contents_for_item

    from app.models import Article, RichText, Download


    def render_items(items):
        for item in items:
            if isinstance(item, RichText):
                # ProseEditorField returns HTML that's already safe
                yield item.text
            elif isinstance(item, Download):
                yield format_html(
                    '<a href="{}">{}</a>',
                    item.file.url,
                    item.file.name,
                )


    def article_detail(request, id):
        article = get_object_or_404(Article, id=id)
        contents = contents_for_item(article, [RichText, Download])
        return render(request, "app/article_detail.html", {
            "article": article,
            "content": {
                region.key: mark_safe("".join(render_items(contents[region.key])))
                for region in article.regions
            },
        })

.. note::

   The ``RegionRenderer`` from `feincms3
   <https://feincms3.readthedocs.io/>`__ offers a more flexible and
   capable method of rendering plugins.

After the ``render_regions`` call all that's left to do is add the
content to the template.

``app/templates/app/article_detail.html``:

.. code-block:: html+django

    <article>
        <h1>{{ article }}</h1>
        {{ article.pub_date }}

        {{ content.main }}
    </article>
    <aside>{{ content.sidebar }}</aside>

Finally, ensure that ``content_editor``, ``django_prose_editor`` and ``app`` are added to your
``INSTALLED_APPS`` setting:

.. code-block:: python

    INSTALLED_APPS = [
        # ... other apps
        'content_editor',
        'django_prose_editor',
        'app',  # your app
    ]

You'll also need to install django-prose-editor::

    pip install django-prose-editor[sanitize]

And you're good to go!


Custom buttons to add content blocks
=====================================

You can add nice icons to the plugin buttons using Google's Material Icons
(which are bundled with the content editor):

``app/admin.py``:

.. code-block:: python

    from content_editor.admin import ContentEditor, ContentEditorInline

    @admin.register(Article)
    class ArticleAdmin(ContentEditor):
        inlines = [
            ContentEditorInline.create(model=models.RichText, icon="article"),
            ContentEditorInline.create(model=models.Download, icon="download"),
        ]

The content editor bundles Google's Material Icons font. You can browse available
icons at https://fonts.google.com/icons.

Additional options include ``button`` (where you can set custom HTML for the
icon if you need more control) and ``color`` to set a CSS color for the icon.

.. _django-prose-editor: https://django-prose-editor.readthedocs.io/en/latest/
