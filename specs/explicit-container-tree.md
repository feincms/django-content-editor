# Explicit container tree

Status: implemented, to be released in django-content-editor 10.0 together
with a feincms3 release building on it (see "Release plan").

## Problem

Sections are implicit. Plugins are a flat, ordered list per region; a plugin
whose inline has `sections = 1` opens a section, a plugin whose inline has
`sections = -1` closes one. Nesting is derived by walking the list and
counting. The walk exists several times: in the editor (`Sections.update`,
`depthAfter` and `ancestorsOf` in
`content_editor/static/content_editor/sections.js`, and the clone dialog in
`cloning.js`), in `RegionRenderer.render_section_plugins` in feincms3 (which
builds sections on top of subregions), and in project-specific code.

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
Openers stay regular plugins and become containers: they have fields and
determine how their contents are rendered (accordion, tabs, ...); they only
gain the `container` flag.

### Container declaration

Replace the integer `sections` on the inline with a boolean on the plugin
model, `False` by default on `PluginBase`:

```python
class Accordion(PagePlugin):
    container = True
```

Whether a plugin is a container defines what the stored `depth` values mean,
so it's a property of the data, not of a particular admin or renderer. The
content editor (including normalization when saving) and the renderer both
read it from the model, so they can't disagree, and other consumers of the
data (APIs, exports, copying content) find it in the same place.

### Admin forms

`ContentEditorInline` adds the structural fields to its fieldsets (or fields)
automatically if they are missing, and renders them as hidden inputs; this
is new for `region` and `ordering` in 10.0 too. `depth` is added to the same
list (`_STRUCTURAL_FIELDS` in `content_editor/admin.py`), so projects
don't have to change any fieldsets, and no system check is needed for it.

### Consistency on save

The editor never produces invalid depths, so the server doesn't reject them
but normalizes them when saving (e.g. in `ContentEditor.save_related`): walking
each region in order, an item's depth is clamped to at most the previous
item's depth, plus one if the previous item is a container. Normalization
runs after the formsets have been saved, so items marked for deletion are
already gone. It only runs for admins with container plugins and without
`sections`. This only matters for crafted requests and programmatic changes. Rejecting instead would need validation errors spanning several
formsets, which the Django admin has no good place for.

A system check reports inlines using `sections` and container plugins in the
same admin, and warns about inlines still using `sections`.

## Editing experience

What explicit depth buys editors, compared to the closer-based model (including
the auto-closer and drop-depth improvements shipped in 9.2):

- **No closer rows.** A container ends where the depth goes back down. The list
  only shows real content; nothing has to be created automatically, kept
  balanced, or deleted together with its opener.
- **Every gap works like the end of a region does today.** While dragging, the
  horizontal pointer position picks the depth anywhere, within the range the
  gap allows. Today this only works at the end of a region, and only by
  creating closers behind the scenes.
- **Adding at any depth.** Insert targets add plugins at the depth of their
  position, and the "+" at the end of a region is no longer stuck inside open
  sections.
- **Ending a container early is one action.** To end a container after item A,
  outdent the item following A. Today the closer has to be found and dragged
  up instead.
- **Indent/outdent without dragging.** Buttons on the inline (and keyboard
  shortcuts, e.g. Alt+Shift+Arrow keys; not Tab, which has to keep moving the
  focus) change the depth directly.
- **"Only the container" is trivial.** Deleting a container just decreases the
  depth of its descendants by one; there's no closer to locate.
- **Invalid states can't be built.** No orphaned closers, no closer moved to
  another region on its own, no unbalanced containers; every list of depths the
  editor produces is a valid tree.

## Editor changes

In all of the following, "previous item" means the item directly preceding a
position in the region's order, which for a collapsed container is its last
descendant, not the container itself.

- `Containers.update` (formerly `Sections.update`) reads `depth` from a hidden
  `-depth` input instead of counting `sections`, and normalizes it using the
  same rule as the server; so does `ancestorsOf`. `childrenMap` stays as it
  is. `closerMap`, `depthAfter` and the auto-closer logic are only used by
  the deprecated closer-based mode and go away together with `sections`.
- Drag & drop: the vertical position chooses the gap (as today, exactly one
  indicator per gap) and the horizontal position chooses the depth within the
  range allowed at that gap: from the depth of the next item up to the depth
  of the previous item, plus one if the previous item is a container. This
  generalizes today's end-of-region behavior to every gap.
  Dropping never splits a container: the minimum depth is the depth of the next
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
- Moving a container to another region moves its whole subtree. It's
  appended to the end of the region; the root ends up at depth 0, descendants
  keep their depth relative to the root.
- Cloning (the server-side `CloneForm`) copies the selected plugins to the
  insert position. The roots take the depth of that position (`_clone_depth`),
  like added plugins do, so cloning into a container doesn't end it;
  descendants keep their depth relative to their root.
- Deleting a container either marks the subtree for deletion or decreases the
  depth of the descendants by one (same dialog as today). Unchecking the
  container's delete checkbox restores the previous depths.

## Rendering

The renderer moves from feincms3 into django-content-editor, so that the
package defining the tree also renders it. feincms3 builds on top of it.

Apart from container rendering, the move doesn't depend on `depth`, but it
lands together with it in 10.0 (see "Release plan").

### What moves

A new `content_editor.renderer` module with the core of today's
`feincms3.renderer`:

- `RegionRenderer` with plugin registration (`register`, `unregister`,
  `copy`, `plugins(fetch=...)`), `render_plugin`, `render_region` and
  `render_regions`.
- Fetching and caching: `regions_from_item` (using `contents_for_item`, the
  `fetch` flag and `inherit_from`), `regions_from_contents` and the opaque
  regions object with its cache handling.
- The helpers `template_renderer`, `render_in_context`, `default_context` and
  `PluginNotRegisteredError`.
- Container rendering, rebuilt on `depth` (see below).
- Subregions: the `subregion` argument of `register`, the dispatch to
  `handle_<subregion>` methods, `subregion()` and `takewhile_subregion()`.
- Marks: the `marks` argument of `register`, `marks()` and
  `takewhile_mark()`. They cost nothing when unused, and emulating them
  without such a concept would be needlessly hard.
- The `{% render_region %}` template tag, which only calls
  `regions.render()`, in the `content_editor` template tag library
  (`{% load content_editor %}`). feincms3's `{% load feincms3 %}` keeps
  offering it.

The deprecated compatibility APIs (`TemplatePluginRenderer`,
`register_string_renderer`, `register_template_renderer`,
`render_plugin_in_context`, `feincms3.regions`) don't move; they stay in
feincms3 until they are removed.

### Containers

Today, sections are rendered through subregions: an opener is registered with
a subregion, a `handle_<subregion>` method calls `render_section_plugins`,
and a registered closer ends the section. With `depth`, the renderer walks the
tree instead, and containers are recognized by their model's `container`
attribute:

```python
renderer.register(
    Accordion,
    template_renderer("containers/accordion.html"),
)
```

A container's renderer receives its children explicitly, as a third argument:
`renderer(plugin, context, children)`. `register` checks that the renderer
of a container accepts it, like the existing check for two
arguments. `children` is a sequence of rendered child nodes in order; each
node has the child's `plugin` and renders as the child's HTML, and the
sequence itself renders as the concatenated HTML. So a simple container
template only needs `{{ children }}`, while e.g. tabs can loop over the nodes
and use each child plugin for the tab titles. `template_renderer` exposes
the sequence as `children` in the template.

Containers are declared explicitly instead of being inferred from the
data, because an empty container has to render as a container too, and
because its renderer is called differently.

The renderer renders each list of siblings (the top level of a region, or
the children of one container) through one overridable method,
`render_siblings(plugins, context)`. It dispatches runs of plugins to their
subregion's `handle_<subregion>` method, exactly like `handle()` does today;
`handle_default` renders plugins one by one, recursing into containers. The
handlers only ever see the siblings, never the whole region.

### Containers and subregions

Both stay, for different purposes:

- **Containers** are explicit structure. Editors create them in
  the content editor and see them there. Use them when the editor decides
  what belongs together: accordions, tabs, columns.
- **Subregions** are implicit grouping at render time, decided by the
  developer based on which plugins follow each other, and invisible in the
  editor. Use them for grouping which should just happen, e.g. rendering two
  consecutive images side by side.

The documentation states this distinction prominently, with the rule of
thumb: if the editor decides the grouping, use a container; if it follows
from adjacent plugin types, use a subregion.

Subregions only ever group siblings: subregion handling runs inside
`render_siblings`, so a subregion run can't cross a container boundary, and
consecutive images are grouped inside a container the same way as at the top
level. This makes containers win over subregions without any special rules.

`render_section_plugins`, `register_section_close` and `handle__close_section`
stay in feincms3 for a deprecation period so that projects rendering
closer-based data keep working.

### What builds on top

`feincms3.renderer` re-exports the moved names, so existing imports keep
working. Its `RegionRenderer` subclass only adds the deprecated compatibility
APIs and closer-based section rendering until they are removed. Projects
build on the renderer as before, e.g. with their own `handle_<subregion>`
methods.

## Release plan

Everything lands at once, in one release per package, so projects upgrade
and migrate in one step.

1. django-content-editor 10.0: `depth`, the model-level `container`
   attribute, editor support, the renderer including container rendering,
   the migration helper and the rename of sections to containers.
2. feincms3, released at the same time and requiring django-content-editor
   10.0: `feincms3.renderer` builds on `content_editor.renderer` and
   re-exports its names; closer-based section rendering
   (`render_section_plugins`, `register_section_close`) emits a
   `DeprecationWarning`. feincms3 currently requires
   `django-content-editor>=9` without an upper bound, so older feincms3
   releases are installed together with 10.0 too. Their renderer keeps working
   for closer-based data but doesn't know containers.
3. django-content-editor 11.0: remove `sections`: the inline attribute, the
   closer-based mode in the editor (`closerMap`, `closerPlugin`, `depthAfter`,
   `addSectionClosers`, closing sections when dropping at the end of a region,
   `.order-machine-container--open`), and the checks `content_editor.E004`
   and `content_editor.W001`. feincms3 removes closer-based section rendering
   at the same time. `compute_depths` stays, since data migrations import it.

The new messages (indent, outdent, the container deletion dialog) are
translated to German; the other catalogs list them for their translators.

### Upgrading projects

1. Upgrade django-content-editor and feincms3 together.
2. Run `makemigrations`: every plugin model gets the `depth` column. This is
   required for all projects, also those not using sections; without the
   column, fetching plugins fails.
3. Projects using sections additionally:
   - Set `container = True` on the models of the opening plugins (JSON
     plugin proxies get it using a mixin passed to `proxy(mixins=[...])`).
   - Write a data migration using a helper which computes `depth` from the
     existing closer-based structure. The helper can't use the inlines'
     `sections` attributes (they live in the admin, not on the models), so
     the openers and closers are passed explicitly, as models or querysets:

     ```python
     from content_editor.migrations_utils import compute_depths


     def forwards(apps, schema_editor):
         JSONPlugin = apps.get_model("pages", "JSONPlugin")
         compute_depths(
             apps.get_model("pages", "Page"),
             plugins=[apps.get_model("pages", "RichText"), JSONPlugin],
             openers=[apps.get_model("pages", "Accordion")],
             closers=[JSONPlugin.objects.filter(type="close_section")],
         )
     ```

     `plugins` lists the remaining plugin models. The helper walks each
     region of each page like the editor does, writes `depth`, and deletes
     the closers. Sections which are still open at the end of a region simply
     end there. Each row is processed once; closers take precedence over
     openers, and openers over the remaining plugins. Proxies sharing a table
     (e.g. JSON plugins) can't be passed as openers or closers, because
     models are fetched without filtering, so the helper rejects them; they
     are passed as querysets instead. Openers opening several sections at
     once (`sections = 2`) aren't supported; the helper counts every opener
     as one level.
   - The data migration deletes the closers and can't be reversed, so back up
     the database first.
   - Run the data migration only together with a renderer which knows
     containers (`content_editor.renderer` or the feincms3 release from
     step 2 above). Older renderers would render every section until the end
     of its region, since the closers are gone.
   - Remove `sections` from the inlines, and the closer models and inlines.

The editor supports both modes until 11.0, selected per admin: depth-based
when the admin has container plugins and no inline uses `sections`,
closer-based otherwise.

## Decisions

- **All plugins get `depth`.** It lives on `PluginBase`, so every plugin table
  gets the column and a migration, also plugins which never end up nested.
  That keeps fetching, sorting and validation uniform.
- **Outdenting takes the following siblings along** (see above), instead of
  turning them into children of the outdented item.
- **Slicing regions is the project's responsibility.** Nothing known slices
  regions; inheritance (`inherit_from`) copies whole regions, so depths stay
  consistent. Projects which filter plugins (e.g. a "hide this plugin"
  checkbox) have to drop a hidden container's descendants too, otherwise the
  renderer attaches them to the closest preceding container with a lower
  depth, or renders them at the top level. A small helper could be offered,
  but isn't required.
- **Containers and subregions both stay.** Containers are explicit structure
  created by editors, subregions implicit render-time grouping of adjacent
  plugins. Subregions only group siblings, so containers always win (see
  "Containers and subregions").
- **`container` lives on the plugin model**, not on the inline or in the
  renderer registration. It defines what the stored depths mean, so the
  editor and the renderer must agree on it.
- **Container renderers receive their children explicitly**, as a sequence of
  rendered child nodes which also renders as the concatenated HTML.
- **Subregions and marks move to django-content-editor** together with the
  rest of the renderer. Containers and subregions are documented side by side,
  which helps with choosing between them; marks are cheap when unused.
- **Everything lands in 10.0**, together with a feincms3 release building on
  `content_editor.renderer`. Releasing the renderer earlier (e.g. in 9.3)
  would only help if feincms3 had to be released before 10.0, which isn't
  needed.
- **The concept is called "container" everywhere**: in the API, the editor
  (module, CSS classes, messages) and the documentation. "Sections" only
  refers to the deprecated closer-based `sections` attribute.
