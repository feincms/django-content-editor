/* global django,Downcoder,ContentEditor */
/* eslint indent:[2,4] */
/* eslint comma-dangle:[2,"never"] */
django.jQuery(function($){
    var context = document.getElementById('content-editor-context');
    if (!context) return;

    window.ContentEditor = {
        addContent: function addContent(plugin) {
            $('#' + plugin + '_set-group .add-row a')[0].click();
        },
        addPluginButton: function addPluginButton(plugin, html) {
            var doAdd = function(plugin, html, title) {
                var unit = document.querySelector('.control-unit.plugin-buttons');
                if (!unit) {
                    unit = document.createElement('div');
                    unit.className = 'control-unit plugin-buttons';
                    document.querySelector('.machine-control').appendChild(unit);
                }

                var button = document.createElement('a');
                var $button = $(button);
                $button.data("plugin", plugin);
                button.className = 'plugin-button';
                button.title = title;
                button.addEventListener('click', function() {
                    ContentEditor.addContent(plugin);
                });
                button.innerHTML = html;

                unit.appendChild(button);

                hideNotAllowedPluginButtons($button);
            };

            for (var i=0; i<ContentEditor.plugins.length; i++) {
                if (ContentEditor.plugins[i][0] == plugin) {
                    doAdd(plugin, html, ContentEditor.plugins[i][1]);
                    break;
                }
            }
        }
    };

    // .dataset.context instead of getAttribute would be nicer
    $.extend(window.ContentEditor, JSON.parse(context.getAttribute('data-context')));

    // Add basic structure. There is always at least one inline group if
    // we even have any plugins.
    $('.inline-group:first').before(
        '<div class="tabs regions"></div>' +
        '<div class="module">' +
        '<div class="order-machine"></div><div class="machine-control"></div>' +
        '</div>'
    );

    var orderMachine = $('.order-machine'),
        machineEmptyMessage = $('<p class="hidden machine-message"/>').text(ContentEditor.messages.empty).appendTo(orderMachine);


    // Pre map plugin regions
    var pluginRegions = (function() {
        var result = {};
        var plugins = ContentEditor.plugins;
        for (var i = 0; i < plugins.length; i++) {
            result[plugins[i][0]] = plugins[i][2];
        }
        return result;
    })();


    function moveEmptyFormsToEnd() {
        orderMachine.append(orderMachine.find('.empty-form').detach());
    }

    function reorderInlines(context) {
        context = context || orderMachine;
        var inlines = context.find('.inline-related');
        inlines.not('.empty-form').each(function() {
            $(document).trigger('content-editor:deactivate', [$(this)]);
        });
        inlines.detach();
        inlines.sort(function inlinesCompareFunction(a, b) {
            var aOrdering = $(a).find('.field-ordering input').val() || 1e9;
            var bOrdering = $(b).find('.field-ordering input').val() || 1e9;
            return aOrdering - bOrdering;
        });
        orderMachine.append(inlines);
        moveEmptyFormsToEnd();
        inlines.not('.empty-form').each(function() {
            $(document).trigger('content-editor:activate', [$(this)]);
        });
    }

    function buildDropdown(contents, title) {
        var select = document.createElement('select'),
            idx = 0;

        if (title)
            select.options[idx++] = new Option(title, '', true);

        for (var i = 0; i < contents.length; i++) {
            select.options[idx++] = new Option(contents[i][1], contents[i][0]);
        }
        return select;
    }


    // Hides plugins that are not allowed in this region
    function hideNotAllowedDropdown() {
        $(ContentEditor.machineControlSelect).find("option").each(function() {
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
        $buttons = $buttons ? $buttons :
                            $('.control-unit.plugin-buttons .plugin-button');

        var region = ContentEditor.currentRegion;

        $buttons.each(function() {
            var $button = $(this);
            var plugin = $button.data('plugin');
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
        var match = /^([a-z0-9_]+)_set-\d+$/g.exec($(inline).attr('id'));
        if (match) {
            return match[1];
        }
        return null;
    }


    function attachMoveToRegionDropdown(inline) {

        // Filter allowed regions
        var inlineType = getInlineType(inline);
        var regions = [];
        for (var i = 0; i < ContentEditor.regions.length; i++) {
            if (!inlineType || !pluginRegions[inlineType] || $.inArray(ContentEditor.regions[i][0], pluginRegions[inlineType]) >= 0) {
                regions.push(ContentEditor.regions[i]);
            }
        };

        if (regions.length < 2) return;

        var controls = document.createElement('div'),
            select = buildDropdown(regions),
            regionInput = inline.find('.field-region input');

        select.value = regionInput.val();
        controls.className = 'inline-controls';
        controls.appendChild(select);
        inline.append(controls);

        select.addEventListener('change', function() {
            inline.attr('data-region', select.value);
            regionInput.val(select.value);
            hideInlinesFromOtherRegions();
            setBiggestOrdering(inline);
            reorderInlines();
        });
    }

    // Assing data-region to all inlines.
    // We also want to the data attribute to be visible to selectors (that's why we're using $.attr)
    function assignRegionDataAttribute() {
        orderMachine.find('.inline-related:not(.empty-form)').each(function() {
            var $this = $(this),
                region = $this.find('.field-region input').val();

            $this.attr('data-region', region);
            attachMoveToRegionDropdown($this);
        });
    }

    function setBiggestOrdering(row) {
        var orderings = [];
        orderMachine.find('.field-ordering input').each(function() {
            if (!isNaN(+this.value)) orderings.push(+this.value);
        });
        row.find('.field-ordering input').val(10 + Math.max.apply(null, orderings));
    }

    function hideInlinesFromOtherRegions() {
        var inlines = orderMachine.find('.inline-related:not(.empty-form)');
        inlines.addClass('content-editor-hidden');
        var shown = inlines.filter('[data-region="' + ContentEditor.currentRegion + '"]');
        machineEmptyMessage.addClass('hidden');
        if (shown.length) {
            shown.removeClass('content-editor-hidden');
        } else {
            machineEmptyMessage.removeClass('hidden');
        }
    }


    var pluginInlineGroups = (function selectPluginInlineGroups() {
        var selector = [];
        for (var i=0; i < ContentEditor.plugins.length; i++) {
            selector.push('#' + ContentEditor.plugins[i][0] + '_set-group');
        }
        return $(selector.join(', '));
    })();


    reorderInlines(pluginInlineGroups);
    pluginInlineGroups.hide();
    assignRegionDataAttribute();




    // Always move empty forms to the end, because new plugins are inserted
    // just before its empty form. Also, assign region data.
    $(document).on('formset:added', function newForm(event, row) {
        moveEmptyFormsToEnd();

        row.find('.field-region input').val(ContentEditor.currentRegion);
        row.attr('data-region', ContentEditor.currentRegion);

        setBiggestOrdering(row);
        attachMoveToRegionDropdown(row);

        machineEmptyMessage.addClass('hidden');

        $(document).trigger('content-editor:activate', [row]);
    });

    $(document).on('formset:removed', function resetInlines() {
        if (!orderMachine.find('.inline-related[data-region="' + ContentEditor.currentRegion + '"]').length) {
            machineEmptyMessage.removeClass('hidden');
        }
        orderMachine.find('.inline-related.last-related:not(.empty-form)').each(function() {
            $(document).trigger('content-editor:deactivate', [$(this)]);
        });

        // As soon as possible, but not sooner (let the inline.js code run to the end first)
        setTimeout(function() {
            orderMachine.find('.inline-related.last-related:not(.empty-form)').each(function() {
                $(document).trigger('content-editor:activate', [$(this)]);
            });
        }, 0);

    });

    // Initialize tabs and currentRegion.
    (function() {

        var tabContainer = $('.tabs.regions');
        for (var i=0; i < ContentEditor.regions.length; i++) {
            var t = document.createElement('h2');
            t.textContent = ContentEditor.regions[i][1];
            t.setAttribute('data-region', ContentEditor.regions[i][0]);
            tabContainer.append(t);
        }

        var tabs = tabContainer.children(), tab;
        tabs.on('click', function() {
            ContentEditor.currentRegion = $(this).data('region');
            tabs.removeClass('active').filter('[data-region="' + ContentEditor.currentRegion + '"]').addClass('active');
            hideInlinesFromOtherRegions();
            window.location.hash = 'tab_' + ContentEditor.currentRegion;

            // Make sure only allowed plugins are in select
            hideNotAllowedDropdown();
            hideNotAllowedPluginButtons();
        });

        // Restore tab if location hash matches.
        if (window.location.hash && (tab = tabs.filter('[data-region="' + window.location.hash.substr(5) + '"]')) && tab.length) {
            tab.click();
        } else {
            tabs.eq(0).click();
        }

    })();

    $(document).on(
        'content-editor:deactivate',
        function(event, row) {
            row.find('fieldset').addClass('content-editor-hidden');
        }
    ).on(
        'content-editor:activate',
        function(event, row) {
            row.find('fieldset').removeClass('content-editor-hidden');
        }
    );

    // Start sortable; hide fieldsets when dragging, and hide fieldsets of to-be-deleted inlines.
    orderMachine.sortable({
        handle: 'h3',
        placeholder: 'placeholder',
        // Newly added forms MUST be added at the end and remain there until
        // they are saved; Django's inline formsets do not like "missing"
        // primary keys within forms with index < initial form count
        // Previously: items: '.inline-related:not(.empty-form)',
        items: '.inline-related.has_original',
        start: function(event, ui) {
            $(document).trigger('content-editor:deactivate', [ui.item]);
        },
        stop: function(event, ui) {
            $(document).trigger('content-editor:activate', [ui.item]);
        }
    }).on('click', '.delete>input[type=checkbox]', function toggleForDeletionClass() {
        $(this).closest('.inline-related')[this.checked ? 'addClass' : 'removeClass']('for-deletion');
    });

    // Fill in ordering field and try to keep the current region tab (location hash).
    $('form').submit(function(){
        orderMachine.find('.field-ordering input').each(function assignOrdering(index) {
            this.value = 10 * (index + 1); // Avoid default=0 just because.
        });

        var form = $(this);
        form.attr('action', form.attr('action') + window.location.hash);
        return true;
    });

    // Cmd-S and Escape behavior.
    $(document).keydown(function handleKeys(event) {
        if (event.which == 83 && event.metaKey) {
            $('form input[name=' + (event.shiftKey ? '_continue' : '_save') + ']').click();
            return false;
        } else if (event.which == 27) {
            orderMachine.sortable('cancel');
        }
    });

    (function buildPluginDropdown() {
        var select = buildDropdown(ContentEditor.plugins, ContentEditor.messages.createNew);
        select.addEventListener('change', function() {
            ContentEditor.addContent(select.value);
            select.value = '';
        });
        ContentEditor.machineControlSelect = select;
        hideNotAllowedDropdown();
        $(select).appendTo('.machine-control').wrap('<div class="control-unit"></div>');
    })();

    $(document).trigger('content-editor:ready');
});
