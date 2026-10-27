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

.. _sections:

Sections
--------

Plugins may contain other plugins. The models of such plugins (accordions,
tabs, columns, ...) set ``container = True``; the content editor and the
renderer both use this:

.. code-block:: python

    class Accordion(ArticlePlugin):
        container = True

        title = models.CharField(max_length=200)

    class ArticleAdmin(ContentEditor):
        inlines = [
            ContentEditorInline.create(model=Accordion),
            ContentEditorInline.create(model=RichText),
            ...
        ]

The nesting is stored in the ``depth`` field of every plugin: a container's
children are the following plugins with a greater depth. ``depth`` is added
to the inline forms as a hidden field automatically. The editor never
produces invalid depths; when saving, depths are additionally normalized so
that a plugin is at most one level deeper than the previous plugin, and only
if that is a container.

In the editor, containers are drawn around their contents, and they are
collapsed, moved, cloned and deleted together with their contents:

- While dragging, the horizontal pointer position chooses the depth within
  the range allowed at the drop position. Dropping never splits a section.
- The buttons in the header of each item and Alt+Shift+Left/Right indent and
  outdent items directly. Outdenting an item also outdents its following
  siblings.
- New items take the depth of the position where they are added. At the end
  of a region, there's one "+" button per open level.
- Moving a container to another region moves its contents too.
- Marking a container for deletion asks whether only the container should be
  marked for deletion (its contents move one level up), or the contents too.

See :doc:`rendering` for rendering containers.

Deprecated: closer-based sections
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Plugins may also open and close sections by setting ``sections`` to a positive
number (opens that many sections) or to a negative number (closes sections).
All plugins between the opening and the closing plugin are grouped visually,
and they are collapsed and moved together. Sections which aren't closed extend
until the end of the region. An admin uses either ``sections`` or container
plugins, not both.

.. code-block:: python

    class ArticleAdmin(ContentEditor):
        inlines = [
            ContentEditorInline.create(model=Accordion, sections=1),
            ContentEditorInline.create(model=CloseSection, sections=-1),
            ...
        ]

If there's exactly one plugin closing a single section, the editor helps with
keeping sections balanced:

- Adding a section opener adds the closing plugin right after it.
- Dragging items below the end of a region where sections are still open
  closes those sections first if the pointer is moved to the left, into the
  indentation of an outer level.

Marking a section opener for deletion asks whether only the opener and its
closing plugin should be marked for deletion, or the contents of the section
too.

.. _migrating-sections:

Migrating from closer-based sections
------------------------------------

Plugins created with ``create_plugin_base`` have a ``depth`` field, so
``makemigrations`` adds it to all plugin models. Then, write a data migration
which computes ``depth`` from the existing opening and closing plugins and
deletes the closing plugins:

.. code-block:: python

    from django.db import migrations

    from content_editor.migrations_utils import compute_depths


    def forwards(apps, schema_editor):
        compute_depths(
            apps.get_model("pages", "Page"),
            plugins=[apps.get_model("pages", "RichText"), ...],
            openers=[apps.get_model("pages", "Accordion")],
            closers=[apps.get_model("pages", "CloseSection")],
        )


    class Migration(migrations.Migration):
        dependencies = [...]
        operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]

``plugins`` lists all remaining plugin models. Sections which are still open
at the end of a region end there. Afterwards, remove ``sections = 1`` from the
inlines of the opening plugins and set ``container = True`` on their models,
and remove the closing plugins' models and inlines. Each model is fetched using its base
manager, so the openers and closers should be concrete models, not proxies
sharing a table with other plugins.

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
