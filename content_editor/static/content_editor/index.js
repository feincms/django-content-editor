import { Cloning } from "content-editor/cloning"
import { initContext } from "content-editor/context"
import { DragDrop } from "content-editor/dragdrop"
import { Machine } from "content-editor/machine"
import { Regions } from "content-editor/regions"
import { Sections } from "content-editor/sections"
import { emit, qs, qsa } from "content-editor/utils"

/*
 * CONTENT EDITOR ENTRY POINT
 *
 * Loaded as ``type=module``. All initialization happens here in one explicit,
 * ordered sequence: parse the context, construct and wire the subsystem
 * instances, move the plugin inlines into the order machine, build the UI, then
 * run the initial state pass and restore persisted state.
 *
 * Ordering matters: Django's ``inlines.js`` initializes the formsets (and
 * creates the "Add another" link inside each inline group) on the jQuery ready
 * queue, and we must run *after* it because we move the inlines out of their
 * groups. This is the one place we still touch jQuery — purely as the
 * DOM-ready hook, not for any DOM work. Because our module executes after
 * ``inlines.js`` (and Django always loads jQuery for the admin), our
 * ``django.jQuery(init)`` ready callback is registered after Django's and
 * therefore runs after the inline formsets are set up. A native
 * ``DOMContentLoaded`` listener or ``setTimeout`` does not reliably order after
 * jQuery's (deferred) ready queue.
 */

function injectStyles(ContentEditor) {
  const style = document.createElement("style")
  style.textContent = `
.order-machine .inline-related .inline_label::after {
  content: "(${window.gettext("Hide")})";
  opacity: 0.7;
  margin-left: 0.5ch;
  cursor: pointer;
}
.order-machine .inline-related .inline_label:hover::after {
  text-decoration: underline;
}
.order-machine .inline-related.collapsed .inline_label::after {
  content: "(${window.gettext("Show")})";
  color: var(--link-fg, #447e9b);
  opacity: 1;
}
.order-machine .inline-related.for-deletion .inline_label::after {
  opacity: 0.5;
  content: " (${ContentEditor.messages.forDeletion})";
}
.order-machine .inline-related:not(:where(${ContentEditor.declaredRegions
    .map((region) => `[data-region="${region.key}"]`)
    .join(", ")})) .inline_move_to_region {
  border-color: red;
}
  `
  document.head.append(style)
}

function saveEditorState(ContentEditor) {
  const u = new URLSearchParams()
  u.append("region", ContentEditor.currentRegion)
  u.append("scrollY", Math.floor(window.scrollY))
  u.append(
    "collapsed",
    qsa(
      ".order-machine .inline-related.collapsed:not(.empty-form) .order-machine-ordering",
    )
      .map((input) => input.value)
      .join(","),
  )
  return u.toString()
}

function restoreEditorState(regions, machine) {
  const u = new URLSearchParams(location.hash.replace(/^#/, ""))
  if (u.size) {
    const region = u.get("region")
    const scrollY = u.get("scrollY") || 0
    const collapsed = (u.get("collapsed") || "").split(",")

    for (const inline of qsa(
      ".order-machine .inline-related:not(.empty-form)",
    )) {
      const wasCollapsed = collapsed.includes(
        qs(".order-machine-ordering", inline).value,
      )
      /* XXX handle sections */
      inline.classList.toggle(
        "collapsed",
        wasCollapsed && !inline.querySelector(".errorlist"),
      )
    }

    regions.selectInitial(region)
    machine.initializeCollapseAll()

    if (scrollY) {
      setTimeout(() => {
        window.scrollTo(0, scrollY)
      }, 200)
    }
  } else {
    regions.selectInitial(undefined)
    machine.initializeCollapseAll()
  }
}

function init() {
  const ContentEditor = initContext()

  injectStyles(ContentEditor)

  const machine = new Machine(ContentEditor)
  const sections = new Sections(ContentEditor, machine)
  const dragdrop = new DragDrop(ContentEditor, machine, sections)
  const regions = new Regions(ContentEditor, machine)
  machine.wire({ sections, regions, dragdrop })

  // Public API: expose addPluginButton on the shared ContentEditor object.
  ContentEditor.addPluginButton = (prefix, iconHTML, initializing) =>
    regions.addPluginButton(prefix, iconHTML, initializing)

  machine.addPluginIcons()

  // Pull the plugin inlines out of their Django inline groups into the order
  // machine, then hide the (now empty) groups.
  const pluginInlineGroups = ContentEditor.plugins
    .map((plugin) => document.getElementById(`${plugin.prefix}-group`))
    .filter(Boolean)
  machine.reorderInlines(pluginInlineGroups)
  for (const group of pluginInlineGroups) {
    group.style.display = "none"
  }

  regions.assignToInlines()

  for (const plugin of ContentEditor.plugins) {
    ContentEditor.addPluginButton(plugin.prefix, plugin.button, true)
  }

  if (ContentEditor.declaredRegions.length > 1) {
    new Cloning(ContentEditor, machine, regions).addButton()
  }

  regions.initTabs()

  for (const form of qsa("form")) {
    form.addEventListener("submit", () => {
      // Use the hash because it's still there after the save-and-continue redirect
      form.action = `${form.action.split("#")[0]}#${saveEditorState(ContentEditor)}`
    })
  }

  restoreEditorState(regions, machine)

  if (!ContentEditor.allowChange) {
    qs(".order-machine-wrapper").classList.add("order-machine-readonly")
  }

  emit("content-editor:ready")
}

// Run after Django's admin inline setup; see the module comment above.
django.jQuery(init)
