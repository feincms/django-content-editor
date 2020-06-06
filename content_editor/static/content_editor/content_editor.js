/* global django,ContentEditor */

/* Polyfilling a bit */
if (!Element.prototype.matches)
  Element.prototype.matches =
    Element.prototype.msMatchesSelector ||
    Element.prototype.webkitMatchesSelector;

if (!Element.prototype.closest) {
  Element.prototype.closest = function(s) {
    var el = this;
    if (!document.documentElement.contains(el)) return null;
    do {
      if (el.matches(s)) return el;
      el = el.parentElement || el.parentNode;
    } while (el !== null && el.nodeType === 1);
    return null;
  };
}
/* Polyfill end */

django.jQuery(function($) {
  var context = document.getElementById("content-editor-context");
  if (!context) return;

  window.ContentEditor = {
    addContent: function addContent(label) {
      var plugin = ContentEditor.pluginsByKey[label];
      plugin && $("#" + plugin.prefix + "-group .add-row a").click();
    },
    addPluginButton: function addPluginButton(label, html) {
      var plugin = ContentEditor.pluginsByKey[label];
      if (!plugin) return;

      var unit = document.querySelector(".control-unit.plugin-buttons");
      if (!unit) {
        unit = document.createElement("div");
        unit.className = "control-unit plugin-buttons";
        var mc = document.querySelector(".machine-control");
        mc.insertBefore(unit, mc.firstChild);
      }

      var button = document.createElement("a");
      var $button = $(button);
      $button.data("plugin", plugin.key);
      button.className = "plugin-button";
      button.title = plugin.title;
      button.addEventListener("click", function() {
        ContentEditor.addContent(plugin.key);
      });
      button.innerHTML = html;

      unit.appendChild(button);

      hideNotAllowedPluginButtons($button);
    }
  };

  // .dataset.context instead of getAttribute would be nicer
  $.extend(
    window.ContentEditor,
    JSON.parse(context.getAttribute("data-context"))
  );

  var i;
  ContentEditor.pluginsByKey = {};
  ContentEditor.prefixToKey = {};
  for (i = 0; i < ContentEditor.plugins.length; ++i) {
    ContentEditor.pluginsByKey[ContentEditor.plugins[i].key] =
      ContentEditor.plugins[i];
    ContentEditor.prefixToKey[ContentEditor.plugins[i].prefix] =
      ContentEditor.plugins[i].key;
  }
  ContentEditor.regionsByKey = {};
  for (i = 0; i < ContentEditor.regions.length; ++i) {
    ContentEditor.regionsByKey[ContentEditor.regions[i].key] =
      ContentEditor.regions[i];
  }

  // Add basic structure. There is always at least one inline group if
  // we even have any plugins.
  $(".inline-group:first").before(
    '<div class="tabs regions">' +
      '<button type="button" class="toggle">' +
      ContentEditor.messages.toggle +
      "</button>" +
      "</div>" +
      '<div class="module">' +
      '<div class="order-machine"></div><div class="machine-control"></div>' +
      "</div>"
  );

  var orderMachine = $(".order-machine"),
    machineEmptyMessage = $('<p class="hidden machine-message"/>')
      .text(ContentEditor.messages.empty)
      .appendTo(orderMachine);

  // Pre map plugin regions
  var pluginRegions = (function() {
    var result = {};
    var plugins = ContentEditor.plugins;
    for (var i = 0; i < plugins.length; i++) {
      result[plugins[i].key] = plugins[i].regions;
    }
    return result;
  })();

  function ensureDraggable(arg) {
    if (arg.hasClass("empty-form") || arg.hasClass("fs-draggable")) return;

    var inline = arg[0];

    inline.addEventListener("dragstart", function(e) {
      // window.__fs_dragging = inline;
      window.__fs_dragging = e.target.closest(".inline-related");
      window.__fs_dragging.classList.add("fs-dragging");

      e.dataTransfer.dropEffect = "move";
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", "");
      } catch (e) {
        // IE11 needs this.
      }
    });
    inline.addEventListener("dragend", function() {
      $(".fs-dragging").removeClass("fs-dragging");
      $(".fs-dragover").removeClass("fs-dragover");
    });
    inline.addEventListener(
      "dragover",
      function(e) {
        e.preventDefault();
        $(".fs-dragover").removeClass("fs-dragover");
        e.target.closest(".inline-related").classList.add("fs-dragover");
      },
      true
    );
    inline.addEventListener("drop", function(e) {
      e.preventDefault();
      insertBefore(window.__fs_dragging, e.target.closest(".inline-related"));
    });

    arg.find(">h3").attr("draggable", true);
    arg.addClass("fs-draggable");
  }

  function reorderInlines(context) {
    context = context || orderMachine;
    var inlines = context.find(".inline-related");
    inlines.not(".empty-form").each(function() {
      $(document).trigger("content-editor:deactivate", [$(this)]);

      ensureDraggable($(this));
    });

    inlines.detach();
    orderMachine.append(inlines);

    inlines.each(function() {
      var ordering = $(".field-ordering input", this).val() || 1e9;
      this.style.order = ordering;
      ensureDraggable($(this));
    });

    inlines.not(".empty-form").each(function() {
      $(document).trigger("content-editor:activate", [$(this)]);
    });
  }

  function buildDropdown(contents, title) {
    var select = document.createElement("select"),
      idx = 0;

    if (title) select.options[idx++] = new Option(title, "", true);

    for (var i = 0; i < contents.length; i++) {
      select.options[idx++] = new Option(contents[i].title, contents[i].key);
    }
    return select;
  }

  // Hides plugins that are not allowed in this region
  function hideNotAllowedDropdown() {
    $(ContentEditor.machineControlSelect)
      .find("option")
      .each(function() {
        var $option = $(this);
        var allowed = pluginRegions[$option.val()];
        if (!allowed || $.inArray(ContentEditor.currentRegion, allowed) >= 0) {
          $option.show();
        } else {
          $option.hide();
        }
      });
  }

  // Hide not allowed plugin buttons
  // If $buttons only checks this buttons, else checks all
  function hideNotAllowedPluginButtons($buttons) {
    $buttons = $buttons
      ? $buttons
      : $(".control-unit.plugin-buttons .plugin-button");

    var region = ContentEditor.currentRegion;

    $buttons.each(function() {
      var $button = $(this);
      var plugin = $button.data("plugin");
      var allowed = pluginRegions[plugin];

      if (!allowed || $.inArray(region, allowed) >= 0) {
        // Allowed
        $button.show();
      } else {
        // Not allowed
        $button.hide();
      }
    });
  }

  // Fetch the inline type from id
  function getInlineType(inline) {
    var match = /^([a-z0-9_]+)-\d+$/g.exec($(inline).attr("id"));
    if (match) {
      return ContentEditor.prefixToKey[match[1]];
    }
    return null;
  }

  function attachMoveToRegionDropdown(inline) {
    // Filter allowed regions
    var inlineType = getInlineType(inline);
    var regions = [];
    for (var i = 0; i < ContentEditor.regions.length; i++) {
      if (
        (!inlineType ||
          !pluginRegions[inlineType] ||
          $.inArray(ContentEditor.regions[i].key, pluginRegions[inlineType]) >=
            0) &&
        ContentEditor.regions[i].key !== "_unknown_"
      ) {
        regions.push(ContentEditor.regions[i]);
      }
    }

    if (regions.length < 2) return;

    var controls = document.createElement("div"),
      select = buildDropdown(regions),
      regionInput = inline.find(".field-region input");

    select.value = regionInput.val();
    controls.className = "inline-controls";
    controls.appendChild(select);
    inline.append(controls);

    select.addEventListener("change", function() {
      inline.attr("data-region", select.value);
      regionInput.val(select.value);
      hideInlinesFromOtherRegions();
      setBiggestOrdering(inline);
      reorderInlines();
    });
  }

  // Assing data-region to all inlines.
  // We also want to the data attribute to be visible to selectors (that's why we're using $.attr)
  function assignRegionDataAttribute() {
    orderMachine.find(".inline-related:not(.empty-form)").each(function() {
      var $this = $(this),
        region = $this.find(".field-region input").val();

      if (!ContentEditor.regionsByKey[region]) {
        var spec = {
          key: "_unknown_",
          title: ContentEditor.messages.unknownRegion,
          inherited: false
        };
        ContentEditor.regions.push(spec);
        ContentEditor.regionsByKey[spec.key] = spec;
        region = spec.key;
      }

      $this.attr("data-region", region);
      attachMoveToRegionDropdown($this);
    });
  }

  function setBiggestOrdering(row) {
    var orderings = [];
    orderMachine.find(".field-ordering input").each(function() {
      if (!isNaN(+this.value)) orderings.push(+this.value);
    });
    var ordering = 10 + Math.max.apply(null, orderings);
    row.find(".field-ordering input").val(ordering);
    row.css("order", ordering);
  }

  function insertBefore(row, before) {
    var beforeOrdering = +before.querySelector(".field-ordering input").value,
      beforeRows = [],
      afterRows = [];
    orderMachine.find(".inline-related:not(.empty-form)").each(function() {
      var thisOrderingField = this.querySelector(".field-ordering input");
      if (this != row && !isNaN(+thisOrderingField.value)) {
        if (+thisOrderingField.value >= beforeOrdering) {
          afterRows.push([this, thisOrderingField]);
        } else {
          beforeRows.push([this, thisOrderingField]);
        }
      }
    });
    beforeRows.sort(function(a, b) {
      return a[1].value - b[1].value;
    });
    afterRows.sort(function(a, b) {
      return a[1].value - b[1].value;
    });
    var rows = [].concat(beforeRows);
    rows.push([row, row.querySelector(".field-ordering input")]);
    rows = rows.concat(afterRows);
    for (var i = 0; i < rows.length; ++i) {
      var thisRow = rows[i];
      thisRow[1].value = thisRow[0].style.order = 10 * (1 + i);
    }
  }

  function hideInlinesFromOtherRegions() {
    var inlines = orderMachine.find(".inline-related:not(.empty-form)");
    inlines.addClass("content-editor-hidden");
    var shown = inlines.filter(
      '[data-region="' + ContentEditor.currentRegion + '"]'
    );
    machineEmptyMessage.addClass("hidden");
    if (shown.length) {
      shown.removeClass("content-editor-hidden");
    } else {
      machineEmptyMessage.removeClass("hidden");
    }
    machineEmptyMessage.text(
      ContentEditor.messages[
        ContentEditor.regionsByKey[ContentEditor.currentRegion].inherited
          ? "emptyInherited"
          : "empty"
      ]
    );
  }

  var pluginInlineGroups = (function selectPluginInlineGroups() {
    var selector = [];
    for (var i = 0; i < ContentEditor.plugins.length; i++) {
      selector.push("#" + ContentEditor.plugins[i].prefix + "-group");
    }
    return $(selector.join(", "));
  })();

  reorderInlines(pluginInlineGroups);
  pluginInlineGroups.hide();
  assignRegionDataAttribute();

  // Always move empty forms to the end, because new plugins are inserted
  // just before its empty form. Also, assign region data.
  $(document).on("formset:added", function newForm(event, row, formsetName) {
    // Not one of our managed inlines?
    if (!ContentEditor.prefixToKey[formsetName]) return;

    row.find(".field-region input").val(ContentEditor.currentRegion);
    row.attr("data-region", ContentEditor.currentRegion);

    setBiggestOrdering(row);
    attachMoveToRegionDropdown(row);
    ensureDraggable(row);

    machineEmptyMessage.addClass("hidden");

    $(document).trigger("content-editor:activate", [row]);
  });

  $(document).on("formset:removed", function resetInlines(
    _event,
    _row,
    formsetName
  ) {
    // Not one of our managed inlines?
    if (!ContentEditor.prefixToKey[formsetName]) return;

    if (
      !orderMachine.find(
        '.inline-related[data-region="' + ContentEditor.currentRegion + '"]'
      ).length
    ) {
      machineEmptyMessage.removeClass("hidden");
    }
    orderMachine
      .find(".inline-related.last-related:not(.empty-form)")
      .each(function() {
        $(document).trigger("content-editor:deactivate", [$(this)]);
      });

    // As soon as possible, but not sooner (let the inline.js code run to the end first)
    setTimeout(function() {
      orderMachine
        .find(".inline-related.last-related:not(.empty-form)")
        .each(function() {
          $(document).trigger("content-editor:activate", [$(this)]);
        });
    }, 0);
  });

  // Initialize tabs and currentRegion.
  (function() {
    var tabContainer = $(".tabs.regions");
    for (var i = 0; i < ContentEditor.regions.length; i++) {
      var t = document.createElement("h2");
      t.textContent = ContentEditor.regions[i].title;
      t.setAttribute("data-region", ContentEditor.regions[i].key);
      tabContainer.append(t);
    }

    var tabs = tabContainer.find("h2"),
      tab;
    tabs.on("click", function() {
      ContentEditor.currentRegion = $(this).data("region");
      tabs
        .removeClass("active")
        .filter('[data-region="' + ContentEditor.currentRegion + '"]')
        .addClass("active");
      hideInlinesFromOtherRegions();
      window.location.hash = "tab_" + ContentEditor.currentRegion;

      // Make sure only allowed plugins are in select
      hideNotAllowedDropdown();
      hideNotAllowedPluginButtons();
    });

    // Restore tab if location hash matches.
    if (
      window.location.hash &&
      (tab = tabs.filter(
        '[data-region="' + window.location.hash.substr(5) + '"]'
      )) &&
      tab.length
    ) {
      tab.click();
    } else {
      tabs.eq(0).click();
    }

    tabContainer.find(".toggle").on("click", function() {
      $(".order-machine .inline-related").toggleClass("collapsed");
    });
  })();

  $(document)
    .on("content-editor:deactivate", function(event, row) {
      row.find("fieldset").addClass("content-editor-hidden");
    })
    .on("content-editor:activate", function(event, row) {
      row.find("fieldset").removeClass("content-editor-hidden");
    });

  // Hide fieldsets of to-be-deleted inlines.
  orderMachine.on(
    "click",
    ".delete>input[type=checkbox]",
    function toggleForDeletionClass() {
      var module = $(this).closest(".inline-related");
      if (this.checked) {
        module.addClass("for-deletion");
      } else {
        module.removeClass("for-deletion");
      }
    }
  );

  // Try to keep the current region tab (location hash).
  $("form").submit(function() {
    var form = $(this);
    form.attr("action", (form.attr("action") || "") + window.location.hash);
    return true;
  });

  // Cmd-S and Escape behavior.
  $(document).keydown(function handleKeys(event) {
    if (event.which == 83 && event.metaKey) {
      $(
        "form input[name=" + (event.shiftKey ? "_continue" : "_save") + "]"
      ).click();
      return false;
    } else if (event.which == 27) {
      // TODO cancel an ongoing drag.
      // orderMachine.sortable("cancel");
    }
  });
  (function buildPluginDropdown() {
    var select = buildDropdown(
      ContentEditor.plugins,
      ContentEditor.messages.createNew
    );
    select.addEventListener("change", function() {
      ContentEditor.addContent(select.value);
      select.value = "";
    });
    ContentEditor.machineControlSelect = select;
    hideNotAllowedDropdown();
    $(select)
      .appendTo(".machine-control")
      .wrap('<div class="control-unit"></div>');
  })();

  $(document).trigger("content-editor:ready");
});
