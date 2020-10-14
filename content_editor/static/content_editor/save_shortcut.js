/* global django */
django.jQuery(function ($) {
  $(document).keydown(function handleKeys(event) {
    if (event.which == 83 && (event.metaKey || event.ctrlKey)) {
      $("form input[name=_continue]").click();
      return false;
    }
  });
});
