=============
Admin Classes
=============

ContentEditor
=============

The ``ContentEditor`` class extends ``RefinedModelAdmin`` and provides the full
content editing interface for managing heterogeneous collections of content blocks.

It automatically handles:

- Plugin management and ordering
- Region-based content organization
- Drag-and-drop reordering of content blocks
- Integration with ``ContentEditorInline`` classes

Basic usage:

.. code-block:: python

    from content_editor.admin import ContentEditor, ContentEditorInline
    from .models import Article, RichText, Download

    @admin.register(Article)
    class ArticleAdmin(ContentEditor):
        inlines = [
            ContentEditorInline.create(model=RichText),
            ContentEditorInline.create(model=Download),
        ]

ContentEditorInline
===================

``ContentEditorInline`` is a specialized ``StackedInline`` that serves as a marker
for content editor plugins. It provides additional functionality for:

- Region restrictions
- Custom icons and buttons
- Plugin-specific configuration

The ``.create()`` class method provides a convenient way to quickly create inlines:

.. code-block:: python

    ContentEditorInline.create(
        model=MyPlugin,
        icon="description",  # Material icon name
        color="#ff5722",     # Custom color
        regions={"main"},    # Restrict to specific regions
    )

Restricting plugins to regions
------------------------------

You may want to allow certain content blocks only in specific regions. For example,
you may want to allow rich text content blocks only in the ``main`` region. There
are several ways to do this; you can either hardcode the list of allowed regions:

.. code-block:: python

    from content_editor.admin import ContentEditor, allow_regions

    class ArticleAdmin(ContentEditor):
        inlines = [
            # Explicit:
            RichTextInline.create(regions={"main"}),
            # Using the helper which does exactly the same:
            RichTextInline.create(regions=allow_regions({"main"})),
        ]

Or you may want to specify a list of denied regions. This may be less
repetitive if you have many regions and many restrictions:

.. code-block:: python

    from content_editor.admin import ContentEditor, deny_regions

    class ArticleAdmin(ContentEditor):
        inlines = [
            RichTextInline.create(regions=deny_regions({"sidebar"})),
        ]

RefinedModelAdmin
=================

The ``RefinedModelAdmin`` class provides a lightweight base class that extends
Django's ``ModelAdmin`` with commonly useful tweaks. It serves as the foundation
for the ``ContentEditor`` class, but can also be used independently for regular
Django admin classes that want to benefit from these enhancements.

Currently, ``RefinedModelAdmin`` includes:

- **Save shortcuts**: Keyboard shortcuts (Ctrl+S / Cmd+S) for quickly saving forms
- **Deletion safety check**: Shows a confirmation dialog when attempting to delete
  the whole object instead of saving changes (including marked inline deletions)
- **Tabbed fieldsets**: Support for tabbed fieldsets using the ``tabbed`` CSS class

To use ``RefinedModelAdmin`` for your own admin classes:

.. code-block:: python

    from content_editor.admin import RefinedModelAdmin

    @admin.register(MyModel)
    class MyModelAdmin(RefinedModelAdmin):
        # Your admin configuration here
        pass

This gives you the save shortcut functionality without the full content editor
interface, making it useful for any Django model admin where you want these
convenience features.

To use tabbed fieldsets, add the ``tabbed`` CSS class to your fieldsets:

.. code-block:: python

    class MyModelAdmin(RefinedModelAdmin):
        fieldsets = [
            ('Basic Information', {
                'fields': ['title', 'description'],
                'classes': ['tabbed'],
            }),
            ('Advanced Settings', {
                'fields': ['status', 'priority'],
                'classes': ['tabbed'],
            }),
        ]
