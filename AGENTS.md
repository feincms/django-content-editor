# Agent Instructions for django-content-editor

This document provides guidance for AI coding agents working on the django-content-editor codebase.

## Repository Overview

django-content-editor is a Django library for editing structured content in the admin interface. It extends Django's inlines mechanism to manage heterogeneous collections of content blocks (plugins) organized into regions, commonly used for CMS-style content editing.

**Key directories:**
- `content_editor/` - Main package code
- `tests/testapp/` - Test application and test suite
- `docs/` - Sphinx documentation (reStructuredText)

**Core modules:**
- `admin.py` - ContentEditor, ContentEditorInline, and admin check classes
- `models.py` - PluginBase model and Region class
- `contents.py` - Contents class and helpers for fetching/organizing content
- `checks.py` - Django system checks

## Development Workflow

### Before Making Changes

1. **Always read files before editing them** - Use the Read tool to understand existing code structure
2. **Check for existing tests** - Look in `tests/testapp/test_*.py` for related test coverage
3. **Review system checks** - Changes to admin classes should consider the checks in `checks.py`
4. **Check documentation** - Related docs may need updates in `docs/`

### Testing Requirements

**Run tests through tox:**
```bash
tox -e py312-dj52  # Run specific Python/Django version
tox -l             # List available test environments
```

**Test suite structure:**
- `test_content_editor.py` - Basic ContentEditor functionality
- `test_contents.py` - Contents class and helpers
- `test_checks.py` - Django system checks
- `test_playwright.py` - Browser-based integration tests
- `test_playwright_helpers.py` - Playwright utilities

**Important testing practices:**
- Write tests for new functionality in appropriate test files
- Place imports at the top of test files, not inside test methods
- Playwright tests require Chromium installation (handled by tox)
- Tests must pass before changes are considered complete
- Integration tests use pytest-playwright and test real browser interactions

### Code Style

- Follow existing code style (project uses pre-commit hooks with ruff and biome)
- Run `prek` to execute pre-commit hooks before committing
- Keep code minimal and focused - avoid over-engineering
- Prefer editing existing files over creating new ones
- Don't add comments, docstrings, or type annotations to unchanged code
- Only add error handling where truly necessary (at boundaries)

## Architecture Considerations

### Plugin System

**PluginBase model:**
- Abstract base class for all content plugins
- Provides `parent`, `region`, and `ordering` fields
- Plugins are typically defined per-project (not in this library)

**ContentEditorInline:**
- Specialized StackedInline for plugins
- Used as a marker to differentiate plugins from regular inlines
- Can restrict plugins to specific regions using `regions` attribute
- Supports customization via `icon`, `color`, `button` attributes

**Important patterns:**
- ContentEditor identifies plugins by checking `isinstance(inline, ContentEditorInline)`
- The `.create()` classmethod dynamically creates inline classes
- Plugins are rendered in regions using drag-and-drop interface

### Region System

**Regions organize content:**
- Defined as a `regions` attribute/property on the model
- Must return a list of `Region` instances
- Each region has `key`, `title`, and optional `inherited` attributes
- Region keys must be valid Python identifiers

**Contents class:**
- Groups content blocks by region
- Supports inheritance (empty regions can inherit from parent instances)
- Access content via attribute (`contents.main`) or subscription (`contents["main"]`)
- Unknown regions go to `_unknown_region_contents`

### System Checks

The library provides four system checks:
- `content_editor.E001` - Missing region/ordering in fieldsets
- `content_editor.E002` - Missing regions attribute on model
- `content_editor.E003` - Regions not iterable
- `content_editor.I001` - Non-abstract base classes warning

**Check implementation:**
- Admin checks use custom `checks_class` on admin classes
- Model checks use `@register()` decorator
- All checks documented in `docs/checks.rst`

## Documentation Practices

### Sphinx Documentation Structure

Documentation is in `docs/` using reStructuredText:
- `index.rst` - Main entry with toctree
- `installation.rst` - Installation instructions
- `quickstart.rst` - Getting started guide
- `admin-classes.rst` - ContentEditor, ContentEditorInline, RefinedModelAdmin
- `contents.rst` - Contents class and regions
- `checks.rst` - System checks reference
- `design-decisions.rst` - Architecture explanations
- `changelog.rst` - Links to CHANGELOG.rst

### When Adding Documentation

1. Determine appropriate .rst file (or create new one if needed)
2. Keep documentation concise and practical
3. Use code-block directives with Python syntax highlighting
4. Add new files to index.rst toctree
5. Follow existing RST formatting conventions
6. Assume readers have Django knowledge

### README.rst

Keep the README minimal - it just points to Read the Docs. Full documentation lives in `docs/`.

## Common Patterns

### Creating Plugin Inlines

Use the `.create()` classmethod for convenience:
```python
ContentEditorInline.create(
    model=MyPlugin,
    icon="description",  # Material icon
    color="oklch(0.5 0.2 330)",  # Custom color
    regions={"main"},  # Restrict to regions
)
```

### Region Restrictions

Two helper functions for restricting plugins to regions:
- `allow_regions({"main", "sidebar"})` - Only allow these regions
- `deny_regions({"footer"})` - Allow all except these regions

The `deny_regions` helper returns a callable that computes allowed regions dynamically.

### Contents Helpers

Prefer using helper functions over instantiating `Contents` directly:
```python
# Single item
contents = contents_for_item(article, plugins=[RichText, Download])

# Multiple items (with batching)
contents = contents_for_items(articles, plugins=[RichText, Download])

# With inheritance
contents = contents_for_item(
    page,
    plugins=[RichText],
    inherit_from=page.ancestors().reverse(),
)
```

### Field Visibility

ContentEditorInline automatically hides `region` and `ordering` fields using `HiddenInput` widget. These fields must exist in fieldsets but won't be visible to users.

## Git and Version Control

- Repository is at `github.com/matthiask/django-content-editor`
- Follow conventional commit messages
- Don't commit unless explicitly requested
- Never use `--no-verify` or skip hooks
- Stage specific files by name (avoid `git add -A`)
- Watch for sensitive files (.env, credentials) before staging

## File Organization

**Don't create unnecessary files:**
- No new markdown/documentation files without explicit request
- Don't create helper utilities for one-time operations
- Don't add configuration for hypothetical future needs

**Static files:**
- Admin CSS in `content_editor/static/content_editor/`
- Admin JavaScript in same directory
- Material icons CSS included

**Translations:**
- Locale files in `content_editor/locale/`
- Use Django's translation functions (`gettext`, `gettext_lazy`)

## When Stuck

If you need to understand complex behavior:
1. Read the test files - they demonstrate real usage patterns
2. Check `admin.py` for the ContentEditor implementation
3. Look at `contents.py` for the Contents class and helpers
4. Review `models.py` for PluginBase and Region
5. Check Playwright tests for browser interaction behavior
6. Look at `docs/` for architectural explanations

## JavaScript and Frontend

The content editor includes significant JavaScript:
- `content_editor.js` - Main drag-and-drop functionality
- `save_shortcut.js` - Ctrl+S / Cmd+S shortcuts
- `tabbed_fieldsets.js` - Tabbed fieldset support

**Context object:**
- JavaScript receives configuration via JSON script tag
- Context includes plugins, regions, messages, permissions
- Generated by `_content_editor_context()` method in admin

## Common Issues

**Plugin not appearing:**
- Ensure inline uses `ContentEditorInline` (not just `StackedInline`)
- Check if plugin is restricted to regions the model doesn't have
- Verify model inherits from `PluginBase`

**Region errors:**
- Model must have `regions` attribute (not method)
- Regions must be iterable (list, tuple, set) not string
- Region keys must be valid Python identifiers

**Fieldset validation:**
- ContentEditorInline fieldsets must include `region` and `ordering`
- These fields are automatically hidden (don't add HiddenInput manually)

## References

- Django documentation: https://docs.djangoproject.com/
- Read the Docs: https://django-content-editor.readthedocs.io/
- Related project FeinCMS: https://github.com/feincms/feincms/
- Related project feincms3: https://feincms3.readthedocs.io/
