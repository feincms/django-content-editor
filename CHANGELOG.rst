==========
Change log
==========

Next version
~~~~~~~~~~~~

- The return value of ``PluginRenderer.render`` now allows outputting
  individual items as well as the concatenated output of all items as
  before.
- Added this change log.


`0.5`_ (2016-06-21)
~~~~~~~~~~~~~~~~~~~

- Made tests using Django@master pass again by switching to my fork of
  django-mptt.
- Simplified the way package data is specified in setup.py.


`0.4`_ (2016-04-14)
~~~~~~~~~~~~~~~~~~~

- Added a check to Django's checks framework for custom content editor
  fieldsets.
- Streamlined the implementation of ``PluginRenderer``, allow rendering
  a single plugin.
- Added documentation for ``Contents`` and its helpers.
- Added infrastructure for running the tests using ``./setup.py test``.


`0.3`_ (2016-02-28)
~~~~~~~~~~~~~~~~~~~

- Replaced the ``ContentEditorForm`` with a ``formfield_for_dbfield``
  override for easier model form customization.
- Replaced the ``ContentProxy`` concept with a generic ``Contents``
  class and various helpers for fetching contents.
- Added a simple ``PluginRenderer`` for registering render functions
  for a plugin class tree.


`0.2`_ (2016-02-26)
~~~~~~~~~~~~~~~~~~~

- Added comments, documentation.
- Fixed the JavaScript tag generation by the ``JS`` class.
- Only auto-fill our own ordering fields.


`0.1`_ (2016-02-16)
~~~~~~~~~~~~~~~~~~~

Initial public release of django-content-editor.


.. _django-ckeditor: https://pypi.python.org/pypi/django-ckeditor
.. _django-content-editor: http://django-content-editor.readthedocs.org/en/latest/
.. _django-mptt: http://django-mptt.github.io/django-mptt/
.. _feincms-cleanse: https://pypi.python.org/pypi/feincms-cleanse

.. _0.1: https://github.com/matthiask/django-content-editor/commit/2bea5456
.. _0.2: https://github.com/matthiask/django-content-editor/compare/0.1.0...0.2.0
.. _0.3: https://github.com/matthiask/django-content-editor/compare/0.2.0...0.3.0
.. _0.4: https://github.com/matthiask/django-content-editor/compare/0.3.0...0.4.0
.. _0.5: https://github.com/matthiask/django-content-editor/compare/0.4.0...0.5.0
.. _0.6: https://github.com/matthiask/django-content-editor/compare/0.5.0...master
