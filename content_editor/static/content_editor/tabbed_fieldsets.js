/* Tabbed fieldsets without jQuery dependency */
;(() => {
  function initializeTabbedFieldsets() {
    const tabbedElements = document.querySelectorAll(".tabbed")
    if (tabbedElements.length === 0) return

    let anchor = tabbedElements[0]
    // Break out of the .inline-related containment, avoids ugly h3's
    const inlineRelated = anchor.closest(".inline-related")
    if (inlineRelated) {
      anchor = inlineRelated
    }

    // Create the tabbed container
    const tabbedContainer = document.createElement("div")
    tabbedContainer.id = "tabbed"
    tabbedContainer.className = "clearfix"
    tabbedContainer.innerHTML =
      '<div class="tabs clearfix"></div>' +
      '<div class="modules tabbed-modules"></div>'

    anchor.parentNode.insertBefore(tabbedContainer, anchor)

    const tabsContainer = document
      .getElementById("tabbed")
      .querySelector(".tabs")
    const modulesContainer = document
      .getElementById("tabbed")
      .querySelector(".modules")
    let errorIndex = -1
    let uncollapseIndex = -1

    // Process each tabbed element
    tabbedElements.forEach((element, index) => {
      const title = element.querySelector("h2")

      if (element.querySelector(".errorlist")) {
        title.classList.add("has-error")
        errorIndex = errorIndex < 0 ? index : errorIndex
      }

      if (element.classList.contains("uncollapse")) {
        uncollapseIndex = uncollapseIndex < 0 ? index : uncollapseIndex
      }

      title.setAttribute("data-index", index)
      title.classList.add("tab")
      tabsContainer.appendChild(title)

      element.classList.add("content-editor-invisible")
      modulesContainer.appendChild(element)
    })

    // Add click handler for tabs
    tabsContainer.addEventListener("click", (event) => {
      const target = event.target.closest("[data-index]")
      if (!target) return

      const index = Number.parseInt(target.getAttribute("data-index"), 10)
      const isActive = target.classList.contains("active")

      if (isActive) {
        target.classList.remove("active")
        modulesContainer.querySelectorAll(".tabbed").forEach((module) => {
          module.classList.add("content-editor-invisible")
        })
      } else {
        // Remove active from all tabs
        tabsContainer.querySelectorAll(".active").forEach((tab) => {
          tab.classList.remove("active")
        })
        target.classList.add("active")

        // Hide all modules and show the selected one
        const modules = modulesContainer.querySelectorAll(".tabbed")
        modules.forEach((module, moduleIndex) => {
          if (moduleIndex === index) {
            module.classList.remove("content-editor-invisible")
          } else {
            module.classList.add("content-editor-invisible")
          }
        })
      }
    })

    // Auto-open tab with errors or marked for uncollapse
    if (errorIndex >= 0 || uncollapseIndex >= 0) {
      const index = errorIndex >= 0 ? errorIndex : uncollapseIndex
      const targetTab = tabsContainer.querySelector(`[data-index="${index}"]`)
      if (targetTab) {
        targetTab.click()
      }
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeTabbedFieldsets)
  } else {
    initializeTabbedFieldsets()
  }
})()
