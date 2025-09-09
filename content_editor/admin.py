import itertools
from collections import defaultdict

from django import forms
from django.apps import apps
from django.contrib import messages
from django.contrib.admin.checks import InlineModelAdminChecks, ModelAdminChecks
from django.contrib.admin.options import ModelAdmin, StackedInline
from django.contrib.admin.utils import flatten_fieldsets
from django.core import checks
from django.utils.text import capfirst
from django.utils.translation import gettext
from js_asset.js import JSON


__all__ = ("ContentEditorInline", "ContentEditor", "allow_regions", "deny_regions")


_inline_index = itertools.count()


class ContentEditorChecks(ModelAdminChecks):
    def check(self, admin_obj, **kwargs):
        errors = super().check(admin_obj, **kwargs)
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
        errors = super().check(inline_obj, **kwargs)
        errors.extend(self.check_content_editor_fields_in_fieldset(inline_obj))
        errors.extend(self.check_content_editor_iterable_regions(inline_obj))
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

    def check_content_editor_iterable_regions(self, obj):
        if obj.regions is None:
            return

        regions = obj.regions(set()) if callable(obj.regions) else obj.regions
        if isinstance(regions, str) or not hasattr(regions, "__iter__"):
            yield checks.Error(
                f"regions must be 'None' or an iterable. Current value is {regions!r}.",
                obj=obj.__class__,
                id="content_editor.E003",
            )


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
    icon = ""
    color = ""
    sections = 0

    def formfield_for_dbfield(self, db_field, *args, **kwargs):
        """Ensure ``region`` and ``ordering`` use a HiddenInput widget"""
        # `request` was made a positional argument in dbb0df2a0 (2015-12-24)
        if db_field.name in ("region", "ordering"):
            kwargs["widget"] = forms.HiddenInput
        return super().formfield_for_dbfield(db_field, *args, **kwargs)

    @classmethod
    def create(cls, model, **kwargs):
        """Create a inline for the given model

        Usage::

            ContentEditorInline.create(MyPlugin, form=MyPluginForm, ...)
        """
        kwargs["model"] = model
        opts = model._meta
        return type(
            f"ContentEditorInline_{opts.app_label}_{opts.model_name}_{next(_inline_index)}",
            (cls,),
            kwargs,
        )


def auto_icon_colors(content_editor):
    hue = 330
    for inline in content_editor.inlines:
        if issubclass(inline, ContentEditorInline) and not inline.color:
            inline.color = f"oklch(0.5 0.2 {hue})"
            hue -= 20
    return content_editor


class RefinedModelAdmin(ModelAdmin):
    class Media:
        css = {
            "all": [
                "content_editor/django_admin_fixes.css",
                "content_editor/tabbed_fieldsets.css",
            ],
        }
        js = [
            "content_editor/save_shortcut.js",
            "content_editor/tabbed_fieldsets.js",
        ]


class ContentEditor(RefinedModelAdmin):
    """
    The ``ContentEditor`` is a drop-in replacement for ``ModelAdmin`` with the
    speciality of knowing how to work with content editor plugins (that is,
    :class:`content_editor.admin.ContentEditorInline` inlines).

    It does not have any public API except from everything inherited from
    the standard ``ModelAdmin`` class.
    """

    checks_class = ContentEditorChecks

    def _content_editor_context(self, request, context):
        try:
            instance = context["adminform"].form.instance
        except (AttributeError, KeyError):
            instance = context.get("original")

        allow_change = True
        if instance is None:
            instance = self.model()
        else:
            allow_change = self.has_change_permission(request, instance)

        plugins = []
        adding_not_allowed = ["_adding_not_allowed"]

        for iaf in context.get("inline_admin_formsets", []):
            if not isinstance(iaf.opts, ContentEditorInline):
                continue
            regions = (
                (
                    iaf.opts.regions({region.key for region in instance.regions})
                    if callable(iaf.opts.regions)
                    else iaf.opts.regions
                )
                if allow_change and iaf.opts.has_add_permission(request, instance)
                else adding_not_allowed
            )
            button = iaf.opts.button
            if not button and iaf.opts.icon:
                button = f'<span class="material-icons">{iaf.opts.icon}</span>'
            plugins.append(
                {
                    "title": capfirst(str(iaf.opts.verbose_name)),
                    "regions": list(regions) if regions else None,
                    "prefix": iaf.formset.prefix,
                    "button": button,
                    "color": iaf.opts.color,
                    "sections": iaf.opts.sections,
                    "model": iaf.opts.model._meta.label_lower,
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

        return {
            "plugins": plugins,
            "regions": regions,
            "allowChange": allow_change,
            "messages": {
                "createNew": gettext("Add new item"),
                "empty": gettext("No items."),
                "emptyInherited": gettext("No items. Region may inherit content."),
                "noRegions": gettext("No regions available."),
                "noPlugins": gettext("No plugins allowed in this region."),
                "newItem": gettext("New item"),
                "unknownRegion": gettext("Unknown region"),
                "collapseAll": gettext("Collapse all items"),
                "uncollapseAll": gettext("Uncollapse all items"),
                "forDeletion": gettext("marked for deletion"),
                "selectMultiple": gettext(
                    "Use Ctrl-Click to select and move multiple items."
                ),
                "clone": gettext("Clone from region"),
                "noClone": gettext("Didn't find anything to clone"),
                "selectAll": gettext("Select all"),
            },
        }

    def _content_editor_media(self, request, context):
        return forms.Media(
            css={
                "all": [
                    "content_editor/material-icons.css",
                    "content_editor/content_editor.css",
                ]
            },
            js=[
                "admin/js/jquery.init.js",
                JSON(
                    self._content_editor_context(request, context),
                    id="content-editor-context",
                ),
                "content_editor/content_editor.js",
            ],
        )

    def render_change_form(self, request, context, **kwargs):
        response = super().render_change_form(request, context, **kwargs)

        response.context_data["media"] = response.context_data[
            "media"
        ] + self._content_editor_media(request, response.context_data)

        return response

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)

        if request.POST.getlist("_clone"):
            clone_form = CloneForm(request.POST)
            if clone_form.is_valid():
                count = clone_form.process()
                self.message_user(
                    request, gettext("Cloning {} plugins succeeded.").format(count)
                )
            else:
                self.message_user(
                    request,
                    gettext("Cloning plugins failed: {}").format(clone_form.errors),
                    level=messages.ERROR,
                )


class CloneForm(forms.Form):
    _clone = forms.CharField()
    _clone_region = forms.CharField()
    _clone_ordering = forms.IntegerField()

    def clean(self):
        data = super().clean()

        plugins = self.data.getlist("_clone")

        objects = defaultdict(set)
        for plugin in plugins:
            model, _sep, pk = plugin.partition(":")
            objects[model].add(pk)

        instances = {}
        for model, pks in objects.items():
            cls = apps.get_model(model)
            instances |= {
                f"{model}:{obj.pk}": obj for obj in cls._base_manager.filter(pk__in=pks)
            }

        data["_clone_instances"] = [
            obj for obj in [instances.get(plugin) for plugin in plugins] if obj
        ]

        return data

    def process(self):
        ordering = self.cleaned_data["_clone_ordering"]
        region = self.cleaned_data["_clone_region"]

        count = 0

        for instance in self.cleaned_data["_clone_instances"]:
            instance.pk = None
            instance.ordering = ordering
            instance.region = region
            instance.save(force_insert=True)
            ordering += 10

            count += 1

        return count


def allow_regions(regions):
    return set(regions)


def deny_regions(regions):
    regions = set(regions)
    return lambda self, all_regions: all_regions - regions
