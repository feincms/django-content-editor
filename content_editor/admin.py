from __future__ import absolute_import, unicode_literals

import json

from django import forms
from django.contrib.admin.checks import InlineModelAdminChecks
from django.contrib.admin.options import ModelAdmin, StackedInline
from django.contrib.admin.utils import flatten_fieldsets
from django.core import checks
from django.forms.utils import flatatt
from django.templatetags.static import static
from django.utils.encoding import force_text
from django.utils.html import format_html, mark_safe
from django.utils.text import capfirst
from django.utils.translation import ugettext


__all__ = ('ContentEditorInline', 'ContentEditor')


class ContentEditorChecks(InlineModelAdminChecks):
    def check(self, inline_obj, **kwargs):
        errors = super(ContentEditorChecks, self).check(inline_obj, **kwargs)
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
    checks_class = ContentEditorChecks

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


class JS(object):
    """
    Use this to insert a script tag via ``forms.Media`` containing additional
    attributes (such as ``id`` and ``data-*`` for CSP-compatible data
    injection.)::

        media.add_js([
            JS('asset.js', {
                'id': 'asset-script',
                'data-the-answer': '"42"',
            }),
        ])

    The rendered media tag (via ``{{ media.js }}`` or ``{{ media }}`` will
    now contain a script tag as follows, without line breaks::

        <script type="text/javascript" src="/static/asset.js"
            data-answer="&quot;42&quot;" id="asset-script"></script>

    The attributes are automatically escaped. The data attributes may now be
    accessed inside ``asset.js``::

        var answer = document.querySelector('#asset-script').dataset.answer;
    """
    def __init__(self, js, attrs):
        self.js = js
        self.attrs = attrs

    def startswith(self, _):
        # Masquerade as absolute path so that we are returned as-is.
        return True

    def __html__(self):
        return format_html(
            '{}"{}',
            static(self.js),
            mark_safe(flatatt(self.attrs)),
        ).rstrip('"')


class ContentEditor(ModelAdmin):
    """
    The ``ContentEditor`` is a drop-in replacement for ``ModelAdmin`` with the
    speciality of knowing how to work with :class:`feincms.models.Base`
    subclasses and associated plugins.

    It does not have any public API except from everything inherited from'
    the standard ``ModelAdmin`` class.
    """

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
                capfirst(force_text(plugin._meta.verbose_name))
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
