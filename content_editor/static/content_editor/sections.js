import { crel, debounce, qs } from "content-editor/utils"

/*
 * SECTIONS
 *
 * Plugins may open (``sections > 0``) and close (``sections < 0``) nested
 * sections. This class draws the visual grouping rectangles behind the inlines
 * and tracks, for every section-opening inline, the inlines contained within it
 * (``childrenMap``, including the closing inline) and its closing inline
 * (``closerMap``) so they can be hidden, moved or deleted together. Sections
 * which are still open at the end of the region are drawn open-ended. Single
 * instance, owned by ``index.js`` and queried by ``machine``/``dragdrop``.
 */
export class Sections {
  constructor(ContentEditor, machine) {
    this.ContentEditor = ContentEditor
    this.machine = machine
    this.sectionsMap = new Map()
    this.childrenMap = new Map()
    this.closerMap = new Map()
    this.deletionGroups = new Map()

    if (ContentEditor.hasSections) {
      const debounced = debounce(() => this.update(), 10)
      const resizeObserver = new ResizeObserver(() => debounced())
      resizeObserver.observe(machine.wrapper)
    }
  }

  sectionsOf(inline) {
    const prefix = inline.id.replace(/-[0-9]+$/, "")
    return this.ContentEditor.pluginsByPrefix[prefix]?.sections || 0
  }

  // The plugin which is used to close sections automatically. Only available
  // if there's exactly one plugin closing a single section and it may be added
  // to the current region.
  closerPlugin() {
    const closers = this.ContentEditor.plugins.filter(
      (plugin) => plugin.sections < 0,
    )
    return closers.length === 1 &&
      closers[0].sections === -1 &&
      this.machine.regions.pluginInCurrentRegion(closers[0].prefix)
      ? closers[0]
      : null
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
    const newCloserMap = new Map()
    const topLevel = []

    const closeSection = (atInline, open = false) => {
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
      if (!open) newCloserMap.set(fromInline, atInline)
      div.style.top = `${from.top - wrapperRect.top - 5}px`
      div.style.left = `${from.left - wrapperRect.left - 5}px`
      div.style.right = "5px"
      div.style.height = `${until.top - from.top + until.height + (open ? 30 : 10)}px`

      div.classList.toggle("order-machine-section--open", open)
      div.classList.toggle(
        "content-editor-hide",
        fromInline.classList.contains("collapsed"),
      )
    }

    for (const inline of inlines) {
      inline.style.marginInlineStart = `${30 * indent}px`
      nextIndent = Math.max(0, indent + this.sectionsOf(inline))

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
        closeSection(inlines[lastVisibleIndex], true)
      }
    }

    for (const section of this.sectionsMap.values()) {
      section.remove()
    }

    this.sectionsMap = newSectionsMap
    this.childrenMap = newChildrenMap
    this.closerMap = newCloserMap

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

  // All inlines contained in the section opened by ``inline``, in order and
  // including the closing inlines.
  descendants(inline) {
    return (this.childrenMap.get(inline) || []).flatMap((child) => [
      child,
      ...this.descendants(child),
    ])
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

  /*
   * DELETION
   *
   * Marking a section opener for deletion asks whether the contents of the
   * section should be marked too or only the opener and its closer. New
   * inlines are removed right away as usual, saved inlines only when saving.
   */
  handleDelete(inline, deleting) {
    if (!deleting) {
      for (const el of this.deletionGroups.get(inline) || []) {
        this.markForDeletion(el, false)
      }
      this.deletionGroups.delete(inline)
      return true
    }

    const closer = this.closerMap.get(inline)
    const contents = this.descendants(inline).filter((el) => el !== closer)
    if (!contents.length) {
      if (closer) this.deleteGroup(inline, [closer])
      return true
    }

    this.askDeleteSection().then((answer) => {
      if (answer === "all") {
        this.deleteGroup(inline, [...contents, ...(closer ? [closer] : [])])
      } else if (answer === "unwrap") {
        this.deleteGroup(inline, closer ? [closer] : [])
      } else {
        return
      }
      this.markForDeletion(inline, true)
    })
    return false
  }

  deleteGroup(inline, others) {
    this.deletionGroups.set(inline, others.filter(isSaved))
    for (const el of others) this.markForDeletion(el, true)
  }

  // Saved inlines are marked for deletion using their checkbox, new inlines
  // are removed immediately.
  markForDeletion(inline, deleting) {
    const checkbox = qs(".delete > input[type=checkbox]", inline)
    if (checkbox) {
      checkbox.checked = deleting
      inline.classList.toggle("for-deletion", deleting)
    } else if (deleting) {
      const link = qs(".inline-deletelink", inline)
      if (link) {
        this._removing = true
        try {
          link.click()
        } finally {
          this._removing = false
        }
      }
    }
  }

  askDeleteSection() {
    const messages = this.ContentEditor.messages
    return new Promise((resolve) => {
      let answer = null
      const button = (textContent, value, className = "button") => {
        const el = crel("button", { type: "button", className, textContent })
        el.addEventListener("click", () => {
          answer = value
          dialog.close()
        })
        return el
      }

      const dialog = crel("dialog", { className: "section-delete" }, [
        crel("p", { textContent: messages.deleteSection }),
        crel("div", { className: "submit-row" }, [
          button(messages.deleteSectionUnwrap, "unwrap", "button delete"),
          button(messages.deleteSectionAll, "all", "button delete"),
          button(window.gettext("Cancel"), null),
        ]),
      ])
      dialog.addEventListener("close", () => {
        dialog.remove()
        resolve(answer)
      })
      document.body.append(dialog)
      dialog.showModal()
    })
  }
}

function isSaved(inline) {
  return Boolean(qs(".delete > input[type=checkbox]", inline))
}
