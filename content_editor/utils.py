from __future__ import unicode_literals

from collections import defaultdict
from itertools import chain
from operator import attrgetter


__all__ = ('Contents', 'ContentProxy', 'MPTTContentProxy')


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

    def __iter__(self):
        if not self._sorted:
            self._sort()
        return chain.from_iterable(
            self._contents[region.key] for region in self._regions
        )


class ContentProxy(Contents):
    # Ugly!
    def __init__(self, item, plugins):
        super(ContentProxy, self).__init__(item.regions)

        for plugin in plugins:
            queryset = plugin.get_queryset().filter(parent=item)
            queryset._known_related_objects.setdefault(
                plugin._meta.get_field('parent'),
                {},
            ).update({item.pk: item})
            for obj in queryset:
                self.add(obj)


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
            setattr(self, region.key, [])

            if region.inherited:
                for ancestor in ancestors:
                    content = contents[ancestor][region.key]

                    if content:
                        setattr(self, region.key, sorted(
                            content,
                            key=attrgetter('ordering'),
                        ))
                        break

            else:
                setattr(self, region.key, sorted(
                    contents[ancestors[0]][region.key],
                    key=attrgetter('ordering'),
                ))
