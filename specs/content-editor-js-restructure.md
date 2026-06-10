# Spec: Restructuring & modernizing the content editor frontend

Status: **draft / research** — updated as analysis and planning proceed.

## 1. Goals

1. **Separate concerns** into well-named units (ES modules acting as namespaces;
   classes only where something is genuinely instantiated more than once or
   benefits from encapsulating mutable state).
2. **Centralize initialization.** Today the bootstrap logic is scattered across
   the top-level IIFE, a nested `django.jQuery(($) => …)` callback, several
   inner IIFEs and `setTimeout` calls. Move it into one explicit, ordered
   sequence.
3. **Fix the rights/permissions bug:** plugins can currently be added even when
   the instance has *no regions at all*. Adding must be impossible without a
   valid, non-unknown current region.
4. **Keep relying on integration (Playwright) tests.** Unit tests are not a
   goal in themselves; extracting pure utilities into their own module is
   welcome *for code structure*, and they become trivially unit-testable as a
   side benefit, but integration coverage stays the primary safety net.

5. **Remove the jQuery dependency entirely**, using vanilla DOM. Unblocked by
   the decision to require Django ≥ 4.2 (see §7); `admin/js/jquery.init.js` is
   dropped from `Media` and the public custom events go native. See §7.

Non-goals: redesigning the UX, changing the Python/admin API, introducing a
bundler or npm build step.

## 2. Current state

### 2.1 Files (`content_editor/static/content_editor/`)

| File | Role |
| --- | --- |
| `content_editor.js` | ~1245 lines, one big IIFE. The entire order-machine editor. |
| `tabbed_fieldsets.js` | Standalone, no jQuery. Tabbed fieldsets for `RefinedModelAdmin`. Already reasonably clean. |
| `save_shortcut.js` | Standalone. Ctrl/Cmd-S save + delete-confirmation guard. Clean. |
| `content_editor.css` | Order-machine, plugin buttons, drag/drop, sections, cloning dialog, Jazzmin overrides. |
| `tabbed_fieldsets.css` | Tab styles + `.content-editor-invisible` helper. |
| `django_admin_fixes.css` | One rule (`.form-row { overflow: visible }`). |
| `material-icons.css/.woff2` | Icon font. |

### 2.2 How it is loaded (no build step!)

- `content_editor/admin.py`:
  - `RefinedModelAdmin.Media` → `save_shortcut.js`, `tabbed_fieldsets.js`,
    `tabbed_fieldsets.css`, `django_admin_fixes.css`.
  - `ContentEditor._content_editor_media()` builds a `forms.Media` with
    `admin/js/jquery.init.js`, a `JSON(...)` `<script id="content-editor-context">`
    data block, and `content_editor.js`.
- Scripts are served **as-is**; there is no `package.json`, bundler, or
  transpile step. `biome` is used only for lint/format. Pre-commit excludes
  `*.min.*`.
- **Key enabler:** the `django-js-asset` dependency (`js_asset.js`) already
  provides:
  - `JS(src, attrs={...})` → emits `<script src=… attr=…>`, so we can add
    `type="module"`.
  - `ImportMap` → emits `<script type="importmap">`, mapping bare specifiers to
    `static()`-resolved (hashed) URLs.
  This means **native ES modules require no new tooling.** Note that relative
  imports (`import … from "./dom.js"`) are **not** viable under
  `ManifestStaticFilesStorage` (it does not rewrite JS import specifiers, so
  hashed filenames 404); the import map is **required**, not optional — see
  §4.1.

### 2.3 Public API that MUST be preserved

Third-party integrations (django-prose-editor, feincms3, custom plugin JS)
depend on these. They are contract, not implementation detail:

- `window.ContentEditor` global object, specifically:
  - `ContentEditor.addPluginButton(prefix, iconHTML, initializing)`
  - `ContentEditor.addContent(prefix)`
  - read access to `plugins`, `regions`, `currentRegion`, etc.
- DOM events dispatched on `document`:
  - `content-editor:ready`
  - `content-editor:activate` (passes the row — payload shape changing, §7.2)
  - `content-editor:deactivate` (passes the row — payload shape changing, §7.2)
- The `#content-editor-context` JSON contract (produced by
  `_content_editor_context` in `admin.py`).
- CSS class / DOM-structure contracts relied on by Playwright tests and by
  integrators (e.g. `.order-machine`, `.tabs.regions`, `.plugin-buttons`,
  `.order-machine-insert-target`, `dialog.clone`, `input[name=_clone]`, …).

### 2.4 Concerns identified in `content_editor.js`

The single file mixes ~15 concerns:

1. **Generic DOM utils** — `qs`, `qsa`, `crel`, `buildDropdown`, `debounce`.
   Pure, no editor state.
2. **Safe storage** — `safeStorage`, `LS` (localStorage wrapper).
3. **Editor state / context** — `prepareContentEditorObject`: parses the JSON
   context, derives `declaredRegions`, `pluginsByPrefix`, `regionsByKey`,
   `hasSections`; holds `currentRegion`, `_insertBefore`; exposes `addContent`.
   This is the singleton `window.ContentEditor`.
4. **Layout scaffolding** — `addOrderMachine` (injects tabs/order-machine/
   plugin-buttons markup), `addPluginIconsToInlines`.
5. **Dynamic styles** — `defineContentEditorStyles` (runtime CSS using
   `gettext` + `declaredRegions`; cannot be static).
6. **Regions & tabs** — tab creation, `currentRegion` switching,
   `hideInlinesFromOtherRegions`.
7. **Region assignment for inlines** — `assignRegionDataAttribute`,
   `attachMoveToRegionDropdown`, unknown-region synthesis, `getPluginTypeFromId`,
   `pluginRegions` map.
8. **Plugin buttons (add UI)** — `addPluginButton`,
   `updatePluginButtonsVisibility`, `pluginInCurrentRegion`,
   `hidePluginButtons`, insert-target click handling, positioning.
9. **Ordering** — `setBiggestOrdering`, `insertAdjacent`, `findInlinesInOrder`,
   `style.order` ↔ `-ordering` input syncing.
10. **Drag & drop** — `ensureDraggable`, `startMouseMonitor`,
    `shouldInsertAfter`, dragstart/over/drop/end.
11. **Sections (nested grouping)** — `updateSections`, `closeSection`,
    `hideSection`, `selectSection`, `sectionsMap`/`childrenMap`, ResizeObserver.
12. **Collapse / expand** — `collapseInline`, `initializeCollapseAll`,
    collapse-toggle + h3-click + for-deletion handlers.
13. **Inline lifecycle** — `reorderInlines`, `formset:added`/`removed`
    handlers, activate/deactivate event wiring.
14. **State persistence** — `saveEditorState`/`restoreEditorState` via URL hash,
    form-submit handler.
15. **Cloning** — `addCloningButton` + the entire clone dialog builder.
16. **Orchestration** — the scattered bootstrap tying all of the above together.

## 3. The rights/permissions bug (goal #3)

### 3.1 Root cause

`updatePluginButtonsVisibility()` is responsible for three things at once:

- hiding individual plugin buttons not allowed in the current region,
- toggling `order-machine-hide-insert-targets` on the wrapper (i.e. whether the
  "+" insert targets are clickable at all),
- showing the `noPlugins` / `noRegions` messages.

It is invoked from only two places: at the tail of `addPluginButton(...)` when
`initializing === false`, and inside the **tab click handler**. Initial plugin
buttons are added with `initializing = true` (no visibility pass), and the only
initial trigger is `restoreEditorState()` doing `tabs.eq(0).click()`.

When the instance has **no regions**, no tab `<h2>` elements are created, so
`tabs.eq(0).click()` is a no-op. Therefore `updatePluginButtonsVisibility()`
**never runs**, and the insert targets keep their CSS-default *visible* state.
A user can click a "+" target, the (un-hidden) plugin buttons appear, and
clicking one calls `ContentEditor.addContent(prefix)` — adding a plugin with
`currentRegion === undefined`.

`pluginInCurrentRegion()` already guards correctly
(`if (!ContentEditor.regions.length) return false`); the defect is purely that
the guard is gated behind an event that never fires. This is a direct
consequence of scattered initialization (goal #2), which is why the fix and the
refactor belong together.

Note: `assignRegionDataAttribute()` can *synthesize* `_unknown_*` regions from
existing content, which makes `regions.length > 0` even when nothing was
declared. The "no regions" state to defend against is **no declared, real
(non-`_unknown_`) region** — not merely `regions.length === 0`.

### 3.2 Required behavior

- If there is no valid current region (none declared, or `currentRegion` is
  unset / `_unknown_*`), insert targets must be non-interactive and plugin
  buttons hidden; show the `noRegions` message.
- Adding must be blocked at the source too: `addContent` / the add path should
  refuse when there is no valid target region, not merely rely on buttons being
  visually hidden (defense in depth, since `addContent` is public API).
- Centralized init must always run the visibility/state pass exactly once,
  independent of whether any tab click happens.

## 4. Target architecture

### 4.1 Module strategy: native ES modules + import map (no build step)

**Constraint — `ManifestStaticFilesStorage`:** Django's hashed static storage
rewrites `url()` / `@import` in CSS and source-map comments, but it does **not**
rewrite `import` specifiers inside JavaScript. So a module that does
`import { qs } from "./dom.js"` keeps that literal string after `collectstatic`,
while the file on disk becomes `dom.<hash>.js` → 404. **Relative imports between
ES modules are therefore not viable** under hashed storage.

**Resolution — import map (proven pattern).** Use **bare specifiers** and map
them to hashed URLs with `js_asset`'s `ImportMap` (which resolves through
`static()`, so it picks up the manifest hashes). This is the same approach
already used successfully in **django-prose-editor**, so it is a known-good,
low-risk path rather than a new experiment.

- Modules import via bare specifiers, e.g.
  `import { qs, qsa } from "content-editor/dom"`.
- The admin emits one `<script type="importmap">` mapping those specifiers to
  `static("content_editor/dom.js")` (→ hashed at deploy), via
  `js_asset.ImportMap` / the shared `importmap` registry, **before** the entry
  module script.
- Entry point loaded with `JS("content_editor/index.js", {"type": "module"})`.
- `type="module"` is deferred and runs after the document is parsed, so
  `window.gettext` and the `#content-editor-context` JSON block are available.
- The entry module still assigns `window.ContentEditor` to preserve the global
  public API.

**Import-map caveats to respect** (all handled by the django-prose-editor
pattern, noted here so we don't regress):

- A document may contain only one effective import map and it must appear
  **before** the first module script. `js_asset`'s shared `importmap` registry
  is designed to merge entries from multiple apps into a single block — reuse
  it rather than emitting an ad-hoc `<script type="importmap">`.
- Import-map entries must stay in sync with the set of module files. Generate
  them from a single list in `admin.py` (one `static()` call per module) so
  adding a module is a one-line change.
- Bare specifiers should be namespaced (`content-editor/…`) to avoid collisions
  with other apps' import-map entries.

### 4.2 Proposed module layout

The ~16 concerns in §2.4 do **not** map to 16 files — many are 15–40 lines and
several are tightly coupled (e.g. the region/plugin *rights* logic spans
"regions" and "plugin buttons"; the ordering math is used by drag/drop, cloning
and adding). Splitting per-function would produce tiny files, more cross-module
chatter, and one import-map entry each. Instead group by **subsystem** into
~8 files. Files live under `content_editor/static/content_editor/`; each
non-entry module gets one import-map entry under the `content-editor/`
namespace.

```
file              specifier               ~LOC  contains (concerns from §2.4)
index.js          (type=module entry)      ~200 orchestration/central init (#16); runtime <style>
                                                injection (#5); URL-hash persistence + form submit
                                                (#14); readonly handling; fires content-editor:ready
context.js        content-editor/context    ~50 ContentEditor singleton, JSON parse, derived maps,
                                                addContent (#3)
utils.js          content-editor/utils      ~90 qs/qsa/crel/buildDropdown/debounce (#1), safeStorage/LS
                                                (#2), native custom-event emit/on helpers
regions.js        content-editor/regions   ~260 region tabs + currentRegion switching +
                                                hide-other-regions (#6); region assignment +
                                                move-to-region dropdown + unknown regions +
                                                getPluginTypeFromId (#7); plugin add-buttons +
                                                rights/visibility + insert targets (#8) — the whole
                                                "what plugin may go in what region" domain, incl. the
                                                §3 bug fix
machine.js        content-editor/machine   ~380 layout scaffolding + plugin icons (#4); reorderInlines
                                                + formset added/removed + activate/deactivate (#13);
                                                ordering math: findInlinesInOrder/setBiggestOrdering/
                                                insertAdjacent (#9); collapse/expand + collapse-all +
                                                for-deletion (#12)
dragdrop.js       content-editor/dragdrop  ~110 draggable wiring, mouse monitor, drop handling (#10)
sections.js       content-editor/sections  ~140 Sections manager class (nested grouping) (#11)
cloning.js        content-editor/cloning   ~190 clone dialog (#15)
```

**8 files** (1 entry + 7 imported). Rationale for the non-obvious groupings:

- **`regions.js`** keeps the rights logic in one place. The bug in §3 lives at
  the seam between "current region" and "which plugin buttons are enabled";
  separating them is what made the original code easy to get wrong.
- **`machine.js`** is the order-machine core: building it, moving inlines into
  it, the ordering arithmetic, and the formset/collapse lifecycle all mutate the
  same DOM region and share the ordering helpers. It is the largest file but
  highly cohesive.
- **`sections.js`** stays separate: its `Sections` class owns
  `sectionsMap`/`childrenMap` + the ResizeObserver, and `machine.js` only calls
  `sections.update()` at a few points — a clean, narrow interface (see §4.3 on
  the class-per-subsystem approach).
- **`dragdrop.js`** stays separate: self-contained event wiring that depends on
  `machine.js`'s ordering/section hooks but is otherwise isolated.
- **`utils.js`** absorbs the three trivial helper concerns (dom, storage, event
  emit/listen) that each would otherwise be a <40-line file.
- **`index.js`** absorbs the one-shot init-time concerns (styles injection,
  persistence, readonly) rather than giving each its own module.

If `machine.js` proves unwieldy during implementation, the collapse/expand block
(#12, ~80 LOC) is the clean split-off point into `collapse.js` (→ 9 files).
Otherwise prefer the 8-file layout.

`save_shortcut.js` and `tabbed_fieldsets.js` stay as standalone classic scripts
(already vanilla, no jQuery, independently loaded) unless converting them
simplifies loading — low priority, see open question 6.2.

Exact module boundaries may shift during implementation; the table above is the
working decomposition, not a contract.

### 4.3 Namespaces vs classes — recommendation

There is **one editor per page** (singleton), so nothing is instantiated more
than once. The original "classes only for multiple instances" heuristic would
therefore point at plain modules everywhere. **But the coarser grouping in §4.2
changes the balance:** each stateful subsystem now owns a cluster of shared,
long-lived references (`orderMachine`, `orderMachineWrapper`, the three machine
messages, `currentRegion`, `sectionsMap`/`childrenMap`, `_insertBefore`, the
plugin-buttons container, drag state). Holding that as a pile of module-level
`let`s reads worse than encapsulating it. So:

- **A single-instance class per stateful subsystem**, even though instantiated
  once — the class is the natural home for that subsystem's DOM refs + mutable
  state, and `index.js` wires the instances together explicitly:
  - `Sections` — `sectionsMap`/`childrenMap` + ResizeObserver.
  - `Machine` — order-machine DOM refs, ordering helpers, formset/collapse
    lifecycle.
  - `Regions` — region tabs, `currentRegion`, the message elements, plugin-
    button rights/visibility (incl. the §3 fix).
  - `DragDrop` — drag state + mouse-monitor teardown.
  - `Cloning` — dialog state (only built when `declaredRegions.length > 1`).
  Constructor dependency-injection (pass the context + needed sibling instances)
  keeps wiring visible in `index.js` and avoids hidden module-global coupling.
- **Plain function modules (namespaces) for the stateless parts:** `utils.js`
  (pure helpers) and the one-shot init helpers in `index.js`. No `this`, easiest
  to read/test.
- **`window.ContentEditor` stays a plain singleton object** (parsed context +
  `addPluginButton`/`addContent` public methods), **not** a class — it is a
  public data/API surface and integrators read its properties directly; a class
  instance would risk breaking them. The subsystem classes hang their behavior
  off this shared context object rather than replacing it.

Net: a handful of single-instance classes (`Machine`, `Regions`, `Sections`,
`DragDrop`, `Cloning`) plus stateless `utils` and the `context` singleton. This
is a deliberate, pragmatic departure from "classes only when N>1": with this
grouping the classes earn their keep through **state encapsulation**, which the
user has explicitly endorsed.

### 4.4 Centralized initialization (goal #2)

`index.js` runs one explicit sequence: parse the context, **construct the
subsystem instances** (injecting shared deps), wire them, then run the initial
state pass. Since `type="module"` is deferred it runs after DOM parse, so no
ready-callback wrapper is needed. Roughly:

1. `const ctx = initContext()` — parse JSON, build derived maps, assign
   `window.ContentEditor = ctx`.
2. Inject runtime `<style>` (the dynamic CSS using `gettext`/`declaredRegions`).
3. `const machine = new Machine(ctx)` — build scaffolding + plugin icons,
   `reorderInlines(pluginGroups)`, hide original inline groups.
4. `const sections = new Sections(ctx, machine)`; `machine.useSections(sections)`.
5. `const drag = new DragDrop(ctx, machine, sections)`.
6. `const regions = new Regions(ctx, machine)` — assign region data attrs
   (incl. unknown-region synthesis), build move-to-region dropdowns, build
   plugin buttons; add clone button via `new Cloning(...)` if
   `declaredRegions.length > 1`.
7. Wire global handlers once: insert-target clicks, body click/Escape,
   native `formset:added`/`formset:removed`, `content-editor:activate/deactivate`,
   form submit (persistence).
8. `regions.initTabs()`.
9. **Always** run the initial state pass — `regions.selectInitial()` — which
   guarantees the plugin-button/insert-target visibility pass runs exactly once
   even with **zero regions**. *This is where the §3 rights bug is fixed:* the
   pass no longer depends on a tab click that never happens.
10. Restore editor state from the URL hash (replaces `setTimeout(restore, 1)`).
11. Apply readonly handling.
12. Dispatch `content-editor:ready` (native).

No nested IIFEs, no `setTimeout`-for-ordering hacks, no event-gated init;
ordering and dependencies are explicit in the constructor wiring.

## 5. Testing strategy (goal #4)

- **Integration first.** Existing Playwright tests in
  `tests/testapp/test_playwright.py` are the safety net. They already cover:
  editor load, add content, tabbed fieldsets, save shortcut, sections visual
  grouping, and cloning (UI + backend). Run the full suite before/after each
  step (`tox -e py312-dj52`, Chromium handled by tox).
- **New integration test for the rights bug:** an admin instance whose
  `regions` is empty must render with insert targets non-interactive / plugin
  buttons hidden and the `noRegions` message shown, and adding must be
  impossible. Needs a test model/admin with empty regions in `tests/testapp`.
  (Open question 6.1.)
- **Optional unit tests** only for the pure `dom.js` / `ordering.js` helpers,
  justified by the extraction itself, not pursued for coverage. Would require a
  JS test runner — only add if cheap and non-intrusive; otherwise skip.

## 6. Open questions

1. **Empty-regions test fixture:** RESOLVED. `regions` can be declared either as
   a static class attribute or as a property/callable (existing `Article` /
   `Page` use static lists). For the bug repro either works:
   - **Static `regions = []`** — simplest. Note this trips
     `content_editor.E002` (the check is
     `if not getattr(admin_obj.model, "regions", False)`, and `[]` is falsy), so
     `manage.py check` reports an error. That does **not** block the admin
     change page from rendering at request time, which is all the Playwright
     repro needs — but it adds noise if the test setup runs system checks.
   - **`regions` as a property returning `[]`** — avoids tripping E002, because
     `getattr` on the *class* returns the (truthy) property descriptor while
     `instance.regions` is empty at runtime.

   Choose the static attribute unless the test harness enforces system checks,
   in which case use the property. Add the fixture model + a `ContentEditor`
   admin to `tests/testapp`.
2. **Convert `save_shortcut.js` / `tabbed_fieldsets.js` to modules too?**
   RESOLVED — leave them as-is (standalone, vanilla, no jQuery, independently
   loaded). They are out of scope for this rework.
3. **Module granularity:** RESOLVED — the §4.2 grouping into 8 subsystem files
   (regions+rights, machine, dragdrop, sections, cloning, context, utils, entry)
   settles this. `collapse.js` is the only optional further split, noted inline.
4. **ES modules + import map:** RESOLVED. `ManifestStaticFilesStorage` does not
   rewrite JS `import` specifiers, so relative imports break under hashed
   storage; bare specifiers + `js_asset.ImportMap` (mapping to `static()` URLs)
   is the fix. This is already in production use in **django-prose-editor**, so
   it is a proven pattern, not a risk. Extra per-module HTTP requests are
   acceptable for an admin tool (HTTP/2). See §4.1.

## 7. Dropping jQuery (goal #5)

`content_editor.js` is the only file using jQuery (`save_shortcut.js` and
`tabbed_fieldsets.js` are already vanilla). It obtains it via
`prepareContentEditorObject(django.jQuery)` and the
`django.jQuery(($) => …)` ready wrapper. `admin/js/jquery.init.js` is added to
`Media` explicitly.

**DECISION (resolved):** minimum Django is now **≥ 4.2** (`pyproject.toml`,
`tox.ini`, django-upgrade target, and CHANGELOG updated). This unblocks
**complete jQuery removal**: formset events are native, the custom events go
native (§7.2), and `admin/js/jquery.init.js` is dropped from `Media`.

### 7.1 Support matrix reality

- `pyproject.toml` declares `django>=3.2`, **but the tox `envlist` only tests
  dj42/dj52/dj60/main — i.e. Django ≥ 4.2.**
- Django **4.1** switched `formset:added` / `formset:removed` to native
  `dispatchEvent(new CustomEvent(...))` (verified in the installed 4.2/5.2/6.0
  `inlines.js`: dispatch with `event.detail.formsetName`). Django **3.2 / 4.0**
  trigger them via jQuery `$(document).trigger(...)`, which a native
  `addEventListener` will **not** catch.
- Consequence: jQuery is *only* strictly required to receive formset events on
  Django < 4.1. The current dual-path code
  (`if (event.detail?.formsetName) … else …`) is exactly this legacy shim.

With the floor now at **≥ 4.2**, formset events are consumed natively with
`document.addEventListener("formset:added", e => e.detail.formsetName)` and
jQuery is no longer needed for them.

### 7.2 The other jQuery boundary: the custom-event contract

`content-editor:ready`, `content-editor:activate`, `content-editor:deactivate`
are currently `$(document).trigger("…", [$row])`. Integrators listening via
`$(document).on("content-editor:activate", (event, row) => …)` rely on the
**jQuery argument shape** (`row` as the 2nd handler arg, and `row` being a
*jQuery object*).

- A native `document.dispatchEvent(new CustomEvent(...))` *would* be caught by
  jQuery `.on` (jQuery binds via native `addEventListener`), **but** the row
  would arrive as `event.detail` (or `event.originalEvent.detail`), not as the
  2nd argument — and as a DOM element, not a jQuery object. That is a
  **breaking change** for existing jQuery-based integrators.
- This mirrors Django's own 4.1 formset-event migration.

**DECISION (resolved):** go **native** — `document.dispatchEvent(new
CustomEvent("content-editor:activate", { detail: { row } }))` where `row` is a
**DOM element** (no longer a jQuery object). Same for `:deactivate`. This is
required for full jQuery removal and intentionally mirrors Django's own 4.1
formset-event migration. It is a breaking change for integrators who used
`$(document).on("content-editor:activate", (event, $row) => …)`: the row now
arrives as `event.detail.row`, a DOM element. Must be called out in the
changelog, and the maintainer's dependent projects (feincms3, django-prose-editor
integration notes) checked.

**Integrator migration guidance.** Document this at the place the events are
already described — the "also emits two signals" passage in
`docs/quickstart.rst` (no new section) — plus a CHANGELOG note. Because
jQuery handles native JS events but the reverse is not true (per Django's
[admin JS docs](https://docs.djangoproject.com/en/6.0/ref/contrib/admin/javascript/#supporting-versions-of-django-older-than-4-1)),
a third-party widget that must support **both old and new content-editor
releases** should register with jQuery and branch on `event.detail`:

```js
function handleActivate(row) {
  // `row` is a DOM element
}

// Works whether content-editor fires a native CustomEvent (new) or a
// jQuery-triggered event (old). jQuery .on() catches both.
django.jQuery(document).on("content-editor:activate", (event, $row) => {
  if (event.detail && event.detail.row) {
    // New content-editor: native event, element in event.detail.row
    handleActivate(event.detail.row)
  } else {
    // Old content-editor: jQuery event, $row is the 2nd argument
    handleActivate($row.get(0))
  }
})
```

Integrators targeting only the new release can simply use
`document.addEventListener("content-editor:activate", e => handleActivate(e.detail.row))`.
Document the same dual pattern for `content-editor:deactivate`.
`content-editor:ready` carries no payload, so it is unaffected beyond the
native/jQuery firing mechanism (which jQuery `.on` handles transparently).

### 7.3 jQuery usage inventory & vanilla equivalents

Everything below other than formset-event *listening* (§7.1) and custom-event
*dispatch* (§7.2) is mechanically replaceable. Most replacements already have
precedent in the file (`qs`, `qsa`, `crel`).

| jQuery pattern (current) | Vanilla replacement |
| --- | --- |
| `$(".inline-group:first")` | `qs(".inline-group")` (`:first` is jQuery-only) |
| `$anchor.before(html)` | `anchor.insertAdjacentHTML("beforebegin", html)` |
| `$("#x-group .add-row a").click()` | `qs("#x-group .add-row a").click()` |
| `$(sel)` wrappers (`orderMachine`, `orderMachineWrapper`, …) | hold the DOM node from `qs(sel)` |
| `.find(sel)` | `el.querySelectorAll(sel)` / scoped `qsa` |
| `.not(".empty-form")` | `.filter(n => !n.matches(".empty-form"))` |
| `.each(fn)` | `for (const el of …)` |
| `.addClass/.removeClass/.toggleClass` | `el.classList.add/remove/toggle` |
| `.attr("data-region", v)` / `.data("region")` | `el.dataset.region` / `getAttribute` |
| `.val()` | `el.value` |
| `.text(s)` | `el.textContent = s` |
| `.css("order", n)` | `el.style.order = n` |
| `.hide()/.show()` | toggle a class (unify with existing `.hidden`/`content-editor-hide`) |
| `$('<p class="…"/>').text(t)` | `crel("p", { className: "…", textContent: t })` |
| `.after(node)` | `el.insertAdjacentElement("afterend", node)` |
| `.detach()` + `.append()` (move nodes) | `parent.append(node)` (append moves) |
| `.appendTo(x)` | `x.append(node)` |
| `.first().focus()` | `qs(sel, ctx).focus()` |
| `.eq(0).click()` | `nodes[0]?.click()` |
| `.filter('[data-region="x"]')` | `nodes.filter(n => n.matches('[data-region="x"]'))` |
| `$.inArray(v, arr) >= 0` | `arr.includes(v)` |
| `$(this).toArray()` (in cloning) | already an array if `findInlinesInOrder` returns one |
| `$(document).on("click", sel, fn)` (delegation) | `document.addEventListener("click", e => { const t = e.target.closest(sel); if (t) … })` |
| `$("form").submit(fn)` | `qs("form").addEventListener("submit", fn)` |
| `django.jQuery(($) => …)` ready wrapper | module is deferred (runs after parse); run directly or `DOMContentLoaded` |
| `orderMachine.on("click", ".x", fn)` | scoped delegated `addEventListener` on the node |

`findInlinesInOrder` should return a plain sorted `Array` of elements (it is
already consumed with `.sort`, `.toArray`, `.filter`, iteration). A small
delegation helper (`on(root, type, selector, handler)`) can absorb the repeated
`closest`-based pattern.

### 7.4 Outcome

Both gating decisions are resolved (min Django ≥ 4.2; native custom events), so
the target is **complete jQuery removal**:

- `admin/js/jquery.init.js` dropped from `ContentEditor._content_editor_media`.
- Formset events consumed via
  `document.addEventListener("formset:added"|"formset:removed", e => e.detail.…)`;
  the legacy `else` branch handling pre-4.1 jQuery-triggered args is deleted.
- Public custom events dispatched/observed natively via the `events.js` helper.
- All other ~40 jQuery call sites converted per the §7.3 table.
- Verify nothing else on the admin page relied on us pulling in jQuery (we only
  ever used `django.jQuery`, which Django still ships for its own admin JS, so
  dropping it from *our* Media does not remove it globally).

## 8. Migration plan (incremental, test-gated)

Each step keeps the suite green and ships behavior-identical code unless noted.

0. **DONE — drop Django < 4.2.** Bumped `pyproject.toml` (`django>=4.2`),
   removed the `dj32` tox dep, set django-upgrade `--target-version 4.2`, added
   a CHANGELOG entry. Run the suite to confirm green baseline.
1. **Set up the ESM + import-map loading path** end-to-end with a trivial
   module first (e.g. extract `dom.js` and import it from `index.js`): add the
   `ImportMap` to `_content_editor_media`, load `index.js` as `type="module"`,
   confirm it works both with the default static storage **and** with
   `ManifestStaticFilesStorage` (a test settings override exercising hashed
   names). This de-risks the whole approach before moving real logic.
2. Extract pure utilities + context: `dom.js`, `storage.js`, `context.js`.
3. Carve out leaf concerns with little shared state: `styles.js`, `layout.js`,
   `ordering.js`, `cloning.js`, `persistence.js`, `events.js`.
4. Carve out stateful concerns: `sections.js` (class), `dragdrop.js`,
   `collapse.js`, `lifecycle.js`, `regions.js`, `plugin-buttons.js`. Convert
   jQuery → vanilla per §7.3 as each concern moves.
5. **Remove jQuery completely:** native formset-event listeners, native custom
   events, drop `admin/js/jquery.init.js` from `Media`, delete the pre-4.1
   formset fallback branch.
6. Introduce `index.js` central init; delete the scattered bootstrap.
7. **Fix the rights bug** as part of (6): always run the initial visibility
   pass; block `addContent` without a valid region. Add the new integration
   test (empty-regions fixture per §6.1).
8. Final cleanup: dead code, naming, biome pass; extend the existing
   "also emits two signals" passage in `docs/quickstart.rst` with the
   switching strategy, and add the CHANGELOG note for the native custom-event
   payload change (§7.2).
