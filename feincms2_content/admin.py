# ------------------------------------------------------------------------
# coding=utf-8
# ------------------------------------------------------------------------

from __future__ import absolute_import, unicode_literals

import copy
import logging

from django import forms
from django.contrib.admin.options import ModelAdmin, StackedInline


# ------------------------------------------------------------------------
FEINCMS_CONTENT_FIELDSET_NAME = 'FEINCMS_CONTENT'
FEINCMS_CONTENT_FIELDSET = (FEINCMS_CONTENT_FIELDSET_NAME, {'fields': ()})

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------------
class ItemEditorForm(forms.ModelForm):
    """
    The item editor form contains hidden region and ordering fields and should
    be used for all content type inlines.
    """

    region = forms.CharField(widget=forms.HiddenInput())
    ordering = forms.IntegerField(widget=forms.HiddenInput())


# ------------------------------------------------------------------------
class ItemEditorInline(StackedInline):
    """
    Custom ``InlineModelAdmin`` subclass used for content types.
    """

    form = ItemEditorForm
    extra = 0
    fk_name = 'parent'
    template = 'admin/feincms/content_inline.html'
    classes = ('feincms',)  # noqa https://github.com/django/django/commit/5399ccc0f4257676981ef7937ea84be36f7058a6


# ------------------------------------------------------------------------
class ItemEditor(ModelAdmin):
    """
    The ``ItemEditor`` is a drop-in replacement for ``ModelAdmin`` with the
    speciality of knowing how to work with :class:`feincms.models.Base`
    subclasses and associated content types.

    It does not have any public API except from everything inherited from'
    the standard ``ModelAdmin`` class.
    """

    def get_content_type_map(self, request):
        """ Prepare mapping of content types to their prettified names. """
        content_types = []
        for content_type in self.model.plugins.values():
            content_name = content_type._meta.verbose_name
            content_types.append(
                (content_name, content_type.__name__.lower()))
        return content_types

    def changeform_view(self, request, object_id=None, form_url='',
                        extra_context=None):
        extra_context = extra_context or {}

        if not object_id:
            # insert dummy object as 'original' so template code can grab
            # defaults for template, etc.
            extra_context['original'] = self.model()

            # If there are errors in the form, we need to preserve the object's
            # template as it was set when the user attempted to save it, so
            # that the same regions appear on screen.
            if request.method == 'POST' and \
                    hasattr(self.model, '_feincms_templates'):
                extra_context['original'].template_key =\
                    request.POST['template_key']

        extra_context.update({
            'request': request,
            'model': self.model,
            'available_templates': getattr(
                self.model, '_feincms_templates', ()),
            'content_types': self.get_content_type_map(request),
            'FEINCMS_CONTENT_FIELDSET_NAME': FEINCMS_CONTENT_FIELDSET_NAME,
        })
        return super(ItemEditor, self).changeform_view(
            request, object_id, form_url, extra_context)

    def render_change_form(self, request, context, **kwargs):
        if kwargs.get('add'):
            if request.method == 'GET' and 'adminform' in context:
                if 'template_key' in context['adminform'].form.initial:
                    context['original'].template_key = (
                        context['adminform'].form.initial['template_key'])
                # ensure that initially-selected template in form is also
                # used to render the initial regions in the item editor
        return super(
            ItemEditor, self).render_change_form(request, context, **kwargs)

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
        context.update(self.get_extra_context(request))
        return super(ItemEditor, self).render_revision_form(
            request, obj, version, context, revert, recover)
