from collections import defaultdict

from django.db import models


__all__ = ("compute_depths",)


def _queryset(source, *, allow_proxies=True):
    if isinstance(source, models.QuerySet):
        return source
    if not allow_proxies and source._meta.proxy:
        raise ValueError(
            f"{source._meta.label} is a proxy model. Proxies share their table"
            " with other plugins, so pass a queryset selecting only the opening"
            " or closing plugins instead, e.g."
            ' JSONPlugin.objects.filter(type="close_section").'
        )
    return source._base_manager.all()


def compute_depths(*, plugins, openers, closers):
    """
    Compute the ``depth`` of plugins from the closer-based section structure
    and delete the closers

    ``openers`` are the plugins which opened a section (``sections = 1``),
    ``closers`` those which closed one (``sections = -1``), ``plugins`` all
    remaining plugins. Each entry is either a plugin model or a queryset.
    Plugins are grouped by their ``parent`` and region, so the plugins of
    several content models can be passed at once.
    Proxies sharing a table (e.g. JSON plugins) have to be passed as
    querysets when they open or close sections, since models are fetched
    without filtering. Every row is only processed once; closers take
    precedence over openers and openers over the remaining plugins. Sections
    which are still open at the end of a region simply end there. Meant to be
    used in data migrations::

        def forwards(apps, schema_editor):
            JSONPlugin = apps.get_model("pages", "JSONPlugin")
            compute_depths(
                plugins=[apps.get_model("pages", "RichText"), JSONPlugin],
                openers=[apps.get_model("pages", "Accordion")],
                closers=[JSONPlugin.objects.filter(type="close_section")],
            )
    """
    regions = defaultdict(list)
    seen = set()
    for sources, kind in [(closers, -1), (openers, 1), (plugins, 0)]:
        for source in sources:
            queryset = _queryset(source, allow_proxies=kind == 0)
            parent = queryset.model._meta.get_field("parent")
            content_model = parent.related_model._meta.label_lower
            for plugin in queryset:
                key = (plugin._meta.concrete_model._meta.label_lower, plugin.pk)
                if key in seen:
                    continue
                seen.add(key)
                regions[
                    content_model, getattr(plugin, parent.attname), plugin.region
                ].append((plugin, kind))

    updates = defaultdict(list)
    deletions = defaultdict(list)
    for items in regions.values():
        items.sort(key=lambda row: row[0].ordering)
        depth = 0
        for plugin, kind in items:
            if kind < 0:
                depth = max(0, depth - 1)
                deletions[plugin.__class__].append(plugin.pk)
                continue
            if plugin.depth != depth:
                plugin.depth = depth
                updates[plugin.__class__].append(plugin)
            depth += kind

    for model, objects in updates.items():
        model._base_manager.bulk_update(objects, ["depth"])
    for model, pks in deletions.items():
        model._base_manager.filter(pk__in=pks).delete()
