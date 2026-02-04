from django.contrib import admin
from django.core import checks
from django.db import models
from django.test.utils import isolate_apps

from content_editor.admin import ContentEditor, ContentEditorInline
from content_editor.checks import check_plugin_bases
from testapp.models import Article, RichText


@isolate_apps()
def test_model_checks():
    class Model(models.Model):
        name = models.CharField()

        def __str__(self):
            return self.name

    class ModelAdmin(ContentEditor):
        model = Model
        inlines = []

    assert ModelAdmin(Model, admin.AdminSite()).check() == [
        checks.Error(
            "ContentEditor models require a non-empty 'regions' attribute or property.",
            obj=ModelAdmin,
            id="content_editor.E002",
        )
    ]


def test_inline_checks():
    assert admin.ModelAdmin(Article, admin.AdminSite()).check() == []

    class RichTextInline(ContentEditorInline):
        model = RichText
        # Purposefully construct an inline with missing region
        # and ordering fields
        fieldsets = [(None, {"fields": ("text",)})]

    class InvalidRegionsStringInline(ContentEditorInline):
        model = RichText
        regions = "main"

    class InvalidRegionsCallableInline(ContentEditorInline):
        model = RichText

        def regions(self, all_regions):
            return "main"

    class ValidRegionsGeneratorInline(ContentEditorInline):
        model = RichText

        def regions(self, all_regions):
            yield "main"

    class ArticleAdmin(ContentEditor):
        model = Article
        inlines = [
            RichTextInline,
            InvalidRegionsStringInline,
            InvalidRegionsCallableInline,
            ValidRegionsGeneratorInline,
        ]

    assert ArticleAdmin(Article, admin.AdminSite()).check() == [
        checks.Error(
            "fieldsets must contain both 'region' and 'ordering'.",
            obj=RichTextInline,
            id="content_editor.E001",
        ),
        checks.Error(
            "regions must be 'None' or an iterable. Current value is 'main'.",
            obj=InvalidRegionsStringInline,
            id="content_editor.E003",
        ),
        checks.Error(
            "regions must be 'None' or an iterable. Current value is 'main'.",
            obj=InvalidRegionsCallableInline,
            id="content_editor.E003",
        ),
    ]


def test_plugin_base_checks():
    """Test that the check runs and doesn't error on existing models."""
    # Run the check on all existing models - should not raise an error
    # and should not produce any infos (all our test models are correctly structured)
    infos = check_plugin_bases(app_configs=None)

    # None of the existing testapp models should trigger the check
    # because they all properly use abstract base classes
    testapp_infos = [
        info
        for info in infos
        if hasattr(info.obj, "_meta") and info.obj._meta.app_label == "testapp"
    ]
    assert len(testapp_infos) == 0, (
        f"Unexpected infos for testapp models: {testapp_infos}"
    )
