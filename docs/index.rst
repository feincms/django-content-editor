===================================================
django-content-editor -- Editing structured content
===================================================

.. image:: https://travis-ci.org/matthiask/django-content-editor.svg?branch=master
    :target: https://travis-ci.org/matthiask/django-content-editor

.. warning::

   Everything is really bare bones here, but works alright. The abstract
   plugin base model and the administration interface are practically
   finished, but the parts pertaining to views and templates need some
   additional thinking. Also, docs and more tests.

**Tagline: The component formerly known as FeinCMS' ItemEditor.**

The item editor was primarily a system to work with lists of content blocks
which can be assigned to arbitrary other objects. Whether those are elements of
a hierarchical page structure, weblog articles or anything else is irrelevant.
The idea of putting content together in small manageable pieces is interesting
for various use cases.


Why ``django-content-editor``?
==============================

``django-content-editor`` does what FeinCMS should have been all along. A
really thin layer around ``django.contrib.admin``'s inlines without any
magical behavior, with proper separation between models, rendering and
administration as Django did with the
`newforms admin a long time ago <https://code.djangoproject.com/wiki/NewformsAdminBranch>`_.

Also, there is **absolutely no magic** going on behind the scenes, no
dynamic model generation or anything similar. The FeinCMS code's dynamic
behavior required workarounds such as ``feincms_item_editor_inline`` for
simple use cases such as specifying ``InlineModelAdmin`` options.
Furthermore, my long gone fondness for monkey patching made the code even
more prone to breakage.

With the next version of `django-mptt <https://github.com/django-mptt/django-mptt>`_
supporting a draggable tree admin (formerly FeinCMS' TreeEditor) it made
lots of sense extracting the content editor of FeinCMS into its own package,
and thereby paving the way for a more modular Django-based CMF.

Content first! The interface matters, but content matters more.


Example: articles with rich text plugins
========================================

``app/models.py``::

    from django.db import models

    from content_editor.models import Template, Region, create_plugin_base


    class Article(models.Model):
        title = models.CharField(max_length=200)
        pub_date = models.DateField(blank=True, null=True)

        regions = [
            Region(name='main', title='main region'),
            # Region(name='sidebar', title='sidebar region', inherited=False),
        ]

        def __str__(self):
            return self.title


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

    from content_editor.admin import ContentEditor, ContentEditorInline

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
        style.innerHTML = "div[id*='cke_id_'] { margin-left: 170px; }";
        $('head').append(style);

        // Activate and deactivate the CKEDITOR because it does not like
        // getting dragged or its underlying ID changed

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
                    CKEDITOR.instances[this.id] && CKEDITOR.instances[this.id].destroy();
                });
            }
        );
    })(django.jQuery);


``app/views.py``::

    from django.views import generic

    from content_editor.models import ContentProxy

    from .models import Article, RichText, Download


    class ArticleView(generic.DetailView):
        model = Article

        def get_context_data(self, **kwargs):
            return super(ArticleView, self).get_context_data(
                content=ContentProxy(
                    self.object,
                    plugins=[RichText, Download],
                ),
                **kwargs)


``app/templates/app/article_detail.html``::

    {% extends "base.html" %}

    {% block title %}{{ article }} - {{ block.super }}{% endblock %}

    {% block content %}
    <h1>{{ article }}</h1>
    {{ article.pub_date }}

    {# Yes, not generic at all. And also does not render downloads. #}
    {% for plugin in content.main %}{{ plugin.text|safe }}{% endfor %}
    {% endblock %}

Finally, ensure that ``content_editor`` and ``app`` are added to your
``INSTALLED_APPS`` setting, and you're good to go.


Conventions
===========

Regions
~~~~~~~

The included ``ContentProxy`` classes and the ``ContentEditor`` admin class
expect a ``regions`` attribute or property (**not** a method) on their model
(the ``Article`` model above) which returns a list of ``Region`` instances.

Regions have the following attributes:

* ``title``: Something nice, will be visible in the content editor.
* ``name``: The region name, used in the content proxy as attribute name for
  the list of plugins.
* ``inherited``: Only has an effect if you are using the bundled
  ``MPTTContentProxy``: Models inherit content from their ancestor chain if a
  region with ``inherited = True`` is emtpy.

You are free to define additional attributes -- simply pass them when
instantiating a new region.


Templates
~~~~~~~~~

Various classes will expect the main model to have a ``template`` attribute or
property which returns a ``Template`` instance. Nothing of the sort is
implemented yet.

Templates have the following attributes:

* ``title``: Something nice.
* ``name``: Something machine-readable.
* ``template_name``: A template path.
* ``regions``: A list of region instances.

As with the regions above, you are free to define additional attributes.


Design decisions
==============================

About rich text editors
~~~~~~~~~~~~~~~~~~~~~~~

We have been struggling with rich text editors for a long time. To be honest, I
do not think it was a good idea to add that many features to the rich text
editor. Resizing images uploaded into a rich text editor is a real pain, and
what if you'd like to reuse these images or display them using a lightbox
script or something similar? You have to resort to writing loads of JavaScript
code which will only work on one browser. You cannot really filter the HTML
code generated by the user to kick out ugly HTML code generated by copy-pasting
from word. The user will upload 10mb JPEGs and resize them to 50x50 pixels in
the rich text editor.

All of this convinced me that offering the user a rich text editor with too
much capabilities is a really bad idea. The rich text editor in FeinCMS only
has bold, italic, bullets, link and headlines activated (and the HTML code
button, because that's sort of inevitable -- sometimes the rich text editor
messes up and you cannot fix it other than going directly into the HTML code.
Plus, if someone really knows what they are doing, I'd still like to give them
the power to shot their own foot).

If this does not seem convincing you can always add your own rich text content
type with a different configuration (or just override the rich text editor
initialization template in your own project). We do not want to force our world
view on you, it's just that we think that in this case, more choice has the
bigger potential to hurt than to help.


Content blocks
~~~~~~~~~~~~~~

Images and other media files are inserted via objects; the user can only select
a file and a display mode (f.e. float/block for images or something...). An
article's content could look like this:

* Rich Text
* Floated image
* Rich Text
* YouTube Video Link, embedding code is automatically generated from the link
* Rich Text

It's of course easier for the user to start with only a single rich text field,
but I think that the user already has too much confusing possibilities with an
enhanced rich text editor. Once the user grasps the concept of content blocks
which can be freely added, removed and reordered using drag/drop, I'd say it's
much easier to administer the content of a webpage. Plus, the content blocks
can have their own displaying and updating logic; implementing dynamic content
inside the CMS is not hard anymore, on the contrary. Since content blocks are
Django models, you can do anything you want inside them.
