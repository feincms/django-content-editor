from django.apps import apps
from django.core.checks import Error, Info, register
from django.core.exceptions import FieldDoesNotExist
from django.db import models

from content_editor.models import PluginBase


def _models(app_configs):
    if app_configs is None:
        return apps.get_models()
    return [model for app_config in app_configs for model in app_config.get_models()]


@register()
def check_plugin_bases(app_configs, **kwargs):
    """
    Check for unexpected non-abstract base classes in plugin models.

    This check helps identify potential issues where plugin models inherit from
    non-abstract base classes (other than the expected PluginBase), which can
    lead to unexpected database table structures and relationships.
    """
    infos = []

    for model in _models(app_configs):
        # Skip proxy models - they're expected to have non-abstract parents
        if model._meta.proxy:
            continue

        # Check if this model inherits from PluginBase
        if not issubclass(model, PluginBase):
            continue

        # Check for non-abstract base classes
        non_abstract_bases = [
            base
            for base in model.__bases__
            if (issubclass(base, models.Model) and not base._meta.abstract)
        ]

        if non_abstract_bases:
            infos.append(
                Info(
                    f"Found unexpected non-abstract base classes when creating {model.__module__}.{model.__qualname__}",
                    hint=f"The following base classes are non-abstract: {', '.join(f'{base.__module__}.{base.__qualname__}' for base in non_abstract_bases)}. "
                    "Consider making them abstract by adding 'class Meta: abstract = True'.",
                    obj=model,
                    id="content_editor.I001",
                )
            )

    return infos


def _depth_field(model):
    try:
        return model._meta.get_field("depth")
    except (AttributeError, FieldDoesNotExist):
        return None


@register()
def check_plugin_depth(app_configs, **kwargs):
    """
    Check that plugin models do not override the ``depth`` field added by
    ``create_plugin_base``. The content editor uses ``depth`` for nesting
    plugins in containers and overwrites its values.
    """
    errors = []
    for model in _models(app_configs):
        if not issubclass(model, PluginBase) or not (field := _depth_field(model)):
            continue
        if any(
            (base_field := _depth_field(base))
            and base_field.creation_counter != field.creation_counter
            for base in model.__mro__[1:]
        ):
            errors.append(
                Error(
                    f"{model._meta.label}.depth overrides the depth field of"
                    " create_plugin_base.",
                    hint="The content editor uses 'depth' for nesting plugins in"
                    " containers and overwrites its values. Rename the field.",
                    obj=model,
                    id="content_editor.E005",
                )
            )
    return errors
