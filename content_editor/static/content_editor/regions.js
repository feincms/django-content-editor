import { buildDropdown, delegate, qs, qsa } from "content-editor/utils"

/*
 * REGIONS & PLUGIN RIGHTS
 *
 * Owns everything in the "what plugin may go in what region" domain: the region
 * tabs and the current region, hiding inlines from other regions, assigning the
 * ``data-region`` attribute (synthesizing ``_unknown_*`` regions for content in
 * undeclared regions), the move-to-region dropdowns, and the add-plugin buttons
 * together with their visibility/rights logic.
 *
 * The rights fix lives here: ``updatePluginButtonsVisibility`` decides whether
 * the insert targets are interactive, and ``selectInitial`` guarantees it runs
 * exactly once during initialization — even when there are no regions at all,
 * where previously it never ran (it was gated behind a tab click that never
 * happened).
 */
export class Regions {
  constructor(ContentEditor, machine) {
    this.ContentEditor = ContentEditor
    this.machine = machine
    this.tabs = []

    // Pre map plugin regions
    this.pluginRegions = Object.fromEntries(
      ContentEditor.plugins.map((plugin) => [plugin.prefix, plugin.regions]),
    )

    this.bindInsertTargets()
    this.bindGlobalHandlers()
  }

  /*
   * REGION ASSIGNMENT
   */

  // Fetch the inline type from id
  getPluginTypeFromId(id) {
    let ret = null
    for (const plugin of this.ContentEditor.plugins) {
      if (
        id.startsWith(plugin.prefix) &&
        (!ret || plugin.prefix.length > ret.prefix.length)
      ) {
        ret = plugin
      }
    }
    return ret
  }

  // Assign data-region to all inlines. We also want the data attribute to be
  // visible to selectors.
  assignToInlines() {
    const CE = this.ContentEditor
    for (const inline of qsa(
      ".inline-related:not(.empty-form)",
      this.machine.orderMachine,
    )) {
      // Try input first and fall back to the readonly presentation
      let region =
        qs(".order-machine-region", inline)?.value ||
        qs(".field-region .readonly", inline)?.textContent

      if (!CE.regionsByKey[region]) {
        const key = `_unknown_${region}`
        if (!CE.regionsByKey[key]) {
          const spec = {
            key,
            title: `${CE.messages.unknownRegion}: ${region}`,
            inherited: false,
          }
          CE.regions.push(spec)
          CE.regionsByKey[spec.key] = spec
        }
        region = key
      }

      inline.setAttribute("data-region", region)
      this.attachMoveToRegionDropdown(inline)
    }
  }

  attachMoveToRegionDropdown(inline) {
    const CE = this.ContentEditor
    // Filter allowed regions
    const inlineType = this.getPluginTypeFromId(inline.id)?.type
    const regions = []
    for (const region of CE.regions) {
      if (
        (!inlineType ||
          !this.pluginRegions[inlineType] ||
          this.pluginRegions[inlineType].includes(region.key)) &&
        !/^_unknown_/.test(region.key)
      ) {
        regions.push(region)
      }
    }

    const isCurrentUnknown = /^_unknown_/.test(inline.dataset.region)

    if (regions.length < 2 && !isCurrentUnknown) {
      return
    }

    const select = buildDropdown(
      regions,
      isCurrentUnknown ? CE.messages.unknownRegion : "",
    )
    const regionInput = qs(".order-machine-region", inline)

    select.className = "inline_move_to_region"
    select.value = isCurrentUnknown ? "" : regionInput.value
    qs(":scope > h3 .inline_label", inline).insertAdjacentElement(
      "afterend",
      select,
    )

    select.addEventListener("change", () => {
      if (select.value) {
        inline.setAttribute("data-region", select.value)
        regionInput.value = select.value
        this.hideInlinesFromOtherRegions()
        this.machine.setBiggestOrdering(inline)
        this.machine.reorderInlines()
      }
    })
  }

  hideInlinesFromOtherRegions() {
    const CE = this.ContentEditor
    const inlines = qsa(
      ".inline-related:not(.empty-form)",
      this.machine.orderMachine,
    )
    for (const el of inlines) el.classList.add("content-editor-invisible")
    const shown = inlines.filter((el) =>
      el.matches(`[data-region="${CE.currentRegion}"]`),
    )
    this.machine.emptyMessage.classList.add("hidden")
    if (shown.length) {
      for (const el of shown) el.classList.remove("content-editor-invisible")
    } else {
      this.machine.emptyMessage.classList.remove("hidden")
    }
    this.machine.emptyMessage.textContent =
      CE.messages[
        CE.regionsByKey[CE.currentRegion].inherited ? "emptyInherited" : "empty"
      ]
  }

  /*
   * TABS
   */
  initTabs() {
    const tabContainer = qs(".tabs.regions")
    for (const region of this.ContentEditor.regions) {
      const t = document.createElement("h2")
      t.className = "tab"
      t.textContent = region.title
      t.setAttribute("data-region", region.key)
      tabContainer.append(t)
    }

    this.tabs = qsa("h2", tabContainer)
    for (const tab of this.tabs) {
      tab.addEventListener("click", () =>
        this.activateRegion(tab.dataset.region),
      )
    }
  }

  activateRegion(key) {
    const CE = this.ContentEditor
    CE.currentRegion = key
    this.hideInlinesFromOtherRegions()
    for (const tab of this.tabs) {
      tab.classList.toggle("active", tab.dataset.region === key)
    }
    this.updatePluginButtonsVisibility()
    this.machine.updateSections()
  }

  // Activate the region matching ``region`` (from the URL hash), else the first
  // tab. When there are no regions at all, still run the visibility pass exactly
  // once so the insert targets are disabled and the "no regions" message shows.
  selectInitial(region) {
    const target = this.tabs.find((tab) => tab.dataset.region === region)
    if (target) {
      this.activateRegion(target.dataset.region)
    } else if (this.tabs.length) {
      this.activateRegion(this.tabs[0].dataset.region)
    } else {
      this.updatePluginButtonsVisibility()
    }
  }

  /*
   * PLUGIN BUTTONS & RIGHTS
   */
  pluginInCurrentRegion(prefix) {
    const CE = this.ContentEditor
    if (!CE.regions.length) return false

    const plugin = CE.pluginsByPrefix[prefix]
    const regions = plugin.regions || Object.keys(CE.regionsByKey)
    return regions.includes(CE.currentRegion)
  }

  // Hide not allowed plugin buttons and toggle whether the insert targets are
  // interactive at all.
  updatePluginButtonsVisibility() {
    const CE = this.ContentEditor
    const buttons = qsa(".plugin-buttons .plugin-button")
    let visible = 0

    for (const button of buttons) {
      const plugin = button.dataset.pluginPrefix
      const isVisible =
        !plugin ||
        (this.pluginInCurrentRegion(plugin) &&
          !/^_unknown_/.test(CE.currentRegion))
      button.classList.toggle("content-editor-hide", !isVisible)
      visible += isVisible ? 1 : 0
    }

    if (visible) {
      this.machine.wrapper.classList.remove("order-machine-hide-insert-targets")
      this.machine.noPluginsMessage.classList.add("hidden")

      this.machine.pluginButtons.style.setProperty(
        "--_v",
        Math.max(7, Math.ceil(visible / 3)),
      )
    } else {
      this.machine.wrapper.classList.add("order-machine-hide-insert-targets")

      if (CE.currentRegion && CE.allowChange) {
        this.machine.noPluginsMessage.classList.remove("hidden")
        this.machine.emptyMessage.classList.add("hidden")
      }
    }

    if (CE.regions.length) {
      this.machine.noRegionsMessage.classList.add("hidden")
    } else {
      this.machine.noRegionsMessage.classList.remove("hidden")
    }
  }

  addPluginButton(prefix, iconHTML, initializing = false) {
    const CE = this.ContentEditor
    const plugin = CE.pluginsByPrefix[prefix]
    if (!plugin) return

    const button = document.createElement("a")
    button.dataset.pluginPrefix = plugin.prefix
    button.className = "plugin-button"
    button.title = plugin.title
    button.role = "button"
    button.addEventListener("click", (e) => {
      e.preventDefault()
      CE.addContent(plugin.prefix)
      this.hidePluginButtons()
    })

    const icon = document.createElement("span")
    icon.className = "plugin-button-icon"
    icon.innerHTML = iconHTML || '<span class="material-icons">extension</span>'
    button.appendChild(icon)
    if (plugin.color) {
      icon.style.color = plugin.color
    }

    const title = document.createElement("span")
    title.className = "plugin-button-title"
    title.textContent = plugin.title
    button.appendChild(title)

    const unit = qs(".plugin-buttons")
    unit.appendChild(button)

    if (!initializing) {
      this.updatePluginButtonsVisibility()
    }
  }

  // Unselect the currently selected plugin
  hidePluginButtons() {
    this.machine.wrapper.classList.remove("plugin-buttons-visible")
    for (const el of qsa(".order-machine-insert-target.selected")) {
      el.classList.remove("selected")
    }
  }

  bindInsertTargets() {
    delegate(
      document,
      "click",
      ".order-machine-insert-target",
      (_e, target) => {
        const isSelected = target.classList.contains("selected")
        this.hidePluginButtons()
        if (isSelected) {
          this.ContentEditor._insertBefore = null
        } else {
          target.classList.add("selected")

          const pos = target.getBoundingClientRect()
          const wrapperRect = this.machine.wrapper.getBoundingClientRect()
          const buttons = qs(".plugin-buttons")
          buttons.style.left = `${pos.left - wrapperRect.left + 30}px`

          const y =
            pos.top -
            wrapperRect.top +
            (target.classList.contains("last")
              ? 30 - buttons.getBoundingClientRect().height
              : 0)
          buttons.style.top = `${y}px`

          this.machine.wrapper.classList.add("plugin-buttons-visible")

          this.ContentEditor._insertBefore = target.closest(".inline-related")
        }
      },
    )
  }

  bindGlobalHandlers() {
    document.body.addEventListener("keyup", (e) => {
      if (e.key === "Escape") this.hidePluginButtons()
    })

    document.body.addEventListener("click", (e) => {
      if (
        !e.target.closest(".order-machine-insert-target") &&
        !e.target.closest(".plugin-buttons")
      ) {
        this.hidePluginButtons()
      }
    })
  }
}
