from __future__ import absolute_import, unicode_literals

from django.utils.html import format_html_join, mark_safe


class PluginRenderer(object):
    def __init__(self):
        self._renderers = {}

    def register(self, plugin, renderer):
        self._renderers[plugin] = renderer

    def fallback(self, plugin):
        return mark_safe('<!-- %s: %s -->' % (
            plugin._meta.label,
            plugin,
        ))

    def render(self, plugins):
        return format_html_join('\n', '{}', (
            (self._renderers.get(plugin.__class__, self.fallback)(plugin),)
            for plugin in plugins
        ))

    def plugins(self):
        return self._renderers.keys()
