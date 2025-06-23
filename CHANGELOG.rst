==========
Change log
==========

Next version
============

- Removed mentions of the ``Template`` type from the docs and deprecated the
  class. django-content-editor never used it, only FeinCMS did; feincms3 ships
  its own ``TemplateType`` type replacing it.
- Prepared for the new object-based ``Script`` by moving from django-js-asset's
  ``JS`` to a script without attributes, and moved the configuration into an
  inline JSON blob.
- Rewrote ``content_editor/save_shortcut.js`` without jQuery.


7.2 (2025-01-27)
================

- Added Python 3.13. Removed Python 3.8 and 3.9.
- Added Django 5.2a1.
- Changed ``Type`` and therefore also ``Region`` and ``Template`` to be
  hashable. This is achieved by hashing the ``key`` field (which all existing
  uses of ``Type`` have).


7.1 (2024-10-02)
================

- Changed the plugin buttons grid to allow collapsing empty rows.
- Disabled dragging plugins when changes are not allowed anyway.
- Stopped collapsing plugin initially when they contain errors.
- Added automatic scrolling while dragging plugins.
- Fixed a bug where a plugin with multiple fieldsets wouldn't collapse
  completely.
- Added Django 5.1 to the CI.
- Introduced sections. Content editor inlines can now define a ``sections``
  attribute; recommended values include 0 (the default), 1 (open one section)
  and -1 (close one section). Those sections are collapsed and moved as one
  unit during editing.
- Added a red border to the region dropdown of plugins in unknown regions.


7.0 (2024-05-31)
================

- Switched from ESLint to biome.
- Completely revamped the plugin buttons control. It now doesn't take up any
  place on the side anymore but instead appears when clicking the insertion
  target.
- Added plugin icons to inlines instead of the generic drag handle.


6.5 (2024-05-16)
================

- Fixed the content editor initialization: The active region was only set after
  saving and not initially.
- Removed the maximum height from content editor inlines.
- Started showing the target indicator again when dragging over collapsed
  plugins.
- Allowed dragging plugins to positions *after* existing plugins, not just
  *before*. This allows dragging a plugin directly to the end, finally.
- Changed the content editor to work better if changing the parent object isn't
  allowed. Plugin buttons (which didn't do anything) are now hidden, and the
  region tabs work correctly.
- Updated the bundled material icons font.
- Preferred the admin form's model instance to the ``original`` context
  variable. This lets us pick better content editor defaults.
- Started hiding all plugin buttons when showing an unknown region.


6.4 (2024-02-16)
================

- Stopped showing plugin buttons if user has no permission to add the plugin.
- Added Python 3.11, Django 4.1 and 4.2 to the CI matrix.
- Removed Django 4.0 from the CI (3.2 is still there).
- Added ``Type`` to ``content_editor.models.__all__`` since it is used in
  feincms3.
- Tweak the plugin button positioning a bit.
- Added padding to form rows in tabbed fieldsets below 767px.
- Switched to hatchling and ruff.
- Started restoring not only the region but also the collapsed state of inlines
  and the vertical scroll position.


`6.3`_ (2022-04-30)
===================

.. _6.3: https://github.com/matthiask/django-content-editor/compare/6.2...6.3

- Increased the ``max-height`` of content editor fieldsets so that stupidly
  high fieldsets stay completely visible.
- Changed missing icons to a generic extension icon instead of the question
  mark.
- Added a system check for the ``regions`` attribute of content editor inlines.
  It verifies that the attribute is either ``None`` or an iterable.


`6.2`_ (2022-03-04)
===================

.. _6.2: https://github.com/matthiask/django-content-editor/compare/6.1...6.2

- Changed the handling of ``formset:added`` and ``formset:removed`` for
  compatibility with Django 4.1.
- **POSSIBLY BACKWARDS INCOMPATIBLE:** Disallowed region keys which do not have
  the form of an identifer, e.g. ``content-main``. Such keys cannot be used in
  templates etc. and are therefore a bad idea.


`6.1`_ (2022-02-17)
===================

.. _6.1: https://github.com/matthiask/django-content-editor/compare/6.0...6.1

- **POSSIBLY BACKWARDS INCOMPATIBLE:** Disallowed region keys starting with an
  underscore. It was a bad idea to allow these in the first place and caused
  some ... unnecessary interactions when wrapping ``Contents`` in lazy objects.
- Fixed an edge case where multiple machine messages were shown.
- Made it possible to move plugins out of unknown regions even if there is only
  one valid region at all.


`6.0`_ (2022-01-13)
===================

.. _6.0: https://github.com/matthiask/django-content-editor/compare/5.1...6.0

- Made the ``inherit_from`` argument to ``contents_for_item`` keyword-only.
- Added an optional ``regions`` argument to ``contents_for_items`` and
  ``contents_for_item`` which allows passing in a list of ``Region`` objects to
  limit the regions fetched.
- Renamed the undocumented ``_regions`` attribute of the ``Contents`` object to
  ``regions``.


`5.1`_ (2021-12-30)
===================

- Added pre-commit.
- Changed the minimum versions to Django 3.2 and Python 3.8.
- Added compatibility with `django-jazzmin
  <https://github.com/farridav/django-jazzmin/>`__.


`5.0`_ (2021-12-03)
===================

- Allowed dragging text etc. inside the content editor (made the ``dragstart``
  handling only trigger when dragging the title of fieldsets).
- Fixed a bug where overlong fieldset titles would cause wrapping, which made
  the region move dropdown and the deletion UI elements inaccessible.
- Made the submit row sticky in content editors.
- Reworked the machine control to always add plugin buttons for all plugins and
  removed the plugins dropdown and moved the control to the right hand side of
  the editor to improve the visibility of plugin labels.
- Made it possible to drag several content blocks at once.
- Made it possible to directly insert plugins in the middle of the content, not
  just at the end.
- Added a bundled copy of `Google's Material Icons library
  <https://fonts.google.com/icons>`__ for use in the editor.
- Stopped overflowing the content editor horizontally when using (very) long
  descriptions for content blocks.
- Changed the transitions to avoid ugly artefacts when switching regions.
- Stopped merging unknown regions into one tab.
- Fixed one instance of a slightly timing-dependent initialization.
- Added Python 3.10, Django 4.0rc1 to the CI.


`4.1`_ (2021-04-15)
===================

- Fixed the rich text plugin to use the correct selector for the
  documented JavaScript code.
- Added ``allow_regions`` and ``deny_regions`` helpers to restrict
  plugins to specific regions. This was possible before but may be a
  little bit nicer with those helpers.
- Added a workaround for a Chrome regression where the contents of a
  collapsed fieldset were still visible. (See `the Chromium bug
  <https://bugs.chromium.org/p/chromium/issues/detail?id=1151858>`__.)
- Fixed an edge case where passing a generator to ``contents_for_item``
  would cause too many queries because of a missing ``parent`` foreign
  key caching.
- Disabled the content editor when there are no regions or when the current
  region doesn't allow any plugins.
- Changed the content editor interface to collapse and expand fieldsets with a
  single click instead of requiring a totally not discoverable doubleclick.
- Switched to saving the "Collapse all items" state inside the browsers'
  localStorage instead of starting with expanded fieldsets every time.
- Changed the JavaScript code to not add history entries anymore when changing
  tabs.
- Fixed the layout and sizing of controls in the title of heading blocks (the
  dropdown to move the block to a different region and the delete checkbox).
- Changed the content editor to always add new items in an uncollapsed state.
- Added a workaround for Django admin's failure to collapse/uncollapse
  fieldsets which have been added dynamically.
- Changed the "Collapse all items" behavior to never collapse fieldsets with
  errors inside.
- Changed ``Region`` and ``Template`` to require all of their fields.


`4.0`_ (2020-11-28)
===================

- **BACKWARDS INCOMPATIBLE**: Plugins now use the inline prefix inside
  the content editor. ``ContentEditor.addPluginButton()`` now requires
  the inline prefix of plugins, not an arbitrary key. E.g.  instead of
  ``<app_label>_<model_name>`` it now expects
  ``<app_label>_<model_name>_set``. This change allows using the same
  plugin model several times with different inlines.
- Allowed configuring plugin buttons by setting the ``button`` attribute
  of ``ContentEditorInline`` classes/objects.
- Added highlighting of the current content block in the editor.
- Added focussing of the first input field of new content blocks.
- Added a dragging affordance to content blocks.
- Made hovered and focussed content blocks stand out more.
- Fixed styling problems when using tabbed fieldsets with inlines.
- Fixed a long-standing bug where dropping a content block on top of
  e.g. a CKEditor instance wouldn't actually move the dragged block to
  the new position.
- Changed the JavaScript code to also handle Ctrl-S, not just Cmd-S to
  save; modified the event handler to always save and continue.
- Replaced the collapse-all button with a checkbox to make it clearer
  what the state is.
- Allowed collapsing individual content blocks by doubleclicking the
  title. This may change in the future (as all things) because it's not
  discoverable at all.
- Added a small note when a fieldset is collapsed.
- Changed CSS variables to use the same names as `django-variable-admin
  <https://github.com/matthiask/django-variable-admin/>`__.
- Moved the ``Ctrl-S`` and ``Cmd-S`` shortcut handling into its own
  ``content_editor/save_shortcut.js`` static file to allow easier reuse
  in other model admin classes.
- Started modernizing the JavaScript code, dropped Internet Explorer
  polyfills. Django dropped support for legacy browsers in the
  administration interface in the Django 3.1 release too.
- Changed the JavaScript code to not swallow unrelated drag/drop events.


`3.0`_ (2020-06-06)
===================

- Added Django 3.0 and 3.1a1 to the test matrix.
- Dropped Django 1.11, 2.0 and 2.1.
- Fixed a problem where the content editor JavaScript code would produce
  an invalid ``action`` upon submit.


`2.0`_ (2019-11-11)
===================

- Changed the minimum versions to Django 1.11 and Python 3.5. Removed
  the dependency on six again.
- Dropped the ``contents_for_mptt_item`` utility.
- Dropped the ``PluginRenderer`` -- people should really either use
  feincms3's ``TemplatePluginRenderer`` or implement a project-specific
  solution.


`1.5`_ (2019-09-26)
===================

- Added an additional check to avoid processing inlines not managed by
  the content editor.
- Allowed uncollapsing tabbed fieldsets after page load by specifying
  ``"classes": ["tabbed", "uncollapse"]``
- Added a place to edit items assigned to unknown regions.


`1.4`_ (2019-03-18)
===================

- Added configuration to make running prettier and ESLint easy.
- Added a different message when a region is empty and its ``inherited``
  flag is set.
- Make the ``regions`` attribute on ``ContentEditorInline`` objects a
  callable.
- Added a six dependency, Django 3.0 will ship without
  ``@python_2_unicode_compatible``.
- Deprecated ``contents_for_mptt_item`` and removed the django-mptt
  dependency from the testsuite.
- Made the dependency of our JS on ``django.jQuery`` explicit which is
  necessary to avoid invalid orderings with Django 2.2 because of its
  updated ``Media.merge`` algorithm.


`1.3`_ (2018-12-10)
===================

- Added back the possibility to move new content blocks in-between other
  content blocks without having to save first. To achieve this the CSS
  and JavaScript of the content editor was rewritten using `flex
  ordering <https://developer.mozilla.org/en-US/docs/Web/CSS/order>`__
  instead of modifying the order of elements in the DOM. This also
  implies that reordering content blocks does not require deactivation
  and activation steps anymore e.g. to preserve the functionality of a
  rich text editor, possibly making it easier to implement custom
  editors for individual plugins.
- Added a button to the content editor to toggle the content of inlines
  (making reordering contents easier).
- Added a workaround for a bug with Django's responsive administration
  panel CSS where form fields where shown below the 767px breakpoint
  despite them being ``.hidden``.
- Reformatted the CSS and JavaScript code using `prettier
  <https://prettier.io/>`__.


`1.2`_ (2018-10-06)
===================

- Fixed our use of internal API of ``forms.Media`` that will be removed
  in Django 2.0.
- Fixed an elusive bug with our formsets handling. Newly added content
  blocks have to be saved before they can be reordered.
- Fixed a handful of minor CSS bugs.
- Updated the documentation with a few improved recommendations.
- Moved plugin buttons before the dropdown.
- Removed the JavaScript's dependency on the exact ``related_name``
  value of plugins.


`1.1`_ (2017-06-27)
===================

- Moved the ``JS`` form assets helper to django-js-asset_, thereby raising
  our own Python code coverage to 100%.
- Added Django 1.11 and Django@master to the Travis build.
- Added a tox_ configuration file for building docs and running style
  checks and the test suite.
- Added a check which errors if the model registered with the
  ``ContentEditor`` has no ``regions`` attribute or property.
- Expanded the documentation a bit.
- Fixed occasional problems when sorting by keeping the empty inline
  formsets at the end at all times. Thanks to Tom Van Damme for the
  contribution!


`1.0`_ (2017-01-23)
===================

- Moved the regions inheritance handling from ``contents_for_mptt_item``
  to ``contents_for_item`` to make it reusable outside MPTT hierarchies.
- Reworded the introduction to the documentation.


`0.10`_ (2016-09-06)
====================

- Changed ``Region`` and ``Template`` to extend
  ``types.SimpleNamespace`` on Python versions that support this
  (>3.3)
- Allowed restricting individual plugin types to a subset of available
  regions by setting ``ContentEditorInline.plugins`` to a list of region
  keys. Thanks to Tom Van Damme for the contribution!
- Removed Django from ``install_requires`` -- updating
  django-content-editor does not necessarily mean users want to update
  Django as well.


`0.9`_ (2016-08-12)
===================

- Some browsers do not support ``Math.sign``...
- Automatically open the first tab with errors when using tabbed
  fieldsets.
- Improve visibility of plugin fieldsets.
- Fixed widgets using their own size in tabbed fieldsets and the
  content editor (for example django-versatileimagefield_'s primary
  point of interest field).
- Use django.contrib.staticfiles' static URL generation if it is
  installed.


`0.8`_ (2016-07-07)
===================

- Modified ``PluginRenderer.render`` and
  ``PluginRenderer.render_content`` to pass on keyword arguments (if
  any) to the registered render functions.
- Made tabbed fieldsets' titles stand out if the tab contains invalid fields.


`0.7`_ (2016-06-29)
===================

- Raise tests coverage back to 100% after the ``PluginRenderer.render``
  change in 0.6.
- Simplify the implementation of the return value of
  ``PluginRenderer.render``. Empty regions are now falsy again.


`0.6`_ (2016-06-25)
===================

- The return value of ``PluginRenderer.render`` now allows outputting
  individual items as well as the concatenated output of all items as
  before.
- Added this change log.


`0.5`_ (2016-06-21)
===================

- Made tests using Django@master pass again by switching to my fork of
  django-mptt.
- Simplified the way package data is specified in setup.py.


`0.4`_ (2016-04-14)
===================

- Added a check to Django's checks framework for custom content editor
  fieldsets.
- Streamlined the implementation of ``PluginRenderer``, allow rendering
  a single plugin.
- Added documentation for ``Contents`` and its helpers.
- Added infrastructure for running the tests using ``./setup.py test``.


`0.3`_ (2016-02-28)
===================

- Replaced the ``ContentEditorForm`` with a ``formfield_for_dbfield``
  override for easier model form customization.
- Replaced the ``ContentProxy`` concept with a generic ``Contents``
  class and various helpers for fetching contents.
- Added a simple ``PluginRenderer`` for registering render functions
  for a plugin class tree.


`0.2`_ (2016-02-26)
===================

- Added comments, documentation.
- Fixed the JavaScript tag generation by the ``JS`` class.
- Only auto-fill our own ordering fields.


`0.1`_ (2016-02-16)
===================

Initial public release of django-content-editor.

The last common commit of FeinCMS 1 and django-content-editor before the fork
was `made in 2015
<https://github.com/feincms/feincms/commit/30d1e263e1ac32cdd1550517de003791e533b2de>`__.
The core concepts were basically unchanged since 2009. django-content-editor is
a modernization of FeinCMS's ItemEditor while keeping the good parts about it.


.. _django-ckeditor: https://pypi.python.org/pypi/django-ckeditor
.. _django-content-editor: http://django-content-editor.readthedocs.org/en/latest/
.. _django-js-asset: https://github.com/matthiask/django-js-asset
.. _django-mptt: https://github.com/django-mptt/django-mptt/
.. _feincms-cleanse: https://pypi.python.org/pypi/feincms-cleanse
.. _django-versatileimagefield: http://django-versatileimagefield.readthedocs.io/en/latest/
.. _tox: https://tox.readthedocs.io/

.. _0.1: https://github.com/matthiask/django-content-editor/commit/2bea5456
.. _0.2: https://github.com/matthiask/django-content-editor/compare/0.1.0...0.2.0
.. _0.3: https://github.com/matthiask/django-content-editor/compare/0.2.0...0.3.0
.. _0.4: https://github.com/matthiask/django-content-editor/compare/0.3.0...0.4.0
.. _0.5: https://github.com/matthiask/django-content-editor/compare/0.4.0...0.5.0
.. _0.6: https://github.com/matthiask/django-content-editor/compare/0.5.0...0.6.0
.. _0.7: https://github.com/matthiask/django-content-editor/compare/0.6.0...0.7.0
.. _0.8: https://github.com/matthiask/django-content-editor/compare/0.7.0...0.8.0
.. _0.9: https://github.com/matthiask/django-content-editor/compare/0.8.0...0.9.0
.. _0.10: https://github.com/matthiask/django-content-editor/compare/0.9.0...0.10.0
.. _1.0: https://github.com/matthiask/django-content-editor/compare/0.10.0...1.0.0
.. _1.1: https://github.com/matthiask/django-content-editor/compare/1.0.0...1.1.0
.. _1.2: https://github.com/matthiask/django-content-editor/compare/1.1.0...1.2
.. _1.3: https://github.com/matthiask/django-content-editor/compare/1.2...1.3
.. _1.4: https://github.com/matthiask/django-content-editor/compare/1.3...1.4
.. _1.5: https://github.com/matthiask/django-content-editor/compare/1.4...1.5
.. _2.0: https://github.com/matthiask/django-content-editor/compare/1.5...2.0
.. _3.0: https://github.com/matthiask/django-content-editor/compare/2.0...3.0
.. _4.0: https://github.com/matthiask/django-content-editor/compare/3.0...4.0
.. _4.1: https://github.com/matthiask/django-content-editor/compare/4.0...4.1
.. _5.0: https://github.com/matthiask/django-content-editor/compare/4.1...5.0
.. _5.1: https://github.com/matthiask/django-content-editor/compare/5.0...5.1
