/* global django,Downcoder,ContentEditor */
/* eslint indent:[2,4] */
/* eslint comma-dangle:[2,"never"] */
django.jQuery(function($){
    var context = document.getElementById('content-editor-context');
    if (!context) return;

    window.ContentEditor = {
        addContent: function addContent(plugin) {
            $('#' + plugin + '_set-group .add-row a').click();
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
                button.className = 'plugin-button';
                button.title = title;
                button.addEventListener('click', function() {
                    ContentEditor.addContent(plugin);
                });
                button.innerHTML = html;

                unit.appendChild(button);
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

    function attachMoveToRegionDropdown(inline) {
        if (ContentEditor.regions.length < 2) return;

        var controls = document.createElement('div'),
            select = buildDropdown(ContentEditor.regions),
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
        inlines.hide();
        var shown = inlines.filter('[data-region="' + ContentEditor.currentRegion + '"]');
        machineEmptyMessage.addClass('hidden');
        if (shown.length) {
            shown.show();
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
            row.find('fieldset').hide();
        }
    ).on(
        'content-editor:activate',
        function(event, row) {
            row.find('fieldset').show();
        }
    );

    // Start sortable; hide fieldsets when dragging, and hide fieldsets of to-be-deleted inlines.
    orderMachine.sortable({
        handle: 'h3',
        placeholder: 'placeholder',
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
        $(select).appendTo('.machine-control').wrap('<div class="control-unit"></div>');
    })();

    $(document).trigger('content-editor:ready');
});
