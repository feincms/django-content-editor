/* global django */
django.jQuery(($) => {
  const tabbed = $(".tabbed")
  if (tabbed.length >= 1) {
    let anchor = tabbed.eq(0)
    /* Break out of the .inline-related containment, avoids ugly h3's */
    if (anchor.parents(".inline-related").length) {
      anchor = anchor.parents(".inline-related")
    }
    anchor.before(
      '<div id="tabbed" class="clearfix">' +
        '<div class="tabs clearfix"></div>' +
        '<div class="modules tabbed-modules"></div>' +
        "</div>",
    )

    const $tabs = $("#tabbed > .tabs")
    const $modules = $("#tabbed > .modules")
    let errorIndex = -1
    let uncollapseIndex = -1

    tabbed.each(function createTabs(index) {
      const $old = $(this)
      const $title = $old.children("h2")

      if ($old.find(".errorlist").length) {
        $title.addClass("has-error")
        errorIndex = errorIndex < 0 ? index : errorIndex
      }
      if ($old.is(".uncollapse")) {
        uncollapseIndex = uncollapseIndex < 0 ? index : uncollapseIndex
      }

      $title.attr("data-index", index)
      $title.addClass("tab")
      $tabs.append($title)

      $old.addClass("content-editor-invisible")

      $modules.append($old)
    })

    $tabs.on("click", "[data-index]", function () {
      const $tab = $(this)
      if ($tab.hasClass("active")) {
        $tab.removeClass("active")
        $modules.children().addClass("content-editor-invisible")
      } else {
        $tabs.find(".active").removeClass("active")
        $tab.addClass("active")
        $modules
          .children()
          .addClass("content-editor-invisible")
          .eq($tab.data("index"))
          .removeClass("content-editor-invisible")
      }
    })

    if (errorIndex >= 0 || uncollapseIndex >= 0) {
      const index = errorIndex >= 0 ? errorIndex : uncollapseIndex
      $tabs.find(`[data-index=${index}]`).click()
    }
  }
})
