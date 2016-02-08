.. _index:

==========================================
Implement a rich text plugin with CKEditor
==========================================

.. warning::

   This is not production ready — everything works, but that's it.


Python
======

``app/models.py``::

    from django.db import models

    from content_editor.models import (
        Template,
        Region,
        ContentProxy,
        create_plugin_base
    )


    class Page(models.Model):
        title = models.CharField(max_length=200)

        template = Template(
            name='test',
            regions=[
                Region(name='main', title='main region'),
                Region(name='sidebar', title='sidebar region'),
            ],
        )

        def __str__(self):
            return self.title

        def content(self):
            return ContentProxy(self, plugins=[Richtext])


    PagePlugin = create_plugin_base(Page)


    class Richtext(PagePlugin):
        text = models.TextField(blank=True)

        class Meta:
            verbose_name = 'rich text'
            verbose_name_plural = 'rich texts'


``app/admin.py``::

    from django import forms
    from django.contrib import admin
    from django.db import models

    from content_editor.admin import ContentEditor, ContentEditorInline

    from .models import Page, Richtext


    class RichTextarea(forms.Textarea):
        def __init__(self, attrs=None):
            default_attrs = {'class': 'richtext'}
            if attrs:
                default_attrs.update(attrs)
            super(RichTextarea, self).__init__(default_attrs)


    class RichtextInline(ContentEditorInline):
        model = Richtext
        formfield_overrides = {
            models.TextField: {'widget': RichTextarea},
        }

        class Media:
            js = (
                '//cdn.ckeditor.com/4.5.6/standard/ckeditor.js',
                'app/plugin_ckeditor.js',
            )

    admin.site.register(
        Page,
        ContentEditor,
        inlines=[
            RichtextInline,
        ],
    )


JavaScript
==========

Put this in ``app/static/app/plugin_ckeditor.js``::

    /* global django, CKEDITOR */
    django.jQuery(function($) {

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
            function(event, row) {
                row.find('textarea.richtext').each(function() {
                    CKEDITOR.replace(this.id, CKEDITOR.config);
                });
            }
        ).on(
            'content-editor:deactivate',
            function(event, row) {
                row.find('textarea.richtext').each(function() {
                    CKEDITOR.instances[this.id] && CKEDITOR.instances[this.id].destroy();
                });
            }
        );
    });



Why?
====

Good question. There is **absolutely no magic** going on behind the scenes,
no dynamic model generation or anything. The FeinCMS code sometimes
mysteriously broke down, monkey patching was required, and too much was
implicit instead of explicit. In the end, this probably also prevented people
from contributing because FeinCMS was seen as *here be dragons*.

Also, ``feincms2_content`` follows the philosophy "Libraries, not Frameworks".



========================================
FeinCMS - An extensible Django-based CMS
========================================


.. image:: images/tree_editor.png

FeinCMS is an extremely stupid content management system. It knows
nothing about content -- just enough to create an admin interface for
your own page content types. It lets you reorder page content blocks
using a drag-drop interface, and you can add as many content blocks
to a region (f.e. the sidebar, the main content region or something
else which I haven't thought of yet). It provides helper functions,
which provide ordered lists of page content blocks. That's all.

Adding your own content types is extremely easy. Do you like markdown
that much, that you'd rather die than using a rich text editor?
Then add the following code to your project, and you can go on using the
CMS without being forced to use whatever the developers deemed best::

    from markdown2 import markdown
    from feincms.module.page.models import Page
    from django.db import models

    class MarkdownPageContent(models.Model):
        content = models.TextField()

        class Meta:
            abstract = True

        def render(self, **kwargs):
            return markdown(self.content)

    Page.create_plugin(MarkdownPageContent)


That's it. Only ten lines of code for your own page content type.



Contents
========

.. toctree::
   :maxdepth: 3

   richtext
   installation
   page
   contenttypes
   extensions
   admin
   integration
   medialibrary
   templatetags
   settings
   migrations
   versioning
   advanced/index
   faq
   contributing
   deprecation


Releases
========

.. toctree::
   :maxdepth: 1

   releases/1.2
   releases/1.3
   releases/1.4
   releases/1.5
   releases/1.6
   releases/1.7
   releases/1.8
   releases/1.9
   releases/1.10
   releases/1.11


Indices and tables
==================

* :ref:`genindex`
* :ref:`modindex`
* :ref:`search`
