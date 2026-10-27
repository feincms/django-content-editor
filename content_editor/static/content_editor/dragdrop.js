import { INDENT } from "content-editor/sections"
import { qsa } from "content-editor/utils"

/*
 * DRAG & DROP
 *
 * Makes order-machine inlines draggable and handles reordering on drop,
 * including moving whole sections and the selected multi-selection. Auto-scrolls
 * the window while dragging near the viewport edges. Single instance; depends on
 * ``machine`` (ordering) and ``sections`` (section structure).
 *
 * The drop position is determined by the pointer's vertical position. With
 * containers, the pointer's horizontal position chooses the depth within the
 * range allowed at that position. With closer-based sections, sections may
 * still be open at the end of a region; there, the pointer's horizontal
 * position decides how many of them the dropped inlines are moved out of. The
 * required closing plugins are added automatically.
 */
export class DragDrop {
  constructor(ContentEditor, machine, sections) {
    this.ContentEditor = ContentEditor
    this.machine = machine
    this.sections = sections
    this.dragging = null
    this.clientY = null

    if (ContentEditor.allowChange) {
      this.bindDragHandlers()
    }
  }

  shouldInsertAfter(inline, clientY) {
    const rect = inline.getBoundingClientRect()
    const yMid = rect.y + rect.height / 2 + 5 // Compensate for margin
    return clientY > yMid
  }

  startMouseMonitor() {
    const updater = (e) => {
      this.clientY = e.clientY
    }
    window.addEventListener("mousemove", updater)
    window.addEventListener("dragover", updater)

    const interval = setInterval(() => {
      const { clientY } = this
      if (clientY && clientY / window.innerHeight < 0.1) {
        window.scrollBy(0, -10)
      } else if (clientY && clientY / window.innerHeight > 0.9) {
        window.scrollBy(0, 10)
      }
    }, 10)

    return () => {
      window.removeEventListener("mousemove", updater)
      window.removeEventListener("dragover", updater)
      clearInterval(interval)
    }
  }

  // The selected inlines together with the contents of selected sections
  movingInlines() {
    const moving = new Set()
    for (const el of qsa(".order-machine .inline-related.selected")) {
      moving.add(el)
      for (const child of this.sections.descendants(el)) moving.add(child)
    }
    return moving
  }

  // Determine where the dragged inlines would be dropped. ``over`` is the
  // visible inline used for the drop indicator, ``anchor`` the inline the
  // dragged inlines are inserted next to and ``close`` the number of open
  // sections which have to be closed first.
  dropTarget(e) {
    const visible = this.machine
      .findInlinesInOrder()
      .filter((el) => !el.classList.contains("content-editor-hide"))
    if (!visible.length) return null

    let over =
      visible.find(
        (el) => e.clientY < el.getBoundingClientRect().bottom + 8, // Half the margin
      ) || visible[visible.length - 1]
    let after = this.shouldInsertAfter(over, e.clientY)

    // Before an inline is the same position as after the previous inline;
    // only use the latter so that each gap has exactly one indicator.
    const index = visible.indexOf(over)
    if (!after && index > 0) {
      over = visible[index - 1]
      after = true
    }

    // Dropping after a collapsed section moves the inlines after the section.
    const anchor =
      (after &&
        over.classList.contains("collapsed") &&
        this.sections.descendants(over).at(-1)) ||
      over
    const depth = this.sections.depthMap.get(over) || 0

    if (this.ContentEditor.usesDepth) {
      return this.depthDropTarget(e, over, after ? anchor : null, depth)
    }

    const moving = this.movingInlines()
    const remaining = this.machine
      .findInlinesInOrder()
      .filter((el) => !moving.has(el))
    const anchorOrder = +anchor.style.order
    const atEnd =
      after && !remaining.some((el) => +el.style.order > anchorOrder)

    // Section openers and closers change the depth after them
    let close = 0
    let targetDepth = after
      ? Math.max(
          0,
          (this.sections.depthMap.get(anchor) || 0) +
            this.sections.sectionsOf(anchor),
        )
      : depth
    if (atEnd && this.sections.closerPlugin()) {
      const open = this.sections.depthAfter(remaining)
      const base = over.getBoundingClientRect().left - INDENT * depth
      targetDepth = Math.min(
        open,
        Math.max(0, Math.floor((e.clientX - base) / INDENT)),
      )
      close = open - targetDepth
    }

    return {
      over,
      anchor,
      after,
      close,
      offset: INDENT * (targetDepth - depth),
    }
  }

  // The drop target with containers: the dragged inlines are inserted after
  // ``previous`` (or before ``next``), the remaining inlines directly before and
  // after the gap. ``anchor`` is the inline the gap follows, if any.
  depthDropTarget(e, over, anchor, overDepth) {
    const moving = this.movingInlines()
    const anchorOrder = anchor ? +anchor.style.order : Number.NEGATIVE_INFINITY
    const remaining = this.machine
      .findInlinesInOrder()
      .filter((el) => !moving.has(el))
    const previous = remaining
      .filter((el) => +el.style.order <= anchorOrder)
      .at(-1)
    const next = remaining.find((el) => +el.style.order > anchorOrder)

    // Dropping never splits a section, so the next inline keeps its parent
    const depthOf = (el) => this.sections.depthMap.get(el) || 0
    const minimum = next ? depthOf(next) : 0
    const maximum = previous
      ? depthOf(previous) + (this.sections.isContainer(previous) ? 1 : 0)
      : 0
    const base = over.getBoundingClientRect().left - INDENT * overDepth
    const depth = Math.max(
      minimum,
      Math.min(maximum, Math.floor((e.clientX - base) / INDENT)),
    )

    return {
      over,
      after: Boolean(anchor),
      previous,
      next,
      depth,
      offset: INDENT * (depth - overDepth),
    }
  }

  // Move the dragged subtrees to the drop target. The roots end up at the
  // target depth, their descendants keep their relative depth.
  dropAtDepth(target, moving) {
    const sections = this.sections
    const roots = [...moving].filter(
      (el) =>
        !sections.ancestorsOf(el).some((ancestor) => moving.has(ancestor)),
    )
    const depths = new Map()
    for (const root of roots) {
      const delta = target.depth - sections.depthOf(root)
      for (const el of [root, ...sections.descendants(root)]) {
        depths.set(el, sections.depthOf(el) + delta)
      }
    }

    const anchor = target.previous || target.next
    if (anchor) {
      const after = Boolean(target.previous)
      const toMove = [...moving].map((el) => [el, +el.style.order])
      toMove.sort((a, b) => (after ? -1 : 1) * (a[1] - b[1]))
      for (const row of toMove) {
        this.machine.insertAdjacent(row[0], anchor, after)
      }
    }
    for (const [el, depth] of depths) sections.setDepth(el, depth)

    // Keep the inlines visible if they moved into a collapsed container
    for (const root of roots) {
      for (const el of sections.ancestorsOf(root)) {
        el.classList.remove("collapsed")
      }
    }
    this.machine.updateSections()
  }

  clearDragover() {
    for (const el of qsa(".fs-dragover")) {
      el.classList.remove("fs-dragover", "fs-dragover--after")
      el.style.removeProperty("--fs-dragover-offset")
    }
  }

  bindDragHandlers() {
    const orderMachine = this.machine.orderMachine
    let cancelMouseMonitor

    orderMachine.addEventListener("dragstart", (e) => {
      // Only handle events from [draggable] elements
      if (!e.target.closest("h3[draggable]")) return

      this.dragging = e.target.closest(".inline-related")
      this.dragging.classList.add("fs-dragging", "selected")

      e.dataTransfer.dropEffect = "move"
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", "")

      cancelMouseMonitor = this.startMouseMonitor()
    })
    orderMachine.addEventListener("dragend", () => {
      this.dragging = null
      this.clientY = null
      for (const el of qsa(".fs-dragging")) el.classList.remove("fs-dragging")
      this.clearDragover()
      for (const el of qsa(".order-machine .inline-related.selected")) {
        el.classList.remove("selected")
      }
      cancelMouseMonitor?.()
      cancelMouseMonitor = null
    })

    orderMachine.addEventListener("dragenter", (e) => {
      if (this.dragging) e.preventDefault()
    })
    orderMachine.addEventListener("dragover", (e) => {
      if (!this.dragging) return
      e.preventDefault()
      this.clearDragover()
      const target = this.dropTarget(e)
      if (!target) return
      target.over.classList.add("fs-dragover")
      target.over.classList.toggle("fs-dragover--after", target.after)
      if (target.offset) {
        target.over.style.setProperty(
          "--fs-dragover-offset",
          `${target.offset}px`,
        )
      }
    })

    orderMachine.addEventListener("drop", (e) => {
      if (!this.dragging) return
      e.preventDefault()
      const target = this.dropTarget(e)
      const moving = this.movingInlines()
      this.dragging = null
      if (!target) return

      if (this.ContentEditor.usesDepth) {
        this.dropAtDepth(target, moving)
        return
      }

      let { anchor, after } = target
      if (target.close) {
        this.ContentEditor._insertBefore = null
        const closer = this.sections.closerPlugin()
        for (let i = 0; i < target.close; ++i) {
          this.ContentEditor.addContent(closer.prefix)
        }
        // The closers have been added at the end of the region
        anchor = this.machine
          .findInlinesInOrder()
          .filter((el) => !moving.has(el))
          .at(-1)
        after = true
      } else if (moving.has(anchor)) {
        return
      }

      const toMove = [...moving].map((el) => [el, +el.style.order])
      toMove.sort((a, b) => (after ? -1 : 1) * (a[1] - b[1]))
      for (const row of toMove) {
        this.machine.insertAdjacent(row[0], anchor, after)
      }

      this.machine.updateSections()
    })
  }

  ensureDraggable(inline) {
    if (
      !this.ContentEditor.allowChange ||
      inline.classList.contains("empty-form")
    )
      return

    for (const handle of qsa(":scope > h3, .card-title", inline)) {
      handle.setAttribute("draggable", true) // Default admin, Jazzmin
    }
  }
}
