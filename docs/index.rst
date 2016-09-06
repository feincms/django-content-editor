===================================================
django-content-editor -- Editing structured content
===================================================

.. image:: https://travis-ci.org/matthiask/django-content-editor.svg?branch=master
    :target: https://travis-ci.org/matthiask/django-content-editor

.. warning::

   Everything here works alright, but is still subject to change.
   Some additional real-world testing has to happen before the code
   can be declared 1.0-ready. Also, additional docs and more tests.

**Tagline: The component formerly known as FeinCMS' ItemEditor.**

Django's builtin admin application provides a really good and usable
administration interface for creating and updating content.
``django-content-editor`` extends Django's inlines mechanism with an
interface and tools for managing and rendering heterogenous
collections of content as are often necessary for content management
systems. For example, articles may be composed of text blocks with
images and videos interspersed throughout.

That, in fact, was one of the core ideas of FeinCMS_. Unfortunately,
FeinCMS_' components were too strongly coupled, and the code in
general used too much magic which made the code hard to understand
and difficult to fix when it broke (this didn't happen too often in
the last years, but still.)

So, ``django-content-editor``.

At the time of writing the newest release of django-mptt_ comes with
a `draggable tree admin`_, formerly FeinCMS_' TreeEditor. It has become
really simple to build a basic pages CMS building *on top* of
django-mptt_ and ``django-content-editor``.

---

FeinCMS_ actually was trying to **be** a really simple and stupid
content management system. Simply looking at the amount of code in
FeinCMS_ is enough to decide that we did worse than we should have
done. While FeinCMS_ still contains less code than `comparable CMS
systems`_ it still consists of hundreds of lines of comparatively
complicated and needlessly dynamic code.  Reasons are mostly
historical of course -- Django_'s administration interface did it
fact not even have dynamic JavaScript-backed inlines when FeinCMS_
was first released, and the necessary events which we require for
adding custom JavaScript-backed widgets (such as rich text editors)
to plugins are only available starting with Django_ 1.9 -- the
latest release at the time of writing.

---


.. _Django: https://www.djangoproject.com/
.. _FeinCMS: https://github.com/feincms/feincms/
.. _newforms admin: https://code.djangoproject.com/wiki/NewformsAdminBranch
.. _django-mptt: https://github.com/django-mptt/django-mptt/
.. _comparable CMS systems: https://www.djangopackages.com/grids/g/cms/
.. _draggable tree admin: http://django-mptt.github.io/django-mptt/admin.html#mptt-admin-draggablempttadmin


Example: articles with rich text plugins
========================================

``app/models.py``::

    from django.db import models

    from content_editor.models import (
        Template, Region, create_plugin_base
    )


    class Article(models.Model):
        title = models.CharField(max_length=200)
        pub_date = models.DateField(blank=True, null=True)

        regions = [
            Region(key='main', title='main region'),
            Region(key='sidebar', title='sidebar region',
                   inherited=False),
        ]

        def __str__(self):
            return self.title


    # create_plugin_base does nothing outlandish, it only defines an
    # abstract base model with the following attributes:
    # - a parent ForeignKey with a related_name the rest of the code
    #   expects
    # - a region CharField containing the region key defined above
    # - an ordering IntegerField for ordering plugin items
    # - a get_queryset() classmethod returning a queryset for the
    #   ContentProxy classes (a good place to add select_related and
    #   prefetch_related calls or anything similar)
    # That's all. Really!
    ArticlePlugin = create_plugin_base(Article)


    class RichText(ArticlePlugin):
        text = models.TextField(blank=True)

        class Meta:
            verbose_name = 'rich text'
            verbose_name_plural = 'rich texts'


    class Download(ArticlePlugin):
        file = models.FileField(upload_to='downloads/%Y/%m/')

        class Meta:
            verbose_name = 'download'
            verbose_name_plural = 'downloads'


``app/admin.py``::

    from django import forms
    from django.contrib import admin
    from django.db import models

    from content_editor.admin import (
        ContentEditor, ContentEditorInline
    )

    from .models import Article, Richtext, Download


    class RichTextarea(forms.Textarea):
        def __init__(self, attrs=None):
            default_attrs = {'class': 'richtext'}
            if attrs:
                default_attrs.update(attrs)
            super(RichTextarea, self).__init__(default_attrs)


    class RichTextInline(ContentEditorInline):
        model = RichText
        formfield_overrides = {
            models.TextField: {'widget': RichTextarea},
        }
        regions = ['main']  # We only want rich texts in "main" region.

        class Media:
            js = (
                '//cdn.ckeditor.com/4.5.6/standard/ckeditor.js',
                'app/plugin_ckeditor.js',
            )

    admin.site.register(
        Article,
        ContentEditor,
        inlines=[
            RichTextInline,
            ContentEditorInline.create(model=Download),
        ],
    )


``app/static/app/plugin_ckeditor.js``::

    /* global django, CKEDITOR */
    (function($) {

        /* Improve spacing */
        var style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = "div[id*='cke_id_'] {margin-left:170px;}";
        $('head').append(style);

        // Activate and deactivate the CKEDITOR because it does not
        // like getting dragged or its underlying ID changed

        CKEDITOR.config.width = '787';
        CKEDITOR.config.height= '300';
        CKEDITOR.config.format_tags = 'p;h1;h2;h3;h4;pre';
        CKEDITOR.config.toolbar = [[
            'Maximize','-',
            'Format','-',
            'Bold','Italic','Underline','Strike','-',
            'Subscript','Superscript','-',
            'NumberedList','BulletedList','-',
            'Anchor','Link','Unlink','-',
            'Source'
        ]];

        $(document).on(
            'content-editor:activate',
            function(event, $row, formsetName) {
                $row.find('textarea.richtext').each(function() {
                    CKEDITOR.replace(this.id, CKEDITOR.config);
                });
            }
        ).on(
            'content-editor:deactivate',
            function(event, $row, formsetName) {
                $row.find('textarea.richtext').each(function() {
                    CKEDITOR.instances[this.id] &&
                    CKEDITOR.instances[this.id].destroy();
                });
            }
        );
    })(django.jQuery);


``app/views.py``::

    from django.utils.html import format_html, mark_safe
    from django.views import generic

    from content_editor.renderer import PluginRenderer
    from content_editor.contents import contents_for_mptt_item

    from .models import Article, RichText, Download


    renderer = PluginRenderer()
    renderer.register(
        RichText,
        lambda plugin: mark_safe(plugin.text),
    )
    renderer.register(
        Download,
        lambda plugin: format_html(
            '<a href="{}">{}</a>',
            plugin.file.url,
            plugin.file.name,
        ),
    )


    class ArticleView(generic.DetailView):
        model = Article

        def get_context_data(self, **kwargs):
            return super(ArticleView, self).get_context_data(
                content=contents_for_mptt_item(
                    self.object,
                    [RichText, Download],
                ).render_regions(renderer),
                **kwargs)


``app/templates/app/article_detail.html``::

    {% extends "base.html" %}

    {% block title %}{{ article }} - {{ block.super }}{% endblock %}

    {% block content %}
    <article>
        <h1>{{ article }}</h1>
        {{ article.pub_date }}

        {{ content.main }}
    </article>
    <aside>{{ content.sidebar }}</aside>
    {% endblock %}

Finally, ensure that ``content_editor`` and ``app`` are added to your
``INSTALLED_APPS`` setting, and you're good to go.

IF you also want nice icons to add new items, you might want to use
`font awesome`_ and the following snippets:

``app/admin.py``::

    class ArticleAdmin(ContentEditor):
        inlines = [
            RichTextInline,
            ContentEditorInline.create(model=Download),
        ]

        class Media:
            css = {'all': (
                'https://maxcdn.bootstrapcdn.com/font-awesome'
                '/4.5.0/css/font-awesome.min.css',
            )}
            js = (
                'app/plugin_buttons.js',
            )


``app/plugin_buttons.js``::

    (function($) {
        $(document).on('content-editor:ready', function() {
            ContentEditor.addPluginButton(
                'app_richtext',
                '<i class="fa fa-pencil"></i>'
            );
            ContentEditor.addPluginButton(
                'app_download',
                '<i class="fa fa-download"></i>'
            );
        });
    })(django.jQuery);


.. _font awesome: https://fortawesome.github.io/Font-Awesome/


Parts
=====

Regions
~~~~~~~

The included ``Contents`` class and its helpers (``contents_*``) and
the ``ContentEditor`` admin class expect a ``regions`` attribute or
property (**not** a method) on their model (the ``Article`` model
above) which returns a list of ``Region`` instances.

Regions have the following attributes:

* ``title``: Something nice, will be visible in the content editor.
* ``key``: The region key, used in the content proxy as attribute name
  for the list of plugins. Must contain a valid Python identifier.
* ``inherited``: Only has an effect if you are using the bundled
  ``contents_for_mptt_item`` or anything comparable: Models inherit
  content from their ancestor chain if a region with ``inherited =
  True`` is emtpy.

You are free to define additional attributes -- simply pass them
when instantiating a new region.


Templates
~~~~~~~~~

Various classes will expect the main model to have a ``template``
attribute or property which returns a ``Template`` instance. Nothing
of the sort is implemented yet.

Templates have the following attributes:

* ``title``: Something nice.
* ``key``: The template key. Must contain a valid Python identifier.
* ``template_name``: A template path.
* ``regions``: A list of region instances.

As with the regions above, you are free to define additional
attributes.


``Contents`` class and helpers
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The ``content_editor.contents`` module offers a few helpers for
fetching content blocks from the database. The ``Contents`` class
knows how to group content blocks by region and how to merge
contents from several main models. This is especially useful in
inheritance scenarious, for example when a page in a hierarchical
page tree inherits some aside-content from its ancestors.

.. note::

   **Historical note**

   The ``Contents`` class and the helpers replace the monolithic
   ``ContentProxy`` concept in FeinCMS_.

Simple usage is as follows::

    from content_editor.contents import Contents

    article = Article.objects.get(...)
    c = Contents(article.regions)
    for item in article.cms_richtext_set.all():
        c.add(item)
    for item in article.cms_download_set.all():
        c.add(item)

    # Returns a list of all items, sorted by the order of
    article.regions # and by item ordering
    list(c)

    # Returns a list of all items from the given region
    c['main']
    # or
    c.main

    # How many items do I have?
    len(c)

    # Inherit content from the given contents instance if one of my
    # regions is a. inherited and b. empty
    c.inherit_regions(some_other_contents_instance)

    # Plugins from unknown regions end up in _unknown_region_contents:
    c._unknown_region_contents

For simple use cases, you'll probably want to take a closer look at
the following helper methods instead of instantiating a ``Contents``
class directly:


``contents_for_items``
----------------------

Returns a contents instance for a list of main models::

    articles = Article.objects.all()[:10]
    contents = contents_for_items(
        articles,
        plugins=[RichText, Download])

    something = [
        (article, contents[article])
        for article in articles
    ]


``contents_for_item``
---------------------

Returns the contents instance for a given main model (note that this
helper calls ``contents_for_items`` to do the real work)::

    # ...
    contents = contents_for_item(
        article,
        plugins=[RichText, Download])


``contents_for_mptt_item``
--------------------------

Returns the contents instance for a given main model, inheriting
content from ancestors if a given region is inheritable and empty in
the passed item::

    page = Page.objects.get(path=...)
    contents = contents_for_mptt_item(
        page,
        plugins=[RichText, Download])


``PluginRenderer`` class
~~~~~~~~~~~~~~~~~~~~~~~~

.. warning::

   I consider the ``PluginRenderer`` extremely experimental.  The
   main problem with the current code is that it assumes too much,
   and makes it hard i.e. to add a template plugin which simply
   causes the main template to include the plugin template with
   context and everything.

   Also, its name does not tell that it's only usable for HTML right
   now.

Example::

    renderer = PluginRenderer()
    # Register renderers -- also handles subclasses
    # Fallback for unknown plugins is a HTML comment containing the
    # model label (app.model) and plugin.__str__
    # The return value of renderers is autoescaped.
    renderer.register(
        RichText,
        lambda plugin: mark_safe(plugin.text))
    renderer.register(
        Image,
        lambda plugin: format_html(
            '<img src={}" alt="">',
            plugin.image.url,
        ))

    article = ...
    contents = contents_for_item(
        article,
        plugins=[RichText, Image])

    return render(request, 'cms/article_detail.html', {
        'object': article,
        'content': {
            region.key: renderer.render(contents[region.key])
            for region in article.regions
        },
    })


Design decisions
================

About rich text editors
~~~~~~~~~~~~~~~~~~~~~~~

We have been struggling with rich text editors for a long time. To
be honest, I do not think it was a good idea to add that many
features to the rich text editor. Resizing images uploaded into a
rich text editor is a real pain, and what if you'd like to reuse
these images or display them using a lightbox script or something
similar? You have to resort to writing loads of JavaScript code
which will only work on one browser. You cannot really filter the
HTML code generated by the user to kick out ugly HTML code generated
by copy-pasting from word. The user will upload 10mb JPEGs and
resize them to 50x50 pixels in the rich text editor.

All of this convinced me that offering the user a rich text editor
with too much capabilities is a really bad idea. The rich text
editor in FeinCMS only has bold, italic, bullets, link and headlines
activated (and the HTML code button, because that's sort of
inevitable -- sometimes the rich text editor messes up and you
cannot fix it other than going directly into the HTML code.  Plus,
if someone really knows what they are doing, I'd still like to give
them the power to shot their own foot).

If this does not seem convincing you can always add your own rich
text plugin with a different configuration (or just override the
rich text editor initialization template in your own project). We do
not want to force our world view on you, it's just that we think
that in this case, more choice has the bigger potential to hurt than
to help.


Plugins
~~~~~~~

Images and other media files are inserted via objects; the user can
only select a file and a display mode (f.e. float/block for images
or something...). An article's content could look like this:

* Rich Text
* Floated image
* Rich Text
* YouTube Video Link, embedding code is automatically generated from
  the link
* Rich Text

It's of course easier for the user to start with only a single rich
text field, but I think that the user already has too much confusing
possibilities with an enhanced rich text editor. Once the user
grasps the concept of content blocks which can be freely added,
removed and reordered using drag/drop, I'd say it's much easier to
administer the content of a webpage. Plus, the content blocks can
have their own displaying and updating logic; implementing dynamic
content inside the CMS is not hard anymore, on the contrary. Since
content blocks are Django models, you can do anything you want
inside them.


Glossary
========

- **Main model**: (Bad wording -- not happy with that). The model to
  which plugins may be added. This model uses the content editor
  admin class.

- **Plugin**: A content element type such as rich text, download,
  and image or whatever.

- **Content block**: A content element instance belonging to a main
  model instance. Also called **item** sometimes in the documentation
  above.
