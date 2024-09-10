from itertools import chain
from operator import attrgetter


__all__ = ("Contents", "contents_for_items", "contents_for_item")


class Contents:
    def __init__(self, regions):
        self.regions = regions
        self._sorted = False
        self._contents = {region.key: [] for region in self.regions}
        self._unknown_region_contents = []

    def add(self, content):
        self._sorted = False
        try:
            self._contents[content.region].append(content)
        except KeyError:
            self._unknown_region_contents.append(content)

    def _sort(self):
        for region_key in list(self._contents):
            self._contents[region_key] = sorted(
                self._contents[region_key], key=attrgetter("ordering")
            )
        self._sorted = True

    def __getattr__(self, key):
        if key.startswith("_"):
            raise AttributeError(f"Invalid region key {key!r} on {self!r}")
        if not self._sorted:
            self._sort()
        return self._contents.get(key, [])

    def __getitem__(self, key):
        if key.startswith("_"):
            raise KeyError(f"Invalid region key {key!r} on {self!r}")
        if not self._sorted:
            self._sort()
        return self._contents.get(key, [])

    def __iter__(self):
        if not self._sorted:
            self._sort()
        return chain.from_iterable(
            self._contents[region.key] for region in self.regions
        )

    def __len__(self):
        return sum((len(contents) for contents in self._contents.values()), 0)

    def inherit_regions(self, contents):
        for region in self.regions:
            if not region.inherited or self[region.key]:
                continue
            self._contents[region.key] = contents[region.key]  # Still sorted


def contents_for_items(items, plugins, *, regions=None):
    contents = {item: Contents(regions or item.regions) for item in items}
    items_dict = {item.pk: item for item in contents}
    for plugin in plugins:
        queryset = plugin.get_queryset().filter(parent__in=contents.keys())
        if regions is not None:
            queryset = queryset.filter(region__in=[region.key for region in regions])
        queryset._known_related_objects.setdefault(
            plugin._meta.get_field("parent"), {}
        ).update(items_dict)
        for obj in queryset:
            contents[obj.parent].add(obj)
    return contents


def contents_for_item(item, plugins, *, inherit_from=None, regions=None):
    inherit_from = list(inherit_from) if inherit_from else []
    all_contents = contents_for_items(
        [item] + inherit_from, plugins=plugins, regions=regions
    )
    contents = all_contents[item]
    for other in inherit_from:
        contents.inherit_regions(all_contents[other])
    return contents
