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

    outline = page.locator(".order-machine-container")
    expect(outline).to_have_count(1)
    expect(page.locator(".order-machine-container--open")).to_have_count(0)
    expect(outline).to_have_attribute("data-depth", "1")
    expect(outline).to_have_attribute("data-end", "End of Page container · S")
    expect(page.locator(CONTAINER.format(0))).to_have_class(
        re.compile(r"\border-machine-opener\b")
    )
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
def test_drag_ignores_selection_in_other_regions(page: Page, django_server, user):
    login_admin(page, django_server)
    obj = PageModel.objects.create(title="Selection")
    obj.testapp_pagecontainer_set.create(title="S", region="main", ordering=10)
    obj.testapp_pagetext_set.create(text="A", region="main", ordering=20, depth=1)
    obj.testapp_pagetext_set.create(text="X", region="sidebar", ordering=30)
    obj.testapp_pagetext_set.create(text="Y", region="sidebar", ordering=40)
    open_page(page, django_server, obj)

    # Select A, then drag in another region
    page.locator(f"{TEXT.format(0)} > h3").click(
        modifiers=["Control"], position={"x": 5, "y": 5}
    )
    expect(page.locator(TEXT.format(0))).to_have_class(re.compile("selected"))
    page.click(".tabs.regions .tab[data-region='sidebar']")
    drag_after(page, TEXT.format(2), TEXT.format(1), dx=5)
    save(page)
    assert depths(obj) == [
        ("main", "S", 0),
        ("main", "A", 1),
        ("sidebar", "X", 0),
        ("sidebar", "Y", 0),
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


SCREENSHOTS = os.path.join(os.getcwd(), "test-results", "screenshots")


@pytest.fixture
def large_page():
    """A region with 40+ plugins, three container levels and collapsed
    containers. Returns the page and the orderings of the collapsed
    containers."""
    obj = PageModel.objects.create(title="Large")
    ordering = 0
    collapsed = []

    def add(depth, container=None, text=None):
        nonlocal ordering
        ordering += 10
        if container is not None:
            obj.testapp_pagecontainer_set.create(
                title=container, region="main", ordering=ordering, depth=depth
            )
        else:
            obj.testapp_pagetext_set.create(
                text=text, region="main", ordering=ordering, depth=depth
            )
        return ordering

    add(0, text="Introduction")
    for group in ("FAQ", "Services", "Team", "Contact"):
        add(0, container=group)
        add(1, text=f"{group}: lead")
        for item in ("Opening hours", "Prices"):
            add(1, container=f"{group} · {item}")
            add(2, text=f"{item}: summary")
            details = add(2, container=f"{item} details")
            if group == "Team":
                collapsed.append(details)
            add(3, text=f"{item}: first detail")
            add(3, text=f"{item}: second detail")
            add(2, text=f"{item}: closing remark")
        add(1, text=f"{group}: outro")
        add(0, text=f"After {group}")
    collapsed.append(add(0, container="Archive"))
    add(1, text="Archived text")
    add(0, text="Conclusion")
    return obj, collapsed


@pytest.mark.django_db
@pytest.mark.parametrize("color_scheme", ["light", "dark"])
def test_large_page_screenshots(
    page: Page, django_server, user, large_page, color_scheme
):
    obj, collapsed = large_page
    assert (
        obj.testapp_pagecontainer_set.count() + obj.testapp_pagetext_set.count() >= 40
    )

    page.emulate_media(color_scheme=color_scheme)
    page.set_viewport_size({"width": 1280, "height": 900})
    login_admin(page, django_server)
    page.goto(
        f"{django_server}/admin/testapp/page/{obj.pk}/change/"
        f"#region=main&collapsed={','.join(map(str, collapsed))}"
    )
    page.wait_for_selector(".order-machine")
    page.evaluate("() => document.fonts.ready")
    expect(page.locator(".inline-related.collapsed")).to_have_count(len(collapsed))
    # Rail colours cycle after four levels; there are three here
    outlines = page.locator(".order-machine-container")
    for depth in ("1", "2", "3"):
        expect(
            outlines.and_(page.locator(f"[data-depth='{depth}']")).first
        ).to_be_attached()
    expect(page.locator(".order-machine-container[data-depth='4']")).to_have_count(0)

    # Shorter text areas and no sticky submit row for an overview
    page.add_style_tag(
        content="textarea { height: 3em } .submit-row { position: static }"
    )
    os.makedirs(SCREENSHOTS, exist_ok=True)
    page.screenshot(
        path=os.path.join(SCREENSHOTS, f"large-page-{color_scheme}.png"),
        full_page=True,
    )

    # Hovering a plugin highlights the containers containing it
    page.locator(
        ".inline-related:has(> h3 :text('Opening hours: first detail'))"
    ).first.dispatch_event("mouseover")
    page.screenshot(
        path=os.path.join(SCREENSHOTS, f"large-page-hover-{color_scheme}.png"),
        full_page=True,
    )

    # The sticky tab bar shows the path of the topmost visible plugin
    page.locator(
        ".inline-related:has(> h3 :text('Prices: second detail'))"
    ).first.evaluate("el => el.scrollIntoView({block: 'start'})")
    expect(page.locator(".order-machine-breadcrumb")).to_be_visible()
    page.screenshot(
        path=os.path.join(SCREENSHOTS, f"large-page-breadcrumb-{color_scheme}.png")
    )


@pytest.mark.django_db
def test_add_plugin_using_the_keyboard(page: Page, django_server, user, container_page):
    login_admin(page, django_server)
    open_page(page, django_server, container_page)

    target = page.locator(f"{TEXT.format(1)} > .order-machine-insert-target").first
    target.focus()
    page.keyboard.press("Enter")
    expect(page.locator(".plugin-buttons")).to_be_visible()
    expect(page.locator(".plugin-buttons .plugin-button").first).to_be_focused()

    # Escape returns to the insert target
    page.keyboard.press("Escape")
    expect(target).to_be_focused()

    page.keyboard.press("Enter")
    page.locator(".plugin-buttons .plugin-button[title='Rich text']").press("Enter")
    expect(page.locator("#id_testapp_pagetext_set-2-text")).to_be_focused()
    page.keyboard.type("C")
    save(page)
    assert depths(container_page) == [
        ("main", "S", 0),
        ("main", "A", 1),
        ("main", "C", 0),
        ("main", "B", 0),
    ]


@pytest.mark.django_db
def test_highlight_current_containers(page: Page, django_server, user):
    login_admin(page, django_server)
    obj = PageModel.objects.create(title="Highlight")
    obj.testapp_pagecontainer_set.create(title="S", region="main", ordering=10)
    obj.testapp_pagecontainer_set.create(title="T", region="main", ordering=20, depth=1)
    obj.testapp_pagetext_set.create(text="A", region="main", ordering=30, depth=2)
    obj.testapp_pagecontainer_set.create(title="U", region="main", ordering=40)
    obj.testapp_pagetext_set.create(text="B", region="main", ordering=50, depth=1)
    open_page(page, django_server, obj)

    current = page.locator(".order-machine-container--current")
    expect(current).to_have_count(0)

    page.locator(f"{TEXT.format(0)} > h3").hover()
    expect(page.locator(".order-machine-highlighting")).to_have_count(1)
    expect(current).to_have_count(2)
    expect(
        current.and_(page.locator("[data-label='Page container · S']"))
    ).to_have_count(1)
    expect(
        current.and_(page.locator("[data-label='Page container · T']"))
    ).to_have_count(1)

    # Focus wins once the pointer leaves the editor
    page.locator("#id_testapp_pagetext_set-1-text").focus()
    page.mouse.move(0, 0)
    expect(current).to_have_count(1)
    expect(current).to_have_attribute("data-label", "Page container · U")

    page.locator("#id_title").focus()
    expect(current).to_have_count(0)
    expect(page.locator(".order-machine-highlighting")).to_have_count(0)


@pytest.mark.django_db
def test_breadcrumb(page: Page, django_server, user, large_page):
    obj, _collapsed = large_page
    # Scroll instantly
    page.emulate_media(reduced_motion="reduce")
    page.set_viewport_size({"width": 1280, "height": 900})
    login_admin(page, django_server)
    open_page(page, django_server, obj)

    breadcrumb = page.locator(".order-machine-breadcrumb")
    expect(breadcrumb).to_be_hidden()

    page.locator(
        ".inline-related:has(> h3 :text('Opening hours: first detail'))"
    ).first.evaluate("el => el.scrollIntoView({block: 'start'})")
    expect(breadcrumb.get_by_role("button")).to_have_text(
        [
            "main region",
            "Page container · FAQ",
            "Page container · FAQ · Opening hours",
            "Page container · Opening hours details",
        ]
    )

    breadcrumb.get_by_role("button", name="Page container · FAQ", exact=True).click()
    expect(breadcrumb.get_by_role("button")).to_have_text(
        ["main region", "Page container · FAQ"]
    )
    expect(
        page.locator(".inline-related:has(> h3 :text('FAQ: lead'))")
    ).to_be_in_viewport()

    breadcrumb.get_by_role("button", name="main region").click()
    expect(breadcrumb).to_be_hidden()
