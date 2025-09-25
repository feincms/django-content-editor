/* global django,ContentEditor */
;(() => {
  /*
   * GENERAL UTILITIES
   */
  function qs(sel, ctx = document) {
    return ctx.querySelector(sel)
  }
  function qsa(sel, ctx = document) {
    return Array.from(ctx.querySelectorAll(sel))
  }

  function crel(tagName, attributes = null, children = []) {
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

  function buildDropdown(contents, title) {
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

  const safeStorage = (storage, prefix = "ContentEditor:") => {
    return {
      set(name, value) {
        try {
          storage.setItem(prefix + name, JSON.stringify(value))
        } finally {
          /* empty */
        }
      },
      get(name) {
        try {
          return JSON.parse(storage.getItem(prefix + name))
        } finally {
          /* empty */
        }
      },
    }
  }

  const LS = safeStorage(localStorage)

  /*
   * CONTENT EDITOR UTILITIES */

  const prepareContentEditorObject = ($) => {
    const _contentEditorContext = document.getElementById(
      "content-editor-context",
    ).textContent

    const ContentEditor = JSON.parse(_contentEditorContext)
    Object.assign(ContentEditor, {
      declaredRegions: [...ContentEditor.regions],
      pluginsByPrefix: Object.fromEntries(
        ContentEditor.plugins.map((plugin) => [plugin.prefix, plugin]),
      ),
      regionsByKey: Object.fromEntries(
        ContentEditor.regions.map((region) => [region.key, region]),
      ),
      hasSections: ContentEditor.plugins.some((plugin) => plugin.sections),

      addContent(prefix) {
        $(`#${prefix}-group .add-row a`).click()
      },
    })

    return ContentEditor
  }

  function addOrderMachine($) {
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
      <div class="plugin-buttons">
      </div>
    </div>
    <p class="order-machine-help">${ContentEditor.messages.selectMultiple}</p>
    `,
    )
  }

  function defineContentEditorStyles() {
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
.order-machine .inline-related:not(:where(${ContentEditor.declaredRegions.map((region) => `[data-region="${region.key}"]`).join(", ")})) .inline_move_to_region {
  border-color: red;
}
  `
    document.head.append(style)
  }

  function addPluginIconsToInlines() {
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

  /*
   * CONTENT EDITOR INITIALIZATION
   */

  window.ContentEditor = prepareContentEditorObject(django.jQuery)

  django.jQuery(($) => {
    ContentEditor.addPluginButton = (
      prefix,
      iconHTML,
      initializing = false,
    ) => {
      const plugin = ContentEditor.pluginsByPrefix[prefix]
      if (!plugin) return

      const button = document.createElement("a")
      button.dataset.pluginPrefix = plugin.prefix
      button.className = "plugin-button"
      button.title = plugin.title
      button.role = "button"
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

      if (!initializing) {
        updatePluginButtonsVisibility()
      }
    }

    addOrderMachine($)
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
        } finally {
          // IE11 needs this.
        }

        cancelMouseMonitor = startMouseMonitor()
      })
      inline.addEventListener("dragend", () => {
        $(".fs-dragging").removeClass("fs-dragging")
        $(".fs-dragover").removeClass("fs-dragover")
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
          for (const inline of qsa(".order-machine .inline-related.selected")) {
            selectSection(inline)
          }

          const inline = e.target.closest(".inline-related")
          const toMove = qsa(".order-machine .inline-related.selected").map(
            (inline) => [inline, +inline.style.order],
          )
          const orAfter = shouldInsertAfter(inline, e.clientY)
          toMove.sort((a, b) => (orAfter ? -1 : 1) * (a[1] - b[1]))
          for (const row of toMove) {
            insertAdjacent(row[0], inline, orAfter)
            row[0].classList.remove("selected")
          }
          window.__fs_dragging = null

          updateSections()
        }
      })

      arg.find(">h3, .card-title").attr("draggable", true) // Default admin, Jazzmin
      arg.addClass("fs-draggable")
    }

    function findInlinesInOrder(region = null) {
      region = region || ContentEditor.currentRegion
      const inlines = orderMachine.find(
        `.inline-related:not(.empty-form)[data-region="${region}`,
      )
      inlines.sort((a, b) => a.style.order - b.style.order)
      return inlines
    }

    let sectionsMap = new Map()
    let childrenMap = null

    function updateSections() {
      /* Bail out early if we wouldn't do nothing anyway */
      if (!ContentEditor.hasSections) return

      const inlines = findInlinesInOrder()

      let indent = 0
      let nextIndent
      const stack = []
      const wrapper = orderMachineWrapper[0]
      const wrapperRect = wrapper.getBoundingClientRect()

      const newSectionsMap = new Map()
      const newChildrenMap = new Map()
      const topLevel = []

      function closeSection(atInline) {
        const fromInline = stack.pop()
        const from = fromInline.getBoundingClientRect()
        const until = atInline.getBoundingClientRect()

        let div = sectionsMap.get(fromInline)
        if (div) {
          sectionsMap.delete(fromInline)
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
          indent + ContentEditor.pluginsByPrefix[prefix].sections,
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

      for (const section of sectionsMap.values()) {
        section.remove()
      }

      sectionsMap = newSectionsMap
      childrenMap = newChildrenMap

      /* Top level inline's sections should be hidden if the inline is collapsed */
      for (const inline of topLevel) {
        hideSection(inline, inline.classList.contains("collapsed"))
      }
    }

    if (ContentEditor.hasSections) {
      /* From https://www.freecodecamp.org/news/javascript-debounce-example/ */
      function debounce(func, timeout = 300) {
        let timer
        return (...args) => {
          clearTimeout(timer)
          timer = setTimeout(() => {
            func.apply(this, args)
          }, timeout)
        }
      }
      const debouncedIndentInlines = debounce(updateSections, 10)

      const resizeObserver = new ResizeObserver((_entries) => {
        debouncedIndentInlines()
      })
      resizeObserver.observe(orderMachineWrapper[0])
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
        const span = document.createElement("span")
        span.className = "order-machine-insert-target"
        this.appendChild(span)

        // Be extra careful because multiple fields could be on one line
        qs(`.field-ordering input[name$="-ordering"]`, this).classList.add(
          "order-machine-ordering",
        )
        qs(`.field-region input[name$="-region"]`, this).classList.add(
          "order-machine-region",
        )

        const ordering = $(".order-machine-ordering", this).val() || 1e9
        this.style.order = ordering
        ensureDraggable($(this))
      })

      inlines.not(".empty-form").each(function () {
        $(document).trigger("content-editor:activate", [$(this)])
      })
    }

    function pluginInCurrentRegion(prefix) {
      if (!ContentEditor.regions.length) return false

      const plugin = ContentEditor.pluginsByPrefix[prefix]
      const regions = plugin.regions || Object.keys(ContentEditor.regionsByKey)
      return regions.includes(ContentEditor.currentRegion)
    }

    // Hide not allowed plugin buttons
    // If buttons only checks this buttons, else checks all
    function updatePluginButtonsVisibility() {
      const buttons = qsa(".plugin-buttons .plugin-button")
      let visible = 0

      for (const button of buttons) {
        const plugin = button.dataset.pluginPrefix
        const isVisible =
          !plugin ||
          (pluginInCurrentRegion(plugin) &&
            !/^_unknown_/.test(ContentEditor.currentRegion))
        button.classList.toggle("content-editor-hide", !isVisible)
        visible += isVisible ? 1 : 0
      }

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
    function getPluginTypeFromId(id) {
      let ret = null
      for (const plugin of ContentEditor.plugins) {
        if (
          id.startsWith(plugin.prefix) &&
          (!ret || plugin.prefix.length > ret.prefix.length)
        ) {
          ret = plugin
        }
      }
      return ret
    }

    // Pre map plugin regions
    const pluginRegions = Object.fromEntries(
      ContentEditor.plugins.map((plugin) => [plugin.prefix, plugin.regions]),
    )
    function attachMoveToRegionDropdown($inline) {
      // Filter allowed regions
      const inlineType = getPluginTypeFromId($inline.attr("id"))?.type
      const regions = []
      for (const region of ContentEditor.regions) {
        if (
          (!inlineType ||
            !pluginRegions[inlineType] ||
            $.inArray(region.key, pluginRegions[inlineType]) >= 0) &&
          !/^_unknown_/.test(region.key)
        ) {
          regions.push(region)
        }
      }

      const isCurrentUnknown = /^_unknown_/.test($inline.data("region"))

      if (regions.length < 2 && !isCurrentUnknown) {
        return
      }

      const select = buildDropdown(
        regions,
        isCurrentUnknown ? ContentEditor.messages.unknownRegion : "",
      )
      const regionInput = $inline.find(".order-machine-region")

      select.className = "inline_move_to_region"
      select.value = isCurrentUnknown ? "" : regionInput.val()
      $inline.find("> h3 .inline_label").after(select)

      select.addEventListener("change", () => {
        if (select.value) {
          $inline.attr("data-region", select.value)
          regionInput.val(select.value)
          hideInlinesFromOtherRegions()
          setBiggestOrdering($inline)
          reorderInlines()
        }
      })
    }

    // Assing data-region to all inlines.
    // We also want to the data attribute to be visible to selectors (that's why we're using $.attr)
    function assignRegionDataAttribute() {
      orderMachine.find(".inline-related:not(.empty-form)").each(function () {
        const $this = $(this)
        // Try input first and fall back to the readonly presentation
        let region =
          $this.find(".order-machine-region").val() ||
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
      orderMachine.find(".order-machine-ordering").each(function () {
        if (!Number.isNaN(+this.value)) orderings.push(+this.value)
      })
      const ordering = 10 + Math.max.apply(null, orderings)
      $row.find(".order-machine-ordering").val(ordering)
      $row.css("order", ordering)
    }

    function insertAdjacent(row, inline, after = false) {
      const inlineOrdering = +qs(".order-machine-ordering", inline).value
      const beforeRows = []
      const afterRows = []
      orderMachine.find(".inline-related:not(.empty-form)").each(function () {
        const thisOrderingField = qs(".order-machine-ordering", this)
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
      rows.push([row, qs(".order-machine-ordering", row)])
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

    const pluginInlineGroups = $(
      ContentEditor.plugins
        .map((plugin) => `#${plugin.prefix}-group`)
        .join(", "),
    )

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
          const wrapperRect = orderMachineWrapper[0].getBoundingClientRect()
          const buttons = qs(".plugin-buttons")
          buttons.style.left = `${pos.left - wrapperRect.left + 30}px`

          const y =
            pos.top -
            wrapperRect.top +
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

      $row.find(".order-machine-region").val(ContentEditor.currentRegion)
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

      updateSections()
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

        updateSections()
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

    $(document).on("formset:removed", (event, _$row, formsetName) => {
      if (event.detail?.formsetName) {
        // Django >= 4.1
        handleFormsetRemoved(event.detail.formsetName)
      } else {
        handleFormsetRemoved(formsetName)
      }
    })

    function collapseInline(inline, collapsed = true) {
      inline.classList.toggle("collapsed", collapsed)
      if (!collapsed) {
        /* Could have been hidden through sections */
        inline.classList.remove("order-machine-hide")
      }
      hideSection(inline, collapsed)
    }

    function hideSection(inline, hide = true) {
      const children = childrenMap?.get(inline)
      if (children) {
        for (const child of children) {
          child.classList.toggle("content-editor-hide", hide)
          if (hide || !child.classList.contains("collapsed")) {
            /* Hiding is recursive, showing uncollapsed child sections too */
            hideSection(child, hide)
          }
        }
      }
    }

    function selectSection(inline) {
      const children = childrenMap?.get(inline)
      if (children) {
        for (const child of children) {
          child.classList.add("selected")
          selectSection(child)
        }
      }
    }
    // Initialize tabs and currentRegion.
    ;(() => {
      const tabContainer = $(".tabs.regions")
      for (const region of ContentEditor.regions) {
        const t = document.createElement("h2")
        t.className = "tab"
        t.textContent = region.title
        t.setAttribute("data-region", region.key)
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

        updatePluginButtonsVisibility()
        updateSections()
      })
    })()

    function initializeCollapseAll() {
      const collapseAllInput = $(".collapse-items input")
      collapseAllInput.on("change", function () {
        for (const inline of qsa(
          ".order-machine .inline-related:not(.empty-form)",
        )) {
          collapseInline(inline, this.checked)
        }
        LS.set("collapseAll", this.checked)

        if (this.checked) {
          $(".order-machine .inline-related:not(.empty-form) .errorlist").each(
            function uncollapseInvalidFieldsets() {
              /* XXX handle sections */
              this.closest(".inline-related").classList.remove("collapsed")
            },
          )
        }
      })
      collapseAllInput.attr("checked", LS.get("collapseAll")).trigger("change")
    }

    $(document)
      .on("content-editor:deactivate", (_event, row) => {
        row.find("fieldset").addClass("content-editor-invisible")
      })
      .on("content-editor:activate", (_event, row) => {
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
        const inline = this.closest(".inline-related")
        collapseInline(inline, !inline.classList.contains("collapsed"))
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
      const u = new URLSearchParams()
      u.append("region", ContentEditor.currentRegion)
      u.append("scrollY", Math.floor(window.scrollY))
      u.append(
        "collapsed",
        qsa(
          ".order-machine .inline-related.collapsed:not(.empty-form) .order-machine-ordering",
        )
          .map((input) => input.value)
          .join(","),
      )
      return u.toString()
    }

    const restoreEditorState = () => {
      const tabs = $(".tabs.regions .tab")

      const u = new URLSearchParams(location.hash.replace(/^#/, ""))
      if (u.size) {
        const region = u.get("region")
        const scrollY = u.get("scrollY") || 0
        const collapsed = (u.get("collapsed") || "").split(",")

        for (const inline of qsa(
          ".order-machine .inline-related:not(.empty-form)",
        )) {
          const wasCollapsed = collapsed.includes(
            qs(".order-machine-ordering", inline).value,
          )
          /* XXX handle sections */
          inline.classList.toggle(
            "collapsed",
            wasCollapsed && !inline.querySelector(".errorlist"),
          )
        }

        const tab = tabs.filter(`[data-region="${region}"]`)
        if (tab.length) {
          tab.click()
        } else {
          tabs.eq(0).click()
        }

        initializeCollapseAll()

        if (scrollY) {
          setTimeout(() => {
            window.scrollTo(0, scrollY)
          }, 200)
        }
      } else {
        tabs.eq(0).click()
        initializeCollapseAll()
      }
    }

    $("form").submit(function () {
      // Use the hash because it's still there after the save-and-continue redirect
      this.action = `${this.action.split("#")[0]}#${saveEditorState()}`
    })

    setTimeout(restoreEditorState, 1)

    for (const plugin of ContentEditor.plugins) {
      ContentEditor.addPluginButton(plugin.prefix, plugin.button, true)
    }

    if (!ContentEditor.allowChange) {
      $(".order-machine-wrapper").addClass("order-machine-readonly")
    }

    defineContentEditorStyles()

    /*
     * CLONING
     */
    function addCloningButton() {
      const button = document.createElement("a")
      button.className = "plugin-button"
      button.innerHTML = `
        <span class="plugin-button-icon"><span class="material-icons">content_copy</span></span>
        <span class="plugin-button-title">${ContentEditor.messages.clone}</span>
      `

      pluginButtons.append(button)

      button.addEventListener("click", () => {
        hidePluginButtons()

        const dialog = crel("dialog", { className: "clone" })
        dialog.append(
          crel("h2", {
            textContent: ContentEditor.messages.clone,
          }),
        )

        const fieldsets = []

        for (const region of ContentEditor.declaredRegions) {
          if (region.key === ContentEditor.currentRegion) {
            continue
          }

          const inlines = findInlinesInOrder(region.key)
            .toArray()
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

          contents.append(
            crel("label", {}, [checkbox, ContentEditor.messages.selectAll]),
          )

          const stack = [crel("ul", { "data-indent": 0 })]
          let indent = 0,
            nextIndent

          for (const inline of inlines) {
            const { prefix, model } = getPluginTypeFromId(inline.id)
            nextIndent = Math.max(
              0,
              indent + ContentEditor.pluginsByPrefix[prefix].sections,
            )

            const checkbox = crel("input", {
              type: "checkbox",
              name: "_clone",
              value: `${model}:${qs("input[type=hidden][name$='-id']", inline).value}`,
            })

            checkbox.addEventListener("click", (e) => {
              const checkboxes = qsa(
                "ul input[type=checkbox]",
                e.target.closest("li"),
              )
              for (const cb of checkboxes) {
                cb.checked = e.target.checked
              }
            })

            const label = crel("label", {}, [
              checkbox,
              ...qsa("h3 .material-icons, h3 b, h3 .inline_label", inline).map(
                (node) => node.cloneNode(true),
              ),
            ])

            stack[indent].append(crel("li", {}, [label]))

            while (indent < nextIndent) {
              const list = crel("ul", { "data-indent": indent + 1 })
              stack[indent].children[stack[indent].children.length - 1].append(
                list,
              )
              // qs("li:last-child", stack[indent]).append(list)
              stack[indent + 1] = list
              ++indent
            }

            indent = nextIndent
          }

          contents.append(stack[0])
          fieldsets.push(fieldset)
        }

        if (!fieldsets.length) {
          dialog.append(
            crel("p", { textContent: ContentEditor.messages.noClone }),
          )
        } else if (fieldsets.length === 1) {
          fieldsets[0].open = true
        }
        dialog.append(...fieldsets)

        const saveButton = qs("input[name=_continue]").cloneNode(true)

        const cancelButton = crel("button", {
          className: "button",
          textContent: window.gettext("Cancel"),
        })
        cancelButton.addEventListener("click", () => {
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
            value: ContentEditor.currentRegion,
          }),
          orderingField,
        )

        dialog.append(
          crel("div", { className: "submit-row" }, [saveButton, cancelButton]),
        )

        const bumpOrdering = () => {
          const checked = qsa("input[type=checkbox]:checked", dialog).length
          const inlines = findInlinesInOrder()
          let order = 10
          let orderingFieldSet = false

          for (const inline of inlines) {
            if (inline === ContentEditor._insertBefore) {
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
      })
    }

    if (ContentEditor.declaredRegions.length > 1) {
      addCloningButton()
    }

    $(document).trigger("content-editor:ready")
  })
})()
