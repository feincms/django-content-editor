"""
Helper functions for Playwright integration tests.
"""

from playwright.sync_api import Page, expect

from testapp.models import Article


def login_admin(
    page: Page, django_server: str, username: str = "test", password: str = "test"
):
    """Login to the Django admin site."""
    page.goto(f"{django_server}/admin/login/")
    page.fill("input[name='username']", username)
    page.fill("input[name='password']", password)
    page.click("input[type='submit']")
    # Verify login was successful
    expect(page.locator("text=Site administration")).to_be_visible()


def create_article_with_content(page: Page, django_server: str, title: str):
    """Create an article with content through the admin interface."""
    # Navigate to article add page
    page.goto(f"{django_server}/admin/testapp/article/add/")

    # Fill in the title
    page.fill("input[name='title']", title)

    # First click on the insert target to reveal the available plugins
    page.click(".order-machine-insert-target")

    # Wait for the plugin buttons to appear and click Rich Text plugin
    page.wait_for_selector(".plugin-button:has-text('Rich text')")
    page.click(".plugin-button:has-text('Rich text')")

    # Wait for the content form to appear and locate textarea
    page.wait_for_selector("textarea.richtext")

    # Fill in the rich text content using the simple textarea
    page.fill("textarea.richtext", f"<p>Content for {title}</p>")

    # Save the article
    page.click("input[name='_save']")

    # Verify save was successful
    expect(page.locator(".success")).to_contain_text("was added successfully")

    # Return the created article from the database
    return Article.objects.get(title=title)


def open_article(page: Page, django_server, article):
    page.goto(f"{django_server}/admin/testapp/article/{article.pk}/change/")
    page.wait_for_selector(".order-machine")


# Native drag and drop in headless Chromium is unreliable (dragstart sometimes
# doesn't fire at all on CI), so the tests dispatch the drag events directly.
# Coordinates are computed in the page when dispatching the events because the
# editor auto-scrolls while dragging near the viewport edges.
_DISPATCH_DRAG = """(steps) => {
    for (const [type, selector, dx, dy] of steps) {
        const rect = document.querySelector(selector).getBoundingClientRect()
        const el = ["dragstart", "dragend"].includes(type)
            ? document.querySelector(`${selector} > h3`)
            : document.querySelector(".order-machine")
        el.dispatchEvent(new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + dx,
            clientY: dy < 0 ? rect.bottom + dy : rect.top + dy,
            dataTransfer: new DataTransfer(),
        }))
    }
}"""


def dispatch_drag(page: Page, *steps):
    """Dispatch ``(type, selector, dx, dy)`` drag events; negative ``dy`` values
    are relative to the bottom of the element matching ``selector``."""
    page.evaluate(_DISPATCH_DRAG, [list(step) for step in steps])


def drag_after(page: Page, source, target, *, dx):
    """Drag ``source`` just below ``target``, ``dx`` pixels from its left edge."""
    dispatch_drag(
        page,
        ("dragstart", source, 20, 5),
        ("dragenter", target, dx, -3),
        ("dragover", target, dx, -3),
        ("drop", target, dx, -3),
        ("dragend", source, 20, 5),
    )
