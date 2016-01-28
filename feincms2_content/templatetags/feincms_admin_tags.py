from __future__ import absolute_import, unicode_literals

from collections import OrderedDict

from django import template
from django.contrib.auth import get_permission_codename
from django.utils.text import capfirst


register = template.Library()


@register.inclusion_tag('admin/feincms/plugin_selection_widget.html',
                        takes_context=True)
def show_plugin_selection_widget(context, region):
    """
    {% show_plugin_selection_widget region %}
    """
    user = context['request'].user
    types = OrderedDict({None: []})

    for plugin in region._plugins:
        # Skip cts that we shouldn't be adding anyway
        opts = plugin._meta
        perm = opts.app_label + "." + get_permission_codename('add', opts)
        if not user.has_perm(perm):
            continue

        types.setdefault(
            getattr(plugin, 'optgroup', None),
            [],
        ).append((
            '%s_%s' % (
                plugin._meta.app_label,
                plugin._meta.model_name,
            ),
            capfirst(plugin._meta.verbose_name),
        ))

    return {'types': types}
