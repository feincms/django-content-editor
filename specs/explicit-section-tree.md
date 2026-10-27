# Explicit section tree

Status: proposal, not scheduled.

## Problem

Sections are implicit. Plugins are a flat, ordered list per region; a plugin
whose inline has `sections = n > 0` opens `n` sections, a plugin whose inline
has `sections < 0` closes sections. Nesting is derived by walking the list and
counting. The walk exists several times: in the editor (`Sections.update`,
`depthAfter` and `ancestorsOf` in
`content_editor/static/content_editor/sections.js`, and the clone dialog in
`cloning.js`), in `RegionRenderer.render_section_plugins` in feincms3, and in
project-specific code.

Consequences:

- A section without a closer extends to the end of the region. "After the
  section" doesn't exist as a position. Since 9.2, the editor works around this
  by creating closers: when adding an opener, and when dragging items out of
  sections which are still open at the end of a region.
- The closer is a model with a database table and an admin inline whose only
  purpose is structural. Editors see it as an item in the list.
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
next item with a depth less than or equal to its own. Only containers (the
current openers) may be followed directly by a deeper item, and only one level
deeper. The first item of a region has depth 0.

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

### Consistency on save

The editor never produces invalid depths, so the server doesn't reject them
but normalizes them when saving (e.g. in `ContentEditor.save_related`): walking
each region in order, an item's depth is clamped to at most the previous
item's depth, plus one if the previous item is a container. Items marked for
deletion are skipped. This only matters for crafted requests and programmatic
changes. Rejecting instead would need validation errors spanning several
formsets, which the Django admin has no good place for.

A system check reports inlines using `sections` and `container` in the same
admin, and warns about inlines still using `sections`.

## Editing experience

What explicit depth buys editors, compared to the closer-based model (including
the auto-closer and drop-depth improvements shipped in 9.2):

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
  shortcuts, e.g. Alt+Shift+Arrow keys; not Tab, which has to keep moving the
  focus) change the depth directly.
- **"Only the section" is trivial.** Deleting a container just decreases the
  depth of its descendants by one; there's no closer to locate.
- **Invalid states can't be built.** No orphaned closers, no closer moved to
  another region on its own, no unbalanced sections; every list of depths the
  editor produces is a valid tree.

## Editor changes

In all of the following, "previous item" means the item directly preceding a
position in the region's order, which for a collapsed container is its last
descendant, not the container itself.

- `Sections.update` reads `depth` from a hidden `-depth` input instead of
  counting `sections`; so do `depthAfter` and `ancestorsOf`, which become
  trivial. `childrenMap` stays as it is; `closerMap` and the auto-closer logic
  go away.
- Drag & drop: the vertical position chooses the gap (as today, exactly one
  indicator per gap) and the horizontal position chooses the depth within the
  range allowed at that gap: from the depth of the next item up to the depth
  of the previous item, plus one if the previous item is a container. This
  generalizes today's end-of-region behavior to every gap.
  Dropping never splits a section: the minimum depth is the depth of the next
  item, so items following the gap keep their parent. Splitting is done by
  outdenting.
- Dragged items move together with their descendants, which keep their depth
  relative to the dragged item. With a multi-selection, every selected subtree
  is dropped at the chosen depth, as siblings in their previous order.
- Outdenting an item moves it one level up together with its descendants. Its
  following siblings (with their descendants) automatically move up one level
  as well, so that they don't end up inside a plugin which isn't a container.
  They stay siblings of the outdented item; they don't become its children
  even if it is a container. Items at depth 0 can't be outdented.
- Indenting an item moves it one level down together with its descendants. It
  is only possible if the new depth is at most the previous item's depth, plus
  one if the previous item is a container (the same rule used when saving).
  Directly after a container, the item becomes the container's first child;
  after the last descendant of a preceding sibling container, it becomes that
  container's last child.
- Adding a plugin through an insert target takes the depth of the position.
  The "+" at the end of a region needs a depth choice too, e.g. one insert
  target per open level.
- Moving to another region and cloning (the server-side `CloneForm`) move or
  copy whole subtrees. The root ends up at depth 0, descendants keep their
  depth relative to the root.
- Deleting a container either marks the subtree for deletion or decreases the
  depth of the descendants by one (same dialog as today).

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

1. django-content-editor 10.0: add `depth` (default 0) and `container`. Projects
   generate a schema migration adding `depth` to every plugin model, followed
   by a data migration using a helper which computes `depth` from the
   existing closer-based structure. The helper can't use the inlines'
   `sections` attributes (they live in the admin, not on the models), so the
   section counts are passed explicitly:

   ```python
   from content_editor.migrations_utils import compute_depths


   def forwards(apps, schema_editor):
       compute_depths(
           apps.get_model("pages", "Page"),
           plugins=[apps.get_model("pages", "RichText"), ...],
           sections={
               apps.get_model("pages", "Accordion"): 1,
               apps.get_model("pages", "CloseSection"): -1,
           },
       )
   ```

   The helper walks each region of each page exactly like `Sections.update`,
   writes `depth`, and deletes the closers. Sections which are still open at
   the end of a region simply end there. The closer models and inlines can be
   removed afterwards.
   The editor supports both modes, selected per admin by whether any inline
   uses `sections`.
2. feincms3: depth-aware section rendering, closer-based rendering
   deprecated.
3. django-content-editor 11.0: remove `sections` support.

## Decisions

- **All plugins get `depth`.** It lives on `PluginBase`, so every plugin table
  gets the column and a migration, also plugins which never end up nested.
  That keeps fetching, sorting and validation uniform.
- **Outdenting takes the following siblings along** (see above), instead of
  turning them into children of the outdented item.
- **Slicing regions is the project's responsibility.** Nothing known slices
  regions; inheritance (`inherit_from`) copies whole regions, so depths stay
  consistent. Projects which filter plugins (e.g. a "hide this plugin"
  checkbox) have to drop a hidden container's descendants too, otherwise they
  attach to whatever precedes the container. A small helper could be offered,
  but isn't required.
- **Sections win over subregions.** Combining feincms3's subregions with
  sections isn't an expected use case, but if it happens, the section
  structure takes precedence: a subregion run ends at every depth change, and
  a container always starts its own section regardless of its subregion. In
  the renderer, `takewhile_subregion` additionally stops when the depth
  differs from the depth of the run's first plugin.
