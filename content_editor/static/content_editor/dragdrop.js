import { qsa } from "content-editor/utils"

/*
 * DRAG & DROP
 *
 * Makes order-machine inlines draggable and handles reordering on drop,
 * including moving whole sections and the selected multi-selection. Auto-scrolls
 * the window while dragging near the viewport edges. Single instance; depends on
 * ``machine`` (ordering) and ``sections`` (section selection).
 */
export class DragDrop {
  constructor(ContentEditor, machine, sections) {
    this.ContentEditor = ContentEditor
    this.machine = machine
    this.sections = sections
  }

  shouldInsertAfter(inline, clientY) {
    const rect = inline.getBoundingClientRect()
    const yMid = rect.y + rect.height / 2 + 5 // Compensate for margin
    return clientY > yMid
  }

  startMouseMonitor() {
    const updater = (e) => {
      window.__fs_clientY = e.clientY
    }
    window.addEventListener("mousemove", updater)
    window.addEventListener("dragover", updater)

    const interval = setInterval(() => {
      const clientY = window.__fs_clientY
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

  ensureDraggable(inline) {
    if (
      !this.ContentEditor.allowChange ||
      inline.classList.contains("empty-form") ||
      inline.classList.contains("fs-draggable")
    )
      return

    let cancelMouseMonitor

    inline.addEventListener("dragstart", (e) => {
      // Only handle events from [draggable] elements
      if (!e.target.closest("h3[draggable]")) return

      window.__fs_dragging = e.target.closest(".inline-related")
      window.__fs_dragging.classList.add("fs-dragging")
      window.__fs_dragging.classList.add("selected")

      e.dataTransfer.dropEffect = "move"
      e.dataTransfer.effectAllowed = "move"
      try {
        e.dataTransfer.setData("text/plain", "")
      } finally {
        // IE11 needs this.
      }

      cancelMouseMonitor = this.startMouseMonitor()
    })
    inline.addEventListener("dragend", () => {
      for (const el of qsa(".fs-dragging")) el.classList.remove("fs-dragging")
      for (const el of qsa(".fs-dragover")) el.classList.remove("fs-dragover")
      for (const el of qsa(".order-machine .inline-related.selected")) {
        el.classList.remove("selected")
      }
      cancelMouseMonitor()
      cancelMouseMonitor = null
    })
    inline.addEventListener(
      "dragover",
      (e) => {
        if (window.__fs_dragging) {
          e.preventDefault()
          for (const el of qsa(".fs-dragover"))
            el.classList.remove("fs-dragover")
          const over = e.target.closest(".inline-related")
          over.classList.add("fs-dragover")
          over.classList.toggle(
            "fs-dragover--after",
            this.shouldInsertAfter(over, e.clientY),
          )
        }
      },
      true,
    )
    inline.addEventListener("drop", (e) => {
      if (window.__fs_dragging) {
        e.preventDefault()
        for (const sel of qsa(".order-machine .inline-related.selected")) {
          this.sections.selectSection(sel)
        }

        const over = e.target.closest(".inline-related")
        const toMove = qsa(".order-machine .inline-related.selected").map(
          (el) => [el, +el.style.order],
        )
        const orAfter = this.shouldInsertAfter(over, e.clientY)
        toMove.sort((a, b) => (orAfter ? -1 : 1) * (a[1] - b[1]))
        for (const row of toMove) {
          this.machine.insertAdjacent(row[0], over, orAfter)
          row[0].classList.remove("selected")
        }
        window.__fs_dragging = null

        this.machine.updateSections()
      }
    })

    for (const handle of qsa(":scope > h3, .card-title", inline)) {
      handle.setAttribute("draggable", true) // Default admin, Jazzmin
    }
    inline.classList.add("fs-draggable")
  }
}
