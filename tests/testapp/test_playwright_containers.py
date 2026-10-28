import os
import re

import pytest
from playwright.sync_api import Page, expect

from testapp.models import Page as PageModel

from .test_playwright_helpers import dispatch_drag, drag_after, login_admin


os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"

CONTAINER = "#testapp_pagecontainer_set-{}"
TEXT = "#testapp_pagetext_set-{}"


@pytest.fixture
def django_server(live_server):
    return live_server.url


def open_page(page: Page, django_server, obj):
    page.goto(f"{django_server}/admin/testapp/page/{obj.pk}/change/")
    page.wait_for_selector(".order-machine")


def save(page: Page):
    page.click("input[name='_continue']")
    expect(page.locator(".success")).to_contain_text("was changed successfully")


def depths(obj):
    plugins = [
        *obj.testapp_pagecontainer_set.all(),
        *obj.testapp_pagetext_set.all(),
    ]
    return [
        (plugin.region, str(plugin), plugin.depth)
        for plugin in sorted(plugins, key=lambda plugin: plugin.ordering)
    ]


def expect_indentation(page: Page, selector, value):
    expect(page.locator(selector)).to_have_css("margin-inline-start", value)


@pytest.fixture
def container_page():
    """A container containing A, followed by B"""
    obj = PageModel.objects.create(title="Containers")
    obj.testapp_pagecontainer_set.create(title="S", region="main", ordering=10)
    obj.testapp_pagetext_set.create(text="A", region="main", ordering=20, depth=1)
    obj.testapp_pagetext_set.create(text="B", region="main", ordering=30)
    return obj


@pytest.mark.django_db
def test_containers_are_drawn(page: Page, django_server, user, container_page):
    login_admin(page, django_server)
    open_page(page, django_server, container_page)

    expect(page.locator(".order-machine-container")).to_have_count(1)
    expect(page.locator(".order-machine-container--open")).to_have_count(0)
    expect_indentation(page, CONTAINER.format(0), "0px")
    expect_indentation(page, TEXT.format(0), "30px")
    expect_indentation(page, TEXT.format(1), "0px")

    # Collapsing the container hides its contents
    page.locator(f"{CONTAINER.format(0)} > h3 .inline_label").click()
    expect(page.locator(TEXT.format(0))).to_be_hidden()
    expect(page.locator(TEXT.format(1))).to_be_visible()


@pytest.mark.django_db
def test_indent_and_outdent(page: Page, django_server, user):
    login_admin(page, django_server)
    obj = PageModel.objects.create(title="Indent")
    obj.testapp_pagecontainer_set.create(title="S", region="main", ordering=10)
    for index, text in enumerate("ABC"):
        obj.testapp_pagetext_set.create(
            text=text, region="main", ordering=20 + 10 * index, depth=index < 2
        )
    open_page(page, django_server, obj)

    expect(page.locator(f"{CONTAINER.format(0)} .inline_outdent")).to_be_disabled()
    expect(page.locator(f"{CONTAINER.format(0)} .inline_indent")).to_be_disabled()
    # B can't be indented, A isn't a container
    expect(page.locator(f"{TEXT.format(1)} .inline_indent")).to_be_disabled()

    # Outdenting A takes its following sibling B along
    page.locator(f"{TEXT.format(0)} .inline_outdent").click()
    expect_indentation(page, TEXT.format(0), "0px")
    expect_indentation(page, TEXT.format(1), "0px")
    expect(page.locator(".order-machine-container")).to_have_count(1)

    # Keyboard shortcuts work inside the inline
    page.locator("#id_testapp_pagetext_set-0-text").press("Alt+Shift+ArrowRight")
    expect_indentation(page, TEXT.format(0), "30px")
    page.locator("#id_testapp_pagetext_set-1-text").press("Alt+Shift+ArrowRight")
    expect_indentation(page, TEXT.format(1), "30px")
    page.locator("#id_testapp_pagetext_set-2-text").press("Alt+Shift+ArrowLeft")
    expect_indentation(page, TEXT.format(2), "0px")

    save(page)
    assert depths(obj) == [
        ("main", "S", 0),
        ("main", "A", 1),
        ("main", "B", 1),
        ("main", "C", 0),
    ]


@pytest.mark.django_db
def test_indent_into_collapsed_container(page: Page, django_server, user):
    login_admin(page, django_server)
    obj = PageModel.objects.create(title="Collapsed")
    obj.testapp_pagecontainer_set.create(title="S", region="main", ordering=10)
    obj.testapp_pagetext_set.create(text="A", region="main", ordering=20)
    open_page(page, django_server, obj)

    page.locator(f"{CONTAINER.format(0)} > h3 .inline_label").click()
    page.locator(f"{TEXT.format(0)} .inline_indent").click()
    expect(page.locator(TEXT.format(0))).to_be_visible()
    expect(page.locator(CONTAINER.format(0))).not_to_have_class(
        re.compile(r"\bcollapsed\b")
    )


@pytest.mark.django_db
def test_drag_chooses_depth(page: Page, django_server, user):
    login_admin(page, django_server)
    obj = PageModel.objects.create(title="Drag")
    obj.testapp_pagecontainer_set.create(title="S", region="main", ordering=10)
    obj.testapp_pagetext_set.create(text="A", region="main", ordering=20)
    obj.testapp_pagetext_set.create(text="B", region="main", ordering=30)
    open_page(page, django_server, obj)

    # Into the container: the pointer is right of the container's indentation
    drag_after(page, TEXT.format(1), CONTAINER.format(0), dx=100)
    expect_indentation(page, TEXT.format(1), "30px")
    save(page)
    assert depths(obj) == [("main", "S", 0), ("main", "B", 1), ("main", "A", 0)]

    # A can be dropped as the last child of the container or after it
    drag_after(page, TEXT.format(0), TEXT.format(1), dx=100)
    expect_indentation(page, TEXT.format(0), "30px")
    drag_after(page, TEXT.format(0), TEXT.format(0), dx=-20)
    expect_indentation(page, TEXT.format(0), "0px")

    # Dropping never splits the container: A ends up inside even with the
    # pointer far to the left, because B follows
    drag_after(page, TEXT.format(0), CONTAINER.format(0), dx=-20)
    expect_indentation(page, TEXT.format(0), "30px")
    save(page)
    assert depths(obj) == [("main", "S", 0), ("main", "A", 1), ("main", "B", 1)]


@pytest.mark.django_db
def test_drop_indicator_offset(page: Page, django_server, user, container_page):
    login_admin(page, django_server)
    open_page(page, django_server, container_page)
    dispatch_drag(page, ("dragstart", TEXT.format(1), 20, 5))

    indicator = page.locator(".fs-dragover")
    for selector, dx, offset in [
        (CONTAINER.format(0), 100, "30px"),
        (TEXT.format(0), -20, "-30px"),
    ]:
        dispatch_drag(page, ("dragover", selector, dx, -3))
        expect(indicator).to_have_id(selector[1:])
        expect(indicator).to_have_attribute(
            "style", re.compile(f"--fs-dragover-offset: {offset}")
        )

    dispatch_drag(page, ("dragend", TEXT.format(1), 20, 5))


@pytest.mark.django_db
def test_drag_container_with_contents(page: Page, django_server, user, container_page):
    login_admin(page, django_server)
    open_page(page, django_server, container_page)

    drag_after(page, CONTAINER.format(0), TEXT.format(1), dx=5)
    save(page)
    assert depths(container_page) == [
        ("main", "B", 0),
        ("main", "S", 0),
        ("main", "A", 1),
    ]


@pytest.mark.django_db
def test_add_plugins_at_depth(page: Page, django_server, user, container_page):
    login_admin(page, django_server)
    container_page.testapp_pagetext_set.filter(text="B").delete()
    open_page(page, django_server, container_page)

    # One insert target per open level at the end of the region
    end_targets = page.locator(".order-machine > .order-machine-insert-target.last")
    expect(end_targets).to_have_count(2)

    # Before A, inside the container
    page.locator(f"{TEXT.format(0)} > .order-machine-insert-target").click()
    page.locator(".plugin-buttons .plugin-button[title='Rich text']").click()
    page.fill("#id_testapp_pagetext_set-1-text", "inside")

    end_targets.nth(1).click()
    page.locator(".plugin-buttons .plugin-button[title='Rich text']").click()
    page.fill("#id_testapp_pagetext_set-2-text", "end inside")

    end_targets.nth(0).click()
    page.locator(".plugin-buttons .plugin-button[title='Rich text']").click()
    page.fill("#id_testapp_pagetext_set-3-text", "end")

    save(page)
    assert depths(container_page) == [
        ("main", "S", 0),
        ("main", "inside", 1),
        ("main", "A", 1),
        ("main", "end inside", 1),
        ("main", "end", 0),
    ]


@pytest.mark.django_db
def test_insert_at_container_end(page: Page, django_server, user, container_page):
    login_admin(page, django_server)
    open_page(page, django_server, container_page)

    # B follows the end of the container: one additional insert target adds
    # items to the end of the container
    nested = page.locator(f"{TEXT.format(1)} > .order-machine-insert-target.nested")
    expect(nested).to_have_count(1)
    nested.click()
    page.locator(".plugin-buttons .plugin-button[title='Rich text']").click()
    page.fill("#id_testapp_pagetext_set-2-text", "end inside")
    save(page)
    assert depths(container_page) == [
        ("main", "S", 0),
        ("main", "A", 1),
        ("main", "end inside", 1),
        ("main", "B", 0),
    ]

    # Items cannot be inserted into collapsed containers
    page.locator(f"{CONTAINER.format(0)} > h3 .inline_label").click()
    expect(nested).to_have_count(0)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("answer", "remaining"),
    [
        ("Container and contents", [("main", "B", 0)]),
        ("Only the container", [("main", "A", 0), ("main", "B", 0)]),
    ],
)
def test_delete_container(
    page: Page, django_server, user, container_page, answer, remaining
):
    login_admin(page, django_server)
    open_page(page, django_server, container_page)

    page.locator(f"{CONTAINER.format(0)} .delete input[type=checkbox]").click()
    page.locator("dialog.container-delete").get_by_role("button", name=answer).click()
    save(page)
    assert depths(container_page) == remaining


@pytest.mark.django_db
def test_undelete_container_restores_depths(
    page: Page, django_server, user, container_page
):
    login_admin(page, django_server)
    open_page(page, django_server, container_page)

    checkbox = page.locator(f"{CONTAINER.format(0)} .delete input[type=checkbox]")
    checkbox.click()
    page.get_by_role("button", name="Only the container").click()
    expect_indentation(page, TEXT.format(0), "0px")

    checkbox.uncheck()
    expect_indentation(page, TEXT.format(0), "30px")


@pytest.mark.django_db
def test_move_container_to_other_region(page: Page, django_server, user):
    login_admin(page, django_server)
    obj = PageModel.objects.create(title="Move")
    obj.testapp_pagetext_set.create(text="X", region="main", ordering=10)
    obj.testapp_pagecontainer_set.create(title="S", region="main", ordering=20, depth=0)
    obj.testapp_pagecontainer_set.create(title="T", region="main", ordering=30, depth=1)
    obj.testapp_pagetext_set.create(text="A", region="main", ordering=40, depth=2)
    obj.testapp_pagetext_set.create(text="B", region="main", ordering=50, depth=0)
    open_page(page, django_server, obj)

    page.locator(f"{CONTAINER.format(1)} select.inline_move_to_region").select_option(
        "sidebar"
    )
    save(page)
    assert depths(obj) == [
        ("main", "X", 0),
        ("main", "S", 0),
        ("main", "B", 0),
        ("sidebar", "T", 0),
        ("sidebar", "A", 1),
    ]


@pytest.mark.django_db
def test_clone_into_container(page: Page, django_server, user, container_page):
    login_admin(page, django_server)
    container_page.testapp_pagecontainer_set.create(
        title="U", region="sidebar", ordering=100
    )
    container_page.testapp_pagetext_set.create(
        text="C", region="sidebar", ordering=110, depth=1
    )
    open_page(page, django_server, container_page)

    page.locator(f"{TEXT.format(0)} > .order-machine-insert-target").click()
    page.locator(".plugin-button:has-text('Clone from region')").click()
    dialog = page.locator("dialog.clone")
    # The structure is shown nested
    expect(dialog.locator("ul ul input[name='_clone']")).to_have_count(1)
    dialog.locator("input[name='_clone']").first.check()
    dialog.locator("input[name='_continue']").click()
    expect(page.locator(".success").first).to_be_visible()

    assert [row for row in depths(container_page) if row[0] == "main"] == [
        ("main", "S", 0),
        ("main", "U", 1),
        ("main", "C", 2),
        ("main", "A", 1),
        ("main", "B", 0),
    ]
