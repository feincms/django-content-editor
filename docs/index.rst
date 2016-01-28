.. _index:

==========================================
Implement a rich text plugin with CKEditor
==========================================

.. warning::

   This is not production ready — everything barely works, but that's it.


Python
======

``plugins.py``::

    class Richtext(models.Model):
        text = models.TextField(blank=True)

        class Meta:
            abstract = True
            verbose_name = 'rich text'
            verbose_name_plural = 'rich texts'


``models.py``::

    from django.db import models

    from feincms2_content.models import Template, Region, create_content_base

    from .plugins import Richtext


    class Page(create_content_base()):
        title = models.CharField(max_length=200)

        template = Template(
            name='test',
            regions=[
                Region(name='main', title='main region'),
            ],
        )

        def __str__(self):
            return self.title


    RichtextPlugin = Page.create_plugin(Richtext)


``admin.py``::

    from django.contrib import admin

    from feincms2_content.admin import ItemEditor, ItemEditorInline

    from .models import Page, RichtextPlugin


    class RichtextInline(ItemEditorInline):
        model = RichtextPlugin

        class Media:
            js = (
                '//cdn.ckeditor.com/4.5.6/standard/ckeditor.js',
                'app/plugin_ckeditor.js',
            )

    admin.site.register(
        Page,
        ItemEditor,
        inlines=[
            RichtextInline,
        ],
    )


JavaScript
==========

Put this in ``app/static/app/plugin_ckeditor.js``::

    django.jQuery(function($) {

        /* Improve spacing */
        var style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = "div[id*='cke_id_'] { margin-left: 170px; }";
        $('head').append(style);

        // Activate and deactivate the CKEDITOR because it does not like
        // getting dragged or its underlying ID changed

        function initEditor() {
            $('textarea[name^=app_richtext_set-]').each(function() {
                if (this.id.indexOf('__prefix__') === -1) {
                    CKEDITOR.replace(this);
                }
            });
        }

        function addEditor(row) {
            var id = row.find('textarea').attr('id');
            if (id) {
                CKEDITOR.replace(id);
            }
        }

        function removeEditor(row) {
            var id = row.find('textarea').attr('id');
            if (id) {
                CKEDITOR.instances[id].destroy();
            }
        }

        $('.order-machine').on(
            'sortcreate',
            initEditor
        ).on(
            'sortstart',
            function(event, ui) { removeEditor(ui.item); }
        ).on(
            'sortstop',
            function(event, ui) { addEditor(ui.item); }
        );

        $(document).on(
            'formset:added',
            function(event, row, optionsPrefix) { addEditor(row); }
        ).on(
            'formset:removed',
            function fixEditor(event, row, optionsPrefix) {
                if (!row.is('[id^=app_richtext_set-]')) return;

                // Initiate emergency procedure. Django insists on
                // renumbering formsets.
                $('textarea[name^=app_richtext_set-]').each(function() {
                    CKEDITOR.instances[this.id] && CKEDITOR.instances[this.id].destroy();
                });

                // Call as soon as possible, but not sooner.
                setTimeout(initEditor, 0);
            }
        );

    });


Why?
====

Good question. When I'm finished there will be absolutely **no magic** going
on behind the scenes. The FeinCMS code sometimes mysteriously broke down,
monkey patching was required, and too much was implicit instead of explicit.

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
