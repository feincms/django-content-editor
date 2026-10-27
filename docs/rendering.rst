=========
Rendering
=========

The ``content_editor.renderer`` module contains the ``RegionRenderer``, which
knows how to fetch plugins, render single plugins, and render whole regions.
It was moved here from feincms3_; ``feincms3.renderer`` builds on it.


Registering plugins
===================

Plugins are registered together with a renderer. The renderer is either a
static value or a function receiving the plugin instance and the template
context:

.. code-block:: python

    from django.utils.html import mark_safe

    from content_editor.renderer import RegionRenderer, template_renderer

    renderer = RegionRenderer()
    renderer.register(
        RichText,
        lambda plugin, context: mark_safe(plugin.text),
    )
    renderer.register(
        Download,
        template_renderer("plugins/download.html"),
    )

The template used by ``template_renderer`` receives the plugin instance as
``plugin``. A second argument may be passed to ``template_renderer``, a
function receiving the plugin and the template context and returning the
local context for the template.

``register`` accepts the following optional keyword arguments:

- ``subregion="default"``: The subregion of the plugin, as a string or a
  callable accepting the plugin instance. See `Subregions`_ below.
- ``marks={"default"}``: A set of marks, or a callable accepting the plugin
  instance and returning a set. Marks only have the meaning you assign to
  them; ``marks(plugin)`` returns them and ``takewhile_mark(plugins, mark)``
  consumes plugins from the head of a deque as long as they have the mark.
- ``fetch=True``: Set to ``False`` for plugin classes which shouldn't be
  fetched from the database, e.g. proxies sharing their table with another
  registered plugin.

``unregister(*plugins)`` and ``unregister(keep=[...])`` remove plugins again,
``copy()`` returns a shallow copy of the renderer.


Rendering regions
=================

``regions_from_item`` fetches the plugins (using ``contents_for_item``) lazily
and returns an object with a ``regions`` attribute and a
``render(region_key, context)`` method. Passing ``timeout`` caches the
rendered regions, ``inherit_from`` is passed on to ``contents_for_item``.
``regions_from_contents`` does the same for an existing ``Contents``
instance.

.. code-block:: python

    def article_detail(request, pk):
        article = get_object_or_404(Article, pk=pk)
        return render(
            request,
            "app/article_detail.html",
            {
                "article": article,
                "regions": renderer.regions_from_item(article, timeout=60),
            },
        )

.. code-block:: html+django

    {% load content_editor %}

    <article>{% render_region regions "main" %}</article>

The template tag passes the surrounding template context to the plugin
renderers, so plugin templates have access to e.g. ``request``.


Subregions
==========

Subregions group adjacent plugins when rendering. A run of plugins sharing a
subregion is passed to the renderer's ``handle_<subregion>`` method as a
deque; the method consumes the plugins it handles from the head of the deque,
usually using ``takewhile_subregion``. ``handle_default`` renders plugins one
by one.

.. code-block:: python

    class SmartRegionRenderer(RegionRenderer):
        def handle_teasers(self, plugins, context):
            yield '<div class="teasers">'
            for plugin in self.takewhile_subregion(plugins, "teasers"):
                yield self.render_plugin(plugin, context)
            yield "</div>"

    renderer = SmartRegionRenderer()
    renderer.register(ArticleTeaser, ..., subregion="teasers")
    renderer.register(ProjectTeaser, ..., subregion="teasers")


.. _feincms3: https://feincms3.readthedocs.io/
