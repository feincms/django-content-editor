from django.apps import AppConfig


class ContentEditorConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "content_editor"

    def ready(self):
        # Import checks to register them with Django's check framework
        from content_editor import checks  # noqa: F401, PLC0415
