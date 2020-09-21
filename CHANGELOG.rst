==========
Change log
==========

`Next version`_
===============

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
- Changed CSS variables to use the same names as `django-variable-admin
  <https://github.com/matthiask/django-variable-admin/>`__.


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
.. _Next version: https://github.com/matthiask/django-content-editor/compare/3.0...master
