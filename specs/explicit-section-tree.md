# Explicit section tree

Status: proposal, not scheduled.

## Problem

Sections are implicit. Plugins are a flat, ordered list per region; a plugin
with `sections = n > 0` opens `n` sections, a plugin with `sections < 0`
closes sections. Nesting is derived by walking the list and counting
(`content_editor/static/content_editor/sections.js`,
`content_editor/static/content_editor/cloning.js`, and
`RegionRenderer.render_section_plugins` in feincms3).

Consequences:

- A section without a closer extends to the end of the region. "After the
  section" doesn't exist as a position, so the editor can only express it by
  creating a closer (done since the auto-closer and drop-depth changes).
- The closer is a model with a database table and an admin inline whose only
  purpose is structural. Editors see it as an item in the list.
- Every consumer re-implements the counting walk: the editor (twice), the
  clone dialog, feincms3's renderer, and project-specific code.
- Invalid states are representable: closers without openers, unbalanced
  sections, a closer moved to another region on its own.

## Proposal

Store nesting explicitly, using a `depth` field on `PluginBase`:

```python
class PluginBase(models.Model):
    region = models.CharField(...)
    ordering = models.IntegerField(...)
    depth = models.PositiveSmallIntegerField(default=0)
```

The list ordered by `ordering` plus `depth` per item is a complete outline. A
plugin's children are the following items with a greater depth, up to the
next item with a depth less than or equal to its own. Only plugins which may
contain other plugins (container plugins, the current openers) are allowed to
have deeper items directly following them.

Why `depth` and not a `parent` foreign key:

- Plugins of different models live in different tables, so a parent FK would
  have to be a generic relation (content type + object id). It's awkward to
  query and to validate.
- `depth` keeps `Contents` and the region-based fetching unchanged: one query
  per plugin model, merged and sorted by `ordering`.
- Moving a subtree changes the `ordering` and `depth` of the moved items only,
  the same set of rows the editor already updates when reordering.

Closers disappear entirely. They never carry content, so nothing is lost.
Openers stay regular plugins: they have fields and determine how their
section is rendered (accordion, tabs, ...); they only gain the `container`
flag.

### Container declaration

Replace the integer `sections` with a boolean on the inline:

```python
ContentEditorInline.create(model=Accordion, container=True)
```

Multi-level openers (`sections = 2`) go away; nesting is expressed by nesting
containers.

### Validation

- On save (`ContentEditor.save_related` or a formset clean), check that depth
  only increases by one at a time, and only directly after a container.
  Otherwise the editor and the renderer could disagree about the tree.
- A system check warns about inlines still using `sections`.

## Editing experience

What explicit depth buys editors, compared to the closer-based model (including
the auto-closer and drop-depth improvements already shipped):

- **No closer rows.** A section ends where the depth goes back down. The list
  only shows real content; nothing has to be created automatically, kept
  balanced, or deleted together with its opener.
- **Every gap works like the end of a region does today.** While dragging, the
  horizontal pointer position picks the depth anywhere, within the range the
  gap allows. Today this only works at the end of a region, and only by
  creating closers behind the scenes.
- **Adding at any depth.** Insert targets add plugins at the depth of their
  position, and the "+" at the end of a region is no longer stuck inside open
  sections.
- **Ending a section early is one action.** To end a section after item A,
  outdent the item following A. Today the closer has to be found and dragged
  up instead.
- **Indent/outdent without dragging.** Buttons on the inline (and keyboard
  shortcuts, e.g. Tab/Shift+Tab on a focused header) change the depth
  directly. Indenting an item directly after a container moves it into the
  container.
- **"Only the section" is trivial.** Deleting a container just decreases the
  depth of its descendants by one; there's no closer to locate.
- **Invalid states can't be built.** No orphaned closers, no closer moved to
  another region on its own, no unbalanced sections; every list of depths the
  editor produces is a valid tree.

## Editor changes

- `Sections.update` reads `depth` from a hidden `-depth` input instead of
  counting `sections`. `childrenMap` stays as it is; `closerMap` and the
  auto-closer logic go away.
- Drag & drop: the vertical position chooses the gap and the horizontal
  position chooses the depth within the range allowed at that gap (from the
  depth of the next item up to the depth of the previous item, plus one if
  the previous item is a container). This generalizes today's end-of-region
  behavior to every gap.
  Dropping never splits a section: the minimum depth is the depth of the next
  item, so items following the gap keep their parent. Splitting is done by
  outdenting.
- Outdenting an item moves it one level up and automatically takes its
  following siblings (with their descendants) along, so that the items after
  it don't end up inside a plugin which isn't a container. The outdented
  items stay siblings; they don't become children of the outdented item even
  if it is a container. Its own descendants move up together with it.
- Indenting an item is only possible if its new depth is at most the previous
  item's depth, plus one if the previous item is a container (the same rule
  the save validation enforces). Its descendants move along.
- Adding a plugin through an insert target takes the depth of the position.
  The "+" at the end of a region needs a depth choice too, e.g. one insert
  target per open level.
- Moving to another region and cloning move whole subtrees and reset the
  depth of the root to 0.
- Deleting a container either marks the subtree for deletion or decreases the
  depth of the children by one (same dialog as today).

## Renderer changes (feincms3)

`RegionRenderer.render_section_plugins` and `register_section_close` assume
closers. Add a depth-based variant:

```python
def render_section_plugins(self, section, plugins, context):
    out = []
    while plugins and plugins[0].depth > section.depth:
        ...
```

`register_section_close` and `handle__close_section` stay for a deprecation
period so that projects rendering old data keep working.

## Migration path

1. django-content-editor N: add `depth` (default 0) and `container`. Ship a
   helper which computes `depth` from the existing `sections` counters for
   one parent, usable from a data migration in projects:

   ```python
   from content_editor.migrations_utils import compute_depths


   def forwards(apps, schema_editor):
       compute_depths(apps.get_model("pages", "Page"), plugins=[...])
   ```

   The helper walks each region exactly like `Sections.update`, writes
   `depth`, and deletes the closers.
   The editor supports both modes, selected per admin by whether any inline
   uses `sections`.
2. feincms3: depth-aware section rendering, closer-based rendering
   deprecated.
3. django-content-editor N+1: remove `sections` support.

## Open questions

- Is `depth` needed on plugins which can never be nested? It's on
  `PluginBase`, so every plugin table gets the column and a migration.
- Inheritance (`inherit_from`) copies whole regions, so depths stay
  consistent; verify that nothing else slices regions.
- Does feincms3's `subregion` grouping interact with depth (subregions are
  flat runs of plugins; a subregion spanning items of different depths should
  probably be split)?
