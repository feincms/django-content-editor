from __future__ import absolute_import, unicode_literals

import json

from django import forms
from django.contrib.admin.checks import (
    InlineModelAdminChecks, ModelAdminChecks,
)
from django.contrib.admin.options import ModelAdmin, StackedInline
from django.contrib.admin.utils import flatten_fieldsets
from django.core import checks
from django.utils.encoding import force_text
from django.utils.text import capfirst
from django.utils.translation import ugettext

from js_asset.js import JS


__all__ = ('ContentEditorInline', 'ContentEditor')


class ContentEditorChecks(ModelAdminChecks):
    def check(self, admin_obj, **kwargs):
        errors = super(ContentEditorChecks, self).check(admin_obj, **kwargs)
        errors.extend(self.check_content_editor_regions_attribute(admin_obj))
        return errors

    def check_content_editor_regions_attribute(self, admin_obj):
        if not getattr(admin_obj.model, 'regions', False):
            return [checks.Error(
                "ContentEditor models require a non-empty 'regions'"
                " attribute or property.",
                obj=admin_obj.__class__,
                id='content_editor.E002',
            )]

        return []


class ContentEditorInlineChecks(InlineModelAdminChecks):
    def check(self, inline_obj, **kwargs):
        errors = super(ContentEditorInlineChecks, self).check(
            inline_obj, **kwargs)
        errors.extend(self.check_content_editor_fields_in_fieldset(inline_obj))
        return errors

    def check_content_editor_fields_in_fieldset(self, obj):
        if obj.fieldsets is None:
            return []

        fields = flatten_fieldsets(obj.fieldsets)
        if all(field in fields for field in ('region', 'ordering')):
            return []

        return [checks.Error(
            "fieldsets must contain both 'region' and 'ordering'.",
            obj=obj.__class__,
            id='content_editor.E001',
        )]


class ContentEditorInline(StackedInline):
    """
    Custom ``admin.StackedInline`` subclass used for content types.

    This inline has to be used for content editor inlines, because the content
    editor uses the type to differentiate between plugins and other inlines.
    """
    extra = 0
    fk_name = 'parent'
    checks_class = ContentEditorInlineChecks
    regions = None

    def formfield_for_dbfield(self, db_field, *args, **kwargs):
        """Ensure ``region`` and ``ordering`` use a HiddenInput widget"""
        # `request` was made a positional argument in dbb0df2a0 (2015-12-24)
        if db_field.name in ('region', 'ordering'):
            kwargs['widget'] = forms.HiddenInput
        return super(ContentEditorInline, self).formfield_for_dbfield(
            db_field, *args, **kwargs)

    @classmethod
    def create(cls, model, **kwargs):
        """Create a inline for the given model

        Usage::

            ContentEditorInline.create(MyPlugin, form=MyPluginForm, ...)
        """
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
    speciality of knowing how to work with content editor plugins (that is,
    :class:`content_editor.admin.ContentEditorInline` inlines).

    It does not have any public API except from everything inherited from
    the standard ``ModelAdmin`` class.
    """
    checks_class = ContentEditorChecks

    def _content_editor_context(self, request, context):
        plugins = [
            (iaf.opts.model, iaf.opts)
            for iaf in context.get('inline_admin_formsets', [])
            if isinstance(iaf.opts, ContentEditorInline)
        ]
        instance = context.get('original')
        if not instance:
            instance = self.model()

        return json.dumps({
            'plugins': [(
                '%s_%s' % (plugin[0]._meta.app_label,
                           plugin[0]._meta.model_name),
                capfirst(force_text(plugin[0]._meta.verbose_name)),
                plugin[1].regions,
            ) for plugin in plugins],
            'regions': [(
                region.key,
                force_text(region.title),
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

        response.context_data['media'].add_css({'all': (
            'content_editor/content_editor.css',
        )})
        response.context_data['media'].add_js((
            'content_editor/jquery-ui-1.11.4.custom.min.js',
            'content_editor/tabbed_fieldsets.js',
            JS('content_editor/content_editor.js', {
                'id': 'content-editor-context',
                'data-context': self._content_editor_context(
                    request, response.context_data),
            }),
        ))

        return response
