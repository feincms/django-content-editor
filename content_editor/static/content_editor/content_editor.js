/* global django,ContentEditor */

django.jQuery(function ($) {
  const context = document.getElementById("content-editor-context");
  if (!context) return;

  function qs(sel, ctx = document) {
    return ctx.querySelector(sel);
  }
  function qsa(sel, ctx = document) {
    return Array.from(ctx.querySelectorAll(sel));
  }

  const LS = {
    prefix: "ContentEditor:",
    set: function (name, value) {
      try {
        window.localStorage.setItem(this.prefix + name, JSON.stringify(value));
      } catch (e) {
        /* empty */
      }
    },
    get: function (name) {
      try {
        return JSON.parse(window.localStorage.getItem(this.prefix + name));
      } catch (e) {
        /* empty */
      }
    },
  };

  function unselectSelectedPlugin() {
    qsa(".plugin-button.selected").forEach((btn) =>
      btn.classList.remove("selected")
    );
    qs(".order-machine").classList.remove("order-machine-insertion");
  }

  document.body.addEventListener("keyup", (e) => {
    if (e.key === "Escape") unselectSelectedPlugin();
  });

  window.ContentEditor = {
    addContent: function addContent(prefix) {
      $("#" + prefix + "-group .add-row a").click();
    },
    addPluginButton: function addPluginButton(prefix, iconHTML) {
      const plugin = ContentEditor.pluginsByPrefix[prefix];
      if (!plugin) return;

      const button = document.createElement("a");
      button.dataset.pluginPrefix = plugin.prefix;
      button.className = "plugin-button";
      button.title = plugin.title;
      button.addEventListener("click", function (e) {
        e.preventDefault();
        if (button.classList.contains("selected")) {
          button.classList.remove("selected");
          ContentEditor.addContent(plugin.prefix);
        } else {
          unselectSelectedPlugin();
          button.classList.add("selected");
          qs(".order-machine").classList.add("order-machine-insertion");
        }
      });

      const icon = document.createElement("span");
      icon.className = `plugin-button-icon ${iconHTML ? "" : " missing"}`;
      icon.innerHTML = iconHTML || "";
      button.appendChild(icon);

      const title = document.createElement("span");
      title.className = "plugin-button-title";
      title.textContent = plugin.title;
      button.appendChild(title);

      const unit = qs(".plugin-buttons");
      unit.appendChild(button);

      hideNotAllowedPluginButtons([button]);
    },
  };

  $.extend(window.ContentEditor, JSON.parse(context.dataset.context));

  ContentEditor.pluginsByPrefix = {};
  ContentEditor.plugins.forEach(function (plugin) {
    ContentEditor.pluginsByPrefix[plugin.prefix] = plugin;
  });
  ContentEditor.regionsByKey = {};
  ContentEditor.regions.forEach(function (region) {
    ContentEditor.regionsByKey[region.key] = region;
  });

  // Add basic structure. There is always at least one inline group if
  // we even have any plugins.
  let $anchor = $(".inline-group:first");
  if (ContentEditor.plugins.length) {
    $anchor = $("#" + ContentEditor.plugins[0].prefix + "-group");
  }
  $anchor.before(
    `
    <div class="tabs regions"></div>
    <div class="module order-machine-wrapper">
      <div class="order-machine">
        <span class="order-machine-insert-target last"></span>
      </div>
      <div class="machine-control">
        <label class="toggle-sidebar">
          <div class="plugin-button">
            <span class="plugin-button-icon">
              <span class="material-icons">chevron_right</span>
            </span>
            <input type="checkbox" />${ContentEditor.messages.toggleSidebar}
          </div>
        </label>
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
        <div class="plugin-buttons"></div>
        <p class="small invisible-when-collapsed">${ContentEditor.messages.dblclickInsertion}</p>
      </div>
    </div>
    <p class="order-machine-help">${ContentEditor.messages.selectMultiple}</p>
    `
  );

  const orderMachine = $(".order-machine"),
    machineEmptyMessage = $('<p class="hidden machine-message"/>')
      .text(ContentEditor.messages.empty)
      .appendTo(orderMachine),
    noRegionsMessage = $('<p class="hidden machine-message"/>')
      .text(ContentEditor.messages.noRegions)
      .appendTo(orderMachine),
    noPluginsMessage = $('<p class="hidden machine-message"/>')
      .text(ContentEditor.messages.noPlugins)
      .appendTo(orderMachine);

  // Pre map plugin regions
  const pluginRegions = (function () {
    const result = {};
    ContentEditor.plugins.forEach(function (plugin) {
      result[plugin.prefix] = plugin.regions;
    });
    const plugins = ContentEditor.plugins;
    for (let i = 0; i < plugins.length; i++) {
      result[plugins[i].prefix] = plugins[i].regions;
    }
    return result;
  })();

  function ensureDraggable(arg) {
    if (arg.hasClass("empty-form") || arg.hasClass("fs-draggable")) return;

    const inline = arg[0];

    inline.addEventListener("dragstart", function (e) {
      // Only handle events from [draggable] elements
      if (!e.target.closest("h3[draggable]")) return;

      // window.__fs_dragging = inline;
      window.__fs_dragging = e.target.closest(".inline-related");
      window.__fs_dragging.classList.add("fs-dragging");
      window.__fs_dragging.classList.add("selected");

      e.dataTransfer.dropEffect = "move";
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", "");
      } catch (e) {
        // IE11 needs this.
      }
    });
    inline.addEventListener("dragend", function () {
      $(".fs-dragging").removeClass("fs-dragging");
      $(".fs-dragover").removeClass("fs-dragover");
      qsa(".order-machine .inline-related.selected").forEach((el) =>
        el.classList.remove("selected")
      );
    });
    inline.addEventListener(
      "dragover",
      function (e) {
        if (window.__fs_dragging) {
          e.preventDefault();
          $(".fs-dragover").removeClass("fs-dragover");
          e.target.closest(".inline-related").classList.add("fs-dragover");
        }
      },
      true
    );
    inline.addEventListener("drop", function (e) {
      if (window.__fs_dragging) {
        e.preventDefault();
        const before = e.target.closest(".inline-related");
        const toMove = qsa(".order-machine .inline-related.selected").map(
          (inline) => [inline, +inline.style.order]
        );
        toMove.sort((a, b) => a[1] - b[1]);
        toMove.forEach((row) => {
          insertBefore(row[0], before);
          row[0].classList.remove("selected");
        });
        window.__fs_dragging = null;
      }
    });

    arg.find(">h3").attr("draggable", true);
    arg.addClass("fs-draggable");
  }

  function reorderInlines(context) {
    context = context || orderMachine;
    const inlines = context.find(".inline-related");
    inlines.not(".empty-form").each(function () {
      $(document).trigger("content-editor:deactivate", [$(this)]);

      ensureDraggable($(this));
    });

    inlines.detach();
    orderMachine.append(inlines);

    inlines.each(function () {
      const ordering = $(".field-ordering input", this).val() || 1e9;
      this.style.order = ordering;
      ensureDraggable($(this));
    });

    inlines.not(".empty-form").each(function () {
      $(document).trigger("content-editor:activate", [$(this)]);
    });
  }

  function buildDropdown(contents, title) {
    const select = document.createElement("select");
    let idx = 0;

    if (title) select.options[idx++] = new Option(title, "", true);

    for (let i = 0; i < contents.length; i++) {
      // Option _values_ may either be the prefix (for plugins) or keys (for
      // regions)
      select.options[idx++] = new Option(
        contents[i].title,
        contents[i].prefix || contents[i].key
      );
    }
    return select;
  }

  function pluginInCurrentRegion(prefix) {
    if (!ContentEditor.regions.length) return false;

    const plugin = ContentEditor.pluginsByPrefix[prefix];
    const regions = plugin.regions || Object.keys(ContentEditor.regionsByKey);
    return regions.includes(ContentEditor.currentRegion);
  }

  // Hide not allowed plugin buttons
  // If buttons only checks this buttons, else checks all
  function hideNotAllowedPluginButtons(buttons) {
    buttons = buttons ? buttons : qsa(".plugin-buttons .plugin-button");

    let visible = 0;

    buttons.forEach(function (button) {
      const plugin = button.dataset.pluginPrefix;
      const isVisible = pluginInCurrentRegion(plugin);
      button.classList.toggle("content-editor-hidden", !isVisible);
      visible += isVisible ? 1 : 0;
    });

    if (visible) {
      noRegionsMessage.hide();
      noPluginsMessage.hide();
    } else {
      if (ContentEditor.currentRegion) {
        noPluginsMessage.show();
      } else {
        noRegionsMessage.show();
      }
    }
  }

  // Fetch the inline type from id
  function getInlineType($inline) {
    const match = /^([a-z0-9_]+)-\d+$/g.exec($inline.attr("id"));
    if (match) {
      return match[1];
    }
    return null;
  }

  function attachMoveToRegionDropdown($inline) {
    // Filter allowed regions
    const inlineType = getInlineType($inline);
    const regions = [];
    for (let i = 0; i < ContentEditor.regions.length; i++) {
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

    const select = buildDropdown(regions),
      regionInput = $inline.find(".field-region input");

    select.className = "inline_move_to_region";
    select.value = regionInput.val();
    $inline.find("> h3 .inline_label").after(select);

    select.addEventListener("change", function () {
      $inline.attr("data-region", select.value);
      regionInput.val(select.value);
      hideInlinesFromOtherRegions();
      setBiggestOrdering($inline);
      reorderInlines();
    });
  }

  // Assing data-region to all inlines.
  // We also want to the data attribute to be visible to selectors (that's why we're using $.attr)
  function assignRegionDataAttribute() {
    orderMachine.find(".inline-related:not(.empty-form)").each(function () {
      const $this = $(this);
      let region = $this.find(".field-region input").val();

      if (!ContentEditor.regionsByKey[region]) {
        const key = `_unknown_${region}`;
        if (!ContentEditor.regionsByKey[key]) {
          const spec = {
            key: `_unknown_${region}`,
            title: `${ContentEditor.messages.unknownRegion}: ${region}`,
            inherited: false,
          };
          ContentEditor.regions.push(spec);
          ContentEditor.regionsByKey[spec.key] = spec;
        }
        region = key;
      }

      $this.attr("data-region", region);
      attachMoveToRegionDropdown($this);
    });
  }

  function setBiggestOrdering($row) {
    const orderings = [];
    orderMachine.find(".field-ordering input").each(function () {
      if (!isNaN(+this.value)) orderings.push(+this.value);
    });
    const ordering = 10 + Math.max.apply(null, orderings);
    $row.find(".field-ordering input").val(ordering);
    $row.css("order", ordering);
  }

  function insertBefore(row, before) {
    const beforeOrdering = +qs(".field-ordering input", before).value,
      beforeRows = [],
      afterRows = [];
    orderMachine.find(".inline-related:not(.empty-form)").each(function () {
      const thisOrderingField = qs(".field-ordering input", this);
      if (this != row && !isNaN(+thisOrderingField.value)) {
        if (+thisOrderingField.value >= beforeOrdering) {
          afterRows.push([this, thisOrderingField]);
        } else {
          beforeRows.push([this, thisOrderingField]);
        }
      }
    });
    beforeRows.sort(function (a, b) {
      return a[1].value - b[1].value;
    });
    afterRows.sort(function (a, b) {
      return a[1].value - b[1].value;
    });
    let rows = [].concat(beforeRows);
    rows.push([row, qs(".field-ordering input", row)]);
    rows = rows.concat(afterRows);
    for (let i = 0; i < rows.length; ++i) {
      const thisRow = rows[i];
      thisRow[1].value = thisRow[0].style.order = 10 * (1 + i);
    }
  }

  function hideInlinesFromOtherRegions() {
    const inlines = orderMachine.find(".inline-related:not(.empty-form)");
    inlines.addClass("content-editor-hidden");
    const shown = inlines.filter(
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

  const pluginInlineGroups = (function selectPluginInlineGroups() {
    const selector = [];
    for (let i = 0; i < ContentEditor.plugins.length; i++) {
      selector.push("#" + ContentEditor.plugins[i].prefix + "-group");
    }
    return $(selector.join(", "));
  })();

  reorderInlines(pluginInlineGroups);
  pluginInlineGroups.hide();
  assignRegionDataAttribute();

  $(document).on(
    "click",
    ".order-machine-insert-target",
    function handleInsertion(e) {
      const plugin = qs(".plugin-button.selected");
      if (!plugin) return;

      ContentEditor._insertBefore = e.target.closest(".inline-related");
      ContentEditor.addContent(plugin.dataset.pluginPrefix);
    }
  );

  // Always move empty forms to the end, because new plugins are inserted
  // just before its empty form. Also, assign region data.
  $(document).on("formset:added", function newForm(event, $row, formsetName) {
    // Not one of our managed inlines?
    if (!ContentEditor.pluginsByPrefix[formsetName]) return;

    $row.find(".field-region input").val(ContentEditor.currentRegion);
    $row.find("h3 .inline_label").text(ContentEditor.messages.newItem);
    $row.attr("data-region", ContentEditor.currentRegion);

    setBiggestOrdering($row);
    attachMoveToRegionDropdown($row);
    ensureDraggable($row);

    machineEmptyMessage.addClass("hidden");

    if (ContentEditor._insertBefore) {
      insertBefore($row[0], ContentEditor._insertBefore);
      ContentEditor._insertBefore = null;
    }

    $(document).trigger("content-editor:activate", [$row]);

    $row.find("input, select, textarea").first().focus();
  });

  $(document).on(
    "formset:removed",
    function resetInlines(_event, _row, formsetName) {
      // Not one of our managed inlines?
      if (!ContentEditor.pluginsByPrefix[formsetName]) return;

      if (
        !orderMachine.find(
          '.inline-related[data-region="' + ContentEditor.currentRegion + '"]'
        ).length
      ) {
        machineEmptyMessage.removeClass("hidden");
      }
      orderMachine
        .find(".inline-related.last-related:not(.empty-form)")
        .each(function () {
          $(document).trigger("content-editor:deactivate", [$(this)]);
        });

      // As soon as possible, but not sooner (let the inline.js code run to the end first)
      setTimeout(function () {
        orderMachine
          .find(".inline-related.last-related:not(.empty-form)")
          .each(function () {
            $(document).trigger("content-editor:activate", [$(this)]);
          });
      }, 0);
    }
  );

  // Initialize tabs and currentRegion.
  (function () {
    const tabContainer = $(".tabs.regions");
    for (let i = 0; i < ContentEditor.regions.length; i++) {
      const t = document.createElement("h2");
      t.className = "tab";
      t.textContent = ContentEditor.regions[i].title;
      t.setAttribute("data-region", ContentEditor.regions[i].key);
      tabContainer.append(t);
    }

    const tabs = tabContainer.find("h2");
    tabs.on("click", function () {
      ContentEditor.currentRegion = $(this).data("region");
      hideInlinesFromOtherRegions();
      tabs
        .removeClass("active")
        .filter('[data-region="' + ContentEditor.currentRegion + '"]')
        .addClass("active");
      window.history.replaceState(
        null,
        "",
        "#tab_" + ContentEditor.currentRegion
      );

      // Make sure only allowed plugins are in select
      hideNotAllowedPluginButtons();
    });

    // Restore tab if location hash matches.
    window.setTimeout(function () {
      let tab;
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
    }, 1);

    const collapseAllInput = $(".collapse-items input");
    collapseAllInput.on("change", function () {
      $(".order-machine .inline-related:not(.empty-form)").toggleClass(
        "collapsed",
        this.checked
      );
      LS.set("collapseAll", this.checked);

      if (this.checked) {
        $(".order-machine .inline-related:not(.empty-form) .errorlist").each(
          function uncollapseInvalidFieldsets() {
            this.closest(".inline-related").classList.remove("collapsed");
          }
        );
      }
    });
    collapseAllInput.attr("checked", LS.get("collapseAll")).trigger("change");

    const toggleSidebar = $(".toggle-sidebar input");
    const omWrapper = document.querySelector(".order-machine-wrapper");
    toggleSidebar.on("change", function () {
      omWrapper.classList.toggle("collapsed", this.checked);
      LS.set("collapseSidebar", this.checked);
    });
    toggleSidebar.attr("checked", LS.get("collapseSidebar")).trigger("change");
  })();

  (function initializeInsertTargets() {
    qsa(".order-machine .inline-related").forEach((inline) => {
      const span = document.createElement("span");
      span.className = "order-machine-insert-target";
      inline.appendChild(span);
    });
  })();

  $(document)
    .on("content-editor:deactivate", function (event, row) {
      row.find("fieldset").addClass("content-editor-hidden");
    })
    .on("content-editor:activate", function (event, row) {
      row.find("fieldset").removeClass("content-editor-hidden");
    });

  // Hide fieldsets of to-be-deleted inlines.
  orderMachine.on(
    "click",
    ".delete>input[type=checkbox]",
    function toggleForDeletionClass() {
      this.closest(".inline-related").classList.toggle(
        "for-deletion",
        this.checked
      );
      this.blur();
    }
  );

  orderMachine.on("click", ".inline-related>h3", function toggleCollapsed(e) {
    if (e.ctrlKey) {
      e.preventDefault();
      this.closest(".inline-related").classList.toggle("selected");
    } else if (
      !e.target.closest(".delete") &&
      !e.target.closest(".inline_move_to_region")
    ) {
      e.preventDefault();
      this.closest(".inline-related").classList.toggle("collapsed");
    }
  });

  // Since we pulled out the fieldsets from their containing module
  // we have to reimplement the Show/Hide toggle for order machine items.
  orderMachine.on("click", ".collapse-toggle", function toggleCollapsed(e) {
    // This only reaches us if it hasn't been handled by Django's collapse.js
    e.preventDefault();
    const fieldset = this.closest("fieldset");
    if (fieldset.classList.contains("collapsed")) {
      e.target.textContent = window.gettext("Hide");
      fieldset.classList.remove("collapsed");
    } else {
      e.target.textContent = window.gettext("Show");
      fieldset.classList.add("collapsed");
    }
  });

  // Unselect the currently selected plugin
  $(document.body).on("click", function removeSelected(e) {
    if (
      !e.target.closest(".plugin-button") &&
      !e.target.closest(".order-machine-insert-target")
    ) {
      unselectSelectedPlugin();
    }
  });

  // Try to keep the current region tab (location hash).
  $("form").submit(function () {
    const form = $(this);
    form.attr("action", (form.attr("action") || "") + window.location.hash);
    return true;
  });

  ContentEditor.plugins.forEach(function (plugin) {
    ContentEditor.addPluginButton(plugin.prefix, plugin.button);
  });

  const style = document.createElement("style");
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
  `;
  document.head.appendChild(style);

  $(document).trigger("content-editor:ready");
});
