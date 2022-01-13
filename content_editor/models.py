from django.core.exceptions import ImproperlyConfigured
from django.db import models


__all__ = ("Region", "Template", "create_plugin_base")


class Type(dict):
    _REQUIRED = set()

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
        except KeyError:
            raise AttributeError(f"Unknown attribute {attr!r}")


class Region(Type):
    _REQUIRED = {"key", "title", "inherited"}

    def __init__(self, **kwargs):
        kwargs.setdefault("inherited", False)
        super().__init__(**kwargs)
        if self.key == "regions":
            raise ImproperlyConfigured("'regions' cannot be used as a Region key .")


class Template(Type):
    _REQUIRED = {"key", "template_name", "title", "regions"}


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
            return "{}<region={} ordering={} pk={}>".format(
                self._meta.label,
                self.region,
                self.ordering,
                self.pk,
            )

        @classmethod
        def get_queryset(cls):
            return cls.objects.all()

    return PluginBase
