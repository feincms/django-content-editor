import { LS, delegate, emit, qs, qsa } from "content-editor/utils"

/*
 * ORDER MACHINE
 *
 * The core of the content editor: it builds the order-machine scaffolding,
 * pulls the plugin inlines out of their Django inline groups into a single
 * sortable container, owns the ordering arithmetic (``style.order`` ↔ the
 * ``-ordering`` form field), drives the Django formset add/remove lifecycle,
 * and implements collapse/expand. Single instance; wired to ``sections``,
 * ``regions`` and ``dragdrop`` after construction.
 */
export class Machine {
  constructor(ContentEditor) {
    this.ContentEditor = ContentEditor

    this.buildScaffolding()
    this.orderMachine = qs(".order-machine")
    this.wrapper = qs(".order-machine-wrapper")
    this.pluginButtons = qs(".plugin-buttons")

    this.emptyMessage = this.addMessage(ContentEditor.messages.empty)
    this.noRegionsMessage = this.addMessage(ContentEditor.messages.noRegions)
    this.noPluginsMessage = this.addMessage(ContentEditor.messages.noPlugins)

    this.bindLifecycleEvents()
    this.bindCollapseHandlers()
  }

  // Set the sibling subsystems. Called once by index.js before init runs.
  wire({ sections, regions, dragdrop }) {
    this.sections = sections
    this.regions = regions
    this.dragdrop = dragdrop
  }

  buildScaffolding() {
    const CE = this.ContentEditor
    let anchor = qs(".inline-group")
    if (CE.plugins.length) {
      anchor = document.getElementById(`${CE.plugins[0].prefix}-group`)
    }
    anchor.insertAdjacentHTML(
      "beforebegin",
      `
    <div class="tabs regions">
      <div class="machine-collapse">
        <label class="collapse-items">
          <input type="checkbox" />
          <div class="plugin-button collapse-all">
            <span class="plugin-button-icon">
              <span class="material-icons">unfold_less</span>
            </span>
            ${CE.messages.collapseAll}
          </div>
          <div class="plugin-button uncollapse-all">
            <span class="plugin-button-icon">
              <span class="material-icons">unfold_more</span>
            </span>
            ${CE.messages.uncollapseAll}
          </div>
        </label>
      </div>
    </div>
    <div class="module order-machine-wrapper">
      <div class="order-machine">
        <span class="order-machine-insert-target last"></span>
      </div>
      <div class="plugin-buttons">
      </div>
    </div>
    <p class="order-machine-help">${CE.messages.selectMultiple}</p>
    `,
    )
  }

  addMessage(text) {
    const p = document.createElement("p")
    p.className = "hidden machine-message"
    p.textContent = text
    this.orderMachine.append(p)
    return p
  }

  addPluginIcons() {
    for (const plugin of this.ContentEditor.plugins) {
      const fragment = document.createElement("template")
      fragment.innerHTML =
        plugin.button || '<span class="material-icons">extension</span>'
      const button = fragment.content.firstElementChild
      if (plugin.color) {
        button.style.color = plugin.color
      }
      for (const title of qsa(
        `.dynamic-${plugin.prefix} > h3, #${plugin.prefix}-empty > h3`,
      )) {
        title.insertAdjacentElement("afterbegin", button.cloneNode(true))
      }
    }
  }

  /*
   * ORDERING
   */
  findInlinesInOrder(region = null) {
    region = region || this.ContentEditor.currentRegion
    const inlines = qsa(
      `.inline-related:not(.empty-form)[data-region="${region}"]`,
      this.orderMachine,
    )
    inlines.sort((a, b) => a.style.order - b.style.order)
    return inlines
  }

  setBiggestOrdering(row) {
    const orderings = []
    for (const input of qsa(".order-machine-ordering", this.orderMachine)) {
      if (!Number.isNaN(+input.value)) orderings.push(+input.value)
    }
    const ordering = 10 + Math.max.apply(null, orderings)
    qs(".order-machine-ordering", row).value = ordering
    row.style.order = ordering
  }

  insertAdjacent(row, inline, after = false) {
    const inlineOrdering = +qs(".order-machine-ordering", inline).value
    const beforeRows = []
    const afterRows = []
    for (const el of qsa(
      ".inline-related:not(.empty-form)",
      this.orderMachine,
    )) {
      const thisOrderingField = qs(".order-machine-ordering", el)
      if (el !== row && !Number.isNaN(+thisOrderingField.value)) {
        if (
          after
            ? +thisOrderingField.value > inlineOrdering
            : +thisOrderingField.value >= inlineOrdering
        ) {
          afterRows.push([el, thisOrderingField])
        } else {
          beforeRows.push([el, thisOrderingField])
        }
      }
    }
    beforeRows.sort((a, b) => a[1].value - b[1].value)
    afterRows.sort((a, b) => a[1].value - b[1].value)
    let rows = [].concat(beforeRows)
    rows.push([row, qs(".order-machine-ordering", row)])
    rows = rows.concat(afterRows)
    for (let i = 0; i < rows.length; ++i) {
      const thisRow = rows[i]
      thisRow[1].value = thisRow[0].style.order = 10 * (1 + i)
    }
  }

  /*
   * MOVING INLINES INTO THE ORDER MACHINE
   */
  reorderInlines(roots) {
    const containers = roots?.length ? roots : [this.orderMachine]
    const inlines = containers.flatMap((c) => qsa(".inline-related", c))

    for (const inline of inlines) {
      if (!inline.classList.contains("empty-form")) {
        emit("content-editor:deactivate", { row: inline })
        this.dragdrop.ensureDraggable(inline)
      }
    }

    for (const inline of inlines) {
      this.orderMachine.append(inline)
    }

    for (const inline of inlines) {
      const span = document.createElement("span")
      span.className = "order-machine-insert-target"
      inline.appendChild(span)

      // Be extra careful because multiple fields could be on one line
      qs(`.field-ordering input[name$="-ordering"]`, inline).classList.add(
        "order-machine-ordering",
      )
      qs(`.field-region input[name$="-region"]`, inline).classList.add(
        "order-machine-region",
      )

      const ordering = qs(".order-machine-ordering", inline).value || 1e9
      inline.style.order = ordering
      this.dragdrop.ensureDraggable(inline)
    }

    for (const inline of inlines) {
      if (!inline.classList.contains("empty-form")) {
        emit("content-editor:activate", { row: inline })
      }
    }
  }

  /*
   * FORMSET LIFECYCLE
   *
   * Always move empty forms to the end, because new plugins are inserted just
   * before its empty form. Also, assign region data.
   */
  handleFormsetAdded(row, prefix) {
    const CE = this.ContentEditor
    // Not one of our managed inlines?
    if (!CE.pluginsByPrefix[prefix]) return

    qs(".order-machine-region", row).value = CE.currentRegion
    qs("h3 .inline_label", row).textContent = CE.messages.newItem
    row.setAttribute("data-region", CE.currentRegion)

    this.setBiggestOrdering(row)
    this.regions.attachMoveToRegionDropdown(row)
    this.dragdrop.ensureDraggable(row)

    this.emptyMessage.classList.add("hidden")

    if (CE._insertBefore) {
      this.insertAdjacent(row, CE._insertBefore)
      CE._insertBefore = null
    }

    emit("content-editor:activate", { row })

    const field = qs("input, select, textarea", row)
    if (field) field.focus()

    this.updateSections()
  }

  handleFormsetRemoved(prefix) {
    const CE = this.ContentEditor
    // Not one of our managed inlines?
    if (!CE.pluginsByPrefix[prefix]) return

    if (
      !qsa(
        `.inline-related[data-region="${CE.currentRegion}"]`,
        this.orderMachine,
      ).length
    ) {
      this.emptyMessage.classList.remove("hidden")
    }
    for (const el of qsa(
      ".inline-related.last-related:not(.empty-form)",
      this.orderMachine,
    )) {
      emit("content-editor:deactivate", { row: el })
    }

    // As soon as possible, but not sooner (let the inline.js code run to the end first)
    setTimeout(() => {
      for (const el of qsa(
        ".inline-related.last-related:not(.empty-form)",
        this.orderMachine,
      )) {
        emit("content-editor:activate", { row: el })
      }
      this.updateSections()
    }, 0)
  }

  bindLifecycleEvents() {
    document.addEventListener("formset:added", (e) => {
      this.handleFormsetAdded(e.target, e.detail.formsetName)
    })
    document.addEventListener("formset:removed", (e) => {
      this.handleFormsetRemoved(e.detail.formsetName)
    })

    document.addEventListener("content-editor:deactivate", (e) => {
      for (const fieldset of e.detail.row.querySelectorAll("fieldset")) {
        fieldset.classList.add("content-editor-invisible")
      }
    })
    document.addEventListener("content-editor:activate", (e) => {
      for (const fieldset of e.detail.row.querySelectorAll("fieldset")) {
        fieldset.classList.remove("content-editor-invisible")
      }
    })
  }

  /*
   * COLLAPSE / EXPAND
   */
  collapseInline(inline, collapsed = true) {
    inline.classList.toggle("collapsed", collapsed)
    if (!collapsed) {
      /* Could have been hidden through sections */
      inline.classList.remove("order-machine-hide")
    }
    this.sections.hideSection(inline, collapsed)
  }

  initializeCollapseAll() {
    const collapseAllInput = qs(".collapse-items input")
    collapseAllInput.addEventListener("change", () => {
      for (const inline of qsa(
        ".order-machine .inline-related:not(.empty-form)",
      )) {
        this.collapseInline(inline, collapseAllInput.checked)
      }
      LS.set("collapseAll", collapseAllInput.checked)

      if (collapseAllInput.checked) {
        /* XXX handle sections */
        for (const errorlist of qsa(
          ".order-machine .inline-related:not(.empty-form) .errorlist",
        )) {
          errorlist.closest(".inline-related").classList.remove("collapsed")
        }
      }
    })
    collapseAllInput.checked = LS.get("collapseAll")
    collapseAllInput.dispatchEvent(new Event("change"))
  }

  bindCollapseHandlers() {
    // Hide fieldsets of to-be-deleted inlines.
    delegate(
      this.orderMachine,
      "click",
      ".delete>input[type=checkbox]",
      (_e, target) => {
        target
          .closest(".inline-related")
          .classList.toggle("for-deletion", target.checked)
        target.blur()
      },
    )

    delegate(this.orderMachine, "click", ".inline-related>h3", (e, target) => {
      if (e.ctrlKey) {
        e.preventDefault()
        target.closest(".inline-related").classList.toggle("selected")
      } else if (
        !e.target.closest(".delete") &&
        !e.target.closest(".inline_move_to_region")
      ) {
        e.preventDefault()
        const inline = target.closest(".inline-related")
        this.collapseInline(inline, !inline.classList.contains("collapsed"))
      }
    })

    // Since we pulled out the fieldsets from their containing module
    // we have to reimplement the Show/Hide toggle for order machine items.
    delegate(this.orderMachine, "click", ".collapse-toggle", (e, target) => {
      // This only reaches us if it hasn't been handled by Django's collapse.js
      e.preventDefault()
      const fieldset = target.closest("fieldset")
      if (fieldset.classList.contains("collapsed")) {
        target.textContent = window.gettext("Hide")
        fieldset.classList.remove("collapsed")
      } else {
        target.textContent = window.gettext("Show")
        fieldset.classList.add("collapsed")
      }
    })
  }

  updateSections() {
    this.sections.update()
  }
}
