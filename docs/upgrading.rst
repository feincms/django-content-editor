=================
Upgrading to 10.0
=================

This page is a checklist for upgrading a project to django-content-editor
10.0. It is written so that it can be followed step by step, also by a coding
agent.


Rationale
=========

Until 9.x, nesting was implicit: plugins opened and closed sections
(``sections = 1`` and ``sections = -1`` on the inline), and the editor and
the renderer had to reconstruct the structure by counting openers and
closers. Unbalanced closers, sections which were never closed and plugins
dragged between an opener and its closer made this fragile.

10.0 stores the nesting explicitly: every plugin has a ``depth`` field, and
plugin models which contain other plugins set ``container = True``. A
container's children are the following plugins with a greater depth. Closing
plugins aren't necessary anymore. The ``RegionRenderer`` moved from feincms3
into ``content_editor.renderer`` so that the package defining the tree also
renders it; container renderers receive their children explicitly.

Closer-based ``sections`` still work in 10.0 but are deprecated
(``content_editor.W001``) and will be removed in 11.0.


Overview
========

- **All projects** have to add the ``depth`` column to every plugin table
  (steps 1–3). Without it, fetching plugins fails.
- **Projects using sections** additionally migrate their content to
  containers (steps 4–9). This deletes the closing plugins and cannot be
  reversed.

Do the whole upgrade in one change and deploy it at once: the data
migration, the container renderer and the admin changes depend on each other.


Steps for all projects
======================

1. Upgrade the packages
-----------------------

Upgrade ``django-content-editor`` to 10.0 and, if the project uses it,
``feincms3`` to the release requiring django-content-editor 10.0 at the same
time. Older feincms3 releases install with 10.0 too, but their renderer
doesn't know containers.

2. Check for existing ``depth`` fields
--------------------------------------

Run ``./manage.py check``. ``content_editor.E005`` means that a plugin model
(or one of its abstract bases) already defines a field named ``depth``. The
content editor would overwrite its values, so rename that field first, in a
separate migration (``RenameField``), and update all code using it.

3. Add the ``depth`` column
---------------------------

Run ``./manage.py makemigrations``. It adds
``depth = PositiveSmallIntegerField(default=0)`` to every plugin model created
using ``create_plugin_base``. Plugin models with a hand-written base class
(not using ``create_plugin_base``) need a ``depth`` field of their own to use
containers.

Projects not using sections are done now, apart from the optional cleanups
in step 10.


Additional steps for projects using sections
============================================

4. Back up and take inventory
-----------------------------

Back up the database, and save the rendered HTML of all content using
sections for comparing it after the migration (step 11). Render the regions
directly using the renderer instead of fetching whole pages, so that
unrelated parts of the page (CSRF tokens, randomized content) don't differ.

Then find everything which belongs to closer-based sections:

- Inlines with a ``sections`` attribute, also when it's a property or set
  through ``ContentEditorInline.create(..., sections=...)``. ``./manage.py
  check`` lists them as ``content_editor.W001``.
- The **openers** (positive ``sections``) and **closers** (negative
  ``sections``) per content type (page, article, …). Note whether they are
  models of their own or proxies sharing a table, e.g. JSON plugin proxies
  (``JSONPluginBase.proxy("type", ...)``).
- Closers which don't close anything, e.g. because they are used as
  separators to split a subregion into several groups. The migration deletes
  them, so the rendering changes. Find them before migrating and decide how
  to replace them (e.g. with a container per group, or a separator plugin).
- Openers which are never closed. A section extends until its closer or the
  end of the region, so every following opener ends up nested inside it.
  Editors often used openers like headings, expecting the next opener of the
  same kind to end the previous section. ``compute_depths`` keeps the nesting
  as stored; it doesn't show when container templates don't wrap their
  children, but the editor draws it. Decide whether to close open sections
  before such openers in the data migration (e.g. by inserting closers), or
  to fix the affected content in the editor afterwards.
- Openers with ``sections`` greater than 1. These aren't supported by the
  migration helper, which counts every opener as one level; restructure them
  by hand before migrating.
- The renderer code: ``register_section_close``, ``render_section_plugins``,
  ``handle_<subregion>`` methods rendering sections, openers registered with a
  ``subregion``, and the templates used for rendering sections.
- Tests, fixtures and scripts creating closers or relying on them.
- Project CSS or JavaScript referencing the editor's
  ``.order-machine-section`` class or ``sections.js`` (renamed to
  ``.order-machine-container`` and ``containers.js``).

Grep for ``sections``, ``section_close``, ``render_section_plugins`` and
``register_section_close`` to find them.

5. Declare the containers
-------------------------

Set ``container = True`` on the models of all openers:

.. code-block:: python

    class Accordion(ArticlePlugin):
        container = True

For JSON plugin proxies, pass a mixin:

.. code-block:: python

    class Container:
        container = True

    Accordion = JSONPlugin.proxy("accordion", schema=..., mixins=[Container])

Don't run ``makemigrations`` for removing the closers yet: the migration
deleting them has to come after the data migration.

6. Write the data migration
---------------------------

Write one data migration per app containing content models. It has to depend
on the migration adding ``depth`` (step 3), and it should be a migration of
its own, not part of the schema migration. Call ``compute_depths`` once per
content model:

.. code-block:: python

    from django.db import migrations

    from content_editor.migrations_utils import compute_depths


    def forwards(apps, schema_editor):
        JSONPlugin = apps.get_model("pages", "JSONPlugin")
        compute_depths(
            apps.get_model("pages", "Page"),
            plugins=[
                apps.get_model("pages", "RichText"),
                apps.get_model("pages", "Image"),
                JSONPlugin,
            ],
            openers=[
                apps.get_model("pages", "Accordion"),
                JSONPlugin.objects.filter(type="tabs"),
            ],
            closers=[JSONPlugin.objects.filter(type="close_section")],
        )


    class Migration(migrations.Migration):
        dependencies = [("pages", "00xx_add_depth")]
        operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]

Rules:

- ``plugins`` has to list **every** remaining plugin model of the content
  model, not only those used inside sections. Plugins which aren't listed
  keep ``depth = 0`` and don't take part in the computation.
- Openers and closers sharing a table with other plugins (proxies) have to be
  passed as querysets of the concrete model filtered by type.
  ``compute_depths`` rejects proxy models in ``openers`` and ``closers``.
  Historical models in migrations don't have the proxies' ``type`` defaults,
  so always filter explicitly.
- Each row is processed once. Closers take precedence over openers, and
  openers over plugins, so the concrete JSON plugin model can be passed in
  ``plugins`` although some of its rows are openers or closers.
- Sections which are still open at the end of a region end there.
- The closers are deleted.

7. Render containers
--------------------

Register the openers as containers. Their renderers receive the children as
a third argument; ``template_renderer`` passes them to the template as
``children``:

.. code-block:: python

    renderer.register(models.Accordion, template_renderer("containers/accordion.html"))

.. code-block:: html+django

    <div class="accordion">
      <h2>{{ plugin.title }}</h2>
      {{ children }}
    </div>

``children`` renders as the HTML of all children; loop over it to access
each child's ``plugin`` (e.g. for tab titles). See :doc:`rendering`.

Remove the code which rendered closer-based sections: ``subregion=`` on the
openers' registrations, the ``handle_<subregion>`` methods calling
``render_section_plugins``, and the ``register_section_close`` calls. Adapt
the section templates: what used to be the section's content is now
``{{ children }}``, and the opener is ``plugin``. Container renderers must
accept three arguments, ``register`` raises an error otherwise.

Keep the other arguments of the openers' registrations, e.g. ``fetch=False``
for JSON plugin proxies whose concrete model is registered separately.

``feincms3.renderer`` re-exports the moved names, so imports from there keep
working; importing from ``content_editor.renderer`` is preferred.

8. Update the admin
-------------------

Remove ``sections`` from all inlines, and remove the closers' inlines. The
openers' inlines need no changes, the editor reads ``container`` from the
model. Update verbose names mentioning sections, e.g. "Begin section: FAQ",
since containers have no visible end anymore.

When renaming a concrete model which has proxies (e.g. a JSON plugin model
``Section`` to ``Container``), the migration has to delete the proxies before
``RenameModel`` and create them again afterwards; the migration state can't
resolve the proxies' bases otherwise.

9. Remove the closers
---------------------

Remove the closer models (or proxies) and run ``makemigrations``, which
deletes them. Update tests and fixtures: create containers and children with
``depth`` instead of openers and closers.


Cleanups and verification
=========================

10. Optional cleanups
---------------------

- Import ``RegionRenderer``, ``template_renderer`` etc. from
  ``content_editor.renderer`` and use ``{% load content_editor %}``'s
  ``{% render_region %}`` instead of feincms3's, if the project doesn't use
  feincms3's deprecated renderer APIs.
- Remove ``region`` and ``ordering`` from plugin inline ``fields`` and
  ``fieldsets``; they are added automatically now.

11. Verify
----------

- ``./manage.py check`` reports no ``content_editor.W001``,
  ``content_editor.E004`` or ``content_editor.E005``.
- No ``DeprecationWarning`` about closer-based sections when rendering
  (``python -Wd``).
- ``./manage.py makemigrations --check`` reports no changes.
- The test suite passes.
- Run the migrations on a copy of the production database and compare the
  rendered HTML with the HTML saved in step 4. Also render content which only
  contained closers, since it has no section plugins left afterwards.
- Open content with containers in the admin: containers are drawn around
  their children, and saving without changes doesn't change anything. Look
  for unexpected nesting too, since it may not show in the rendered HTML.
