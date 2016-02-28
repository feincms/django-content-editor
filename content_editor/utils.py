from __future__ import unicode_literals

from itertools import chain
from operator import attrgetter


__all__ = ('Contents', 'MPTTContentProxy')


class Contents(object):
    def __init__(self, regions):
        self._regions = regions
        self._sorted = False
        self._contents = {region.key: [] for region in self._regions}

    def add(self, content):
        self._sorted = False
        self._contents[content.region].append(content)

    def _sort(self):
        for region_key in list(self._contents):
            self._contents[region_key] = sorted(
                self._contents[region_key],
                key=attrgetter('ordering'),
            )
        self._sorted = True

    def __getattr__(self, key):
        if not self._sorted:
            self._sort()
        return self._contents.get(key, [])

    __getitem__ = __getattr__

    def __iter__(self):
        if not self._sorted:
            self._sort()
        return chain.from_iterable(
            self._contents[region.key] for region in self._regions
        )

    def inherit_regions(self, contents):
        for region in self._regions:
            if not region.inherited or self[region.key]:
                continue
            self._contents[region.key] = contents[region.key]  # Still sorted


def collect_contents(item, plugins):
    contents = Contents(item.regions)
    for plugin in plugins:
        queryset = plugin.get_queryset().filter(parent=item)
        queryset._known_related_objects.setdefault(
            plugin._meta.get_field('parent'),
            {},
        ).update({item.pk: item})
        for obj in queryset:
            contents.add(obj)
    return contents


class MPTTContentProxy(Contents):
    def __init__(self, item, plugins):
        super(MPTTContentProxy, self).__init__(item.regions)

        ancestors = item.get_ancestors(ascending=True)
        contents = {item: self}
        contents.update({
            ancestor: Contents(ancestor.regions)
            for ancestor in ancestors
        })

        ancestor_dict = {item.pk: item}
        ancestor_dict.update({ancestor.pk: ancestor for ancestor in ancestors})

        for plugin in plugins:
            queryset = plugin.get_queryset().filter(
                parent__in=contents.keys(),
            )
            queryset._known_related_objects.setdefault(
                plugin._meta.get_field('parent'),
                {},
            ).update(ancestor_dict)

            for obj in queryset:
                contents[obj.parent].add(obj)

        for ancestor in ancestors:
            self.inherit_regions(contents[ancestor])
