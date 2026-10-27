from django import template


register = template.Library()


@register.simple_tag(takes_context=True)
def render_region(context, regions, region, **kwargs):
    """
    Render a single region. See
    :class:`~content_editor.renderer.RegionRenderer` for additional details.

    Usage::

        {% load content_editor %}
        {% render_region regions "main" %}
    """
    return regions.render(region, context, **kwargs)
