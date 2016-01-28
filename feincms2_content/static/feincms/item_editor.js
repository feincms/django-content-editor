// IE<9 lacks Array.prototype.indexOf
if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function(needle) {
        for (i=0, l=this.length; i<l; ++i) {
            if (this[i] === needle) return i;
        }
        return -1;
    }
}

django.jQuery(function($){
    // Patch up urlify maps to generate nicer slugs in german
    if(typeof(Downcoder) != "undefined"){
        Downcoder.Initialize() ;
        Downcoder.map["ö"] = Downcoder.map["Ö"] = "oe";
        Downcoder.map["ä"] = Downcoder.map["Ä"] = "ae";
        Downcoder.map["ü"] = Downcoder.map["Ü"] = "ue";
    }

    /* .dataset.context instead of getAttribute would be nicer */
    var ItemEditor = JSON.parse(
        document.getElementById('item-editor-script').getAttribute('data-context'));

    $('h2:contains(' + ItemEditor.feincmsContentFieldsetName + ')').parent().replaceWith($('#main_wrapper'));

    var inlineGroups = (function() {
        var selector = [];
        $.each(ItemEditor.plugins, function(key, value) {
            selector.push('#' + key + '_set-group');
        });
        return $(selector.join(', '));
    })();

    var inlines = inlineGroups.find('.inline-related').detach();
    inlines.sort(function inlinesCompareFunction(a, b) {
        var aOrdering = $(a).find('.field-ordering input').val() || 1e9;
        var bOrdering = $(b).find('.field-ordering input').val() || 1e9;
        return Math.sign(aOrdering - bOrdering);
    });
    $('.order-machine').append(inlines);

    $('.order-machine .inline-related').not('.empty-form').each(function assignRegionDataAttribute() {
        var $this = $(this),
            region = $this.find('.field-region input').val();

        // Have to use attr() here because we want the data attribute to
        // be visible to selectors.
        $this.attr('data-region', region);
    });

    function moveEmptyFormsToEnd() {
        $('.order-machine').append(
            $('.order-machine .empty-form').detach()
        );
    }
    moveEmptyFormsToEnd();

    $(document).on('formset:added', function newForm(event, row, optionsPrefix) {
        moveEmptyFormsToEnd();

        var currentRegion = $('.tabs>.active').data('region');
        row.find('.field-region input').val(currentRegion);
        row.attr('data-region', currentRegion);
    });

    function selectRegion(name) {
        $('.tabs>div').removeClass('active').filter('[data-region="' + name + '"]').addClass('active');
        $('.order-machine .inline-related').not('.empty-form').hide().filter('[data-region="' + name + '"]').show();
    }

    $(document).on('click', '.tabs>div', function() {
        selectRegion($(this).data('region'));
    });

    $('.tabs>div:first').trigger('click');

    $('.order-machine').sortable({
        handle: 'h3',
        placeholder: 'placeholder'
    });
    $('.order-machine').on('click', '.delete>input[type=checkbox]', function() {
        $(this).closest('.inline-related')[this.checked ? 'addClass' : 'removeClass']('for-deletion');
    });

    $('form').submit(function(){
        $('.field-ordering input').each(function assignOrdering(index) {
            this.value = index;
        });

        var form = $(this);
        form.attr('action', form.attr('action') + window.location.hash);
        return true;
    });

    $(document).keydown(function handleCmdS(event) {
        if(event.which == 83 && event.metaKey) {
            $('form input[name=' + (event.shiftKey ? '_continue' : '_save') + ']').click();
            return false;
        }
    });

})
