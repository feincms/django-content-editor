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
    var ContentEditor = JSON.parse(
            document.getElementById('content-editor-script').getAttribute('data-context')),
        currentRegion,
        orderMachine = $('.order-machine');

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
            return Math.sign(aOrdering - bOrdering);
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
        var controls = document.createElement('div'),
            select = buildDropdown(ContentEditor.regions),
            regionInput = inline.find('.field-region input');

        select.value = regionInput.val();
        controls.className = 'inline-controls';
        controls.appendChild(select);
        inline.append(controls)

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
        $('.field-ordering input').each(function() {
            if (!isNaN(+this.value)) orderings.push(+this.value);
        });
        row.find('.field-ordering input').val(10 + Math.max.apply(null, orderings));
    }

    function hideInlinesFromOtherRegions() {
        orderMachine.find(
            '.inline-related:not(.empty-form)'
        ).hide().filter(
            '[data-region="' + currentRegion + '"]'
        ).show();
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
    $(document).on('formset:added', function newForm(event, row, optionsPrefix) {
        moveEmptyFormsToEnd();

        row.find('.field-region input').val(currentRegion);
        row.attr('data-region', currentRegion);

        setBiggestOrdering(row);
        attachMoveToRegionDropdown(row);

        $(document).trigger('content-editor:activate', [row]);
    });

    $(document).on('formset:removed', function resetInlines(event, row, optionsPrefix) {
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

        var tabContainer = $('.tabs');
        for (var i=0; i < ContentEditor.regions.length; i++) {
            var t = document.createElement('div');
            t.textContent = ContentEditor.regions[i][1];
            t.setAttribute('data-region', ContentEditor.regions[i][0]);
            tabContainer.append(t);
        }

        var tabs = tabContainer.children(), tab;
        tabs.on('click', function() {
            currentRegion = $(this).data('region');
            $('.tabs>div').removeClass('active').filter('[data-region="' + currentRegion + '"]').addClass('active');
            hideInlinesFromOtherRegions();
            window.location.hash = 'tab_' + currentRegion;
        });

        // Restore tab if location hash matches.
        if (window.location.hash && (tab = tabs.filter('[data-region="' + window.location.hash.substr(5) + '"]')) && tab.length) {
            tab.click();
        } else {
            tabs.eq(0).click();
        }

        // Hide tabs if only one.
        if (tabs.length <= 1) tabs.hide();
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
        var select = buildDropdown(ContentEditor.plugins, ContentEditor.messages.createNew);
        select.addEventListener('change', function() {
            $('#' + select.value + '_set-group .add-row a').click();
            select.value = '';
        });
        $(select).appendTo('.machine-control').wrap('<div class="control-unit"></div>');
    })();

});
