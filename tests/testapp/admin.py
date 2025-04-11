from django import forms
from django.contrib import admin
from django.db import models

from content_editor.admin import (
    ContentEditor,
    ContentEditorInline,
    allow_regions,
    deny_regions,
)
from testapp.models import Article, CloseSection, Download, RichText, Section, Thing


class RichTextarea(forms.Textarea):
    def __init__(self, attrs=None):
        default_attrs = {"class": "richtext"}
        if attrs:  # pragma: no cover
            default_attrs.update(attrs)
        super().__init__(default_attrs)


class RichTextInline(ContentEditorInline):
    model = RichText
    formfield_overrides = {models.TextField: {"widget": RichTextarea}}
    fieldsets = [(None, {"fields": ("text", "region", "ordering")})]
    regions = allow_regions({"main"})


class ThingInline(admin.TabularInline):
    model = Thing


class SectionInline(ContentEditorInline):
    model = Section
    sections = 1


class CloseSectionInline(ContentEditorInline):
    model = CloseSection
    sections = -1


admin.site.register(
    Article,
    ContentEditor,
    inlines=[
        RichTextInline,
        ContentEditorInline.create(model=Download, regions=deny_regions({"sidebar"})),
        ThingInline,
        SectionInline,
        CloseSectionInline,
    ],
)
