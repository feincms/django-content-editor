# coding=utf-8
from __future__ import absolute_import, unicode_literals

import json

from django import forms
from django.contrib.admin.options import ModelAdmin, StackedInline
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

    def _content_editor_context(self, request, context):
        plugins = [
            iaf.opts.model
            for iaf in context.get('inline_admin_formsets', [])
            if isinstance(iaf.opts, ContentEditorInline)
        ]
        instance = context.get('original')

        return json.dumps({
            'plugins': [(
                '%s_%s' % (
                    plugin._meta.app_label,
                    plugin._meta.model_name,
                ),
                capfirst(plugin._meta.verbose_name)
            ) for plugin in plugins],
            'regions': [(
                region.name,
                region.title,
            ) for region in instance.template.regions],
            'messages': {
                # 'delete': ugettext('Really delete item?'),
                # 'changeTemplate': ugettext(
                #     'Really change template? All changes are saved.'
                # ),
                # 'changeTemplateWithMove': ugettext(
                #     'Really change template? All changes are saved and'
                #     ' content from %(source_regions)s is moved to'
                #     ' %(target_region)s.'
                # ),
                'createNew': ugettext('Add new item'),
            },
        })

    def _add_content_editor_context(self, request, context):
        context.update({
            'request': request,
            'model': self.model,
            'available_templates': getattr(
                self.model, '_feincms_templates', ()),
            'content_editor_context': self._content_editor_context(
                request,
                context,
            ),
        })

    def render_change_form(self, request, context, **kwargs):
        # insert dummy object as 'original' if no original set yet so
        # template code can grabdefaults for template, etc.
        if not context.get('original'):
            context['original'] = self.model()

        if kwargs.get('add'):
            if request.method == 'GET' and 'adminform' in context:
                if 'template_key' in context['adminform'].form.initial:
                    context['original'].template_key = (
                        context['adminform'].form.initial['template_key'])
                # ensure that initially-selected template in form is also
                # used to render the initial regions in the item editor

        # If there are errors in the form, we need to preserve the object's
        # template as it was set when the user attempted to save it, so
        # that the same regions appear on screen.
        if request.method == 'POST' and \
                hasattr(self.model, '_feincms_templates'):
            context['original'].template_key =\
                request.POST['template_key']

        self._add_content_editor_context(request, context)
        return super(ContentEditor, self).render_change_form(
            request, context, **kwargs)

    @property
    def change_form_template(self):
        opts = self.model._meta
        return [
            'admin/%s/%s/content_editor.html' % (
                opts.app_label, opts.object_name.lower()),
            'admin/%s/content_editor.html' % opts.app_label,
            'admin/content_editor.html',
        ]

    # These next are only used if later we use a subclass of this class
    # which also inherits from VersionAdmin.
    revision_form_template = 'admin/content_editor/revision_form.html'
    recover_form_template = 'admin/content_editor/recover_form.html'

    def render_revision_form(self, request, obj, version, context,
                             revert=False, recover=False):
        if not context.get('original'):
            context['original'] = self.model()
        self._add_content_editor_context(request, context)
        return super(ContentEditor, self).render_revision_form(
            request, obj, version, context, revert, recover)
