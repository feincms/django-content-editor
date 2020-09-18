/* global django */
django.jQuery(function ($) {
  var tabbed = $(".tabbed");
  if (tabbed.length >= 1) {
    var anchor = tabbed.eq(0);
    /* Break out of the .inline-related containment, avoids ugly h3's */
    if (anchor.parents(".inline-related").length) {
      anchor = anchor.parents(".inline-related");
    }
    anchor.before(
      '<div id="tabbed" class="clearfix">' +
        '<div class="tabs clearfix"></div>' +
        '<div class="modules"></div>' +
        "</div>"
    );

    var $tabs = $("#tabbed > .tabs"),
      $modules = $("#tabbed > .modules"),
      errorIndex = -1,
      uncollapseIndex = -1;

    tabbed.each(function createTabs(index) {
      var $old = $(this),
        $title = $old.children("h2");

      if ($old.find(".errorlist").length) {
        $title.addClass("has-error");
        errorIndex = errorIndex < 0 ? index : errorIndex;
      }
      if ($old.is(".uncollapse")) {
        uncollapseIndex = uncollapseIndex < 0 ? index : uncollapseIndex;
      }

      $title.attr("data-index", index);
      $title.addClass("tab");
      $tabs.append($title);

      $old.addClass("content-editor-hidden");

      $modules.append($old);
    });

    $tabs.on("click", "[data-index]", function () {
      var $tab = $(this);
      if ($tab.hasClass("active")) {
        $tab.removeClass("active");
        $modules.children().addClass("content-editor-hidden");
      } else {
        $tabs.find(".active").removeClass("active");
        $tab.addClass("active");
        $modules
          .children()
          .addClass("content-editor-hidden")
          .eq($tab.data("index"))
          .removeClass("content-editor-hidden");
      }
    });

    if (errorIndex >= 0 || uncollapseIndex >= 0) {
      var index = errorIndex >= 0 ? errorIndex : uncollapseIndex;
      $tabs.find("[data-index=" + index + "]").click();
    }
  }
});
