from collections import defaultdict


__all__ = ("compute_depths",)


def _parent_field(plugin, content_model):
    return next(
        field
        for field in plugin._meta.fields
        if field.many_to_one
        and field.related_model._meta.label_lower == content_model._meta.label_lower
    )


def compute_depths(content_model, *, plugins, openers, closers):
    """
    Compute the ``depth`` of plugins from the closer-based section structure
    and delete the closers

    ``openers`` are the plugin models which opened a section
    (``sections = 1``), ``closers`` those which closed one
    (``sections = -1``), ``plugins`` all remaining plugin models. Sections
    which are still open at the end of a region simply end there. Meant to be
    used in data migrations::

        def forwards(apps, schema_editor):
            compute_depths(
                apps.get_model("pages", "Page"),
                plugins=[apps.get_model("pages", "RichText"), ...],
                openers=[apps.get_model("pages", "Accordion")],
                closers=[apps.get_model("pages", "CloseSection")],
            )
    """
    regions = defaultdict(list)
    for models, kind in [(closers, -1), (openers, 1), (plugins, 0)]:
        for model in models:
            parent = _parent_field(model, content_model).attname
            for plugin in model._base_manager.all():
                regions[getattr(plugin, parent), plugin.region].append((plugin, kind))

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
