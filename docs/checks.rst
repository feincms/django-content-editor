=============
System Checks
=============

django-content-editor provides Django system checks to catch common configuration issues early.

Admin Checks
============

content_editor.E001
-------------------

**Missing region and ordering fields in fieldsets**

When using ``ContentEditorInline`` with custom fieldsets, both ``region`` and ``ordering`` fields must be included.

.. code-block:: python

    class MyPluginInline(ContentEditorInline):
        model = MyPlugin
        fieldsets = [
            (None, {
                "fields": ["title", "content", "region", "ordering"],
            }),
        ]

content_editor.E002
-------------------

**Missing regions attribute**

Models used with ``ContentEditor`` must have a non-empty ``regions`` attribute or property.

.. code-block:: python

    from content_editor.models import Region

    class Article(models.Model):
        title = models.CharField(max_length=200)

        regions = [
            Region(key="main", title="Main content"),
        ]

content_editor.E003
-------------------

**Regions must be iterable**

The ``regions`` attribute on ``ContentEditorInline`` must be ``None`` or an iterable (not a string).

.. code-block:: python

    # Incorrect:
    class MyPluginInline(ContentEditorInline):
        regions = "main"  # String - will fail

    # Correct:
    class MyPluginInline(ContentEditorInline):
        regions = {"main"}  # Set - OK
        # or
        regions = None  # OK

Model Checks
============

content_editor.I001
-------------------

**Unexpected non-abstract base classes**

This info-level check warns when plugin models inherit from non-abstract base classes (other than ``PluginBase``). This can lead to unexpected database table structures.

.. code-block:: python

    # Will trigger I001:
    class MyBase(models.Model):
        created_at = models.DateTimeField(auto_now_add=True)

    class MyPlugin(PluginBase, MyBase):
        pass

    # Recommended:
    class MyBase(models.Model):
        created_at = models.DateTimeField(auto_now_add=True)

        class Meta:
            abstract = True

    class MyPlugin(PluginBase, MyBase):
        pass
