/* global django */
/* eslint indent:[2,4] */
/* eslint comma-dangle:[2,"never"] */
django.jQuery(function($) {
    var tabbed = $('.tabbed');
    if (tabbed.length > 1) {
        tabbed.eq(0).before(
            '<div id="tabbed" class="clearfix">' +
            '<div class="tabs clearfix"></div>' +
            '<div class="modules"></div>' +
            '</div>'
        );

        var $tabs = $('#tabbed > .tabs'),
            $modules = $('#tabbed > .modules');

        tabbed.each(function createTabs(index) {
            var $old = $(this),
                $title = $old.children('h2');

            if ($old.find('.errorlist').length) {
              $title.addClass('has-error');
            }

            $title.attr('data-index', index);
            $tabs.append($title);

            $old.addClass('hidden');

            $modules.append($old);
        });

        $tabs.on('click', '[data-index]', function() {
            var $tab = $(this);
            if ($tab.hasClass('active')) {
                $tab.removeClass('active');
                $modules.children().addClass('hidden');
            } else {
                $tabs.find('.active').removeClass('active');
                $tab.addClass('active');
                $modules.children().addClass('hidden').eq(
                    $tab.data('index')
                ).removeClass('hidden');
            }
        });
    }
});
