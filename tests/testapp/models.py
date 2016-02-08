from django.db import models

from content_editor.models import (
    Template,
    Region,
    ContentProxy,
    create_plugin_base
)


class Page(models.Model):
    title = models.CharField(max_length=200)

    template = Template(
        name='test',
        regions=[
            Region(name='main', title='main region'),
            Region(name='sidebar', title='sidebar region'),
        ],
    )

    def __str__(self):
        return self.title

    def content(self):
        return ContentProxy(self, plugins=[Richtext])


PagePlugin = create_plugin_base(Page)


class Richtext(PagePlugin):
    text = models.TextField(blank=True)

    class Meta:
        verbose_name = 'rich text'
        verbose_name_plural = 'rich texts'
