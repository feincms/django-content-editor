import itertools
import json

from django import forms
from django.contrib.admin.checks import InlineModelAdminChecks, ModelAdminChecks
from django.contrib.admin.options import ModelAdmin, StackedInline
from django.contrib.admin.utils import flatten_fieldsets
from django.core import checks
from django.utils.text import capfirst
from django.utils.translation import gettext

from js_asset.js import JS


__all__ = ("ContentEditorInline", "ContentEditor")


_inline_index = itertools.count()


class ContentEditorChecks(ModelAdminChecks):
    def check(self, admin_obj, **kwargs):
        errors = super(ContentEditorChecks, self).check(admin_obj, **kwargs)
        errors.extend(self.check_content_editor_regions_attribute(admin_obj))
        return errors

    def check_content_editor_regions_attribute(self, admin_obj):
        if not getattr(admin_obj.model, "regions", False):
            return [
                checks.Error(
                    "ContentEditor models require a non-empty 'regions'"
                    " attribute or property.",
                    obj=admin_obj.__class__,
                    id="content_editor.E002",
                )
            ]

        return []


class ContentEditorInlineChecks(InlineModelAdminChecks):
    def check(self, inline_obj, **kwargs):
        errors = super(ContentEditorInlineChecks, self).check(inline_obj, **kwargs)
        errors.extend(self.check_content_editor_fields_in_fieldset(inline_obj))
        return errors

    def check_content_editor_fields_in_fieldset(self, obj):
        if obj.fieldsets is None:
            return []

        fields = flatten_fieldsets(obj.fieldsets)
        if all(field in fields for field in ("region", "ordering")):
            return []

        return [
            checks.Error(
                "fieldsets must contain both 'region' and 'ordering'.",
                obj=obj.__class__,
                id="content_editor.E001",
            )
        ]


class ContentEditorInline(StackedInline):
    """
    Custom ``admin.StackedInline`` subclass used for content types.

    This inline has to be used for content editor inlines, because the content
    editor uses the type to differentiate between plugins and other inlines.
    """

    checks_class = ContentEditorInlineChecks
    extra = 0
    fk_name = "parent"
    regions = None
    button = ""

    def formfield_for_dbfield(self, db_field, *args, **kwargs):
        """Ensure ``region`` and ``ordering`` use a HiddenInput widget"""
        # `request` was made a positional argument in dbb0df2a0 (2015-12-24)
        if db_field.name in ("region", "ordering"):
            kwargs["widget"] = forms.HiddenInput
        return super(ContentEditorInline, self).formfield_for_dbfield(
            db_field, *args, **kwargs
        )

    @classmethod
    def create(cls, model, **kwargs):
        """Create a inline for the given model

        Usage::

            ContentEditorInline.create(MyPlugin, form=MyPluginForm, ...)
        """
        kwargs["model"] = model
        return type(
            "ContentEditorInline_%s" % next(_inline_index),
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
        instance = context.get("original")
        if not instance:
            instance = self.model()

        plugins = []
        for iaf in context.get("inline_admin_formsets", []):
            if not isinstance(iaf.opts, ContentEditorInline):
                continue
            regions = (
                iaf.opts.regions({region.key for region in instance.regions})
                if callable(iaf.opts.regions)
                else iaf.opts.regions
            )
            plugins.append(
                {
                    "title": capfirst(str(iaf.opts.verbose_name)),
                    "regions": list(regions) if regions else None,
                    "prefix": iaf.formset.prefix,
                    "button": iaf.opts.button,
                }
            )
        regions = [
            {
                "key": region.key,
                "title": str(region.title),
                "inherited": region.inherited,
                # TODO correct template when POSTing?
            }
            for region in instance.regions
        ]

        return json.dumps(
            {
                "plugins": plugins,
                "regions": regions,
                "messages": {
                    "createNew": gettext("Add new item"),
                    "empty": gettext("No items."),
                    "emptyInherited": gettext("No items. Region may inherit content."),
                    "newItem": gettext("New item"),
                    "unknownRegion": gettext("Unknown region"),
                    "toggle": gettext("Collapse all items"),
                    "collapsed": gettext("collapsed"),
                },
            }
        )

    def _content_editor_media(self, request, context):
        return forms.Media(
            css={"all": ["content_editor/content_editor.css"]},
            js=[
                "admin/js/jquery.init.js",
                "content_editor/save_shortcut.js",
                "content_editor/tabbed_fieldsets.js",
                JS(
                    "content_editor/content_editor.js",
                    {
                        "id": "content-editor-context",
                        "data-context": self._content_editor_context(request, context),
                    },
                ),
            ],
        )

    def render_change_form(self, request, context, **kwargs):
        response = super(ContentEditor, self).render_change_form(
            request, context, **kwargs
        )

        response.context_data["media"] = response.context_data[
            "media"
        ] + self._content_editor_media(request, response.context_data)

        return response
