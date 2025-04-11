"""
Helper functions for Playwright integration tests.
"""

from playwright.sync_api import Page, expect


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
    from testapp.models import Article

    return Article.objects.get(title=title)
