from __future__ import unicode_literals

from collections import defaultdict
from operator import attrgetter

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
    def __init__(self, item, plugins):
        contents = defaultdict(list)

        for plugin in plugins:
            queryset = plugin.get_queryset().filter(parent=item)
            queryset._known_related_objects.setdefault(
                plugin._meta.get_field('parent'),
                {},
            ).update({item.pk: item})

            for obj in queryset:
                contents[obj.region].append(obj)

        for region in item.regions:
            setattr(self, region.name, sorted(
                contents.get(region.name, []),
                key=attrgetter('ordering'),
            ))


class MPTTContentProxy(object):
    def __init__(self, item, plugins):
        contents = defaultdict(lambda: defaultdict(list))
        ancestors = [item] + list(item.get_ancestors(ascending=True))
        ancestor_dict = {ancestor.pk: ancestor for ancestor in ancestors}

        for plugin in plugins:
            queryset = plugin.get_queryset().filter(
                parent__in=ancestor_dict.keys(),
            )
            queryset._known_related_objects.setdefault(
                plugin._meta.get_field('parent'),
                {},
            ).update(ancestor_dict)

            for obj in queryset:
                contents[obj.parent][obj.region].append(obj)

        for region in item.regions:
            setattr(self, region.name, [])

            if region.inherited:
                for ancestor in ancestors:
                    content = contents[ancestor][region.name]

                    if content:
                        setattr(self, region.name, sorted(
                            content,
                            key=attrgetter('ordering'),
                        ))
                        break

            else:
                setattr(self, region.name, sorted(
                    contents[ancestors[0]][region.name],
                    key=attrgetter('ordering'),
                ))


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

        def __str__(self):  # pragma: no cover
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

        def render(self, **kwargs):  # pragma: no cover
            raise NotImplementedError

        @classmethod
        def get_queryset(cls):
            return cls.objects.all()

    return PluginBase
