# coding=utf-8
from __future__ import absolute_import, unicode_literals

import copy
import json

from django import forms
from django.contrib.admin.options import ModelAdmin, StackedInline
from django.utils.text import capfirst
from django.utils.translation import ugettext


FEINCMS_CONTENT_FIELDSET_NAME = 'FEINCMS_CONTENT'
FEINCMS_CONTENT_FIELDSET = (FEINCMS_CONTENT_FIELDSET_NAME, {'fields': ()})


class ItemEditorForm(forms.ModelForm):
    """
    The item editor form contains hidden region and ordering fields and should
    be used for all content type inlines.
    """
    region = forms.CharField(widget=forms.HiddenInput())
    ordering = forms.IntegerField(widget=forms.HiddenInput())


class ItemEditorInline(StackedInline):
    """
    Custom ``InlineModelAdmin`` subclass used for content types.
    """
    form = ItemEditorForm
    extra = 0
    fk_name = 'parent'
    template = 'admin/feincms/content_inline.html'
    classes = ('feincms',)  # noqa https://github.com/django/django/commit/5399ccc0f4257676981ef7937ea84be36f7058a6

    @classmethod
    def create(cls, model, **kwargs):
        kwargs['model'] = model
        return type(
            str('ItemEditorInline_%s_%s' % (
                model._meta.app_label,
                model._meta.model_name,
            )),
            (cls,),
            kwargs,
        )


class ItemEditor(ModelAdmin):
    """
    The ``ItemEditor`` is a drop-in replacement for ``ModelAdmin`` with the
    speciality of knowing how to work with :class:`feincms.models.Base`
    subclasses and associated plugins.

    It does not have any public API except from everything inherited from'
    the standard ``ModelAdmin`` class.
    """

    def _item_editor_context(self, request, instance):
        return json.dumps({
            # XXX Duplicated code here and in feincms_admin_tags...
            'plugins': {
                '%s_%s' % (
                    plugin._meta.app_label,
                    plugin._meta.model_name,
                ): capfirst(
                    plugin._meta.verbose_name
                )
                for plugin in self.model.plugins.values()
            },
            'messages': {
                'delete': ugettext('Really delete item?'),
                'changeTemplate': ugettext(
                    'Really change template? All changes are saved.'
                ),
                'changeTemplateWithMove': ugettext(
                    'Really change template? All changes are saved and'
                    ' content from %(source_regions)s is moved to'
                    ' %(target_region)s.'
                ),
                'moveToRegion': ugettext('Move to region:'),
            },
            'regionNames': [r.name for r in instance.template.regions],
            'regionTitles': [r.title for r in instance.template.regions],
        })

    def render_change_form(self, request, context, **kwargs):
        if kwargs.get('add'):
            if request.method == 'GET' and 'adminform' in context:
                if 'template_key' in context['adminform'].form.initial:
                    context['original'].template_key = (
                        context['adminform'].form.initial['template_key'])
                # ensure that initially-selected template in form is also
                # used to render the initial regions in the item editor

        # insert dummy object as 'original' if no original set yet so
        # template code can grabdefaults for template, etc.
        context.setdefault('original', self.model())

        # If there are errors in the form, we need to preserve the object's
        # template as it was set when the user attempted to save it, so
        # that the same regions appear on screen.
        if request.method == 'POST' and \
                hasattr(self.model, '_feincms_templates'):
            context['original'].template_key =\
                request.POST['template_key']

        context.update({
            'request': request,
            'model': self.model,
            'available_templates': getattr(
                self.model, '_feincms_templates', ()),
            'FEINCMS_CONTENT_FIELDSET_NAME': FEINCMS_CONTENT_FIELDSET_NAME,
            'item_editor_context': self._item_editor_context(
                request,
                context.get('original'),
            ),
        })
        return super(ItemEditor, self).render_change_form(
            request, context, **kwargs)

    @property
    def change_form_template(self):
        opts = self.model._meta
        return [
            'admin/feincms/%s/%s/item_editor.html' % (
                opts.app_label, opts.object_name.lower()),
            'admin/feincms/%s/item_editor.html' % opts.app_label,
            'admin/feincms/item_editor.html',
        ]

    def get_fieldsets(self, request, obj=None):
        """
        Insert FEINCMS_CONTENT_FIELDSET it not present.
        Is it reasonable to assume this should always be included?
        """

        # TODO Find some other way, and remove this code.
        fieldsets = copy.deepcopy(
            super(ItemEditor, self).get_fieldsets(request, obj)
        )
        names = [f[0] for f in fieldsets]

        if FEINCMS_CONTENT_FIELDSET_NAME not in names:
            fieldsets.append(FEINCMS_CONTENT_FIELDSET)

        return fieldsets

    # These next are only used if later we use a subclass of this class
    # which also inherits from VersionAdmin.
    revision_form_template = "admin/feincms/revision_form.html"
    recover_form_template = "admin/feincms/recover_form.html"

    def render_revision_form(self, request, obj, version, context,
                             revert=False, recover=False):
        context.update(self.get_extra_context(request))  # FIXME
        return super(ItemEditor, self).render_revision_form(
            request, obj, version, context, revert, recover)
