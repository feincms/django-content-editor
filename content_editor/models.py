"""
This is the core of FeinCMS

All models defined here are abstract, which means no tables are created in
the feincms\_ namespace.
"""

from __future__ import unicode_literals

from collections import defaultdict
import operator

from django.db import models
from django.utils.encoding import python_2_unicode_compatible


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

    def __init__(self, item, plugins):
        self.item = item
        self.plugins = plugins

        contents = defaultdict(lambda: defaultdict(list))
        parents = set()

        for plugin in self.plugins:
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
            setattr(
                self,
                region.name,
                sorted(c, key=operator.attrgetter('ordering')))

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


def create_plugin_base(content_base):
    """
    This is purely an internal method. Here, we create a base class for
    the concrete content types, which are built in
    ``create_plugin``.

    The three fields added to build a concrete content type class/model
    are ``parent``, ``region`` and ``ordering``.
    """

    @python_2_unicode_compatible
    class PluginBase(models.Model):
        parent = models.ForeignKey(
            content_base,
            related_name='%(app_label)s_%(class)s_set',
            on_delete=models.CASCADE,
        )
        region = models.CharField(max_length=255)
        ordering = models.IntegerField(default=0)

        class Meta:
            abstract = True
            app_label = content_base._meta.app_label
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
