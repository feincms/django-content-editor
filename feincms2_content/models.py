"""
This is the core of FeinCMS

All models defined here are abstract, which means no tables are created in
the feincms\_ namespace.
"""

from __future__ import unicode_literals

from collections import defaultdict
import operator

from django.core.exceptions import ImproperlyConfigured
from django.db import models
from django.utils.encoding import python_2_unicode_compatible
from django.utils.functional import cached_property
from django.utils.translation import ugettext_lazy as _


class _DataType(object):
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            if not hasattr(self, key):
                raise TypeError(
                    '%s() received an invalid keyword %r. as_view '
                    'only accepts arguments that are already '
                    'attributes of the class.' % (
                        self.__class__.__name__,
                        key,
                    )
                )

            setattr(self, key, value)


class Region(_DataType):
    name = ''
    title = 'unnamed'
    inherited = False


class Template(_DataType):
    name = ''
    template_name = None
    title = ''
    regions = []


class ContentProxy(object):
    """
    The ``ContentProxy`` is responsible for loading the plugins for all
    regions (including inherited regions)
    """

    def __init__(self, item):
        self.item = item
        self.db = item._state.db

        contents = defaultdict(lambda: defaultdict(list))
        parents = set()

        for plugin in self.item.plugins.values():
            if hasattr(self.item, 'get_ancestors'):
                queryset = plugin.get_queryset().filter(
                    parent__in=self.item.get_ancestors(include_self=True),
                )
            else:
                queryset = plugin.get_queryset().filter(
                    parent=self.item,
                )

            # queryset._known_related_objects[
            #     self.item._meta.get_field('parent')
            # ] = {self.item.pk: self.item}

            for obj in queryset:
                contents[obj.parent][obj.region].append(obj)
                parents.add(obj.parent)

        regions = {r.name: r for r in self.item.template.regions}

        def _assign_contents(self, item, region):
            c = contents[item][region.name]
            setattr(self, region.name, c)
            if c or not region.inherited:
                # We have contents, or an empty non-inheritable region
                del regions[region.name]

        for region in list(regions.values()):
            _assign_contents(self, self.item, region)

        if not regions:
            # Early exit
            return

        parents = sorted(
            parents,
            key=operator.attrgetter(self.item._mptt_meta.level_attr),
            reverse=True,
        )

        for obj in parents:
            for region in list(regions.values()):
                _assign_contents(self, obj, region)

            if not regions:
                break

    def all_of_types(self, types):
        """
        Returns all plugin instances of the types tuple passed
        """

        content_list = []
        for type, contents in self._cache['cts'].items():
            if any(issubclass(type, t) for t in types):
                content_list.extend(contents)

        return sorted(content_list, key=lambda c: c.ordering)


def create_plugin_base(content_model):
    """
    This is purely an internal method. Here, we create a base class for
    the concrete content types, which are built in
    ``create_content_type``.

    The three fields added to build a concrete content type class/model
    are ``parent``, ``region`` and ``ordering``.
    """

    @python_2_unicode_compatible
    class PluginBase(models.Model):
        parent = models.ForeignKey(content_model)
        region = models.CharField(max_length=255)
        ordering = models.IntegerField(_('ordering'), default=0)

        class Meta:
            abstract = True
            app_label = content_model._meta.app_label
            ordering = ['ordering']

        def __str__(self):
            return (
                '%s<pk=%s, parent=%s<pk=%s, %s>, region=%s,'
                ' ordering=%d>') % (
                self.__class__.__name__,
                self.pk,
                self.parent.__class__.__name__,
                self.parent.pk,
                self.parent,
                self.region,
                self.ordering,
            )

        def render(self, **kwargs):
            raise NotImplementedError

        @classmethod
        def get_queryset(cls):
            return cls.objects.select_related()

    return PluginBase


def create_content_base(inherit_from=models.Model):
    """
    This method can  be used to create a FeinCMS base model inheriting from
    your own custom subclass (f.e. extend ``MPTTModel``). The default is to
    extend :class:`django.db.models.Model`.
    """

    class ContentBase(inherit_from):
        """
        This is the base class for your CMS models. It knows how to create and
        manage content types.
        """

        class Meta:
            abstract = True

        #: ``ContentProxy`` class this object uses to collect content blocks
        content_proxy_class = ContentProxy

        @cached_property
        def content(self):
            """
            Instantiate and return a ``ContentProxy``. You can use your own
            custom ``ContentProxy`` by assigning a different class to the
            ``content_proxy_class`` member variable.
            """
            return self.content_proxy_class(self)

        @classmethod
        def create_plugin(cls, model, regions=None, class_name=None,
                          **kwargs):
            """
            This is the method you'll use to create concrete plugins.

            If the CMS base class is ``page.models.Page``, its database table
            will be ``page_page``. A concrete plugin which is created
            from ``ImageContent`` will use ``page_page_imagecontent`` as its
            table.

            If you want a plugin only available in a subset of regions,
            you can pass a list/tuple of region keys as ``regions``. The
            content type will only appear in the corresponding tabs in the item
            editor.

            If you use two content types with the same name in the same module,
            name clashes will happen and the content type created first will
            shadow all subsequent content types. You can work around it by
            specifying the content type class name using the ``class_name``
            argument. Please note that this will have an effect on the entries
            in ``django_content_type``, on ``related_name`` and on the table
            name used and should therefore not be changed after running
            ``syncdb`` for the first time.

            Name clashes will also happen if a content type has defined a
            relationship and you try to register that content type to more than
            one Base model (in different modules).  Django will raise an error
            when it tries to create the backward relationship. The solution to
            that problem is, as shown above, to specify the content type class
            name with the ``class_name`` argument.

            If you register a content type to more than one Base class, it is
            recommended to always specify a ``class_name`` when registering it
            a second time.

            You can pass additional keyword arguments to this factory function.
            These keyword arguments will be passed on to the concrete content
            type, provided that it has a ``initialize_type`` classmethod. This
            is used f.e. in ``MediaFileContent`` to pass a set of possible
            media positions (f.e. left, right, centered) through to the content
            type.
            """

            if not class_name:
                class_name = model.__name__

            if not model._meta.abstract:
                raise ImproperlyConfigured(
                    'Cannot create content type from'
                    ' non-abstract model (yet).')

            if not hasattr(cls, '_plugin_base'):
                cls._plugin_base = create_plugin_base(cls)

            class Meta(cls._plugin_base.Meta):
                db_table = '%s_%s' % (cls._meta.db_table, class_name.lower())
                verbose_name = model._meta.verbose_name
                verbose_name_plural = model._meta.verbose_name_plural
                permissions = model._meta.permissions

            attrs = {
                # put the concrete plugin into the
                # same module as the CMS base type; this is
                # necessary because 1. Django needs to know
                # the module where a model lives and 2. a
                # content type may be used by several CMS
                # base models at the same time (i.e. in
                # a blog and a page app)
                '__module__': cls.__module__,
                'Meta': Meta,
            }

            new_type = type(
                str(class_name),  # str is correct for PY2 and PY3
                (model, cls._plugin_base),
                attrs,
            )

            # customization hook.
            if hasattr(new_type, 'initialize_type'):
                new_type.initialize_type(**kwargs)
            else:
                for k, v in kwargs.items():
                    setattr(new_type, k, v)

            if not hasattr(cls, 'plugins'):
                cls.plugins = {}
            cls.plugins[model] = new_type
            return new_type

    return ContentBase
