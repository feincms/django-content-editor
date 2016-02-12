from django.db import models

try:
    from django.urls import reverse
except ImportError:  # pragma: no cover
    from django.core.urlresolvers import reverse

from mptt.models import MPTTModel

from content_editor.models import Template, Region, create_plugin_base


class Article(models.Model):
    title = models.CharField(max_length=200)

    regions = [
        Region(name='main', title='main region'),
        Region(name='sidebar', title='sidebar region'),
    ]

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return reverse('article_detail', kwargs={'pk': self.pk})


ArticlePlugin = create_plugin_base(Article)


class RichText(ArticlePlugin):
    text = models.TextField(blank=True)

    class Meta:
        verbose_name = 'rich text'
        verbose_name_plural = 'rich texts'


class Download(ArticlePlugin):
    file = models.FileField(upload_to='downloads/%Y/%m/')

    class Meta:
        verbose_name = 'download'
        verbose_name_plural = 'downloads'


class Page(MPTTModel):
    title = models.CharField(max_length=200)
    parent = models.ForeignKey(
        'self', related_name='children', blank=True, null=True,
        on_delete=models.CASCADE)

    template = Template(
        name='test',
        regions=[
            Region(name='main', title='main region'),
            Region(name='sidebar', title='sidebar region', inherited=True),
        ],
    )

    class Meta:
        verbose_name = 'page'
        verbose_name_plural = 'pages'

    def get_absolute_url(self):
        return reverse('page_detail', kwargs={'pk': self.pk})

    @property
    def regions(self):
        return self.template.regions


PagePlugin = create_plugin_base(Page)


class PageText(PagePlugin):
    text = models.TextField(blank=True)

    class Meta:
        verbose_name = 'text'
        verbose_name_plural = 'texts'
