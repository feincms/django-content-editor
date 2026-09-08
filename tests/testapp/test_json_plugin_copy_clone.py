"""Regression tests for copying and cloning django-json-schema-editor plugins.

All ``JSONPlugin`` proxies live in the same table and are only told apart by
their ``type`` column, so copying ("Save as new") and cloning ("Clone from
region") have plenty of opportunity to hand a row to the wrong proxy and thereby
silently rewrite its type.
"""

import json
import re

import pytest
from bs4 import BeautifulSoup
from django.http import QueryDict
from django.urls import reverse

from content_editor.admin import CloneForm
from testapp.models import Article, JSONPlugin, JSONSpacer, JSONTeaser, JSONText


# Deliberately more than two plugins of the first type: their inlines are
# rendered as ``testapp_jsonplugin_set-0`` ... ``-3``, and the last two of those
# ids are also the formset prefixes of the second and third proxy (Django
# disambiguates the prefixes they all inherit by appending "-2" and "-3").
PLUGINS = [
    (JSONText, {"text": "One"}),
    (JSONTeaser, {"title": "Some teaser"}),
    (JSONText, {"text": "Two"}),
    (JSONSpacer, {}),
    (JSONText, {"text": "Three"}),
    (JSONText, {"text": "Four"}),
]


def create_article():
    article = Article.objects.create(title="Original")
    article.testapp_richtext_set.create(
        text="<p>Hello</p>", region="sidebar", ordering=10
    )
    for index, (cls, data) in enumerate(PLUGINS):
        cls.objects.create(
            parent=article, region="main", ordering=10 + index * 10, data=data
        )
    return article


def plugins_in(article, region):
    """Return ``(type, data)`` of the JSON plugins in ``region``, in editor order."""
    return list(
        JSONPlugin.objects.filter(parent=article, region=region)
        .order_by("ordering")
        .values_list("type", "data")
    )


def expected_plugins():
    return [(cls.TYPE, data) for cls, data in PLUGINS]


def parse(response):
    return BeautifulSoup(response.content, "html.parser")


def change_form(response):
    return parse(response).find("form", id="article_form")


def change_form_data(response):
    """Rebuild the POST data of an admin change form from its rendered HTML.

    Values are lists because the test client's multipart encoder only looks at
    ``dict.items()`` -- a ``QueryDict`` would silently lose all but the last
    value of the multi-valued ``_clone`` field.
    """
    data = {}

    for element in change_form(response).find_all(["input", "textarea", "select"]):
        name = element.get("name")
        if not name or "__prefix__" in name:
            continue
        if element.name == "textarea":
            data[name] = [element.text]
        elif element.name == "select":
            data[name] = [
                option.get("value", "")
                for option in element.find_all("option")
                if option.has_attr("selected")
            ]
        else:
            type = (element.get("type") or "text").lower()
            if type == "submit":
                continue
            if type in {"checkbox", "radio"} and not element.has_attr("checked"):
                continue
            data[name] = [element.get("value", "")]

    return data


def plugins_by_prefix(response):
    context = parse(response).find(id="content-editor-context")
    return {plugin["prefix"]: plugin for plugin in json.loads(context.text)["plugins"]}


def clone_values(response, region):
    """The ``_clone`` values the clone dialog builds for ``region``.

    ``cloning.js`` maps an inline's DOM id back to its formset prefix (and
    therefore to its plugin) and submits ``<model label>:<pk>`` for every
    checked plugin, so the test has to do the same to exercise the real thing.
    """
    plugins = plugins_by_prefix(response)
    values = []

    for inline in change_form(response).select(".inline-related.has_original"):
        prefix = re.sub(r"-(?:\d+|empty)$", "", inline["id"])
        plugin = plugins.get(prefix)
        if plugin is None:  # A plain inline, not a plugin.
            continue
        fields = {
            re.sub(r"^.*-", "", input["name"]): input.get("value", "")
            for input in inline.select("input[type=hidden]")
        }
        if fields["region"] == region:
            values.append(
                (int(fields["ordering"]), f"{plugin['model']}:{fields['id']}")
            )

    return [value for _ordering, value in sorted(values)]


@pytest.mark.django_db
def test_save_as_new_keeps_plugin_types(client):
    """ "Save as new" must copy each plugin as its own type, not as another."""
    article = create_article()

    url = reverse("admin:testapp_article_change", args=(article.pk,))
    data = change_form_data(client.get(url))
    data["title"] = ["Copy"]
    data["_saveasnew"] = ["Save as new"]

    response = client.post(url, data)
    assert response.status_code == 302, response.context["errors"]

    copy = Article.objects.get(title="Copy")
    assert copy.pk != article.pk

    assert plugins_in(copy, "main") == expected_plugins()
    assert copy.testapp_richtext_set.count() == 1
    # The original is left alone.
    assert plugins_in(article, "main") == expected_plugins()


@pytest.mark.django_db
def test_clone_from_region_keeps_plugin_types(client):
    """Cloning a region into another must not change the plugins' types."""
    article = create_article()

    url = reverse("admin:testapp_article_change", args=(article.pk,))
    response = client.get(url)

    data = change_form_data(response)
    data["_continue"] = ["Save and continue editing"]
    data["_clone_region"] = ["sidebar"]
    data["_clone_ordering"] = ["1000"]
    data["_clone"] = clone_values(response, "main")
    assert len(data["_clone"]) == len(PLUGINS)

    response = client.post(url, data, follow=True)
    assert response.status_code == 200
    assert "Cloning 6 plugins succeeded." in [
        message.message for message in response.context["messages"]
    ]

    assert plugins_in(article, "sidebar") == expected_plugins()
    assert plugins_in(article, "main") == expected_plugins()


@pytest.mark.django_db
def test_clone_downcasts_plugins():
    """Cloning has to go through the plugin's own queryset.

    Plugins which share a table downcast their instances there; cloning them
    through the plain base manager instead would save them as whatever model the
    editor submitted -- changing their type.
    """
    article = create_article()
    plugin = JSONText.objects.get(parent=article, data={"text": "One"})

    post = QueryDict(mutable=True)
    post["_clone_region"] = "sidebar"
    post["_clone_ordering"] = "1000"
    # A sibling proxy's label for a plugin which is not of that type.
    post.appendlist("_clone", f"{JSONTeaser._meta.label_lower}:{plugin.pk}")

    form = CloneForm(post)
    assert form.is_valid(), form.errors
    assert form.process() == 1

    assert plugins_in(article, "sidebar") == [(JSONText.TYPE, {"text": "One"})]


@pytest.mark.django_db
def test_inline_ids_map_back_to_their_plugin(client):
    """Every inline's DOM id must resolve back to the plugin it belongs to.

    The editor identifies a plugin by stripping the form index off the inline's
    id and looking the remainder up in ``pluginsByPrefix``. Proxies of the same
    concrete model all inherit the same default formset prefix, and Django
    disambiguates the duplicates by appending "-2", "-3", ... -- so matching the
    longest prefix an id merely *starts with* (which the editor used to do)
    confuses the third and fourth form of the undecorated prefix with the second
    and third proxy.
    """
    article = create_article()
    response = client.get(reverse("admin:testapp_article_change", args=(article.pk,)))
    plugins = plugins_by_prefix(response)

    seen = set()
    for group in change_form(response).select(".inline-group"):
        prefix = group["id"].removesuffix("-group")
        if prefix not in plugins:  # A plain inline, not a plugin.
            continue
        seen.add(prefix)
        for inline in group.select(".inline-related"):
            resolved = re.sub(r"-(?:\d+|empty)$", "", inline["id"])
            assert resolved == prefix, (
                f"Inline {inline['id']!r} of plugin {prefix!r} resolves to {resolved!r}"
            )

    assert seen == set(plugins)
