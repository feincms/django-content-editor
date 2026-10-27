/* global gettext */

/*
 * GENERIC DOM UTILITIES
 */
export function qs(sel, ctx = document) {
  return ctx.querySelector(sel)
}

export function qsa(sel, ctx = document) {
  return Array.from(ctx.querySelectorAll(sel))
}

export function crel(tagName, attributes = null, children = []) {
  const dom = document.createElement(tagName)
  dom.append(...children)
  if (attributes) {
    for (const [name, value] of Object.entries(attributes)) {
      if (/^data-|^aria-|^role/.test(name)) dom.setAttribute(name, value)
      else dom[name] = value
    }
  }
  return dom
}

export function buildDropdown(contents, title) {
  const select = document.createElement("select")
  let idx = 0

  if (title) {
    select.options[idx++] = new Option(title, "", true)
  }

  for (const content of contents) {
    // Option _values_ may either be the prefix (for plugins) or keys (for
    // regions)
    select.options[idx++] = new Option(
      content.title,
      content.prefix || content.key,
    )
  }
  return select
}

/* From https://www.freecodecamp.org/news/javascript-debounce-example/ */
export function debounce(func, timeout = 300) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      func.apply(this, args)
    }, timeout)
  }
}

/*
 * EVENTS
 *
 * The content editor emits ``content-editor:ready``,
 * ``content-editor:activate`` and ``content-editor:deactivate`` as native
 * custom events. ``activate``/``deactivate`` carry the affected inline (a DOM
 * element) in ``event.detail.inline`` and its plugin ``prefix``.
 */
export function emit(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }))
}

// Attach a delegated event listener: ``handler(event, target)`` runs when the
// event originates inside an element matching ``selector`` within ``root``.
export function delegate(root, type, selector, handler) {
  root.addEventListener(type, (e) => {
    const target = e.target.closest(selector)
    if (target && root.contains(target)) handler(e, target)
  })
}

/*
 * STORAGE
 */
// Accessing the storage may throw, e.g. when the browser blocks it, so it is
// only accessed lazily and errors are ignored.
const safeStorage = (getStorage, prefix = "ContentEditor:") => {
  return {
    set(name, value) {
      try {
        getStorage().setItem(prefix + name, JSON.stringify(value))
      } catch {
        /* Storage unavailable */
      }
    },
    get(name) {
      try {
        return JSON.parse(getStorage().getItem(prefix + name))
      } catch {
        return null
      }
    },
  }
}

export const LS = safeStorage(() => window.localStorage)

/*
 * REGION HELPERS
 */

// A region into which content may be added: it must be a declared region,
// existing in ``regionsByKey``, and not a synthesized ``_unknown_*`` region.
export function isRealRegion(ContentEditor, key) {
  return (
    Boolean(key) &&
    !/^_unknown_/.test(key) &&
    Boolean(ContentEditor.regionsByKey[key])
  )
}
