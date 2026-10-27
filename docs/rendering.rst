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


Containers
==========

Plugins whose models set ``container = True`` contain the following plugins
with a greater ``depth`` (see :ref:`containers`). Their renderer receives the
children explicitly, as a third argument:

.. code-block:: python

    renderer.register(
        Accordion,
        template_renderer("containers/accordion.html"),
    )
    renderer.register(
        Columns,
        lambda plugin, context, children: format_html(
            '<div class="columns">{}</div>', children
        ),
    )

``children`` is a sequence of nodes, one per child. Each node renders as the
child's HTML and has the child's ``plugin``; the sequence itself renders as
the concatenated HTML of all children. Templates used with
``template_renderer`` receive it as ``children``. A simple container template
only needs ``{{ children }}``, while e.g. tabs can loop over the nodes:

.. code-block:: html+django

    <div class="tabs">
      {% for child in children %}
        <h2>{{ child.plugin.title }}</h2>
        <div class="tab">{{ child }}</div>
      {% endfor %}
    </div>

Containers are declared on the model instead of being inferred from the data,
because empty containers have to be rendered as containers too. The model is
the one place both the content editor and the renderer read it from.

The top level of a region and the children of each container are rendered
using ``render_siblings(plugins, context)``, which dispatches runs of plugins
to their subregion's handler. Plugins whose preceding container is missing
(e.g. because it has been filtered out) are attached to the closest preceding
container with a lower depth, or rendered at the top level. Projects which
hide plugins should also hide the descendants of hidden containers.


Containers and subregions
=========================

Containers and subregions both group plugins, for different purposes:

- **Containers** are explicit structure. Editors create them in the content
  editor and see them there. Use them when the editor decides what belongs
  together: accordions, tabs, columns.
- **Subregions** are implicit grouping at render time, decided by the
  developer based on which plugins follow each other, and invisible in the
  editor. Use them for grouping which should just happen, e.g. rendering
  consecutive images as a gallery.

Rule of thumb: if the editor decides the grouping, use a container; if it
follows from adjacent plugin types, use a subregion.

Subregions only ever group siblings: a run of plugins never crosses a
container boundary, and consecutive images are grouped inside a container the
same way as at the top level.


.. _feincms3: https://feincms3.readthedocs.io/
