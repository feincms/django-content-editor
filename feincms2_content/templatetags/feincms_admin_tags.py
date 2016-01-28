from __future__ import absolute_import, unicode_literals

from collections import OrderedDict

from django import template
from django.contrib.auth import get_permission_codename
from django.utils.text import capfirst


register = template.Library()


@register.inclusion_tag('admin/feincms/content_type_selection_widget.html',
                        takes_context=True)
def show_content_type_selection_widget(context, region):
    """
    {% show_content_type_selection_widget region %}
    """
    user = context['request'].user
    types = OrderedDict({None: []})

    for ct in region._plugins:
        # Skip cts that we shouldn't be adding anyway
        opts = ct._meta
        perm = opts.app_label + "." + get_permission_codename('add', opts)
        if not user.has_perm(perm):
            continue

        types.setdefault(
            getattr(ct, 'optgroup', None),
            [],
        ).append((
            '%s_%s' % (
                ct._meta.app_label,
                ct._meta.model_name,
            ),
            capfirst(ct._meta.verbose_name),
        ))

    return {'types': types}
