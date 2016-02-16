from __future__ import absolute_import, unicode_literals

import json

from django import forms
from django.contrib.admin.options import ModelAdmin, StackedInline
from django.utils.html import format_html
from django.utils.text import capfirst
from django.utils.translation import ugettext


class ContentEditorForm(forms.ModelForm):
    """
    The item editor form contains hidden region and ordering fields and should
    be used for all content type inlines.
    """
    region = forms.CharField(widget=forms.HiddenInput())
    ordering = forms.IntegerField(widget=forms.HiddenInput())


class ContentEditorInline(StackedInline):
    """
    Custom ``InlineModelAdmin`` subclass used for content types.
    """
    form = ContentEditorForm
    extra = 0
    fk_name = 'parent'

    @classmethod
    def create(cls, model, **kwargs):
        kwargs['model'] = model
        return type(
            str('ContentEditorInline_%s_%s' % (
                model._meta.app_label,
                model._meta.model_name,
            )),
            (cls,),
            kwargs,
        )


class ContentEditor(ModelAdmin):
    """
    The ``ContentEditor`` is a drop-in replacement for ``ModelAdmin`` with the
    speciality of knowing how to work with :class:`feincms.models.Base`
    subclasses and associated plugins.

    It does not have any public API except from everything inherited from'
    the standard ``ModelAdmin`` class.
    """

    class Media:
        css = {'all': (
            'content_editor/content_editor.css',
        )}
        js = (
            'content_editor/jquery-ui-1.11.4.custom.min.js',
            'content_editor/content_editor.js',
            'content_editor/tabbed_fieldsets.js',
        )

    def _content_editor_context(self, request, context):
        plugins = [
            iaf.opts.model
            for iaf in context.get('inline_admin_formsets', [])
            if isinstance(iaf.opts, ContentEditorInline)
        ]
        instance = context.get('original')
        if not instance:
            instance = self.model()

        return json.dumps({
            'plugins': [(
                '%s_%s' % (
                    plugin._meta.app_label,
                    plugin._meta.model_name,
                ),
                capfirst(plugin._meta.verbose_name)
            ) for plugin in plugins],
            'regions': [(
                region.key,
                region.title,
                # TODO correct template when POSTing
            ) for region in instance.regions],
            'messages': {
                'createNew': ugettext('Add new item'),
                'empty': ugettext('No items'),
            },
        })

    def render_change_form(self, request, context, **kwargs):
        response = super(ContentEditor, self).render_change_form(
            request, context, **kwargs)

        # Some sort of CSP-compatible inline JSON support in forms.Media would
        # be nice, but as long as we dont have that, inject the required data
        # into the response using a post render callback.
        script = format_html(
            '<script id="content-editor-context"'
            ' type="application/json" data-context="{}"></script>\n'
            '</head>',
            self._content_editor_context(request, response.context_data),
        ).encode('utf-8')

        def _callback(response):
            response.content = response.content.replace(
                b'</head>', script, 1)

        response.add_post_render_callback(_callback)
        return response
