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
from js_asset import JSON, ImportMap, Media, Script


__all__ = ("ContentEditor", "ContentEditorInline", "allow_regions", "deny_regions")


_inline_index = itertools.count()

# Fields the content editor needs in every plugin form
_STRUCTURAL_FIELDS = ("region", "ordering", "depth")


# The content editor JavaScript ships as native ES modules. Modules import each
# other via bare specifiers (``content-editor/…``) which are resolved through an
# import map to the (possibly hashed) static URLs. This keeps working with
# ``ManifestStaticFilesStorage``, which does not rewrite ``import`` specifiers
# inside JavaScript. ``index.js`` is the entry point loaded as ``type=module``.
_CONTENT_EDITOR_MODULES = (
    "context",
    "utils",
    "regions",
    "machine",
    "dragdrop",
    "containers",
    "cloning",
)
importmap = ImportMap(
    {
        f"content-editor/{name}": f"content_editor/{name}.js"
        for name in _CONTENT_EDITOR_MODULES
    }
)


def _is_container(model):
    return getattr(model, "container", False)


def _has_depth(model):
    return any(field.name == "depth" for field in model._meta.fields)


class ContentEditorChecks(ModelAdminChecks):
    def check(self, admin_obj, **kwargs):
        errors = super().check(admin_obj, **kwargs)
        errors.extend(self.check_content_editor_regions_attribute(admin_obj))
        errors.extend(self.check_content_editor_sections_and_containers(admin_obj))
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

    def check_content_editor_sections_and_containers(self, admin_obj):
        inlines = [
            inline
            for inline in admin_obj.inlines
            if issubclass(inline, ContentEditorInline)
        ]
        if any(inline.sections for inline in inlines) and any(
            _is_container(inline.model) for inline in inlines
        ):
            return [
                checks.Error(
                    "ContentEditor inlines cannot use both 'sections' and container plugins.",
                    obj=admin_obj.__class__,
                    id="content_editor.E004",
                )
            ]

        return []


class ContentEditorInlineChecks(InlineModelAdminChecks):
    def check(self, inline_obj, **kwargs):
        errors = super().check(inline_obj, **kwargs)
        errors.extend(self.check_content_editor_iterable_regions(inline_obj))
        errors.extend(self.check_content_editor_sections(inline_obj))
        return errors

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

    def check_content_editor_sections(self, obj):
        if obj.sections:
            yield checks.Warning(
                "'sections' is deprecated.",
                hint="Set 'container = True' on the models of plugins opening"
                " sections and remove the plugins closing them.",
                obj=obj.__class__,
                id="content_editor.W001",
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

    def _structural_fields(self):
        if _has_depth(self.model):
            return _STRUCTURAL_FIELDS
        return [field for field in _STRUCTURAL_FIELDS if field != "depth"]

    def get_fields(self, request, obj=None):
        """Add the structural fields if they are missing"""
        fields = list(super().get_fields(request, obj))
        return fields + [
            field for field in self._structural_fields() if field not in fields
        ]

    def get_fieldsets(self, request, obj=None):
        """Add the structural fields to the last fieldset if they are missing"""
        fieldsets = super().get_fieldsets(request, obj)
        present = flatten_fieldsets(fieldsets)
        if missing := [
            field for field in self._structural_fields() if field not in present
        ]:
            *fieldsets, (name, options) = fieldsets
            fieldsets.append(
                (name, {**options, "fields": [*options["fields"], *missing]})
            )
        return fieldsets

    def formfield_for_dbfield(self, db_field, *args, **kwargs):
        """Ensure the structural fields use a HiddenInput widget"""
        # `request` was made a positional argument in dbb0df2a0 (2015-12-24)
        if db_field.name in _STRUCTURAL_FIELDS:
            kwargs["widget"] = forms.HiddenInput
        if db_field.name == "depth":
            # Data posted without depth (e.g. from code predating it) keeps
            # the default or current depth instead of failing validation on a
            # hidden field.
            kwargs["required"] = False
        return super().formfield_for_dbfield(db_field, *args, **kwargs)

    @classmethod
    def create(cls, model, **kwargs):
        """Create a inline for the given model

        Usage::

            ContentEditorInline.create(MyPlugin, form=MyPluginForm, ...)
        """
        kwargs["model"] = model
        kwargs.setdefault("__module__", model.__module__)
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
                    "container": _is_container(iaf.opts.model),
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
                "deleteContainer": gettext(
                    "This container isn't empty. Which items should be marked"
                    " for deletion? They will be deleted when saving."
                ),
                "deleteContainerAll": gettext("Container and contents"),
                "deleteContainerUnwrap": gettext("Only the container"),
                "indent": gettext("Indent (Alt+Shift+Right)"),
                "outdent": gettext("Outdent (Alt+Shift+Left)"),
            },
        }

    def _content_editor_media(self, request, context):
        return Media(
            importmap=importmap,
            css={
                "all": [
                    "content_editor/material-icons.css",
                    "content_editor/content_editor.css",
                ]
            },
            js=[
                # index.js uses django.jQuery solely as its DOM-ready hook, so
                # that our initialization runs after Django's admin inline setup
                # (which also runs on the jQuery ready queue). Declare the
                # dependency explicitly.
                "admin/js/jquery.init.js",
                JSON(
                    self._content_editor_context(request, context),
                    id="content-editor-context",
                ),
                Script("content_editor/index.js", type="module"),
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

        self._normalize_depths(request, form.instance)

    def _normalize_depths(self, request, obj):
        """
        Clamp the depth of each plugin to at most the previous plugin's depth,
        plus one if the previous plugin is a container. The editor never
        produces invalid depths, this only matters for crafted requests.
        """
        inlines = [
            inline(self.model, self.admin_site)
            for inline in self.inlines
            if issubclass(inline, ContentEditorInline) and _has_depth(inline.model)
        ]
        if not any(_is_container(inline.model) for inline in inlines) or any(
            inline.sections for inline in inlines
        ):
            return

        regions = defaultdict(list)
        for inline in inlines:
            for plugin in inline.get_queryset(request).filter(**{inline.fk_name: obj}):
                regions[plugin.region].append((plugin, _is_container(inline.model)))

        for plugins in regions.values():
            plugins.sort(key=lambda row: row[0].ordering)
            maximum = 0
            for plugin, container in plugins:
                if plugin.depth > maximum:
                    plugin.depth = maximum
                    plugin.__class__._base_manager.filter(pk=plugin.pk).update(
                        depth=maximum
                    )
                maximum = plugin.depth + 1 if container else plugin.depth


class CloneForm(forms.Form):
    _clone = forms.CharField()
    _clone_region = forms.CharField()
    _clone_ordering = forms.IntegerField()
    _clone_depth = forms.IntegerField(required=False, min_value=0)

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
            # get_queryset() and not _base_manager: plugin models which share a
            # table (and only differ in a type field) downcast their instances
            # here. Skipping that would clone them as whatever model was
            # submitted, silently changing their type.
            instances |= {
                f"{model}:{obj.pk}": obj
                for obj in cls.get_queryset().filter(pk__in=pks)
            }

        data["_clone_instances"] = [
            obj for obj in [instances.get(plugin) for plugin in plugins] if obj
        ]

        return data

    def process(self):
        ordering = self.cleaned_data["_clone_ordering"]
        region = self.cleaned_data["_clone_region"]
        depth = self.cleaned_data["_clone_depth"] or 0

        count = 0
        # Original depths of the cloned ancestors of the current instance
        ancestors = []

        for instance in self.cleaned_data["_clone_instances"]:
            if hasattr(instance, "depth"):
                while ancestors and ancestors[-1] >= instance.depth:
                    ancestors.pop()
                original = instance.depth
                instance.depth = (
                    depth + original - (ancestors[0] if ancestors else original)
                )
                ancestors.append(original)

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
