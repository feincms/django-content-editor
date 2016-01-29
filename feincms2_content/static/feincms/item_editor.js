// IE<9 lacks Array.prototype.indexOf
if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function(needle) {
        for (var i=0, l=this.length; i<l; ++i) {
            if (this[i] === needle) return i;
        }
        return -1;
    };
}

django.jQuery(function($){
    // Patch up urlify maps to generate nicer slugs in german
    if(typeof(Downcoder) != "undefined"){
        Downcoder.Initialize() ;
        Downcoder.map["ö"] = Downcoder.map["Ö"] = "oe";
        Downcoder.map["ä"] = Downcoder.map["Ä"] = "ae";
        Downcoder.map["ü"] = Downcoder.map["Ü"] = "ue";
    }

    // .dataset.context instead of getAttribute would be nicer
    var ItemEditor = JSON.parse(
        document.getElementById('item-editor-script').getAttribute('data-context'));

    // Move the item editor to its place
    $('h2:contains(' + ItemEditor.feincmsContentFieldsetName + ')').parent().replaceWith($('#main_wrapper'));

    var currentRegion,
        orderMachine = $('.order-machine');

    function moveEmptyFormsToEnd() {
        orderMachine.append(orderMachine.find('.empty-form').detach());
    }

    function reorderInlines(context) {
        var inlines = context.find('.inline-related').detach();
        inlines.sort(function inlinesCompareFunction(a, b) {
            var aOrdering = $(a).find('.field-ordering input').val() || 1e9;
            var bOrdering = $(b).find('.field-ordering input').val() || 1e9;
            return Math.sign(aOrdering - bOrdering);
        });
        orderMachine.append(inlines);
        moveEmptyFormsToEnd();
        // TODO breaks CKEDITOR
    }

    function buildDropdown(items, title) {
        var select = document.createElement('select');
        select.options[0] = new Option(title, '', true);
        for (var i=0; i<items.length; i++) {
            select.options[i + 1] = new Option(items[i][1], items[i][0]);
        }
        return select;
    }

    // Assing data-region to all inlines.
    // We also want to the data attribute to be visible to selectors (that's why we're using $.attr)
    function assignRegionDataAttribute() {
        orderMachine.find('.inline-related:not(.empty-form)').each(function() {
            var $this = $(this),
                region = $this.find('.field-region input').val();

            $this.attr('data-region', region);
        });
    }

    function setBiggestOrdering(row) {
        var orderings = [];
        $('.field-ordering input').each(function() {
            if (!isNaN(+this.value)) orderings.push(+this.value);
        });
        row.find('.field-ordering input').val(10 + Math.max.apply(null, orderings));
    }



    var pluginInlineGroups = (function selectPluginInlineGroups() {
        var selector = [];
        for (var i=0; i < ItemEditor.plugins.length; i++) {
            selector.push('#' + ItemEditor.plugins[i][0] + '_set-group');
        }
        return $(selector.join(', '));
    })();

    reorderInlines(pluginInlineGroups);
    pluginInlineGroups.hide();
    assignRegionDataAttribute();




    // Always move empty forms to the end, because new plugins are inserted
    // just before its empty form. Also, assign region data.
    $(document).on('formset:added', function newForm(event, row, optionsPrefix) {
        moveEmptyFormsToEnd();

        row.find('.field-region input').val(currentRegion);
        row.attr('data-region', currentRegion);

        setBiggestOrdering(row);
    });

    // Initialize tabs and currentRegion.
    (function() {
        var tabs = $('.tabs>div'), tab;
        tabs.on('click', function() {
            currentRegion = $(this).data('region');
            $('.tabs>div').removeClass('active').filter('[data-region="' + currentRegion + '"]').addClass('active');
            orderMachine.find('.inline-related:not(.empty-form)').hide().filter('[data-region="' + currentRegion + '"]').show();
            window.location.hash = 'tab_' + currentRegion;
        });

        // Restore tab if location hash matches.
        if (window.location.hash && (tab = tabs.filter('[data-region="' + window.location.hash.substr(5) + '"]'))) {
            tab.click();
        } else {
            tabs.eq(0).click();
        }

        // Hide tabs if only one.
        if (tabs.length <= 1) tabs.hide();
    })();

    // Start sortable; hide fieldsets when dragging, and hide fieldsets of to-be-deleted inlines.
    orderMachine.sortable({
        handle: 'h3',
        placeholder: 'placeholder',
        start: function(event, ui) {
            ui.item.find('fieldset').hide();
        },
        stop: function(event, ui) {
            ui.item.find('fieldset').show();
        }
    }).on('click', '.delete>input[type=checkbox]', function toggleForDeletionClass() {
        $(this).closest('.inline-related')[this.checked ? 'addClass' : 'removeClass']('for-deletion');
    });

    // Fill in ordering field and try to keep the current region tab (location hash).
    $('form').submit(function(){
        $('.field-ordering input').each(function assignOrdering(index) {
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
        var select = buildDropdown(ItemEditor.plugins, ItemEditor.messages.createNew);
        select.addEventListener('change', function() {
            $('#' + select.value + '_set-group .add-row a').click();
            select.value = '';
        });
        $(select).appendTo('.machine-control').wrap('<div class="control-unit"></div>');
    })();

    orderMachine.find('.inline-related').each(function() {
        var inline = $(this),
            controls = document.createElement('div'),
            select = buildDropdown(ItemEditor.regions, 'Move to region');
        controls.className = 'inline-controls';
        controls.appendChild(select);
        $(controls).appendTo(this);

        select.addEventListener('change', function() {
            var inlineRegionInput = inline.find('.field-region input'),
                currentInlineRegion = inlineRegionInput.val();
            if (select.value && currentInlineRegion != select.value) {
                inlineRegionInput.val(select.value);
                inline.attr('data-region', select.value);
                orderMachine.find('.inline-related:not(.empty-form)').hide().filter('[data-region="' + currentRegion + '"]').show();
                setBiggestOrdering(inline);
                reorderInlines(orderMachine);
            }
            select.value = '';
        });
    });

    console.log(JSON.stringify(ItemEditor));
});
