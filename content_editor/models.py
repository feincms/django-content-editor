import warnings

from django.core.exceptions import ImproperlyConfigured
from django.db import models


__all__ = ("Type", "Region", "Template", "create_plugin_base")


class Type(dict):
    _REQUIRED = {"key"}

    def __init__(self, **kwargs):
        missing = self._REQUIRED - set(kwargs)
        if missing:
            raise TypeError(
                f"Missing arguments to {self.__class__.__name__}: {missing}"
            )
        super().__init__(**kwargs)

    def __getattr__(self, attr):
        try:
            return self[attr]
        except KeyError as exc:
            raise AttributeError(f"Unknown attribute {attr!r}") from exc

    def __hash__(self):
        return hash(self.key)


class Region(Type):
    _REQUIRED = {"key", "title", "inherited"}

    def __init__(self, *, key, **kwargs):
        kwargs.setdefault("inherited", False)
        if key == "regions":
            raise ImproperlyConfigured("'regions' cannot be used as a Region key.")
        elif key.startswith("_"):
            raise ImproperlyConfigured(f"Region key {key!r} cannot start with '_'.")
        elif not key.isidentifier():
            raise ImproperlyConfigured(f"Region key {key!r} is no identifier.")
        super().__init__(key=key, **kwargs)


class Template(Type):
    _REQUIRED = {"key", "template_name", "title", "regions"}

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        warnings.warn(
            "Template is deprecated, use feincms3's TemplateType instead.",
            DeprecationWarning,
            stacklevel=2,
        )


def create_plugin_base(content_base):
    """
    Create and return a base class for plugins

    The base class contains a ``parent`` foreign key and the required
    ``region`` and ``ordering`` fields.
    """

    class PluginBase(models.Model):
        parent = models.ForeignKey(
            content_base,
            related_name="%(app_label)s_%(class)s_set",
            on_delete=models.CASCADE,
        )
        region = models.CharField(max_length=255)
        ordering = models.IntegerField(default=0)

        class Meta:
            abstract = True
            app_label = content_base._meta.app_label
            ordering = ["ordering"]

        def __str__(self):
            return f"{self._meta.label}<region={self.region} ordering={self.ordering} pk={self.pk}>"  # pragma: no cover

        @classmethod
        def get_queryset(cls):
            return cls.objects.all()

    return PluginBase
