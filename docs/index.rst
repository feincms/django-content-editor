===================================================
django-content-editor -- Editing structured content
===================================================

Version |release|

.. image:: https://github.com/matthiask/django-content-editor/actions/workflows/tests.yml/badge.svg
    :target: https://github.com/matthiask/django-content-editor/
    :alt: CI Status

**Tagline: The component formerly known as FeinCMS' ItemEditor.**

.. figure:: _static/django-content-editor.png

   The content editing interface.

Django's builtin admin application provides a really good and usable
administration interface for creating and updating content.
``django-content-editor`` extends Django's inlines mechanism with an
interface and tools for managing and rendering heterogenous
collections of content as are often necessary for content management
systems. For example, articles may be composed of text blocks with
images and videos interspersed throughout.

That, in fact, was one of the core ideas of FeinCMS_. Unfortunately,
FeinCMS_ has accumulated much more code than strictly necessary, and
I should have done better in this regard. Of course FeinCMS_ still
contains much less code than `comparable CMS systems`_, but we can do
even better and make it more obvious what's going on.

So, ``django-content-editor``.

.. note::

   If you like these ideas you might want to take a look at feincms3_.

.. toctree::
   :maxdepth: 2
   :caption: Contents:

   installation
   quickstart
   admin-classes
   contents
   design-decisions
   changelog

.. _Django: https://www.djangoproject.com/
.. _FeinCMS: https://github.com/feincms/feincms/
.. _comparable CMS systems: https://www.djangopackages.com/grids/g/cms/
.. _feincms3: https://feincms3.readthedocs.io/
