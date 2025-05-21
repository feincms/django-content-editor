/* global django */

const $ = django.jQuery

/**
 * Content Editor - A Django admin plugin for editing content in a flexible,
 * structured way with regions, sections, and plugins.
 */
;(() => {
  // =========================================================================
  // CONSTANTS AND CONFIGURATION
  // =========================================================================

  const MESSAGES = {
    EMPTY: "empty",
    EMPTY_INHERITED: "emptyInherited",
    NO_REGIONS: "noRegions",
    NO_PLUGINS: "noPlugins",
    NEW_ITEM: "newItem",
    SELECT_MULTIPLE: "selectMultiple",
    COLLAPSE_ALL: "collapseAll",
    UNCOLLAPSE_ALL: "uncollapseAll",
    FOR_DELETION: "forDeletion",
    UNKNOWN_REGION: "unknownRegion",
  }

  const SELECTORS = {
    CONTENT_EDITOR_CONTEXT: "#content-editor-context",
    PLUGIN_BUTTONS: ".plugin-buttons",
    ORDER_MACHINE: ".order-machine",
    ORDER_MACHINE_WRAPPER: ".order-machine-wrapper",
    INLINE_RELATED: ".inline-related",
    TABS_REGIONS: ".tabs.regions",
    INSERT_TARGET: ".order-machine-insert-target",
    COLLAPSE_ITEMS: ".collapse-items input",
    ORDERING_INPUT: ".order-machine-ordering",
    REGION_INPUT: ".order-machine-region",
  }

  const STORAGE_KEYS = {
    COLLAPSE_ALL: "collapseAll",
    EDITOR_STATE: location.pathname,
  }

  const CSS_CLASSES = {
    ACTIVE: "active",
    COLLAPSED: "collapsed",
    SELECTED: "selected",
    HIDDEN: "hidden",
    INVISIBLE: "content-editor-invisible",
    HIDE: "content-editor-hide",
    DRAGGABLE: "fs-draggable",
    DRAGGING: "fs-dragging",
    DRAGOVER: "fs-dragover",
    DRAGOVER_AFTER: "fs-dragover--after",
    FOR_DELETION: "for-deletion",
    LAST_RELATED: "last-related",
    EMPTY_FORM: "empty-form",
    PLUGIN_BUTTONS_VISIBLE: "plugin-buttons-visible",
    ORDER_MACHINE_HIDE_INSERT_TARGETS: "order-machine-hide-insert-targets",
    ORDER_MACHINE_READONLY: "order-machine-readonly",
  }

  const STORAGE_PREFIX = "ContentEditor:"

  // =========================================================================
  // UTILITY MODULES
  // =========================================================================

  /**
   * DOM utility functions
   */
  const DOM = {
    /**
     * Query selector shorthand - returns the first matching element
     * @param {string} selector - CSS selector
     * @param {Element|Document} context - Element to search within
     * @returns {Element|null} - The first matching element or null
     */
    qs(selector, context = document) {
      return context.querySelector(selector)
    },

    /**
     * Query selector all shorthand - returns array of matching elements
     * @param {string} selector - CSS selector
     * @param {Element|Document} context - Element to search within
     * @returns {Element[]} - Array of matching elements
     */
    qsa(selector, context = document) {
      return Array.from(context.querySelectorAll(selector))
    },

    /**
     * Creates and attaches a DOM element
     * @param {string} tag - Element tag name
     * @param {Object} attributes - Key-value pairs of attributes
     * @param {string|Node|Array} [content] - Text content, child node, or array of children
     * @param {Element} [parent] - Optional parent to append to
     * @returns {Element} - The created element
     */
    createElement(tag, attributes = {}, content = null, parent = null) {
      const element = document.createElement(tag)

      // Set attributes
      Object.entries(attributes).forEach(([key, value]) => {
        if (key === "className") {
          element.className = value
        } else if (key === "dataset") {
          Object.entries(value).forEach(([dataKey, dataValue]) => {
            element.dataset[dataKey] = dataValue
          })
        } else if (key === "style" && typeof value === "object") {
          Object.entries(value).forEach(([prop, val]) => {
            element.style[prop] = val
          })
        } else {
          element.setAttribute(key, value)
        }
      })

      // Set content
      if (content !== null) {
        if (Array.isArray(content)) {
          content.forEach((child) => {
            if (child instanceof Node) {
              element.appendChild(child)
            } else {
              element.appendChild(document.createTextNode(String(child)))
            }
          })
        } else if (content instanceof Node) {
          element.appendChild(content)
        } else {
          element.textContent = String(content)
        }
      }

      // Append to parent if provided
      if (parent instanceof Element) {
        parent.appendChild(element)
      }

      return element
    },

    /**
     * Safely injects an HTML template
     * @param {string} html - HTML string to parse
     * @returns {DocumentFragment} - Document fragment with parsed HTML
     */
    createFromHTML(html) {
      const template = document.createElement("template")
      template.innerHTML = html.trim()
      return template.content
    },

    /**
     * Get computed rect information about an element
     * @param {Element} element - The element to get info for
     * @returns {Object} - Element dimensions and position
     */
    getRect(element) {
      return element.getBoundingClientRect()
    },

    /**
     * Tests if an element or its parents match a selector
     * @param {Element} element - Element to test
     * @param {string} selector - CSS selector to match against
     * @returns {Element|null} - Matching element or null
     */
    closest(element, selector) {
      return element.closest(selector)
    },

    /**
     * Toggles multiple classes on an element
     * @param {Element} element - Element to modify
     * @param {Object} classToggles - Object with className->boolean pairs
     */
    toggleClasses(element, classToggles) {
      Object.entries(classToggles).forEach(([className, shouldAdd]) => {
        element.classList.toggle(className, shouldAdd)
      })
    },
  }

  /**
   * Storage module - handles safe interaction with localStorage and sessionStorage
   */
  const Storage = {
    /**
     * Creates a safe storage wrapper
     * @param {Storage} storage - The storage object (localStorage or sessionStorage)
     * @param {string} prefix - Key prefix
     * @returns {Object} - Storage helper object
     */
    createSafeStorage(storage, prefix = STORAGE_PREFIX) {
      return {
        /**
         * Set a value in storage
         * @param {string} name - Key name
         * @param {*} value - Value to store (will be JSON stringified)
         */
        set(name, value) {
          try {
            storage.setItem(prefix + name, JSON.stringify(value))
          } catch (error) {
            console.warn(`Failed to set ${name} in storage:`, error)
          }
        },

        /**
         * Get a value from storage
         * @param {string} name - Key name
         * @returns {*} - Parsed value or null if not found
         */
        get(name) {
          try {
            const value = storage.getItem(prefix + name)
            return value ? JSON.parse(value) : null
          } catch (error) {
            console.warn(`Failed to get ${name} from storage:`, error)
            return null
          }
        },
      }
    },

    // Storage instances
    local: null, // Will be initialized later
    session: null, // Will be initialized later
  }

  /**
   * Debounce utility - limits how often a function can be called
   * @param {Function} func - Function to debounce
   * @param {number} timeout - Debounce timeout in ms
   * @returns {Function} - Debounced function
   */
  function debounce(func, timeout = 300) {
    let timer
    const debounced = function (...args) {
      clearTimeout(timer)
      timer = setTimeout(() => {
        func.apply(this, args)
      }, timeout)
    }

    // Add a method to cancel pending execution
    debounced.cancel = () => {
      clearTimeout(timer)
      timer = null
    }

    return debounced
  }

  // =========================================================================
  // CORE MODULES
  // =========================================================================

  /**
   * Regions module - manages region tabs and switching between regions
   */
  const RegionsManager = {
    currentRegion: "",
    regionsByKey: {},
    declaredRegions: [],

    /**
     * Initialize regions from the ContentEditor context
     * @param {Array} regions - Array of region definitions
     */
    initialize(regions) {
      this.declaredRegions = [...regions]
      this.regionsByKey = Object.fromEntries(
        regions.map((region) => [region.key, region]),
      )
    },

    /**
     * Create region tabs in the UI
     * @param {Element} tabContainer - Container element for tabs
     * @param {Function} onRegionChange - Callback when region changes
     */
    createRegionTabs(tabContainer, onRegionChange) {
      const $tabContainer = $(tabContainer)

      // Create tabs for each region
      this.declaredRegions.forEach((region) => {
        const _tab = DOM.createElement(
          "h2",
          {
            className: "tab",
            dataset: { region: region.key },
          },
          region.title,
          tabContainer,
        )
      })

      // Handle tab clicks
      const tabs = $tabContainer.find("h2")
      tabs.on("click", function () {
        const region = $(this).data("region")
        RegionsManager.setCurrentRegion(region)

        // Update UI
        tabs
          .removeClass(CSS_CLASSES.ACTIVE)
          .filter(`[data-region="${region}"]`)
          .addClass(CSS_CLASSES.ACTIVE)

        // Call the callback
        if (typeof onRegionChange === "function") {
          onRegionChange(region)
        }
      })
    },

    /**
     * Set the current active region
     * @param {string} region - Region key
     */
    setCurrentRegion(region) {
      this.currentRegion = region
    },

    /**
     * Check if a region is known/registered
     * @param {string} regionKey - Region key to check
     * @returns {boolean} - True if the region is known
     */
    isKnownRegion(regionKey) {
      return !!this.regionsByKey[regionKey]
    },

    /**
     * Register an unknown region (for backward compatibility)
     * @param {string} regionKey - Original unrecognized region key
     * @param {string} title - Display title for the unknown region
     * @returns {string} - The new region key (_unknown_prefix)
     */
    registerUnknownRegion(regionKey, title) {
      const newKey = `_unknown_${regionKey}`

      if (!this.regionsByKey[newKey]) {
        const spec = {
          key: newKey,
          title: title,
          inherited: false,
        }
        this.declaredRegions.push(spec)
        this.regionsByKey[newKey] = spec
      }

      return newKey
    },

    /**
     * Check if a region is inherited
     * @param {string} regionKey - Region key to check
     * @returns {boolean} - True if the region is inherited
     */
    isInheritedRegion(regionKey) {
      return this.regionsByKey[regionKey]?.inherited || false
    },
  }

  /**
   * Plugins module - manages plugin registration and button creation
   */
  const PluginsManager = {
    plugins: [],
    pluginsByPrefix: {},
    hasSections: false,

    /**
     * Initialize plugins from the ContentEditor context
     * @param {Array} plugins - Array of plugin definitions
     */
    initialize(plugins) {
      this.plugins = plugins
      this.pluginsByPrefix = Object.fromEntries(
        plugins.map((plugin) => [plugin.prefix, plugin]),
      )
      this.hasSections = plugins.some((plugin) => plugin.sections)

      // Pre-map plugin regions for quick lookup
      this.pluginRegions = Object.fromEntries(
        plugins.map((plugin) => [plugin.prefix, plugin.regions]),
      )
    },

    /**
     * Check if a plugin is allowed in the current region
     * @param {string} prefix - Plugin prefix
     * @param {string} currentRegion - Current active region
     * @returns {boolean} - True if plugin is allowed in region
     */
    isPluginAllowedInRegion(prefix, currentRegion) {
      if (!this.pluginsByPrefix[prefix]) return false
      if (!RegionsManager.declaredRegions.length) return false

      const plugin = this.pluginsByPrefix[prefix]
      const regions = plugin.regions || Object.keys(RegionsManager.regionsByKey)

      return (
        regions.includes(currentRegion) && !/^_unknown_/.test(currentRegion)
      )
    },

    /**
     * Create a button for adding a plugin
     * @param {string} prefix - Plugin prefix
     * @param {string} iconHTML - Optional custom icon HTML
     * @returns {Element|null} - The button element or null if plugin not found
     */
    createPluginButton(prefix, iconHTML) {
      const plugin = this.pluginsByPrefix[prefix]
      if (!plugin) return null

      // Create button
      const button = DOM.createElement("a", {
        className: "plugin-button",
        title: plugin.title,
        dataset: { pluginPrefix: plugin.prefix },
      })

      // Create icon
      const icon = DOM.createElement(
        "span",
        {
          className: "plugin-button-icon",
        },
        null,
        button,
      )

      icon.innerHTML =
        iconHTML || '<span class="material-icons">extension</span>'
      if (plugin.color) {
        icon.style.color = plugin.color
      }

      // Create title
      DOM.createElement(
        "span",
        {
          className: "plugin-button-title",
        },
        plugin.title,
        button,
      )

      return button
    },

    /**
     * Get the section depth change for a plugin
     * @param {string} prefix - Plugin prefix
     * @returns {number} - Section depth change (usually 0 or 1)
     */
    getSectionDepthChange(prefix) {
      return this.pluginsByPrefix[prefix]?.sections || 0
    },
  }

  /**
   * Content Editor module - core functionality for managing content items
   */
  const ContentEditor = {
    allowChange: true,
    messages: {},
    _insertBefore: null,

    /**
     * Initialize the ContentEditor from context data
     * @param {Object} context - JSON parsed context from the page
     */
    initialize(context) {
      // Copy properties from context
      Object.assign(this, context)

      // Initialize sub-modules
      RegionsManager.initialize(this.regions)
      PluginsManager.initialize(this.plugins)

      // Initialize storage
      Storage.local = Storage.createSafeStorage(localStorage)
      Storage.session = Storage.createSafeStorage(sessionStorage)
    },

    /**
     * Add a new content item
     * @param {string} prefix - Plugin prefix
     */
    addContent(prefix) {
      $(`#${prefix}-group .add-row a`).click()
    },

    /**
     * Create UI for all plugin buttons
     * @param {Element} container - Container for plugin buttons
     */
    createAllPluginButtons(container) {
      this.plugins.forEach((plugin) => {
        const button = PluginsManager.createPluginButton(
          plugin.prefix,
          plugin.button,
        )
        if (button) {
          container.appendChild(button)

          // Add click handler
          button.addEventListener("click", (e) => {
            e.preventDefault()
            this.addContent(plugin.prefix)
            UIManager.hidePluginButtons()
          })
        }
      })
    },
  }

  /**
   * Sections Manager - handles section-based grouping and visualization
   */
  const SectionsManager = {
    sectionsMap: new Map(),
    childrenMap: null,

    /**
     * Update section visualization based on current items
     * @param {Element} wrapper - Container element
     * @param {NodeList|Array} inlines - Collection of inline items
     */
    updateSections(wrapper, inlines) {
      // Bail out early if no sections to manage
      if (!PluginsManager.hasSections) return

      const wrapperRect = DOM.getRect(wrapper)

      // Setup for section management
      let indent = 0
      let nextIndent
      const stack = []
      const newSectionsMap = new Map()
      const newChildrenMap = new Map()
      const topLevel = []

      // Function to close a section
      const closeSection = (atInline) => {
        const fromInline = stack.pop()
        const from = DOM.getRect(fromInline)
        const until = DOM.getRect(atInline)

        // Get or create section element
        let div = this.sectionsMap.get(fromInline)
        if (div) {
          this.sectionsMap.delete(fromInline)
        } else {
          div = DOM.createElement(
            "div",
            {
              className: "order-machine-section",
            },
            null,
            wrapper,
          )
        }

        // Set positioning
        newSectionsMap.set(fromInline, div)
        div.style.top = `${from.top - wrapperRect.top - 5}px`
        div.style.left = `${from.left - wrapperRect.left - 5}px`
        div.style.right = "5px"
        div.style.height = `${until.top - from.top + until.height + 10}px`

        // Handle visibility
        div.classList.toggle(
          CSS_CLASSES.HIDE,
          fromInline.classList.contains(CSS_CLASSES.COLLAPSED),
        )
      }

      // Process each inline element
      Array.from(inlines).forEach((inline) => {
        const prefix = inline.id.replace(/-[0-9]+$/, "")
        inline.style.marginInlineStart = `${30 * indent}px`
        nextIndent = Math.max(
          0,
          indent + PluginsManager.getSectionDepthChange(prefix),
        )

        // Track parent-child relationships
        if (stack.length) {
          newChildrenMap.get(stack[stack.length - 1]).push(inline)
        } else {
          topLevel.push(inline)
        }

        // Handle increasing section depth
        while (indent < nextIndent) {
          stack.push(inline)
          ++indent
          newChildrenMap.set(inline, [])
        }

        // Handle decreasing section depth
        while (indent > nextIndent) {
          closeSection(inline)
          --indent
        }

        indent = nextIndent
      })

      // Close any remaining open sections
      while (stack.length) {
        closeSection(inlines[inlines.length - 1])
      }

      // Remove any old sections
      for (const section of this.sectionsMap.values()) {
        section.remove()
      }

      // Update section maps
      this.sectionsMap = newSectionsMap
      this.childrenMap = newChildrenMap

      // Update visibility for top level sections
      topLevel.forEach((inline) => {
        this.hideSection(
          inline,
          inline.classList.contains(CSS_CLASSES.COLLAPSED),
        )
      })
    },

    /**
     * Hide or show a section and its children
     * @param {Element} inline - The inline element
     * @param {boolean} hide - Whether to hide the section
     */
    hideSection(inline, hide = true) {
      const children = this.childrenMap?.get(inline)
      if (!children || !children.length) return

      for (const child of children) {
        // Skip if child is null or not an element
        if (!child || !(child instanceof Element)) continue

        child.classList.toggle(CSS_CLASSES.HIDE, hide)

        // Process child sections: hide all when hiding, only show uncollapsed when showing
        if (hide || !child.classList.contains(CSS_CLASSES.COLLAPSED)) {
          // Hiding is recursive, showing uncollapsed child sections too
          this.hideSection(child, hide)
        }
      }
    },

    /**
     * Select a section and all its children
     * @param {Element} inline - The inline element
     */
    selectSection(inline) {
      const children = this.childrenMap?.get(inline)
      if (children) {
        children.forEach((child) => {
          child.classList.add(CSS_CLASSES.SELECTED)
          this.selectSection(child)
        })
      }
    },
  }

  /**
   * Drag and Drop Manager - handles drag and drop operations for content items
   */
  const DragDropManager = {
    dragging: null, // Currently dragged element
    monitorCleanup: null, // Function to clean up mouse monitoring

    /**
     * Make an inline element draggable
     * @param {Element} inline - The inline element to make draggable
     */
    makeDraggable(inline) {
      if (
        !ContentEditor.allowChange ||
        inline.classList.contains(CSS_CLASSES.EMPTY_FORM) ||
        inline.classList.contains(CSS_CLASSES.DRAGGABLE)
      ) {
        return
      }

      inline.addEventListener("dragstart", this.handleDragStart.bind(this))
      inline.addEventListener("dragend", this.handleDragEnd.bind(this))
      inline.addEventListener("dragover", this.handleDragOver.bind(this), true)
      inline.addEventListener("drop", this.handleDrop.bind(this))

      // Add draggable attribute to the header
      const header = inline.querySelector("h3, .card-title")
      if (header) {
        header.setAttribute("draggable", true)
      }

      inline.classList.add(CSS_CLASSES.DRAGGABLE)
    },

    /**
     * Handle drag start event
     * @param {DragEvent} e - Drag event
     */
    handleDragStart(e) {
      // Only handle events from draggable elements
      if (!e.target.closest("h3[draggable]")) return

      this.dragging = e.target.closest(SELECTORS.INLINE_RELATED)
      this.dragging.classList.add(CSS_CLASSES.DRAGGING)
      this.dragging.classList.add(CSS_CLASSES.SELECTED)

      e.dataTransfer.dropEffect = "move"
      e.dataTransfer.effectAllowed = "move"
      try {
        e.dataTransfer.setData("text/plain", "")
      } catch (_error) {
        // IE11 needs this empty catch
      }

      this.monitorCleanup = this.startMouseMonitor()
    },

    /**
     * Handle drag end event
     */
    handleDragEnd() {
      $(`.${CSS_CLASSES.DRAGGING}`).removeClass(CSS_CLASSES.DRAGGING)
      $(`.${CSS_CLASSES.DRAGOVER}`).removeClass(CSS_CLASSES.DRAGOVER)

      for (const el of DOM.qsa(
        `.order-machine ${SELECTORS.INLINE_RELATED}.${CSS_CLASSES.SELECTED}`,
      )) {
        el.classList.remove(CSS_CLASSES.SELECTED)
      }

      if (this.monitorCleanup) {
        this.monitorCleanup()
        this.monitorCleanup = null
      }

      this.dragging = null
    },

    /**
     * Handle dragover event
     * @param {DragEvent} e - Drag event
     */
    handleDragOver(e) {
      if (this.dragging) {
        e.preventDefault()

        $(`.${CSS_CLASSES.DRAGOVER}`).removeClass(CSS_CLASSES.DRAGOVER)

        const inline = e.target.closest(SELECTORS.INLINE_RELATED)
        inline.classList.add(CSS_CLASSES.DRAGOVER)
        inline.classList.toggle(
          CSS_CLASSES.DRAGOVER_AFTER,
          this.shouldInsertAfter(inline, e.clientY),
        )
      }
    },

    /**
     * Handle drop event
     * @param {DragEvent} e - Drop event
     */
    handleDrop(e) {
      if (this.dragging) {
        e.preventDefault()

        // Select all children of sections
        for (const inline of DOM.qsa(
          `.order-machine ${SELECTORS.INLINE_RELATED}.${CSS_CLASSES.SELECTED}`,
        )) {
          SectionsManager.selectSection(inline)
        }

        const inline = e.target.closest(SELECTORS.INLINE_RELATED)
        const toMove = DOM.qsa(
          `.order-machine ${SELECTORS.INLINE_RELATED}.${CSS_CLASSES.SELECTED}`,
        ).map((inline) => [inline, +inline.style.order])

        const orAfter = this.shouldInsertAfter(inline, e.clientY)
        toMove.sort((a, b) => (orAfter ? -1 : 1) * (a[1] - b[1]))

        for (const row of toMove) {
          OrderingManager.insertAdjacent(row[0], inline, orAfter)
          row[0].classList.remove(CSS_CLASSES.SELECTED)
        }

        this.dragging = null

        // Update sections after reordering
        SectionsManager.updateSections(
          DOM.qs(SELECTORS.ORDER_MACHINE_WRAPPER),
          DOM.qsa(".order-machine .inline-related"),
        )
      }
    },

    /**
     * Determine if element should be inserted before or after target
     * @param {Element} inline - Target element
     * @param {number} clientY - Y position of mouse
     * @returns {boolean} - True if should insert after
     */
    shouldInsertAfter(inline, clientY) {
      const rect = DOM.getRect(inline)
      const yMid = rect.y + rect.height / 2 + 5 // Compensate for margin
      return clientY > yMid
    },

    /**
     * Start monitoring mouse movement for auto-scroll
     * @returns {Function} - Cleanup function
     */
    startMouseMonitor() {
      // Use a local variable instead of a global property
      let currentClientY = null

      const updater = (e) => {
        currentClientY = e.clientY
      }

      window.addEventListener("mousemove", updater)
      window.addEventListener("dragover", updater)

      // Auto-scroll speed factors
      const SCROLL_THRESHOLD = 0.1 // Percentage of viewport height
      const SCROLL_SPEED = 10 // Pixels per tick
      const SCROLL_INTERVAL = 10 // Milliseconds

      const interval = setInterval(() => {
        if (!currentClientY) return

        const viewportHeight = window.innerHeight
        const topThreshold = viewportHeight * SCROLL_THRESHOLD
        const bottomThreshold = viewportHeight * (1 - SCROLL_THRESHOLD)

        if (currentClientY < topThreshold) {
          // Scroll up when near top
          window.scrollBy(0, -SCROLL_SPEED)
        } else if (currentClientY > bottomThreshold) {
          // Scroll down when near bottom
          window.scrollBy(0, SCROLL_SPEED)
        }
      }, SCROLL_INTERVAL)

      return () => {
        window.removeEventListener("mousemove", updater)
        window.removeEventListener("dragover", updater)
        clearInterval(interval)
        currentClientY = null
      }
    },
  }

  /**
   * Ordering Manager - handles the ordering of content items
   */
  const OrderingManager = {
    /**
     * Reorder all inline elements
     * @param {jQuery|Element} context - Context to find inlines in (optional)
     * @param {jQuery} orderMachine - Order machine container
     */
    reorderInlines(context, orderMachine) {
      const $orderMachine = $(orderMachine)
      const inlines = (context || $orderMachine).find(SELECTORS.INLINE_RELATED)

      // Deactivate all non-empty inlines
      inlines.not(CSS_CLASSES.EMPTY_FORM).each(function () {
        $(document).trigger("content-editor:deactivate", [$(this)])
        DragDropManager.makeDraggable(this)
      })

      // Detach and reattach all inlines to ensure proper order
      inlines.detach()
      $orderMachine.append(inlines)

      // Process each inline
      inlines.each(function () {
        // Add insert target
        const span = DOM.createElement("span", {
          className: "order-machine-insert-target",
        })
        this.appendChild(span)

        // Find ordering and region inputs
        const orderingInput = DOM.qs(
          `.field-ordering input[name$="-ordering"]`,
          this,
        )
        if (orderingInput) {
          orderingInput.classList.add("order-machine-ordering")
        }

        const regionInput = DOM.qs(`.field-region input[name$="-region"]`, this)
        if (regionInput) {
          regionInput.classList.add("order-machine-region")
        }

        // Set ordering as style.order
        const ordering = $(".order-machine-ordering", this).val() || 1e9
        this.style.order = ordering

        // Ensure draggable
        DragDropManager.makeDraggable(this)
      })

      // Activate all non-empty inlines
      inlines.not(CSS_CLASSES.EMPTY_FORM).each(function () {
        $(document).trigger("content-editor:activate", [$(this)])
      })
    },

    /**
     * Find all inlines in the current region, sorted by order
     * @param {jQuery} orderMachine - Order machine container
     * @returns {jQuery} - Sorted inlines
     */
    findInlinesInOrder(orderMachine) {
      const inlines = orderMachine.find(
        `.inline-related:not(.empty-form)[data-region="${RegionsManager.currentRegion}"]`,
      )
      inlines.sort((a, b) => a.style.order - b.style.order)
      return inlines
    },

    /**
     * Set the biggest ordering value for a row
     * @param {jQuery} $row - Row to set ordering for
     */
    setBiggestOrdering($row) {
      const orderings = []

      // Get all ordering values
      $(SELECTORS.ORDER_MACHINE)
        .find(SELECTORS.ORDERING_INPUT)
        .each(function () {
          const value = Number.parseFloat(this.value)
          if (!Number.isNaN(value)) orderings.push(value)
        })

      // Default to 10 if no orderings exist
      const maxOrdering = orderings.length > 0 ? Math.max(...orderings) : 0
      const newOrdering = 10 + maxOrdering

      // Apply the new ordering value
      const orderingInput = $row.find(SELECTORS.ORDERING_INPUT)
      if (orderingInput.length) {
        orderingInput.val(newOrdering)

        // Also set the CSS order property
        if ($row[0]) {
          $row[0].style.order = newOrdering
        }
      }
    },

    /**
     * Insert a row adjacent to another inline
     * @param {Element} row - Row to insert
     * @param {Element} inline - Reference inline
     * @param {boolean} after - Whether to insert after (true) or before (false)
     */
    insertAdjacent(row, inline, after = false) {
      const inlineOrdering = +DOM.qs(SELECTORS.ORDERING_INPUT, inline).value
      const beforeRows = []
      const afterRows = []

      // Collect rows before and after the insertion point
      $(SELECTORS.ORDER_MACHINE)
        .find(SELECTORS.INLINE_RELATED)
        .not(CSS_CLASSES.EMPTY_FORM)
        .each(function () {
          const thisOrderingField = DOM.qs(SELECTORS.ORDERING_INPUT, this)
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

      // Sort rows by ordering
      beforeRows.sort((a, b) => a[1].value - b[1].value)
      afterRows.sort((a, b) => a[1].value - b[1].value)

      // Combine rows in the right order
      let rows = [...beforeRows]
      rows.push([row, DOM.qs(SELECTORS.ORDERING_INPUT, row)])
      rows = rows.concat(afterRows)

      // Update ordering values
      for (let i = 0; i < rows.length; ++i) {
        const thisRow = rows[i]
        thisRow[1].value = thisRow[0].style.order = 10 * (1 + i)
      }
    },
  }

  /**
   * UI Manager - handles general UI operations
   */
  const UIManager = {
    orderMachine: null,
    orderMachineWrapper: null,
    pluginButtons: null,
    machineEmptyMessage: null,
    noRegionsMessage: null,
    noPluginsMessage: null,

    /**
     * Initialize UI elements
     * @param {jQuery} orderMachine - Order machine element
     * @param {jQuery} orderMachineWrapper - Order machine wrapper element
     * @param {Element} pluginButtons - Plugin buttons container
     */
    initialize(orderMachine, orderMachineWrapper, pluginButtons) {
      this.orderMachine = orderMachine
      this.orderMachineWrapper = orderMachineWrapper
      this.pluginButtons = pluginButtons

      // Create messages
      this.machineEmptyMessage = $('<p class="hidden machine-message"/>')
        .text(ContentEditor.messages[MESSAGES.EMPTY])
        .appendTo(orderMachine)

      this.noRegionsMessage = $('<p class="hidden machine-message"/>')
        .text(ContentEditor.messages[MESSAGES.NO_REGIONS])
        .appendTo(orderMachine)

      this.noPluginsMessage = $('<p class="hidden machine-message"/>')
        .text(ContentEditor.messages[MESSAGES.NO_PLUGINS])
        .appendTo(orderMachine)

      // Set up event listeners
      this.setupEventListeners()
    },

    /**
     * Add plugin icons to inline headers
     */
    addPluginIconsToInlines() {
      ContentEditor.plugins.forEach((plugin) => {
        const fragment = DOM.createFromHTML(
          plugin.button || '<span class="material-icons">extension</span>',
        )

        const button = fragment.firstElementChild
        if (plugin.color) {
          button.style.color = plugin.color
        }

        DOM.qsa(
          `.dynamic-${plugin.prefix} > h3, #${plugin.prefix}-empty > h3`,
        ).forEach((title) => {
          title.insertAdjacentElement("afterbegin", button.cloneNode(true))
        })
      })
    },

    /**
     * Set up event listeners for UI interactions
     */
    setupEventListeners() {
      // Handle clicks on insert targets
      $(document).on(
        "click",
        SELECTORS.INSERT_TARGET,
        this.handleInsertTargetClick.bind(this),
      )

      // Handle clicks on inline headers for collapsing
      this.orderMachine.on(
        "click",
        ".inline-related>h3",
        this.handleInlineHeaderClick.bind(this),
      )

      // Handle checkbox for deletion
      this.orderMachine.on(
        "click",
        ".delete>input[type=checkbox]",
        this.handleDeleteCheckboxClick.bind(this),
      )

      // Handle collapse toggle clicks (for nested fieldsets)
      this.orderMachine.on(
        "click",
        ".collapse-toggle",
        this.handleCollapseToggleClick.bind(this),
      )

      // Close plugin buttons on escape key
      document.body.addEventListener("keyup", (e) => {
        if (e.key === "Escape") this.hidePluginButtons()
      })

      // Close plugin buttons when clicking outside
      document.body.addEventListener("click", (e) => {
        if (
          !e.target.closest(SELECTORS.INSERT_TARGET) &&
          !e.target.closest(SELECTORS.PLUGIN_BUTTONS)
        ) {
          this.hidePluginButtons()
        }
      })

      // Handle form submission to save state
      $("form").submit(function () {
        this.action = `${this.action.split("#")[0]}#restore`
        StateManager.saveEditorState()
      })
    },

    /**
     * Handle click on an insert target
     * @param {Event} e - Click event
     */
    handleInsertTargetClick(e) {
      const isSelected = e.target.classList.contains(CSS_CLASSES.SELECTED)
      this.hidePluginButtons()

      if (isSelected) {
        ContentEditor._insertBefore = null
      } else {
        e.target.classList.add(CSS_CLASSES.SELECTED)

        // Position the plugin buttons popup
        const pos = DOM.getRect(e.target)
        const wrapperRect = DOM.getRect(this.orderMachineWrapper[0])

        this.pluginButtons.style.left = `${pos.left - wrapperRect.left + 30}px`

        const y =
          pos.top -
          wrapperRect.top +
          (e.target.classList.contains("last")
            ? 30 - DOM.getRect(this.pluginButtons).height
            : 0)
        this.pluginButtons.style.top = `${y}px`

        this.orderMachineWrapper.addClass(CSS_CLASSES.PLUGIN_BUTTONS_VISIBLE)

        ContentEditor._insertBefore = e.target.closest(SELECTORS.INLINE_RELATED)
      }
    },

    /**
     * Handle click on an inline header (for collapsing/selecting)
     * @param {Event} e - Click event
     */
    handleInlineHeaderClick(e) {
      if (e.ctrlKey) {
        // Ctrl+click to select
        e.preventDefault()
        e.target
          .closest(SELECTORS.INLINE_RELATED)
          .classList.toggle(CSS_CLASSES.SELECTED)
      } else if (
        !e.target.closest(".delete") &&
        !e.target.closest(".inline_move_to_region")
      ) {
        // Regular click to collapse
        e.preventDefault()
        const inline = e.target.closest(SELECTORS.INLINE_RELATED)
        this.collapseInline(
          inline,
          !inline.classList.contains(CSS_CLASSES.COLLAPSED),
        )
      }
    },

    /**
     * Handle click on delete checkbox
     * @param {Event} e - Click event
     */
    handleDeleteCheckboxClick(e) {
      e.target
        .closest(SELECTORS.INLINE_RELATED)
        .classList.toggle(CSS_CLASSES.FOR_DELETION, e.target.checked)
      e.target.blur()
    },

    /**
     * Handle collapse toggle clicks (for nested fieldsets)
     * @param {Event} e - Click event
     */
    handleCollapseToggleClick(e) {
      // This only reaches us if it hasn't been handled by Django's collapse.js
      e.preventDefault()
      const fieldset = e.target.closest("fieldset")

      if (fieldset.classList.contains(CSS_CLASSES.COLLAPSED)) {
        e.target.textContent = window.gettext("Hide")
        fieldset.classList.remove(CSS_CLASSES.COLLAPSED)
      } else {
        e.target.textContent = window.gettext("Show")
        fieldset.classList.add(CSS_CLASSES.COLLAPSED)
      }
    },

    /**
     * Collapse or expand an inline
     * @param {Element} inline - Inline element
     * @param {boolean} collapsed - Whether to collapse
     */
    collapseInline(inline, collapsed = true) {
      inline.classList.toggle(CSS_CLASSES.COLLAPSED, collapsed)

      if (!collapsed) {
        // Could have been hidden through sections
        inline.classList.remove("order-machine-hide")
      }

      SectionsManager.hideSection(inline, collapsed)
    },

    /**
     * Hide plugin buttons popup
     */
    hidePluginButtons() {
      this.orderMachineWrapper.removeClass(CSS_CLASSES.PLUGIN_BUTTONS_VISIBLE)

      DOM.qsa(`${SELECTORS.INSERT_TARGET}.${CSS_CLASSES.SELECTED}`).forEach(
        (el) => {
          el.classList.remove(CSS_CLASSES.SELECTED)
        },
      )
    },

    /**
     * Hide inlines from other regions
     */
    hideInlinesFromOtherRegions() {
      const inlines = this.orderMachine.find(
        `${SELECTORS.INLINE_RELATED}:not(.empty-form)`,
      )
      inlines.addClass(CSS_CLASSES.INVISIBLE)

      const shown = inlines.filter(
        `[data-region="${RegionsManager.currentRegion}"]`,
      )

      this.machineEmptyMessage.addClass(CSS_CLASSES.HIDDEN)

      if (shown.length) {
        shown.removeClass(CSS_CLASSES.INVISIBLE)
      } else {
        this.machineEmptyMessage.removeClass(CSS_CLASSES.HIDDEN)
      }

      // Update message for inherited regions
      this.machineEmptyMessage.text(
        ContentEditor.messages[
          RegionsManager.isInheritedRegion(RegionsManager.currentRegion)
            ? MESSAGES.EMPTY_INHERITED
            : MESSAGES.EMPTY
        ],
      )
    },

    /**
     * Update the visibility of plugin buttons
     * @param {Element[]} buttons - Optional specific buttons to check, otherwise checks all
     */
    updatePluginButtonsVisibility(buttons) {
      const buttonsToCheck =
        buttons || DOM.qsa(`${SELECTORS.PLUGIN_BUTTONS} .plugin-button`)
      let visibleCount = 0

      // Update each button's visibility
      buttonsToCheck.forEach((button) => {
        const plugin = button.dataset.pluginPrefix
        const isVisible = PluginsManager.isPluginAllowedInRegion(
          plugin,
          RegionsManager.currentRegion,
        )

        button.classList.toggle(CSS_CLASSES.HIDE, !isVisible)
        visibleCount += isVisible ? 1 : 0
      })

      // Update container based on visible button count
      if (visibleCount) {
        this.orderMachineWrapper.removeClass(
          CSS_CLASSES.ORDER_MACHINE_HIDE_INSERT_TARGETS,
        )
        this.noPluginsMessage.hide()

        // Update grid layout with appropriate row count
        this.pluginButtons.style.setProperty(
          "--_v",
          Math.max(7, Math.ceil(visibleCount / 3)),
        )
      } else {
        this.orderMachineWrapper.addClass(
          CSS_CLASSES.ORDER_MACHINE_HIDE_INSERT_TARGETS,
        )

        if (RegionsManager.currentRegion && ContentEditor.allowChange) {
          this.noPluginsMessage.show()
          this.machineEmptyMessage.hide()
        }
      }

      // Show/hide no regions message
      if (RegionsManager.declaredRegions.length) {
        this.noRegionsMessage.hide()
      } else {
        this.noRegionsMessage.show()
      }
    },

    /**
     * Initialize collapse all functionality
     */
    initializeCollapseAll() {
      const collapseAllInput = $(SELECTORS.COLLAPSE_ITEMS)

      collapseAllInput.on("change", function () {
        DOM.qsa(
          `.order-machine ${SELECTORS.INLINE_RELATED}:not(.empty-form)`,
        ).forEach((inline) => {
          UIManager.collapseInline(inline, this.checked)
        })

        Storage.local.set(STORAGE_KEYS.COLLAPSE_ALL, this.checked)

        if (this.checked) {
          // Make sure inlines with validation errors are still visible
          $(
            `.order-machine ${SELECTORS.INLINE_RELATED}:not(.empty-form) .errorlist`,
          ).each(function () {
            this.closest(SELECTORS.INLINE_RELATED).classList.remove(
              CSS_CLASSES.COLLAPSED,
            )
          })
        }
      })

      // Load saved state
      const savedState = Storage.local.get(STORAGE_KEYS.COLLAPSE_ALL)
      if (savedState !== null) {
        collapseAllInput.attr("checked", savedState).trigger("change")
      }
    },
  }

  /**
   * Region Assignment Manager - manages assigning regions to content items
   */
  const RegionAssignmentManager = {
    /**
     * Assign region data attributes to all inlines
     * @param {jQuery} orderMachine - Order machine element
     */
    assignRegionDataAttribute(orderMachine) {
      orderMachine
        .find(`${SELECTORS.INLINE_RELATED}:not(.empty-form)`)
        .each(function () {
          const $this = $(this)

          // Try input first and fall back to the readonly presentation
          let region =
            $this.find(SELECTORS.REGION_INPUT).val() ||
            $this.find(".field-region .readonly").text()

          // Check if region is known or needs to be registered as unknown
          if (!RegionsManager.isKnownRegion(region)) {
            region = RegionsManager.registerUnknownRegion(
              region,
              `${ContentEditor.messages[MESSAGES.UNKNOWN_REGION]}: ${region}`,
            )
          }

          // Set region data attribute
          $this.attr("data-region", region)

          // Attach region dropdown
          RegionAssignmentManager.attachMoveToRegionDropdown($this)
        })
    },

    /**
     * Create and attach a region dropdown to an inline
     * @param {jQuery} $inline - Inline element
     */
    attachMoveToRegionDropdown($inline) {
      // Get inline type
      const inlineType = this.getInlineType($inline)

      // Filter allowed regions
      const regions = []
      for (const region of RegionsManager.declaredRegions) {
        if (
          (!inlineType ||
            !PluginsManager.pluginRegions[inlineType] ||
            PluginsManager.pluginRegions[inlineType].includes(region.key)) &&
          !/^_unknown_/.test(region.key)
        ) {
          regions.push(region)
        }
      }

      const isCurrentUnknown = /^_unknown_/.test($inline.data("region"))

      // Skip if only one region and not unknown
      if (regions.length < 2 && !isCurrentUnknown) {
        return
      }

      // Build dropdown
      const select = this.buildDropdown(
        regions,
        isCurrentUnknown ? ContentEditor.messages[MESSAGES.UNKNOWN_REGION] : "",
      )

      const regionInput = $inline.find(SELECTORS.REGION_INPUT)

      select.className = "inline_move_to_region"
      select.value = isCurrentUnknown ? "" : regionInput.val()
      $inline.find("> h3 .inline_label").after(select)

      // Handle region change
      select.addEventListener("change", () => {
        if (select.value) {
          $inline.attr("data-region", select.value)
          regionInput.val(select.value)
          UIManager.hideInlinesFromOtherRegions()
          OrderingManager.setBiggestOrdering($inline)
          OrderingManager.reorderInlines(null, $(SELECTORS.ORDER_MACHINE))
        }
      })
    },

    /**
     * Extract the inline type from its ID
     * @param {jQuery} $inline - Inline element
     * @returns {string|null} - Extracted type or null
     */
    getInlineType($inline) {
      const match = /^([a-z0-9_]+)-\d+$/g.exec($inline.attr("id"))
      return match ? match[1] : null
    },

    /**
     * Build a dropdown selector
     * @param {Array} contents - Array of items with title and key/prefix properties
     * @param {string} title - Optional first empty option title
     * @returns {HTMLSelectElement} - The dropdown element
     */
    buildDropdown(contents, title) {
      const select = document.createElement("select")
      let idx = 0

      if (title) {
        select.options[idx++] = new Option(title, "", true)
      }

      for (const content of contents) {
        // Option _values_ may either be the prefix (for plugins) or keys (for regions)
        select.options[idx++] = new Option(
          content.title,
          content.prefix || content.key,
        )
      }

      return select
    },
  }

  /**
   * Form Integration Manager - handles integration with Django's formsets
   */
  const FormIntegrationManager = {
    /**
     * Handle a new formset item being added
     * @param {jQuery|Element} $row - The added row
     * @param {string} prefix - The formset prefix
     */
    handleFormsetAdded($row, prefix) {
      // Not one of our managed inlines?
      if (!PluginsManager.pluginsByPrefix[prefix]) return

      // Set region and initialize
      $row.find(SELECTORS.REGION_INPUT).val(RegionsManager.currentRegion)
      $row
        .find("h3 .inline_label")
        .text(ContentEditor.messages[MESSAGES.NEW_ITEM])
      $row.attr("data-region", RegionsManager.currentRegion)

      // Set ordering and make draggable
      OrderingManager.setBiggestOrdering($row)
      RegionAssignmentManager.attachMoveToRegionDropdown($row)
      DragDropManager.makeDraggable($row[0])

      // Hide empty message
      UIManager.machineEmptyMessage.addClass(CSS_CLASSES.HIDDEN)

      // Handle insertion position
      if (ContentEditor._insertBefore) {
        OrderingManager.insertAdjacent($row[0], ContentEditor._insertBefore)
        ContentEditor._insertBefore = null
      }

      // Trigger activation and focus first field
      $(document).trigger("content-editor:activate", [$row])
      $row.find("input, select, textarea").first().focus()

      // Update sections
      SectionsManager.updateSections(
        DOM.qs(SELECTORS.ORDER_MACHINE_WRAPPER),
        DOM.qsa(".order-machine .inline-related"),
      )
    },

    /**
     * Handle a formset item being removed
     * @param {string} prefix - The formset prefix
     */
    handleFormsetRemoved(prefix) {
      // Not one of our managed inlines?
      if (!PluginsManager.pluginsByPrefix[prefix]) return

      // Show empty message if no items left in current region
      if (
        !$(SELECTORS.ORDER_MACHINE).find(
          `.inline-related[data-region="${RegionsManager.currentRegion}"]`,
        ).length
      ) {
        UIManager.machineEmptyMessage.removeClass(CSS_CLASSES.HIDDEN)
      }

      // Handle deactivation of last related items
      $(SELECTORS.ORDER_MACHINE)
        .find(
          `.inline-related.${CSS_CLASSES.LAST_RELATED}:not(.${CSS_CLASSES.EMPTY_FORM})`,
        )
        .each(function () {
          $(document).trigger("content-editor:deactivate", [$(this)])
        })

      // As soon as possible, but not sooner (let the inline.js code run to the end first)
      setTimeout(() => {
        $(SELECTORS.ORDER_MACHINE)
          .find(
            `.inline-related.${CSS_CLASSES.LAST_RELATED}:not(.${CSS_CLASSES.EMPTY_FORM})`,
          )
          .each(function () {
            $(document).trigger("content-editor:activate", [$(this)])
          })

        // Update sections
        SectionsManager.updateSections(
          DOM.qs(SELECTORS.ORDER_MACHINE_WRAPPER),
          DOM.qsa(".order-machine .inline-related"),
        )
      }, 0)
    },

    /**
     * Set up formset event listeners
     */
    setupFormsetListeners() {
      // Handle formset:added events (new in Django 4.1)
      $(document).on("formset:added", (event, $row, formsetName) => {
        if (event.detail?.formsetName) {
          // Django >= 4.1
          this.handleFormsetAdded($(event.target), event.detail.formsetName)
        } else {
          this.handleFormsetAdded($row, formsetName)
        }
      })

      // Handle formset:removed events
      $(document).on("formset:removed", (event, _$row, formsetName) => {
        if (event.detail?.formsetName) {
          // Django >= 4.1
          this.handleFormsetRemoved(event.detail.formsetName)
        } else {
          this.handleFormsetRemoved(formsetName)
        }
      })

      // Set up content editor activate/deactivate events
      $(document)
        .on("content-editor:deactivate", (_event, row) => {
          row.find("fieldset").addClass(CSS_CLASSES.INVISIBLE)
        })
        .on("content-editor:activate", (_event, row) => {
          row.find("fieldset").removeClass(CSS_CLASSES.INVISIBLE)
        })
    },
  }

  /**
   * State Manager - handles saving and restoring editor state
   */
  const StateManager = {
    /**
     * Save editor state to session storage
     */
    saveEditorState() {
      Storage.session.set(STORAGE_KEYS.EDITOR_STATE, {
        region: RegionsManager.currentRegion,
        scrollY: window.scrollY,
        collapsed: DOM.qsa(
          `.order-machine ${SELECTORS.INLINE_RELATED}.${CSS_CLASSES.COLLAPSED}:not(.${CSS_CLASSES.EMPTY_FORM}) ${SELECTORS.ORDERING_INPUT}`,
        ).map((input) => input.value),
      })
    },

    /**
     * Restore editor state from session storage
     */
    restoreEditorState() {
      const tabs = $(SELECTORS.TABS_REGIONS).find(".tab")

      const state = location.hash.includes("restore")
        ? Storage.session.get(STORAGE_KEYS.EDITOR_STATE)
        : null

      if (state) {
        // Restore inline collapse state
        DOM.qsa(
          `.order-machine ${SELECTORS.INLINE_RELATED}:not(.${CSS_CLASSES.EMPTY_FORM})`,
        ).forEach((inline) => {
          const collapsed = state.collapsed.includes(
            DOM.qs(SELECTORS.ORDERING_INPUT, inline).value,
          )

          inline.classList.toggle(
            CSS_CLASSES.COLLAPSED,
            collapsed && !inline.querySelector(".errorlist"),
          )
        })

        // Restore active tab/region
        const tab = tabs.filter(`[data-region="${state.region}"]`)
        if (tab.length) {
          tab.click()
        } else {
          tabs.eq(0).click()
        }

        // Initialize collapse all
        UIManager.initializeCollapseAll()

        // Restore scroll position
        setTimeout(() => {
          window.history.replaceState(null, "", ".")
          window.scrollTo(0, state.scrollY)
        }, 200)
      } else {
        // No state to restore, just initialize
        tabs.eq(0).click()
        UIManager.initializeCollapseAll()
      }
    },
  }

  /**
   * Styling Manager - handles custom styles
   */
  const StylingManager = {
    /**
     * Add custom styles needed by the content editor
     */
    addCustomStyles() {
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
          content: " (${ContentEditor.messages[MESSAGES.FOR_DELETION]})";
        }
        .order-machine .inline-related:not(:where(${RegionsManager.declaredRegions.map((region) => `[data-region="${region.key}"]`).join(", ")})) .inline_move_to_region {
          border-color: red;
        }
      `
      document.head.appendChild(style)
    },
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  /**
   * Main initialization function
   */
  function init() {
    // Initialize the ContentEditor from context data
    const contextElement = DOM.qs(SELECTORS.CONTENT_EDITOR_CONTEXT)
    if (!contextElement) {
      console.error("Content Editor context not found!")
      return
    }

    ContentEditor.initialize(JSON.parse(contextElement.textContent))

    // Set up jQuery initialization
    django.jQuery(($) => {
      // Create global ContentEditor object for backward compatibility
      window.ContentEditor = {
        ...ContentEditor,
        addContent: ContentEditor.addContent,
        addPluginButton: PluginsManager.createPluginButton,
      }

      // Add basic structure
      let $anchor = $(".inline-group:first")
      if (ContentEditor.plugins.length) {
        $anchor = $(`#${ContentEditor.plugins[0].prefix}-group`)
      }

      $anchor.before(`
        <div class="tabs regions">
          <div class="machine-collapse">
            <label class="collapse-items">
              <input type="checkbox" />
              <div class="plugin-button collapse-all">
                <span class="plugin-button-icon">
                  <span class="material-icons">unfold_less</span>
                </span>
                ${ContentEditor.messages[MESSAGES.COLLAPSE_ALL]}
              </div>
              <div class="plugin-button uncollapse-all">
                <span class="plugin-button-icon">
                  <span class="material-icons">unfold_more</span>
                </span>
                ${ContentEditor.messages[MESSAGES.UNCOLLAPSE_ALL]}
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
        <p class="order-machine-help">${ContentEditor.messages[MESSAGES.SELECT_MULTIPLE]}</p>
      `)

      // Get key elements
      const orderMachineWrapper = $(".order-machine-wrapper")
      const pluginButtons = DOM.qs(SELECTORS.PLUGIN_BUTTONS)
      const orderMachine = $(SELECTORS.ORDER_MACHINE)

      // Initialize managers
      UIManager.initialize(orderMachine, orderMachineWrapper, pluginButtons)
      UIManager.addPluginIconsToInlines()

      // Get plugin inline groups
      const pluginInlineGroups = $(
        ContentEditor.plugins
          .map((plugin) => `#${plugin.prefix}-group`)
          .join(", "),
      )

      // Initialize plugin inlines
      OrderingManager.reorderInlines(pluginInlineGroups, orderMachine)
      pluginInlineGroups.hide()
      RegionAssignmentManager.assignRegionDataAttribute(orderMachine)

      // Set up region tabs
      RegionsManager.createRegionTabs(
        DOM.qs(SELECTORS.TABS_REGIONS),
        (_region) => {
          UIManager.hideInlinesFromOtherRegions()
          UIManager.updatePluginButtonsVisibility()
          SectionsManager.updateSections(
            DOM.qs(SELECTORS.ORDER_MACHINE_WRAPPER),
            DOM.qsa(".order-machine .inline-related"),
          )
        },
      )

      // Create all plugin buttons
      ContentEditor.createAllPluginButtons(pluginButtons)

      // Set up form integration
      FormIntegrationManager.setupFormsetListeners()

      // Add custom styles
      StylingManager.addCustomStyles()

      // Set read-only mode if needed
      if (!ContentEditor.allowChange) {
        $(".order-machine-wrapper").addClass(CSS_CLASSES.ORDER_MACHINE_READONLY)
      }

      // Initialize section management if needed
      if (PluginsManager.hasSections) {
        const debouncedUpdateSections = debounce(() => {
          SectionsManager.updateSections(
            DOM.qs(SELECTORS.ORDER_MACHINE_WRAPPER),
            DOM.qsa(".order-machine .inline-related"),
          )
        }, 10)

        // Set up resize observer for sections
        try {
          const orderMachineWrapper = DOM.qs(SELECTORS.ORDER_MACHINE_WRAPPER)
          if (!orderMachineWrapper) {
            console.warn(
              "Order machine wrapper not found, sections may not update correctly",
            )
            return
          }

          const resizeObserver = new ResizeObserver(() => {
            debouncedUpdateSections()
          })
          resizeObserver.observe(orderMachineWrapper)

          // Also update sections when window resizes (fallback and for older browsers)
          window.addEventListener("resize", debouncedUpdateSections)
        } catch (e) {
          console.warn(
            "ResizeObserver not supported, falling back to window resize event:",
            e,
          )
          // Fallback for browsers without ResizeObserver
          window.addEventListener("resize", debouncedUpdateSections)
        }
      }

      // Restore state
      setTimeout(StateManager.restoreEditorState, 1)

      // Trigger ready event
      $(document).trigger("content-editor:ready")
    })
  }

  // Start initialization
  init()
})()
