import { crel, debounce, delegate, qs, qsa } from "content-editor/utils"

/*
 * CONTAINERS
 *
 * Plugins are nested in containers in one of two ways:
 *
 * - Container plugins (``container``) store the nesting explicitly using the
 *   hidden ``depth`` field of every plugin (``usesDepth``). A container's
 *   children are the following inlines with a greater depth.
 * - Deprecated: plugins open (``sections > 0``) and close (``sections < 0``)
 *   sections, and the nesting is derived by counting. The opening plugins act
 *   as containers.
 *
 * This class draws the outlines of the containers behind the inlines and
 * tracks, for every container, the inlines contained within it
 * (``childrenMap``, including the closing inline) and its closing inline
 * (``closerMap``) so they can be hidden, moved or deleted together. Sections
 * which are still open at the end of the region are drawn open-ended. Single
 * instance, owned by ``index.js`` and queried by ``machine``/``dragdrop``.
 */
// Indentation per level in pixels
export const INDENT = 30
// Space below the last child of a container, and additionally per enclosing
// container ending at the same child, in pixels
const END_PADDING = 20
const NESTED_END_PADDING = 10

export class Containers {
  constructor(ContentEditor, machine) {
    this.ContentEditor = ContentEditor
    this.machine = machine
    this.outlineMap = new Map()
    this.childrenMap = new Map()
    this.closerMap = new Map()
    this.depthMap = new Map()
    this.deletionGroups = new Map()
    this.unwrapped = new Map()

    if (ContentEditor.hasContainers) {
      const debounced = debounce(() => this.update(), 10)
      const resizeObserver = new ResizeObserver(() => debounced())
      resizeObserver.observe(machine.wrapper)
      this.bindDeleteHandlers()
    }
    if (ContentEditor.usesDepth && ContentEditor.allowChange) {
      this.bindDepthHandlers()
    }
  }

  sectionsOf(inline) {
    return this.machine.regions.getPluginTypeFromId(inline.id)?.sections || 0
  }

  isContainer(inline) {
    return Boolean(
      this.machine.regions.getPluginTypeFromId(inline.id)?.container,
    )
  }

  // The stored depth, also for inlines in other regions than the current one
  depthOf(inline) {
    const value =
      qs(".order-machine-depth", inline)?.value ??
      qs(".field-depth .readonly", inline)?.textContent
    return Math.max(0, Number.parseInt(value, 10) || 0)
  }

  setDepth(inline, depth) {
    const input = qs(".order-machine-depth", inline)
    if (input) input.value = depth
  }

  // The depth after the given inlines, that is, the number of sections which
  // are still open at the end.
  depthAfter(inlines) {
    let indent = 0
    for (const inline of inlines) {
      indent = Math.max(0, indent + this.sectionsOf(inline))
    }
    return indent
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
    if (!this.ContentEditor.hasContainers) return
    if (this.ContentEditor.usesDepth) {
      this.updateFromDepth()
      return
    }

    const inlines = this.machine.findInlinesInOrder()

    let indent = 0
    let nextIndent
    const stack = []

    const newOutlineMap = new Map()
    const newChildrenMap = new Map()
    const newCloserMap = new Map()
    const newDepthMap = new Map()

    const closeSection = (atInline, open = false) => {
      const fromInline = stack.pop()
      this.drawOutline(fromInline, atInline, open, newOutlineMap)
      if (!open) newCloserMap.set(fromInline, atInline)
    }

    for (const inline of inlines) {
      /* Inlines are hidden if any container containing them is collapsed */
      inline.classList.toggle(
        "content-editor-hide",
        stack.some((el) => el.classList.contains("collapsed")),
      )
      inline.style.marginInlineStart = `${INDENT * indent}px`
      newDepthMap.set(inline, indent)
      nextIndent = Math.max(0, indent + this.sectionsOf(inline))

      if (stack.length) {
        newChildrenMap.get(stack[stack.length - 1]).push(inline)
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

    for (const outline of this.outlineMap.values()) {
      outline.remove()
    }

    this.outlineMap = newOutlineMap
    this.childrenMap = newChildrenMap
    this.closerMap = newCloserMap
    this.depthMap = newDepthMap
  }

  // Draw the outline of the container ``fromInline`` until ``untilInline``
  // with ``padding`` pixels below it, reusing the existing element if there is
  // one.
  drawOutline(
    fromInline,
    untilInline,
    open,
    newOutlineMap,
    padding = open ? 25 : 5,
  ) {
    const wrapperRect = this.machine.wrapper.getBoundingClientRect()
    const from = fromInline.getBoundingClientRect()
    const until = untilInline.getBoundingClientRect()

    let div = this.outlineMap.get(fromInline)
    if (div) {
      this.outlineMap.delete(fromInline)
    } else {
      div = document.createElement("div")
      div.classList.add("order-machine-container")
      this.machine.wrapper.prepend(div)
    }

    newOutlineMap.set(fromInline, div)
    div.style.top = `${from.top - wrapperRect.top - 5}px`
    div.style.left = `${from.left - wrapperRect.left - 5}px`
    div.style.right = "5px"
    div.style.height = `${until.top - from.top + until.height + 5 + padding}px`

    div.classList.toggle("order-machine-container--open", open)
    div.classList.toggle(
      "content-editor-hide",
      fromInline.classList.contains("collapsed") ||
        fromInline.classList.contains("content-editor-hide"),
    )
  }

  // The depth-based counterpart of ``update``. Also normalizes the depths: an
  // inline is at most one level deeper than the previous inline if that is a
  // container, and at most as deep as the previous inline otherwise.
  updateFromDepth() {
    const inlines = this.machine.findInlinesInOrder()

    const newOutlineMap = new Map()
    const newChildrenMap = new Map()
    const newDepthMap = new Map()

    // The containers containing the current inline, outermost first
    const stack = []
    // The maximum depth of the current inline
    let maximum = 0
    // The maximum depth for inserting new inlines (inlines inserted into
    // collapsed containers would be hidden) and the depth of the innermost
    // visible container ending at the current position
    const insertDepths = () => {
      const collapsed = stack.findIndex((el) =>
        el.classList.contains("collapsed"),
      )
      return collapsed < 0 ? [maximum, maximum - 1] : [collapsed, collapsed]
    }

    for (const inline of inlines) {
      const depth = Math.min(this.depthOf(inline), maximum)
      this.updateInsertTargets(inline, depth, ...insertDepths())
      this.setDepth(inline, depth)
      stack.length = depth

      inline.classList.toggle(
        "content-editor-hide",
        stack.some((el) => el.classList.contains("collapsed")),
      )
      inline.style.marginInlineStart = `${INDENT * depth}px`
      newDepthMap.set(inline, depth)
      if (depth) newChildrenMap.get(stack[depth - 1]).push(inline)

      this.updateDepthButtons(inline, depth > 0, depth < maximum)

      if (this.isContainer(inline)) {
        newChildrenMap.set(inline, [])
        stack.push(inline)
        maximum = depth + 1
      } else {
        maximum = depth
      }
    }

    this.childrenMap = newChildrenMap
    this.depthMap = newDepthMap

    // Containers ending at the same inline are drawn with increasing padding
    // at the bottom, innermost first.
    const ends = new Map()
    for (const container of [...newChildrenMap.keys()].reverse()) {
      const last =
        [container, ...this.descendants(container)].findLast(
          (el) => !el.classList.contains("content-editor-hide"),
        ) || container
      const count = ends.get(last) || 0
      this.drawOutline(
        container,
        last,
        false,
        newOutlineMap,
        END_PADDING + NESTED_END_PADDING * count,
      )
      ends.set(last, count + 1)
    }

    // Make room for the padding below the following inline or at the end of
    // the region.
    let space = 0
    for (const inline of inlines) {
      if (inline.classList.contains("content-editor-hide")) continue
      inline.style.setProperty("--container-end-space", `${space}px`)
      const count = ends.get(inline)
      space = count ? END_PADDING + NESTED_END_PADDING * (count - 1) : 0
    }
    this.machine.orderMachine.style.setProperty(
      "--region-end-space",
      `${space}px`,
    )

    for (const outline of this.outlineMap.values()) {
      outline.remove()
    }
    this.outlineMap = newOutlineMap

    this.updateEndInsertTargets(...insertDepths())
  }

  // Additional insert targets above ``inline`` for adding inlines to the end
  // of the containers ending there, one per depth.
  updateInsertTargets(inline, depth, maximum, innermost) {
    const targets = qsa(":scope > .order-machine-insert-target.nested", inline)
    for (let nested = depth + 1; nested <= maximum; ++nested) {
      let target = targets[nested - depth - 1]
      if (!target) {
        target = crel("span", {
          className: "order-machine-insert-target nested",
        })
        inline.append(target)
      }
      target.dataset.depth = nested
      target.style.marginInlineStart = `${INDENT * (nested - depth)}px`
      this.staggerInsertTarget(target, nested, innermost)
    }
    for (const target of targets.slice(Math.max(0, maximum - depth))) {
      target.remove()
    }
  }

  // The insert targets at the end of the region, one per depth which is
  // available there.
  updateEndInsertTargets(maximum, innermost) {
    const orderMachine = this.machine.orderMachine
    const targets = qsa(
      ":scope > .order-machine-insert-target.last",
      orderMachine,
    )
    for (let depth = 0; depth <= maximum; ++depth) {
      let target = targets[depth]
      if (!target) {
        target = crel("span", {
          className: "order-machine-insert-target last",
        })
        orderMachine.append(target)
      }
      target.dataset.depth = depth
      target.style.marginInlineStart = `${INDENT * depth}px`
      target.classList.toggle("nested", depth > 0)
      this.staggerInsertTarget(target, depth, innermost)
    }
    for (const target of targets.slice(maximum + 1)) target.remove()
  }

  // Move insert targets adding inlines to the end of a container to the
  // bottom of its outline: outer containers end further down.
  staggerInsertTarget(target, depth, innermost) {
    target.style.setProperty(
      "--insert-target-offset",
      `${NESTED_END_PADDING * (innermost - depth + 1)}px`,
    )
  }

  hideChildren(inline, hide = true) {
    const children = this.childrenMap.get(inline)
    if (children) {
      for (const child of children) {
        child.classList.toggle("content-editor-hide", hide)
        if (hide || !child.classList.contains("collapsed")) {
          /* Hiding is recursive, showing uncollapsed child containers too */
          this.hideChildren(child, hide)
        }
      }
    }
  }

  // The containers containing ``inline``, outermost first. Works for
  // inlines in all regions, not only the current one.
  ancestorsOf(inline) {
    if (this.ContentEditor.usesDepth) {
      const stack = []
      for (const el of this.machine.findInlinesInOrder(inline.dataset.region)) {
        const depth = this.depthOf(el)
        stack.length = Math.min(stack.length, depth)
        if (el === inline) break
        if (this.isContainer(el)) stack[depth] = el
      }
      return stack.filter(Boolean)
    }

    const stack = []
    for (const el of this.machine.findInlinesInOrder(inline.dataset.region)) {
      if (el === inline) break
      const sections = this.sectionsOf(el)
      if (sections > 0) {
        stack.push(...Array(sections).fill(el))
      } else {
        stack.length = Math.max(0, stack.length + sections)
      }
    }
    return [...new Set(stack)]
  }

  // Uncollapse inlines with errors and all containers containing them
  showErrors() {
    for (const errorlist of qsa(
      ".order-machine .inline-related:not(.empty-form) .errorlist",
    )) {
      const inline = errorlist.closest(".inline-related")
      for (const el of [inline, ...this.ancestorsOf(inline)]) {
        el.classList.remove("collapsed")
      }
    }
    this.update()
  }

  // All inlines contained in the container ``inline``, in order and
  // including the closing inlines.
  descendants(inline) {
    return (this.childrenMap.get(inline) || []).flatMap((child) => [
      child,
      ...this.descendants(child),
    ])
  }

  /*
   * DELETION
   *
   * Marking a container for deletion asks whether its contents should be
   * marked too or only the container (and its closer, if any). New
   * inlines are removed right away as usual, saved inlines only when saving.
   */
  bindDeleteHandlers() {
    const orderMachine = this.machine.orderMachine

    // Runs after the machine's own handler which toggles ``.for-deletion``.
    delegate(
      orderMachine,
      "click",
      ".delete>input[type=checkbox]",
      (_e, target) => {
        const inline = target.closest(".inline-related")
        if (!this.handleDelete(inline, target.checked)) {
          this.markForDeletion(inline, false)
        }
      },
    )

    // New inlines are removed right away. Runs in the capturing phase so that
    // it runs before Django's own handler.
    orderMachine.addEventListener(
      "click",
      (e) => {
        const link = e.target.closest(".inline-deletelink")
        if (!link || this.removing) return
        if (!this.handleDelete(link.closest(".inline-related"), true)) {
          e.preventDefault()
          e.stopPropagation()
        }
      },
      true,
    )
  }

  handleDelete(inline, deleting) {
    if (!deleting) {
      for (const el of this.deletionGroups.get(inline) || []) {
        this.markForDeletion(el, false)
      }
      this.deletionGroups.delete(inline)
      for (const [el, depth] of this.unwrapped.get(inline) || []) {
        this.setDepth(el, depth)
      }
      this.unwrapped.delete(inline)
      this.update()
      return true
    }

    const closer = this.closerMap.get(inline)
    const contents = this.descendants(inline).filter((el) => el !== closer)
    if (!contents.length) {
      if (closer) this.deleteGroup(inline, [closer])
      return true
    }

    this.askDeleteContainer().then((answer) => {
      if (answer === "all") {
        this.deleteGroup(inline, [...contents, ...(closer ? [closer] : [])])
      } else if (answer === "unwrap") {
        this.deleteGroup(inline, closer ? [closer] : [])
        if (this.ContentEditor.usesDepth) this.unwrap(inline, contents)
      } else {
        return
      }
      this.markForDeletion(inline, true)
    })
    return false
  }

  // Move the contents of a container one level up
  unwrap(inline, contents) {
    if (isSaved(inline)) {
      this.unwrapped.set(
        inline,
        contents.map((el) => [el, this.depthOf(el)]),
      )
    }
    for (const el of contents) this.setDepth(el, this.depthOf(el) - 1)
    this.update()
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
        this.removing = true
        try {
          link.click()
        } finally {
          this.removing = false
        }
      }
    }
  }

  /*
   * INDENTING AND OUTDENTING
   *
   * Buttons in the inline headers and Alt+Shift+Arrow keys change the depth
   * of inlines directly.
   */
  ensureDepthButtons(inline) {
    if (!this.ContentEditor.usesDepth || !this.ContentEditor.allowChange) return
    const title = qs(":scope > h3 .inline_label", inline)
    if (!title || qs(":scope > h3 .inline_depth", inline)) return

    const button = (className, icon, label) =>
      crel("button", { type: "button", className, title: label }, [
        crel("span", { className: "material-icons", textContent: icon }),
      ])
    title.insertAdjacentElement(
      "afterend",
      crel("span", { className: "inline_depth" }, [
        button(
          "inline_outdent",
          "format_indent_decrease",
          this.ContentEditor.messages.outdent,
        ),
        button(
          "inline_indent",
          "format_indent_increase",
          this.ContentEditor.messages.indent,
        ),
      ]),
    )
  }

  updateDepthButtons(inline, canOutdent, canIndent) {
    const outdent = qs(":scope > h3 .inline_outdent", inline)
    const indent = qs(":scope > h3 .inline_indent", inline)
    if (outdent) outdent.disabled = !canOutdent
    if (indent) indent.disabled = !canIndent
  }

  bindDepthHandlers() {
    const orderMachine = this.machine.orderMachine
    delegate(orderMachine, "click", ".inline_depth button", (e, target) => {
      e.preventDefault()
      const inline = target.closest(".inline-related")
      if (target.classList.contains("inline_indent")) this.indent(inline)
      else this.outdent(inline)
    })
    orderMachine.addEventListener("keydown", (e) => {
      if (!e.altKey || !e.shiftKey) return
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
      const inline = e.target.closest(".inline-related")
      if (!inline) return
      e.preventDefault()
      if (e.key === "ArrowRight") this.indent(inline)
      else this.outdent(inline)
    })
  }

  // Move the inline one level up together with its descendants. The
  // following siblings move up too and stay siblings.
  outdent(inline) {
    const depth = this.depthMap.get(inline)
    if (!depth) return
    const inlines = this.machine.findInlinesInOrder()
    for (const el of inlines.slice(inlines.indexOf(inline))) {
      const elDepth = this.depthMap.get(el)
      if (elDepth < depth) break
      this.setDepth(el, elDepth - 1)
    }
    this.update()
  }

  // Move the inline one level down together with its descendants, into the
  // preceding container.
  indent(inline) {
    const inlines = this.machine.findInlinesInOrder()
    const previous = inlines[inlines.indexOf(inline) - 1]
    const depth = this.depthMap.get(inline)
    if (
      !previous ||
      depth >=
        this.depthMap.get(previous) + (this.isContainer(previous) ? 1 : 0)
    ) {
      return
    }
    for (const el of [inline, ...this.descendants(inline)]) {
      this.setDepth(el, this.depthMap.get(el) + 1)
    }
    // Keep the inline visible if it moved into a collapsed container
    for (const el of this.ancestorsOf(inline)) el.classList.remove("collapsed")
    this.update()
  }

  askDeleteContainer() {
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

      const dialog = crel("dialog", { className: "container-delete" }, [
        crel("p", { textContent: messages.deleteContainer }),
        crel("div", { className: "submit-row" }, [
          button(messages.deleteContainerUnwrap, "unwrap", "button delete"),
          button(messages.deleteContainerAll, "all", "button delete"),
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
