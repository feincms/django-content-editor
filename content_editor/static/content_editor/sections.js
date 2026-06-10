import { debounce } from "content-editor/utils"

/*
 * SECTIONS
 *
 * Plugins may open (``sections > 0``) and close (``sections < 0``) nested
 * sections. This class draws the visual grouping rectangles behind the inlines
 * and tracks, for every section-opening inline, the inlines contained within it
 * (``childrenMap``) so they can be hidden or selected together. Single instance,
 * owned by ``index.js`` and queried by ``machine``/``dragdrop``.
 */
export class Sections {
  constructor(ContentEditor, machine) {
    this.ContentEditor = ContentEditor
    this.machine = machine
    this.sectionsMap = new Map()
    this.childrenMap = new Map()

    if (ContentEditor.hasSections) {
      const debounced = debounce(() => this.update(), 10)
      const resizeObserver = new ResizeObserver(() => debounced())
      resizeObserver.observe(machine.wrapper)
    }
  }

  update() {
    /* Bail out early if we wouldn't do anything anyway */
    if (!this.ContentEditor.hasSections) return

    const inlines = this.machine.findInlinesInOrder()

    let indent = 0
    let nextIndent
    const stack = []
    const wrapper = this.machine.wrapper
    const wrapperRect = wrapper.getBoundingClientRect()

    const newSectionsMap = new Map()
    const newChildrenMap = new Map()
    const topLevel = []

    const closeSection = (atInline) => {
      const fromInline = stack.pop()
      const from = fromInline.getBoundingClientRect()
      const until = atInline.getBoundingClientRect()

      let div = this.sectionsMap.get(fromInline)
      if (div) {
        this.sectionsMap.delete(fromInline)
      } else {
        div = document.createElement("div")
        div.classList.add("order-machine-section")
        wrapper.prepend(div)
      }

      newSectionsMap.set(fromInline, div)
      div.style.top = `${from.top - wrapperRect.top - 5}px`
      div.style.left = `${from.left - wrapperRect.left - 5}px`
      div.style.right = "5px"
      div.style.height = `${until.top - from.top + until.height + 10}px`

      div.classList.toggle(
        "content-editor-hide",
        fromInline.classList.contains("collapsed"),
      )
    }

    for (const inline of inlines) {
      const prefix = inline.id.replace(/-[0-9]+$/, "")
      inline.style.marginInlineStart = `${30 * indent}px`
      nextIndent = Math.max(
        0,
        indent + this.ContentEditor.pluginsByPrefix[prefix].sections,
      )

      if (stack.length) {
        newChildrenMap.get(stack[stack.length - 1]).push(inline)
      } else {
        topLevel.push(inline)
      }

      while (indent < nextIndent) {
        stack.push(inline)
        ++indent
        newChildrenMap.set(inline, [])
      }

      while (indent > nextIndent) {
        closeSection(inline)
        --indent
      }

      indent = nextIndent
    }

    if (stack.length) {
      // Cannot just use the last inline, it may be hidden. Find the last
      // inline and use it for finding the place where all open sections
      // should be closed visually.
      let lastVisibleIndex = inlines.length - 1
      while (
        inlines[lastVisibleIndex].classList.contains("content-editor-hide")
      ) {
        --lastVisibleIndex
      }
      while (stack.length) {
        closeSection(inlines[lastVisibleIndex])
      }
    }

    for (const section of this.sectionsMap.values()) {
      section.remove()
    }

    this.sectionsMap = newSectionsMap
    this.childrenMap = newChildrenMap

    /* Top level inline's sections should be hidden if the inline is collapsed */
    for (const inline of topLevel) {
      this.hideSection(inline, inline.classList.contains("collapsed"))
    }
  }

  hideSection(inline, hide = true) {
    const children = this.childrenMap.get(inline)
    if (children) {
      for (const child of children) {
        child.classList.toggle("content-editor-hide", hide)
        if (hide || !child.classList.contains("collapsed")) {
          /* Hiding is recursive, showing uncollapsed child sections too */
          this.hideSection(child, hide)
        }
      }
    }
  }

  selectSection(inline) {
    const children = this.childrenMap.get(inline)
    if (children) {
      for (const child of children) {
        child.classList.add("selected")
        this.selectSection(child)
      }
    }
  }
}
