# coding=utf-8

from __future__ import absolute_import, unicode_literals

from django import template
from django.apps import apps
from django.conf import settings
from django.http import HttpRequest

from feincms import settings as feincms_settings
from feincms.module.page.extensions.navigation import PagePretender


register = template.Library()


def _get_page_model():
    return apps.get_model(
        *feincms_settings.FEINCMS_DEFAULT_PAGE_MODEL.split('.'))


@register.assignment_tag(takes_context=True)
def feincms_nav(context, feincms_page, level=1, depth=1, group=None):
    """
    Saves a list of pages into the given context variable.
    """

    page_class = _get_page_model()

    if not feincms_page:
        return []

    if isinstance(feincms_page, HttpRequest):
        try:
            feincms_page = page_class.objects.for_request(
                feincms_page, best_match=True)
        except page_class.DoesNotExist:
            return []

    mptt_opts = feincms_page._mptt_meta

    # mptt starts counting at zero
    mptt_level_range = [level - 1, level + depth - 1]

    queryset = feincms_page.__class__._default_manager.in_navigation().filter(
        **{
            '%s__gte' % mptt_opts.level_attr: mptt_level_range[0],
            '%s__lt' % mptt_opts.level_attr: mptt_level_range[1],
        }
    )

    page_level = getattr(feincms_page, mptt_opts.level_attr)

    # Used for subset filtering (level>1)
    parent = None

    if level > 1:
        # A subset of the pages is requested. Determine it depending
        # upon the passed page instance

        if level - 2 == page_level:
            # The requested pages start directly below the current page
            parent = feincms_page

        elif level - 2 < page_level:
            # The requested pages start somewhere higher up in the tree
            parent = feincms_page.get_ancestors()[level - 2]

        elif level - 1 > page_level:
            # The requested pages are grandchildren of the current page
            # (or even deeper in the tree). If we would continue processing,
            # this would result in pages from different subtrees being
            # returned directly adjacent to each other.
            queryset = page_class.objects.none()

        if parent:
            if getattr(parent, 'navigation_extension', None):
                # Special case for navigation extensions
                return list(parent.extended_navigation(
                    depth=depth, request=context.get('request')))

            # Apply descendant filter
            queryset &= parent.get_descendants()

    if depth > 1:
        # Filter out children with inactive parents
        # None (no parent) is always allowed
        parents = set([None])
        if parent:
            # Subset filtering; allow children of parent as well
            parents.add(parent.id)

        def _parentactive_filter(iterable):
            for elem in iterable:
                if elem.parent_id in parents:
                    yield elem
                parents.add(elem.id)

        queryset = _parentactive_filter(queryset)

    if group is not None:
        # navigationgroups extension support
        def _navigationgroup_filter(iterable):
            for elem in iterable:
                if getattr(elem, 'navigation_group', None) == group:
                    yield elem

        queryset = _navigationgroup_filter(queryset)

    if hasattr(feincms_page, 'navigation_extension'):
        # Filter out children of nodes which have a navigation extension
        def _navext_filter(iterable):
            current_navextension_node = None
            for elem in iterable:
                # Eliminate all subitems of last processed nav extension
                if current_navextension_node is not None and \
                   current_navextension_node.is_ancestor_of(elem):
                    continue

                yield elem
                if getattr(elem, 'navigation_extension', None):
                    current_navextension_node = elem
                    try:
                        for extended in elem.extended_navigation(
                                depth=depth, request=context.get('request')):
                            # Only return items from the extended navigation
                            # which are inside the requested level+depth
                            # values. The "-1" accounts for the differences in
                            # MPTT and navigation level counting
                            this_level = getattr(
                                extended, mptt_opts.level_attr, 0)
                            if this_level < level + depth - 1:
                                yield extended
                    except Exception:
                        pass  # XXX Warning
                else:
                    current_navextension_node = None

        queryset = _navext_filter(queryset)

    # Return a list, not a generator so that it can be consumed
    # several times in a template.
    return list(queryset)


@register.simple_tag(takes_context=True)
def feincms_languagelinks(context, feincms_page, options):
    """
    ::

        {% feincms_languagelinks for feincms_page as links [args] %}

    This template tag needs the translations extension.

    Arguments can be any combination of:

    * all or existing: Return all languages or only those where a translation
      exists
    * excludecurrent: Excludes the item in the current language from the list
    * request=request: The current request object, only needed if you are using
      AppContents and need to append the "extra path"

    The default behavior is to return an entry for all languages including the
    current language.

    Example::

      {% feincms_languagelinks feincms_page all,excludecurrent as links %}
      {% for key, name, link in links %}
          <a href="{% if link %}{{ link }}{% else %}/{{ key }}/{% endif %}">
            {% trans name %}</a>
      {% endfor %}
    """
    args = options.split(',')
    only_existing = args.get('existing', False)
    exclude_current = args.get('excludecurrent', False)

    # Preserve the trailing path when switching languages if extra_path
    # exists (this is mostly the case when we are working inside an
    # ApplicationContent-managed page subtree)
    trailing_path = ''
    request = context.get('request')
    if request:
        # Trailing path without first slash
        trailing_path = request._feincms_extra_context.get(
            'extra_path', '')[1:]

    translations = dict(
        (t.language, t) for t in feincms_page.available_translations())
    translations[feincms_page.language] = feincms_page

    links = []
    for key, name in settings.LANGUAGES:
        if exclude_current and key == feincms_page.language:
            continue

        # hardcoded paths... bleh
        if key in translations:
            links.append((
                key,
                name,
                translations[key].get_absolute_url() + trailing_path))
        elif not only_existing:
            links.append((key, name, None))

    return links


@register.assignment_tag(takes_context=True)
def page_is_active(context, page, feincms_page=None, path=None):
    """
    Usage example::

        {% feincms_nav feincms_page level=1 as toplevel %}
        <ul>
        {% for page in toplevel %}
            {% page_is_active page as is_active %}
            <li {% if is_active %}class="active"{% endif %}>
                <a href="{{ page.get_navigation_url }}">{{ page.title }}</a>
            <li>
        {% endfor %}
        </ul>
    """
    if isinstance(page, PagePretender):
        if path is None:
            path = context['request'].path_info
        return path.startswith(page.get_absolute_url())

    else:
        if feincms_page is None:
            feincms_page = context['feincms_page']
        return page.is_ancestor_of(feincms_page, include_self=True)
