/* global django,ContentEditor */

django.jQuery(($) => {
  const context = document.getElementById("content-editor-context")
  if (!context) return

  function qs(sel, ctx = document) {
    return ctx.querySelector(sel)
  }
  function qsa(sel, ctx = document) {
    return Array.from(ctx.querySelectorAll(sel))
  }

  const safeStorage = (storage, prefix = "ContentEditor:") => {
    return {
      set(name, value) {
        try {
          storage.setItem(prefix + name, JSON.stringify(value))
        } catch (_e) {
          /* empty */
        }
      },
      get(name) {
        try {
          return JSON.parse(storage.getItem(prefix + name))
        } catch (_e) {
          /* empty */
        }
      },
    }
  }

  const LS = safeStorage(localStorage)
  const SS = safeStorage(sessionStorage)

  window.ContentEditor = {
    addContent: function addContent(prefix) {
      $(`#${prefix}-group .add-row a`).click()
    },
    addPluginButton: function addPluginButton(prefix, iconHTML) {
      const plugin = ContentEditor.pluginsByPrefix[prefix]
      if (!plugin) return

      const button = document.createElement("a")
      button.dataset.pluginPrefix = plugin.prefix
      button.className = "plugin-button"
      button.title = plugin.title
      button.addEventListener("click", (e) => {
        e.preventDefault()
        ContentEditor.addContent(plugin.prefix)
        hidePluginButtons()
      })

      const icon = document.createElement("span")
      icon.className = "plugin-button-icon"
      icon.innerHTML =
        iconHTML || '<span class="material-icons">extension</span>'
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

      hideNotAllowedPluginButtons([button])
    },
  }

  $.extend(window.ContentEditor, JSON.parse(context.dataset.context))

  ContentEditor.pluginsByPrefix = {}
  ContentEditor.plugins.forEach((plugin) => {
    ContentEditor.pluginsByPrefix[plugin.prefix] = plugin
  })
  ContentEditor.regionsByKey = {}
  ContentEditor.regions.forEach((region) => {
    ContentEditor.regionsByKey[region.key] = region
  })

  // Add basic structure. There is always at least one inline group if
  // we even have any plugins.
  let $anchor = $(".inline-group:first")
  if (ContentEditor.plugins.length) {
    $anchor = $(`#${ContentEditor.plugins[0].prefix}-group`)
  }
  $anchor.before(
    `
    <div class="tabs regions">
      <div class="machine-collapse">
        <label class="collapse-items">
          <input type="checkbox" />
          <div class="plugin-button collapse-all">
            <span class="plugin-button-icon">
              <span class="material-icons">unfold_less</span>
            </span>
            ${ContentEditor.messages.collapseAll}
          </div>
          <div class="plugin-button uncollapse-all">
            <span class="plugin-button-icon">
              <span class="material-icons">unfold_more</span>
            </span>
            ${ContentEditor.messages.uncollapseAll}
          </div>
        </label>
      </div>
    </div>
    <div class="module order-machine-wrapper">
      <div class="order-machine">
        <span class="order-machine-insert-target last"></span>
      </div>
      <div class="plugin-buttons"></div>
    </div>
    <p class="order-machine-help">${ContentEditor.messages.selectMultiple}</p>
    `,
  )

  const addPluginIconsToInlines = () => {
    for (const plugin of ContentEditor.plugins) {
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
  addPluginIconsToInlines()

  const orderMachineWrapper = $(".order-machine-wrapper")
  const pluginButtons = qs(".plugin-buttons")
  const orderMachine = $(".order-machine")
  const machineEmptyMessage = $('<p class="hidden machine-message"/>')
    .text(ContentEditor.messages.empty)
    .appendTo(orderMachine)
  const noRegionsMessage = $('<p class="hidden machine-message"/>')
    .text(ContentEditor.messages.noRegions)
    .appendTo(orderMachine)
  const noPluginsMessage = $('<p class="hidden machine-message"/>')
    .text(ContentEditor.messages.noPlugins)
    .appendTo(orderMachine)

  // Pre map plugin regions
  const pluginRegions = (() => {
    const result = {}
    ContentEditor.plugins.forEach((plugin) => {
      result[plugin.prefix] = plugin.regions
    })
    const plugins = ContentEditor.plugins
    for (let i = 0; i < plugins.length; i++) {
      result[plugins[i].prefix] = plugins[i].regions
    }
    return result
  })()

  function shouldInsertAfter(inline, clientY) {
    const rect = inline.getBoundingClientRect()
    const yMid = rect.y + rect.height / 2 + 5 // Compensate for margin
    return clientY > yMid
  }

  function startMouseMonitor() {
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

  function ensureDraggable(arg) {
    if (
      !ContentEditor.allowChange ||
      arg.hasClass("empty-form") ||
      arg.hasClass("fs-draggable")
    )
      return

    const inline = arg[0]
    let cancelMouseMonitor

    inline.addEventListener("dragstart", (e) => {
      // Only handle events from [draggable] elements
      if (!e.target.closest("h3[draggable]")) return

      // window.__fs_dragging = inline;
      window.__fs_dragging = e.target.closest(".inline-related")
      window.__fs_dragging.classList.add("fs-dragging")
      window.__fs_dragging.classList.add("selected")

      e.dataTransfer.dropEffect = "move"
      e.dataTransfer.effectAllowed = "move"
      try {
        e.dataTransfer.setData("text/plain", "")
      } catch (e) {
        // IE11 needs this.
      }

      cancelMouseMonitor = startMouseMonitor()
    })
    inline.addEventListener("dragend", () => {
      $(".fs-dragging").removeClass("fs-dragging")
      $(".fs-dragover").removeClass("fs-dragover")
      qsa(".order-machine .inline-related.selected").forEach((el) =>
        el.classList.remove("selected"),
      )
      cancelMouseMonitor()
      cancelMouseMonitor = null
    })
    inline.addEventListener(
      "dragover",
      (e) => {
        if (window.__fs_dragging) {
          e.preventDefault()
          $(".fs-dragover").removeClass("fs-dragover")
          const inline = e.target.closest(".inline-related")
          inline.classList.add("fs-dragover")
          inline.classList.toggle(
            "fs-dragover--after",
            shouldInsertAfter(inline, e.clientY),
          )
        }
      },
      true,
    )
    inline.addEventListener("drop", (e) => {
      if (window.__fs_dragging) {
        e.preventDefault()
        const inline = e.target.closest(".inline-related")
        const toMove = qsa(".order-machine .inline-related.selected").map(
          (inline) => [inline, +inline.style.order],
        )
        const orAfter = shouldInsertAfter(inline, e.clientY)
        toMove.sort((a, b) => (orAfter ? -1 : 1) * (a[1] - b[1]))
        toMove.forEach((row) => {
          insertAdjacent(row[0], inline, orAfter)
          row[0].classList.remove("selected")
        })
        window.__fs_dragging = null
      }
    })

    arg.find(">h3, .card-title").attr("draggable", true) // Default admin, Jazzmin
    arg.addClass("fs-draggable")
  }

  function reorderInlines(context) {
    const inlines = (context || orderMachine).find(".inline-related")
    inlines.not(".empty-form").each(function () {
      $(document).trigger("content-editor:deactivate", [$(this)])

      ensureDraggable($(this))
    })

    inlines.detach()
    orderMachine.append(inlines)

    inlines.each(function () {
      const ordering = $(".field-ordering input", this).val() || 1e9
      this.style.order = ordering
      ensureDraggable($(this))
    })

    inlines.not(".empty-form").each(function () {
      $(document).trigger("content-editor:activate", [$(this)])
    })
  }

  function buildDropdown(contents, title) {
    const select = document.createElement("select")
    let idx = 0

    if (title) select.options[idx++] = new Option(title, "", true)

    for (let i = 0; i < contents.length; i++) {
      // Option _values_ may either be the prefix (for plugins) or keys (for
      // regions)
      select.options[idx++] = new Option(
        contents[i].title,
        contents[i].prefix || contents[i].key,
      )
    }
    return select
  }

  function pluginInCurrentRegion(prefix) {
    if (!ContentEditor.regions.length) return false

    const plugin = ContentEditor.pluginsByPrefix[prefix]
    const regions = plugin.regions || Object.keys(ContentEditor.regionsByKey)
    return regions.includes(ContentEditor.currentRegion)
  }

  // Hide not allowed plugin buttons
  // If buttons only checks this buttons, else checks all
  function hideNotAllowedPluginButtons(_buttons) {
    const buttons = _buttons ? _buttons : qsa(".plugin-buttons .plugin-button")

    let visible = 0

    buttons.forEach((button) => {
      const plugin = button.dataset.pluginPrefix
      const isVisible =
        pluginInCurrentRegion(plugin) &&
        !/^_unknown_/.test(ContentEditor.currentRegion)
      button.classList.toggle("content-editor-hide", !isVisible)
      visible += isVisible ? 1 : 0
    })

    if (visible) {
      orderMachineWrapper.removeClass("order-machine-hide-insert-targets")
      noPluginsMessage.hide()

      pluginButtons.style.setProperty(
        "--_v",
        Math.max(7, Math.ceil(visible / 3)),
      )
    } else {
      orderMachineWrapper.addClass("order-machine-hide-insert-targets")

      if (ContentEditor.currentRegion && ContentEditor.allowChange) {
        noPluginsMessage.show()
        machineEmptyMessage.hide()
      }
    }

    if (ContentEditor.regions.length) {
      noRegionsMessage.hide()
    } else {
      noRegionsMessage.show()
    }
  }

  // Fetch the inline type from id
  function getInlineType($inline) {
    const match = /^([a-z0-9_]+)-\d+$/g.exec($inline.attr("id"))
    if (match) {
      return match[1]
    }
    return null
  }

  function attachMoveToRegionDropdown($inline) {
    // Filter allowed regions
    const inlineType = getInlineType($inline)
    const regions = []
    for (let i = 0; i < ContentEditor.regions.length; i++) {
      if (
        (!inlineType ||
          !pluginRegions[inlineType] ||
          $.inArray(ContentEditor.regions[i].key, pluginRegions[inlineType]) >=
            0) &&
        !/^_unknown_/.test(ContentEditor.regions[i].key)
      ) {
        regions.push(ContentEditor.regions[i])
      }
    }

    if (regions.length < 2 && !/^_unknown_/.test($inline.data("region"))) return

    const select = buildDropdown(regions)
    const regionInput = $inline.find(".field-region input")

    select.className = "inline_move_to_region"
    select.value = regionInput.val()
    $inline.find("> h3 .inline_label").after(select)

    select.addEventListener("change", () => {
      $inline.attr("data-region", select.value)
      regionInput.val(select.value)
      hideInlinesFromOtherRegions()
      setBiggestOrdering($inline)
      reorderInlines()
    })
  }

  // Assing data-region to all inlines.
  // We also want to the data attribute to be visible to selectors (that's why we're using $.attr)
  function assignRegionDataAttribute() {
    orderMachine.find(".inline-related:not(.empty-form)").each(function () {
      const $this = $(this)
      // Try input first and fall back to the readonly presentation
      let region =
        $this.find(".field-region input").val() ||
        $this.find(".field-region .readonly").text()

      if (!ContentEditor.regionsByKey[region]) {
        const key = `_unknown_${region}`
        if (!ContentEditor.regionsByKey[key]) {
          const spec = {
            key: `_unknown_${region}`,
            title: `${ContentEditor.messages.unknownRegion}: ${region}`,
            inherited: false,
          }
          ContentEditor.regions.push(spec)
          ContentEditor.regionsByKey[spec.key] = spec
        }
        region = key
      }

      $this.attr("data-region", region)
      attachMoveToRegionDropdown($this)
    })
  }

  function setBiggestOrdering($row) {
    const orderings = []
    orderMachine.find(".field-ordering input").each(function () {
      if (!Number.isNaN(+this.value)) orderings.push(+this.value)
    })
    const ordering = 10 + Math.max.apply(null, orderings)
    $row.find(".field-ordering input").val(ordering)
    $row.css("order", ordering)
  }

  function insertAdjacent(row, inline, after = false) {
    const inlineOrdering = +qs(".field-ordering input", inline).value
    const beforeRows = []
    const afterRows = []
    orderMachine.find(".inline-related:not(.empty-form)").each(function () {
      const thisOrderingField = qs(".field-ordering input", this)
      if (this !== row && !Number.isNaN(+thisOrderingField.value)) {
        if (
          after
            ? +thisOrderingField.value > inlineOrdering
            : +thisOrderingField.value >= inlineOrdering
        ) {
          afterRows.push([this, thisOrderingField])
        } else {
          beforeRows.push([this, thisOrderingField])
        }
      }
    })
    beforeRows.sort((a, b) => a[1].value - b[1].value)
    afterRows.sort((a, b) => a[1].value - b[1].value)
    let rows = [].concat(beforeRows)
    rows.push([row, qs(".field-ordering input", row)])
    rows = rows.concat(afterRows)
    for (let i = 0; i < rows.length; ++i) {
      const thisRow = rows[i]
      thisRow[1].value = thisRow[0].style.order = 10 * (1 + i)
    }
  }

  function hideInlinesFromOtherRegions() {
    const inlines = orderMachine.find(".inline-related:not(.empty-form)")
    inlines.addClass("content-editor-invisible")
    const shown = inlines.filter(
      `[data-region="${ContentEditor.currentRegion}"]`,
    )
    machineEmptyMessage.addClass("hidden")
    if (shown.length) {
      shown.removeClass("content-editor-invisible")
    } else {
      machineEmptyMessage.removeClass("hidden")
    }
    machineEmptyMessage.text(
      ContentEditor.messages[
        ContentEditor.regionsByKey[ContentEditor.currentRegion].inherited
          ? "emptyInherited"
          : "empty"
      ],
    )
  }

  const pluginInlineGroups = (function selectPluginInlineGroups() {
    const selector = []
    for (let i = 0; i < ContentEditor.plugins.length; i++) {
      selector.push(`#${ContentEditor.plugins[i].prefix}-group`)
    }
    return $(selector.join(", "))
  })()

  reorderInlines(pluginInlineGroups)
  pluginInlineGroups.hide()
  assignRegionDataAttribute()

  $(document).on(
    "click",
    ".order-machine-insert-target",
    function handleClick(e) {
      const isSelected = e.target.classList.contains("selected")
      hidePluginButtons()
      if (isSelected) {
        ContentEditor._insertBefore = null
      } else {
        e.target.classList.add("selected")

        const pos = e.target.getBoundingClientRect()
        const buttons = qs(".plugin-buttons")
        buttons.style.left = `${pos.left + window.scrollX + 30}px`

        const y =
          pos.top +
          window.scrollY +
          (e.target.classList.contains("last")
            ? 30 - buttons.getBoundingClientRect().height
            : 0)
        buttons.style.top = `${y}px`

        orderMachineWrapper.addClass("plugin-buttons-visible")

        ContentEditor._insertBefore = e.target.closest(".inline-related")
      }
    },
  )

  // Always move empty forms to the end, because new plugins are inserted
  // just before its empty form. Also, assign region data.
  function handleFormsetAdded($row, prefix) {
    // Not one of our managed inlines?
    if (!ContentEditor.pluginsByPrefix[prefix]) return

    $row.find(".field-region input").val(ContentEditor.currentRegion)
    $row.find("h3 .inline_label").text(ContentEditor.messages.newItem)
    $row.attr("data-region", ContentEditor.currentRegion)

    setBiggestOrdering($row)
    attachMoveToRegionDropdown($row)
    ensureDraggable($row)

    machineEmptyMessage.addClass("hidden")

    if (ContentEditor._insertBefore) {
      insertAdjacent($row[0], ContentEditor._insertBefore)
      ContentEditor._insertBefore = null
    }

    $(document).trigger("content-editor:activate", [$row])

    $row.find("input, select, textarea").first().focus()
  }

  function handleFormsetRemoved(prefix) {
    // Not one of our managed inlines?
    if (!ContentEditor.pluginsByPrefix[prefix]) return

    if (
      !orderMachine.find(
        `.inline-related[data-region="${ContentEditor.currentRegion}"]`,
      ).length
    ) {
      machineEmptyMessage.removeClass("hidden")
    }
    orderMachine
      .find(".inline-related.last-related:not(.empty-form)")
      .each(function () {
        $(document).trigger("content-editor:deactivate", [$(this)])
      })

    // As soon as possible, but not sooner (let the inline.js code run to the end first)
    setTimeout(() => {
      orderMachine
        .find(".inline-related.last-related:not(.empty-form)")
        .each(function () {
          $(document).trigger("content-editor:activate", [$(this)])
        })
    }, 0)
  }

  $(document).on("formset:added", (event, $row, formsetName) => {
    if (event.detail?.formsetName) {
      // Django >= 4.1
      handleFormsetAdded($(event.target), event.detail.formsetName)
    } else {
      handleFormsetAdded($row, formsetName)
    }
  })

  $(document).on("formset:removed", (event, $row, formsetName) => {
    if (event.detail?.formsetName) {
      // Django >= 4.1
      handleFormsetRemoved(event.detail.formsetName)
    } else {
      handleFormsetRemoved(formsetName)
    }
  })

  // Initialize tabs and currentRegion.
  ;(() => {
    const tabContainer = $(".tabs.regions")
    for (let i = 0; i < ContentEditor.regions.length; i++) {
      const t = document.createElement("h2")
      t.className = "tab"
      t.textContent = ContentEditor.regions[i].title
      t.setAttribute("data-region", ContentEditor.regions[i].key)
      tabContainer.append(t)
    }

    const tabs = tabContainer.find("h2")
    tabs.on("click", function () {
      ContentEditor.currentRegion = $(this).data("region")
      hideInlinesFromOtherRegions()
      tabs
        .removeClass("active")
        .filter(`[data-region="${ContentEditor.currentRegion}"]`)
        .addClass("active")

      // Make sure only allowed plugins are in select
      hideNotAllowedPluginButtons()
    })

    const collapseAllInput = $(".collapse-items input")
    collapseAllInput.on("change", function () {
      $(".order-machine .inline-related:not(.empty-form)").toggleClass(
        "collapsed",
        this.checked,
      )
      LS.set("collapseAll", this.checked)

      if (this.checked) {
        $(".order-machine .inline-related:not(.empty-form) .errorlist").each(
          function uncollapseInvalidFieldsets() {
            this.closest(".inline-related").classList.remove("collapsed")
          },
        )
      }
    })
    collapseAllInput.attr("checked", LS.get("collapseAll")).trigger("change")
  })()
  ;(function initializeInsertTargets() {
    qsa(".order-machine .inline-related").forEach((inline) => {
      const span = document.createElement("span")
      span.className = "order-machine-insert-target"
      inline.appendChild(span)
    })
  })()

  $(document)
    .on("content-editor:deactivate", (event, row) => {
      row.find("fieldset").addClass("content-editor-invisible")
    })
    .on("content-editor:activate", (event, row) => {
      row.find("fieldset").removeClass("content-editor-invisible")
    })

  // Hide fieldsets of to-be-deleted inlines.
  orderMachine.on(
    "click",
    ".delete>input[type=checkbox]",
    function toggleForDeletionClass() {
      this.closest(".inline-related").classList.toggle(
        "for-deletion",
        this.checked,
      )
      this.blur()
    },
  )

  orderMachine.on("click", ".inline-related>h3", function toggleCollapsed(e) {
    if (e.ctrlKey) {
      e.preventDefault()
      this.closest(".inline-related").classList.toggle("selected")
    } else if (
      !e.target.closest(".delete") &&
      !e.target.closest(".inline_move_to_region")
    ) {
      e.preventDefault()
      this.closest(".inline-related").classList.toggle("collapsed")
    }
  })

  // Since we pulled out the fieldsets from their containing module
  // we have to reimplement the Show/Hide toggle for order machine items.
  orderMachine.on("click", ".collapse-toggle", function toggleCollapsed(e) {
    // This only reaches us if it hasn't been handled by Django's collapse.js
    e.preventDefault()
    const fieldset = this.closest("fieldset")
    if (fieldset.classList.contains("collapsed")) {
      e.target.textContent = window.gettext("Hide")
      fieldset.classList.remove("collapsed")
    } else {
      e.target.textContent = window.gettext("Show")
      fieldset.classList.add("collapsed")
    }
  })

  // Unselect the currently selected plugin
  const hidePluginButtons = () => {
    orderMachineWrapper.removeClass("plugin-buttons-visible")
    for (const el of qsa(".order-machine-insert-target.selected")) {
      el.classList.remove("selected")
    }
  }

  document.body.addEventListener("keyup", (e) => {
    if (e.key === "Escape") hidePluginButtons()
  })

  document.body.addEventListener("click", (e) => {
    if (
      !e.target.closest(".order-machine-insert-target") &&
      !e.target.closest(".plugin-buttons")
    ) {
      hidePluginButtons()
    }
  })

  const saveEditorState = () => {
    SS.set(location.pathname, {
      region: ContentEditor.currentRegion,
      scrollY: window.scrollY,
      collapsed: qsa(
        ".order-machine .inline-related.collapsed:not(.empty-form)",
      ).map((inline) => {
        return qs(".field-ordering input", inline).value
      }),
    })
  }

  const restoreEditorState = () => {
    const tabs = $(".tabs.regions .tab")

    const state = location.hash.includes("restore")
      ? SS.get(location.pathname)
      : null
    if (state) {
      const tab = tabs.filter(`[data-region="${state.region}"]`)
      if (tab.length) {
        tab.click()
      } else {
        tabs.eq(0).click()
      }

      qsa(".order-machine .inline-related:not(.empty-form)").forEach(
        (inline) => {
          const collapsed = state.collapsed.includes(
            qs(".field-ordering input", inline).value,
          )
          inline.classList.toggle(
            "collapsed",
            collapsed && !inline.querySelector(".errorlist"),
          )
        },
      )

      setTimeout(() => {
        window.scrollTo(0, state.scrollY)
      }, 200)
    } else {
      tabs.eq(0).click()
    }
  }

  $("form").submit(function () {
    this.action = `${this.action.split("#")[0]}#restore`
    saveEditorState()
  })
  setTimeout(restoreEditorState, 1)

  ContentEditor.plugins.forEach((plugin) => {
    ContentEditor.addPluginButton(plugin.prefix, plugin.button)
  })

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
  `
  document.head.appendChild(style)

  if (!ContentEditor.allowChange) {
    $(".order-machine-wrapper").addClass("order-machine-readonly")
  }

  $(document).trigger("content-editor:ready")
})
