=====================
Contents and Regions
=====================

Regions
=======

The included ``Contents`` class and its helpers (``contents_*``) and
the ``ContentEditor`` admin class expect a ``regions`` attribute or
property (**not** a method) on their model which returns a list of ``Region`` instances.

Regions have the following attributes:

* ``title``: Something nice, will be visible in the content editor.
* ``key``: The region key, used in the content proxy as attribute name
  for the list of plugins. Must contain a valid Python identifier.
  ``"regions"`` and names starting with an underscore cannot be used. The
  recommendation is to use ``"main"`` when you only have a single region and no
  better idea.
* ``inherited``: Only has an effect if you are using the
  ``inherit_from`` argument to ``contents_for_item``: Model instances
  inherit content from their other instances if a region with
  ``inherited = True`` is empty.

You are free to define additional attributes -- simply pass them
when instantiating a new region.

Example:

.. code-block:: python

    from content_editor.models import Region

    class Article(models.Model):
        title = models.CharField(max_length=200)

        regions = [
            Region(key="main", title="Main content"),
            Region(key="sidebar", title="Sidebar", inherited=True),
        ]

Contents class and helpers
==========================

The ``content_editor.contents`` module offers a few helpers for
fetching content blocks from the database. The ``Contents`` class
knows how to group content blocks by region and how to merge
contents from several main models. This is especially useful in
inheritance scenarios, for example when a page in a hierarchical
page tree inherits some aside-content from its ancestors.

.. note::

   **Historical note**

   The ``Contents`` class and the helpers replace the monolithic
   ``ContentProxy`` concept in FeinCMS_.

Contents class
--------------

Simple usage is as follows:

.. code-block:: python

    from content_editor.contents import Contents

    article = Article.objects.get(...)
    c = Contents(article.regions)
    for item in article.app_richtext_set.all():
        c.add(item)
    for item in article.app_download_set.all():
        c.add(item)

    # Returns a list of all items, sorted by the definition
    # order of article.regions and by item ordering
    list(c)

    # Returns a list of all items from the given region
    c["main"]
    # or
    c.main

    # How many items do I have?
    len(c)

    # Inherit content from the given contents instance if one of my
    # own regions is empty and has its "inherited" flag set.
    c.inherit_regions(some_other_contents_instance)

    # Plugins from unknown regions end up in _unknown_region_contents:
    c._unknown_region_contents

For most use cases you'll probably want to take a closer look at the
following helper methods instead of instantiating a ``Contents`` class
directly:

contents_for_items
-------------------

Returns a contents instance for a list of main models:

.. code-block:: python

    articles = Article.objects.all()[:10]
    contents = contents_for_items(
        articles,
        plugins=[RichText, Download],
    )

    something = [
        (article, contents[article])
        for article in articles
    ]

contents_for_item
------------------

Returns the contents instance for a given main model (note that this
helper calls ``contents_for_items`` to do the real work):

.. code-block:: python

    # ...
    contents = contents_for_item(
        article,
        plugins=[RichText, Download],
    )

It is also possible to add additional items for inheriting regions.
This is most useful with a page tree where i.e. sidebar contents are
inherited from ancestors (this example uses methods added by
django-tree-queries_ as used in feincms3_):

.. code-block:: python

    page = ...
    contents = contents_for_item(
        page,
        plugins=[RichText, Download],
        page.ancestors().reverse(),  # Prefer content closer to the
                                     # current page
    )

.. _FeinCMS: https://github.com/feincms/feincms/
.. _django-tree-queries: https://github.com/matthiask/django-tree-queries/
.. _feincms3: https://feincms3.readthedocs.io/
