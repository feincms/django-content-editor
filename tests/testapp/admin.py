from django import forms
from django.contrib import admin
from django.db import models

from content_editor.admin import ContentEditor, ContentEditorInline

from .models import Page, Richtext


class RichTextarea(forms.Textarea):
    def __init__(self, attrs=None):
        default_attrs = {'class': 'richtext'}
        if attrs:
            default_attrs.update(attrs)
        super(RichTextarea, self).__init__(default_attrs)


class RichtextInline(ContentEditorInline):
    model = Richtext
    formfield_overrides = {
        models.TextField: {'widget': RichTextarea},
    }

    class Media:
        js = (
            '//cdn.ckeditor.com/4.5.6/standard/ckeditor.js',
            'app/plugin_ckeditor.js',
        )

admin.site.register(
    Page,
    ContentEditor,
    inlines=[
        RichtextInline,
    ],
)
