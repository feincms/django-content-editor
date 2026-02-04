from django.apps import apps
from django.core.checks import Info, register
from django.db import models

from content_editor.models import PluginBase


@register()
def check_plugin_bases(app_configs, **kwargs):
    """
    Check for unexpected non-abstract base classes in plugin models.

    This check helps identify potential issues where plugin models inherit from
    non-abstract base classes (other than the expected PluginBase), which can
    lead to unexpected database table structures and relationships.
    """
    infos = []

    # Get all models from the specified app_configs or all apps
    if app_configs is None:
        models_to_check = apps.get_models()
    else:
        models_to_check = []
        for app_config in app_configs:
            models_to_check.extend(app_config.get_models())

    for model in models_to_check:
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
