from __future__ import unicode_literals

from itertools import chain
from operator import attrgetter


__all__ = (
    'Contents',
    'contents_for_items',
    'contents_for_item',
    'contents_for_mptt_item',
)


class Contents(object):
    def __init__(self, regions):
        self._regions = regions
        self._sorted = False
        self._contents = {region.key: [] for region in self._regions}
        self._unknown_region_contents = []

    def add(self, content):
        self._sorted = False
        try:
            self._contents[content.region].append(content)
        except KeyError:
            # TODO Document or delete this.
            self._unknown_region_contents.append(content)

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

    def __len__(self):
        return sum((len(contents) for contents in self._contents.values()), 0)

    def inherit_regions(self, contents):
        for region in self._regions:
            if not region.inherited or self[region.key]:
                continue
            self._contents[region.key] = contents[region.key]  # Still sorted

    def render_regions(self, renderer):
        return {
            region.key: renderer.render(self[region.key])
            for region in self._regions
        }


def contents_for_items(items, plugins):
    contents = {item: Contents(item.regions) for item in items}
    items_dict = {item.pk: item for item in items}
    for plugin in plugins:
        queryset = plugin.get_queryset().filter(parent__in=contents.keys())
        queryset._known_related_objects.setdefault(
            plugin._meta.get_field('parent'),
            {},
        ).update(items_dict)
        for obj in queryset:
            contents[obj.parent].add(obj)
    return contents


def contents_for_item(item, plugins):
    return contents_for_items([item], plugins)[item]


def contents_for_mptt_item(item, plugins):
    ancestors = list(item.get_ancestors(ascending=True))
    all_contents = contents_for_items([item] + ancestors, plugins)
    contents = all_contents[item]
    for ancestor in ancestors:
        contents.inherit_regions(all_contents[ancestor])
    return contents
