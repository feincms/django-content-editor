===================================================
django-content-editor -- Editing structured content
===================================================

.. image:: https://travis-ci.org/matthiask/django-content-editor.svg?branch=master
    :target: https://travis-ci.org/matthiask/django-content-editor

.. warning::

   Everything is really bare bones here, but works alright. The abstract
   plugin base model and the administration interface are practically
   finished, but the parts pertaining to views and templates need some
   additional thinking. Also, docs and more tests.

**Tagline: The component formerly known as `FeinCMS' <http://feincms.org>`_
ItemEditor.**


Why
===

``django-content-editor`` does what FeinCMS should have been all along. A
really thin layer around ``django.contrib.admin``'s inlines without any
magical behavior, with proper separation between models, rendering and
administration as Django did with the
`newforms admin a long time ago <https://code.djangoproject.com/wiki/NewformsAdminBranch>`_.

Also, there is **absolutely no magic** going on behind the scenes, no
dynamic model generation or anything similar. The FeinCMS code's dynamic
behavior required workarounds such as ``feincms_item_editor_inline`` for
simple use cases such as specifying ``InlineModelAdmin`` options.
Furthermore, my long gone fondness for monkey patching made the code even
more prone to breakage.


Example: articles with rich text plugins
========================================

``app/models.py``::

    from django.db import models

    from content_editor.models import (
        Template,
        Region,
        create_plugin_base
    )


    class Article(models.Model):
        title = models.CharField(max_length=200)
        pub_date = models.DateField(blank=True, null=True)

        template = Template(
            name='test',
            regions=[
                Region(name='main', title='main region'),
                # Region(name='sidebar', title='sidebar region', inherited=False),
            ],
        )

        def __str__(self):
            return self.title


    ArticlePlugin = create_plugin_base(Article)


    class Richtext(ArticlePlugin):
        text = models.TextField(blank=True)

        class Meta:
            verbose_name = 'rich text'
            verbose_name_plural = 'rich texts'


``app/admin.py``::

    from django import forms
    from django.contrib import admin
    from django.db import models

    from content_editor.admin import ContentEditor, ContentEditorInline

    from .models import Article, Richtext


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
        Article,
        ContentEditor,
        inlines=[
            RichtextInline,
        ],
    )


``app/static/app/plugin_ckeditor.js``::

    /* global django, CKEDITOR */
    django.jQuery(function($) {

        /* Improve spacing */
        var style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = "div[id*='cke_id_'] { margin-left: 170px; }";
        $('head').append(style);

        // Activate and deactivate the CKEDITOR because it does not like
        // getting dragged or its underlying ID changed

        CKEDITOR.config.width = '787';
        CKEDITOR.config.height= '300';
        CKEDITOR.config.format_tags = 'p;h1;h2;h3;h4;pre';
        CKEDITOR.config.toolbar = [[
            'Maximize','-',
            'Format','-',
            'Bold','Italic','Underline','Strike','-',
            'Subscript','Superscript','-',
            'NumberedList','BulletedList','-',
            'Anchor','Link','Unlink','-',
            'Source'
        ]];

        $(document).on(
            'content-editor:activate',
            function(event, row) {
                row.find('textarea.richtext').each(function() {
                    CKEDITOR.replace(this.id, CKEDITOR.config);
                });
            }
        ).on(
            'content-editor:deactivate',
            function(event, row) {
                row.find('textarea.richtext').each(function() {
                    CKEDITOR.instances[this.id] && CKEDITOR.instances[this.id].destroy();
                });
            }
        );
    });


``app/views.py``::

    from django.views import generic

    from content_editor.models import ContentProxy

    from .models import Article, RichText


    class ArticleView(generic.DetailView):
        model = Article

        def get_context_data(self, **kwargs):
            return super().get_context_data(
                content=ContentProxy(self.object, plugins=[RichText]),
                **kwargs)


``app/templates/app/article_detail.html``::

    {% extends "base.html" %}

    {% block title %}{{ article }} - {{ block.super }}{% endblock %}

    {% block content %}
    <h1>{{ article }}</h1>
    {{ article.pub_date }}

    {# Yes, I know. That's not generic or anything at all. #}
    {% for plugin in content.main %}{{ plugin.text|safe }}{% endfor %}
    {% endblock %}


Indices and tables
==================

* :ref:`genindex`
* :ref:`modindex`
* :ref:`search`
