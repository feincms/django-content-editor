import inspect
import warnings
from collections import deque

from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.template import Context, Engine
from django.utils.functional import SimpleLazyObject
from django.utils.html import mark_safe

from content_editor.contents import contents_for_item


__all__ = (
    "PluginNotRegisteredError",
    "RegionRenderer",
    "default_context",
    "render_in_context",
    "template_renderer",
)


class PluginNotRegisteredError(Exception):
    """
    Exception raised when encountering a plugin which isn't known to the
    renderer.
    """


def default_context(plugin, context):
    """
    Return the default context for plugins rendered with a template, which
    simply is a single variable named ``plugin`` containing the plugin
    instance.
    """
    return {"plugin": plugin}


def render_in_context(context, template, local_context=None):
    """Render using a template rendering context

    This utility avoids the problem of ``render_to_string`` requiring a
    ``dict`` and not a full-blown ``Context`` instance which would needlessly
    burn CPU cycles."""

    if context is None:
        context = Context()

    if not hasattr(template, "render"):  # Quacks like a template?
        try:
            engine = context.template.engine
        except AttributeError:
            engine = Engine.get_default()

        if isinstance(template, (list, tuple)):
            template = engine.select_template(template)
        else:
            template = engine.get_template(template)

    with context.push(local_context):
        return template.render(context)


def template_renderer(template_name, local_context=default_context, /):
    """
    Build a renderer for the region renderer which uses a template (or a list
    of templates) and optionally a local context function. The context contains
    the site-wide context variables too when invoked via ``{% render_region %}``
    """
    return lambda plugin, context: render_in_context(
        context, template_name, local_context(plugin, context)
    )


# See RegionRenderer.register()
_default_marks = {"default"}
_plugin = 0
_renderer = 1
_subregion = 2
_marks = 3
_fetch = 4


class RegionRenderer:
    """
    The region renderer knows how to render single plugins and also complete
    regions.

    The basic usage is to instantiate the region renderer, register plugins
    and render a full region with it.
    """

    def __init__(self):
        self._plugins = {}
        self._handlers = {
            key[7:]: getattr(self, key)
            for key in dir(self)
            if key.startswith("handle_")
        }

    def copy(self):
        """
        Return a shallow copy of the renderer
        """
        obj = self.__class__()
        obj._plugins = dict(self._plugins)
        return obj

    def unregister(self, *plugins, keep=()):
        """
        Unregister plugins

        You can either pass a list of plugins which should be unregistered:

        .. code-block:: python

            renderer.unregister(HTML, RichText)

        Or you can specify which plugins should be kept:

        .. code-block:: python

            renderer.unregister(keep=(HTML, RichText))

        You cannot do both at the same time.

        Plugins can either be the plugin classes themselves or base classes.
        """
        if bool(plugins) == bool(keep):
            raise ImproperlyConfigured(
                "Only ever provide either a list of plugins or a list of plugins to keep."
            )

        test = (
            (lambda cls: not issubclass(cls, plugins))
            if plugins
            else (lambda cls: issubclass(cls, tuple(keep)))
        )
        self._plugins = {
            plugin: cfg for plugin, cfg in self._plugins.items() if test(plugin)
        }

    def register(
        self,
        plugin,
        renderer,
        /,
        *,
        subregion="default",
        marks=_default_marks,
        fetch=True,
    ):
        """
        Register a plugin class

        The renderer is either a static value or a function which always
        receives two arguments: The plugin instance and the context. When using
        ``{% render_region %}`` and the Django template language the context
        will be a Django template ``Context`` (or even ``RequestContext``)
        instance.

        The three optional keyword arguments' are:

        - ``subregion: str = "default"``: The subregion for this plugin as a
          string or as a callable accepting a single plugin instance. A
          matching ``handle_<subregion>`` callable has to exist on the region
          renderer instance or rendering **will** crash loudly.
        - ``marks: Set[str] = {"default"}``: The marks of this plugin. Marks
          only have the meaning you assign to them. Marks are preferrable to
          running ``isinstance`` on plugin instances especially when using the
          same region renderer class for different content types (e.g. pages
          and blog articles).
        - ``fetch = True``: By default a plugin is fetched from the database;
          setting this to ``False`` allows registering plugin classes which
          shouldn't be fetched from the database.
        """
        if callable(renderer) and len(inspect.signature(renderer).parameters) < 2:
            raise ImproperlyConfigured(
                f"The renderer function {renderer} has less than the two required arguments."
            )

        if not isinstance(plugin, (list, tuple)):
            plugin = [plugin]

        for p in plugin:
            if p in self._plugins:
                warnings.warn(
                    f"The plugin {p} has already been registered with {self.__class__} before.",
                    stacklevel=2,
                )

            if p._meta.proxy and fetch:
                warnings.warn(
                    f'The plugin {p} is a proxy but is also registered with the default "fetch=True". This can cause plugins to be fetched (and rendered) twice.',
                    stacklevel=2,
                )

            self._plugins[p] = (p, renderer, subregion, marks, fetch)

    def plugins(self, *, fetch=True):
        """
        Return a list of all registered plugin classes

        By default and because of backwards compatibility concerns the method
        only returns plugins which have been registered for fetching.
        """
        return [
            cfg[_plugin]
            for cfg in self._plugins.values()
            if (cfg[_fetch] if fetch else True)
        ]

    def _config(self, plugin):
        try:
            return self._plugins[plugin.__class__]
        except KeyError as exc:
            raise PluginNotRegisteredError(
                f"Plugin {plugin._meta.label_lower} is not registered"
            ) from exc

    def render_plugin(self, plugin, context):
        """
        Render a single plugin using the registered renderer
        """
        renderer = self._config(plugin)[_renderer]
        if callable(renderer):
            return renderer(plugin, context)
        return renderer

    def subregion(self, plugin):
        """
        Return the subregion of a plugin instance
        """
        subregion = self._config(plugin)[_subregion]
        if callable(subregion):
            return subregion(plugin)
        return subregion

    def takewhile_subregion(self, plugins, subregion):
        """
        Yield all plugins from the head of the ``plugins`` deque as long as
        their subregion equals ``subregion``.
        """
        while plugins and self.subregion(plugins[0]) == subregion:
            yield plugins.popleft()

    def marks(self, plugin):
        """
        Return the marks of a plugin instance
        """
        marks = self._config(plugin)[_marks]
        if callable(marks):
            return marks(plugin)
        return marks

    def takewhile_mark(self, plugins, mark):
        """
        Yield all plugins from the head of the ``plugins`` deque as long as
        their marks include ``mark``.
        """
        while plugins and mark in self.marks(plugins[0]):
            yield plugins.popleft()

    def handle(self, plugins, context):
        """
        Runs the ``handle_<subregion>`` handler for the head of the ``plugins``
        deque.

        This method requires that a matching handler for all values returned by
        ``self.subregion()`` exists.

        You probably want to call this method when overriding the rendering of
        a complete region.
        """
        plugins = deque(plugins)
        while plugins:
            yield from self._handlers[self.subregion(plugins[0])](plugins, context)

    def handle_default(self, plugins, context):
        """
        Renders plugins from the queue as long as there are plugins belonging
        to the ``default`` subregion.
        """
        for plugin in self.takewhile_subregion(plugins, "default"):
            yield self.render_plugin(plugin, context)

    def render_region(self, *, region, contents, context):
        """
        Render one region.
        """
        return mark_safe("".join(self.handle(contents[region.key], context)))

    def render_regions(self, *, regions, contents, context):
        """
        Render multiple regions.

        This method should return a dictionary.
        """
        return {
            region.key: self.render_region(
                region=region, contents=contents, context=context
            )
            for region in regions
        }

    # Main external rendering API

    def regions_from_contents(self, contents, **kwargs):
        """
        Return an opaque object encapsulating
        :mod:`content_editor.contents.Contents` and the logic required to
        render them.

        All you need to know is that the return value has a ``regions``
        attribute containing a list of regions and a ``render`` method
        accepting a region key and a context instance.
        """
        return _Regions(contents=contents, renderer=self, **kwargs)

    def regions_from_item(self, item, /, *, inherit_from=None, timeout=None, **kwargs):
        """
        Return an opaque object, see
        :func:`~content_editor.renderer.RegionRenderer.regions_from_contents`

        Automatically caches the return value if ``timeout`` is truthy. The
        default cache key only takes the ``item``'s class and primary key into
        account. You may have to override the cache key by passing
        ``cache_key`` if you're doing strange^Wadvanced things.
        """
        if timeout and kwargs.get("cache_key") is None:
            kwargs["cache_key"] = f"regions-{item._meta.label_lower}-{item.pk}"

        contents = SimpleLazyObject(
            lambda: contents_for_item(item, self.plugins(), inherit_from=inherit_from)
        )
        return self.regions_from_contents(contents, timeout=timeout, **kwargs)


class _Regions:
    """
    Opaque object implementing the following interface:

    - ``regions``: A list of regions used for the content editor ``Contents``
      instance.
    - ``render(region_key, context)``: A function which actually runs the
      renderer.
    """

    def __init__(self, *, contents, renderer, cache_key=None, timeout=None):
        self._contents = contents
        self._renderer = renderer
        self._cache_key = cache_key
        self._timeout = timeout

    def _rendered(self, context):
        caching = self._cache_key and self._timeout
        if caching and (result := cache.get(self._cache_key)):
            return result
        result = self._renderer.render_regions(
            regions=self.regions, contents=self._contents, context=context
        )
        if caching:
            cache.set(self._cache_key, result, timeout=self._timeout)
        return result

    @property
    def regions(self):
        return self._contents.regions

    def render(self, region_key, context):
        rendered = self._rendered(context)
        return rendered.get(region_key, "")
