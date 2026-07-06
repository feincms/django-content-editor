import { crel, qs, qsa } from "content-editor/utils"

/*
 * CLONING
 *
 * Adds a "Clone from region" plugin button which opens a dialog letting the
 * editor copy plugins (and whole sections) from another region into the current
 * one at the selected insert position. Only constructed when more than one
 * region is declared.
 */
export class Cloning {
  constructor(ContentEditor, machine, regions) {
    this.ContentEditor = ContentEditor
    this.machine = machine
    this.regions = regions
  }

  addButton() {
    const button = document.createElement("a")
    button.className = "plugin-button"
    button.role = "button"
    button.innerHTML = `
      <span class="plugin-button-icon"><span class="material-icons">content_copy</span></span>
      <span class="plugin-button-title">${this.ContentEditor.messages.clone}</span>
    `

    this.machine.pluginButtons.append(button)

    button.addEventListener("click", () => this.openDialog())
  }

  openDialog() {
    const CE = this.ContentEditor
    this.regions.hidePluginButtons()

    const dialog = crel("dialog", { className: "clone" })
    dialog.append(
      crel("h2", {
        textContent: CE.messages.clone,
      }),
    )

    const fieldsets = []

    for (const region of CE.declaredRegions) {
      if (region.key === CE.currentRegion) {
        continue
      }

      const inlines = this.machine
        .findInlinesInOrder(region.key)
        .filter((inline) => inline.classList.contains("has_original"))

      if (!inlines.length) {
        continue
      }

      const contents = crel("div")
      const fieldset = crel(
        "details",
        {
          className: "module",
          name: "clone-region",
        },
        [crel("summary", { textContent: region.title }), contents],
      )

      const checkbox = crel("input", {
        type: "checkbox",
      })
      checkbox.addEventListener("click", (e) => {
        for (const cb of qsa("ul input[type=checkbox]", fieldset)) {
          cb.checked = e.target.checked
        }
      })

      contents.append(crel("label", {}, [checkbox, CE.messages.selectAll]))

      const stack = [crel("ul", { "data-indent": 0 })]
      let indent = 0
      let nextIndent

      for (const inline of inlines) {
        const { prefix, model } = this.regions.getPluginTypeFromId(inline.id)
        nextIndent = Math.max(0, indent + CE.pluginsByPrefix[prefix].sections)

        const cb = crel("input", {
          type: "checkbox",
          name: "_clone",
          value: `${model}:${qs("input[type=hidden][name$='-id']", inline).value}`,
        })

        cb.addEventListener("click", (e) => {
          const checkboxes = qsa(
            "ul input[type=checkbox]",
            e.target.closest("li"),
          )
          for (const c of checkboxes) {
            c.checked = e.target.checked
          }
        })

        const label = crel("label", {}, [
          cb,
          ...qsa("h3 .material-icons, h3 b, h3 .inline_label", inline).map(
            (node) => node.cloneNode(true),
          ),
        ])

        stack[indent].append(crel("li", {}, [label]))

        while (indent < nextIndent) {
          const list = crel("ul", { "data-indent": indent + 1 })
          stack[indent].children[stack[indent].children.length - 1].append(list)
          stack[indent + 1] = list
          ++indent
        }

        indent = nextIndent
      }

      contents.append(stack[0])
      fieldsets.push(fieldset)
    }

    if (!fieldsets.length) {
      dialog.append(crel("p", { textContent: CE.messages.noClone }))
    } else if (fieldsets.length === 1) {
      fieldsets[0].open = true
    }
    dialog.append(...fieldsets)

    const saveButton = qs("input[name=_continue]").cloneNode(true)

    // input[type="submit"] reuses the proper submit row button styling
    const cancelButton = crel("input", {
      className: "button",
      type: "submit",
      value: window.gettext("Cancel"),
    })
    cancelButton.addEventListener("click", (e) => {
      e.preventDefault()
      dialog.close()
    })

    const orderingField = crel("input", {
      type: "hidden",
      name: "_clone_ordering",
    })

    dialog.append(
      crel("input", {
        type: "hidden",
        name: "_clone_region",
        value: CE.currentRegion,
      }),
      orderingField,
    )

    dialog.append(
      crel("div", { className: "submit-row" }, [saveButton, cancelButton]),
    )

    const bumpOrdering = () => {
      const checked = qsa("input[type=checkbox]:checked", dialog).length
      const inlines = this.machine.findInlinesInOrder()
      let order = 10
      let orderingFieldSet = false

      for (const inline of inlines) {
        if (inline === CE._insertBefore) {
          orderingField.value = order
          orderingFieldSet = true

          // Next order is checked-1 since we already have incremented by
          // 10 after the last item
          order += checked * 10
        }

        qs(".order-machine-ordering", inline).value = order
        order += 10
      }

      if (!orderingFieldSet) {
        orderingField.value = order
      }
    }

    const form = qs("#content-main form")
    form.addEventListener("submit", bumpOrdering)
    dialog.addEventListener("close", () => {
      form.removeEventListener("submit", bumpOrdering)
    })

    form.append(dialog)
    dialog.showModal()
  }
}
