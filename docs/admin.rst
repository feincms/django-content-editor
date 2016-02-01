.. _admin:

==================
The content editor
==================

.. module:: content_editor.admin
.. class:: ContentEditor

The tabbed interface below is used to edit content and other properties of the
edited object. A tab is shown for every region of the template or element,
depending on whether templates are activated for the object in question [#f1]_.

Here's a screenshot of a content editing pane. The media file content is
collapsed currently. New items can be added using the control bar at the bottom,
and all content blocks can be reordered using drag and drop:

.. image:: images/item_editor_content.png

.. [#f1] Templates are required for the page module; blog entries managed through
         the item editor probably won't have a use for them.


Customizing the individual plugin forms
---------------------------------------

Customizing the individual content type editors is easily possible through four
settings on the content type model itself:

* ``feincms_item_editor_context_processors``:

  A list of callables using which you may add additional values to the item
  editor templates.

* ``feincms_item_editor_form``:

  You can specify the base class which should be used for the content type
  model. The default value is :class:`django.forms.ModelForm`. If you want
  to customize the form, chances are it is a better idea to set
  ``feincms_item_editor_inline`` instead.

* ``feincms_item_editor_includes``:

  If you need additional JavaScript or CSS files or need to perform additional
  initialization on your content type forms, you can specify template fragments
  which are included in predefined places into the item editor.

  Currently, the only include region available is ``head``::

      class ContentType(models.Model):
          feincms_item_editor_includes = {
              'head': ['content/init.html'],
              }

          # ...

  If you need to execute additional Javascript, for example to add a TinyMCE instance,
  it is recommended to add the initialization functions to the
  ``contentblock_init_handlers`` array, because the initialization needs to be
  performed not only on page load, but also when adding new content blocks. Please
  note that these functions *will* be called several times, also several times
  on the same content types. It is your responsibility to ensure that the handlers
  aren't attached several times if this would be harmful.

  Additionally, several content types do not support being dragged. Rich text
  editors such as TinyMCE react badly to being dragged around - they are still
  visible, but the content disappears and nothing is clickable anymore. Because
  of this you might want to run routines before and after moving content types
  around. This is achieved by adding your JavaScript functions to
  the ``contentblock_move_handlers.poorify`` array for handlers to be executed
  before moving and ``contentblock_move_handlers.richify`` for handlers to be
  executed after moving. Please note that the item editor executes all handlers
  on every drag and drop, it is your responsibility to ensure that code is
  only executed if it has to.

  Take a look at the ``richtext`` item editor include files to understand how
  this should be done.

* ``feincms_item_editor_inline``:

  .. versionadded:: 1.4.0

  This can be used to override the ``InlineModelAdmin`` class used for the
  content type. The custom inline should inherit from ``FeinCMSInline``
  or be configured the same way.

  If you override ``fieldsets`` or ``fields`` you **must** include ``region`` and
  ``ordering`` even though they aren't shown in the administration
  interface.


Putting it all together
=======================

It is possible to build a limited, but fully functional page CMS administration
interface using only the following code (``urls.py`` and ``views.py`` are
missing):

``models.py``::

    from django.db import models
    from mptt.models import MPTTModel
    from feincms.models import create_base_model

    class Page(create_base_model(MPTTModel)):
        active = models.BooleanField(default=True)
        title = models.CharField(max_length=100)
        slug = models.SlugField()

        parent = models.ForeignKey('self', blank=True, null=True, related_name='children')

        def get_absolute_url(self):
            if self.parent_id:
                return u'%s%s/' % (self.parent.get_absolute_url(), self.slug)
            return u'/%s/' % self.slug

``admin.py``::

    from django.contrib import admin
    from feincms.admin import item_editor, tree_editor
    from myapp.models import Page

    class PageAdmin(item_editor.ItemEditor, tree_editor.TreeEditor):
        fieldsets = [
            (None, {
                'fields': ['active', 'title', 'slug'],
                }),
            item_editor.FEINCMS_CONTENT_FIELDSET,
            ]
        list_display = ['active', 'title']
        prepopulated_fields = {'slug': ('title',)}
        raw_id_fields = ['parent']
        search_fields = ['title', 'slug']

    admin.site.register(Page, PageAdmin)


For a more complete (but also more verbose) implementation, have a look
at the files inside :mod:`feincms/module/page/`.
