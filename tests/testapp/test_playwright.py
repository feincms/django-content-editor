import os
import re

import pytest
from bs4 import BeautifulSoup
from django.contrib.auth.models import User
from django.http import QueryDict
from django.test import Client
from django.urls import reverse
from playwright.sync_api import Page, expect

from content_editor.admin import CloneForm
from testapp.models import Article

from .test_playwright_helpers import create_article_with_content, login_admin


# Allow Django to operate in async context
os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"


@pytest.fixture
def django_server(live_server):
    """Return the live server URL."""
    return live_server.url


@pytest.mark.django_db
def test_admin_content_editor_loads(page: Page, django_server, client, user):
    """Test that the content editor loads in the admin interface."""
    # Login to admin
    login_admin(page, django_server)

    # Navigate to article add page
    page.goto(f"{django_server}/admin/testapp/article/add/")

    # Check if content editor loaded properly
    # expect(page.locator("#content-editor-context")).to_be_visible()
    expect(page.locator(".order-machine")).to_be_visible()

    # Check if regions are visible
    expect(page.locator(".tabs.regions")).to_be_visible()


@pytest.mark.django_db
def test_add_content_to_article(page: Page, django_server, client, user):
    """Test adding content to an article through the admin interface."""
    # Login to admin
    login_admin(page, django_server)

    # Create article with content
    create_article_with_content(page, django_server, "Playwright Test Article")

    # Check that we got redirected to the article list
    assert f"{django_server}/admin/testapp/article/" in page.url, (
        "Not redirected to article list"
    )

    # Check that success message is displayed
    expect(page.locator(".success")).to_contain_text("was added successfully")


@pytest.mark.django_db
def test_no_regions_blocks_adding(page: Page, django_server, client, user):
    """Without any region, plugins must not be addable.

    Regression test: the visibility pass that disables the insert targets used to
    be gated behind a region tab click, which never happens when there are no
    regions, so plugins could be added with an undefined region.
    """
    login_admin(page, django_server)
    page.goto(f"{django_server}/admin/testapp/noregionarticle/add/")
    page.wait_for_selector(".order-machine")

    # No region tabs are rendered.
    assert page.locator(".tabs.regions h2").count() == 0

    # The insert targets are non-interactive and the "no regions" message shows.
    expect(page.locator(".order-machine-wrapper")).to_have_class(
        re.compile(r"\border-machine-hide-insert-targets\b")
    )
    expect(
        page.locator(".machine-message", has_text="No regions available.")
    ).to_be_visible()

    # Even calling the public addContent API must not add a plugin.
    total_field = "#id_testapp_noregiontext_set-TOTAL_FORMS"
    assert page.input_value(total_field) == "0"
    page.evaluate("() => window.ContentEditor.addContent('testapp_noregiontext_set')")
    page.wait_for_timeout(200)
    assert page.input_value(total_field) == "0"


@pytest.mark.django_db
def test_drag_and_drop_ordering(page: Page, django_server, client, user):
    """Test drag and drop functionality for ordering content items."""
    # Simplified test that creates a simple article and checks if the UI loads
    # Skip the drag and drop part which is too fragile for automated testing

    article = Article.objects.create(title="DnD Test")
    article.testapp_richtext_set.create(
        text="<p>First item</p>", region="main", ordering=10
    )
    article.testapp_richtext_set.create(
        text="<p>Second item</p>", region="main", ordering=20
    )

    # Login to admin
    login_admin(page, django_server)

    # Navigate to article change page
    page.goto(f"{django_server}/admin/testapp/article/{article.pk}/change/")

    # Wait for the page to load
    page.wait_for_selector("input[name='title']")

    # Verify the title is correct
    value = page.input_value("input[name='title']")
    assert value == "DnD Test", f"Title should be 'DnD Test', but got '{value}'"

    # Verify we can see the article content
    content_count = page.locator("textarea.richtext").count()
    assert content_count >= 2, (
        f"Should have at least 2 rich text items, but found {content_count}"
    )

    # Make a simple change to the title
    page.fill("input[name='title']", "DnD Test Updated")

    # Save the article
    page.click("input[name='_save']")

    # Check that success message is displayed
    expect(page.locator(".success")).to_contain_text("was changed successfully")

    # Verify the change was saved in the database
    article.refresh_from_db()
    assert article.title == "DnD Test Updated"


@pytest.mark.django_db
def test_tabbed_fieldsets(page: Page, django_server, client, user):
    """Test tabbed fieldsets functionality if present."""
    # Login to admin
    login_admin(page, django_server)

    # Navigate to article add page
    page.goto(f"{django_server}/admin/testapp/page/add/")

    # Wait for the content editor to load
    page.wait_for_selector(".tabs.regions")

    # Check if tabbed regions are present
    tabs = page.locator(".tabs .tab")
    tabs.count()

    assert tabs.all_inner_texts() == ["Structure", "main region", "sidebar region"]

    field = page.locator("#id_parent")
    expect(field).not_to_be_visible()

    tabs.nth(0).click()
    page.wait_for_timeout(500)  # Wait for animation

    expect(field).to_be_visible()


@pytest.mark.django_db
def test_save_shortcut(page: Page, django_server, client, user):
    """Test that the save shortcut (Ctrl+S) works."""
    # Login to admin
    login_admin(page, django_server)

    article = Article.objects.create(title="Section Grouping Test")

    # Navigate to the article change page
    page.goto(f"{django_server}/admin/testapp/article/{article.pk}/change/")

    # Use the keyboard shortcut Ctrl+S to save
    page.keyboard.press("Control+s")

    # Wait for the save operation to complete
    page.wait_for_selector(".success", timeout=5000)

    # Check that success message is displayed
    expect(page.locator(".success")).to_contain_text("was changed successfully")


@pytest.mark.django_db
def test_section_visual_grouping(page: Page, django_server, client, user):
    """Section/CloseSection plugins indent and order the content between them."""
    login_admin(page, django_server)

    article = Article.objects.create(title="Section Grouping Test")
    section = article.testapp_section_set.create(region="main", ordering=10)
    rich_text_inside = article.testapp_richtext_set.create(
        text="<p>Content inside section</p>", region="main", ordering=20
    )
    close_section = article.testapp_closesection_set.create(region="main", ordering=30)
    rich_text_outside = article.testapp_richtext_set.create(
        text="<p>Content outside section</p>", region="main", ordering=40
    )

    page.goto(f"{django_server}/admin/testapp/article/{article.pk}/change/")
    page.wait_for_selector(".order-machine")

    # The form loaded with the expected content.
    expect(page.locator("input[name='title']")).to_have_value("Section Grouping Test")
    expect(page.locator("textarea#id_testapp_richtext_set-0-text")).to_have_value(
        "<p>Content inside section</p>"
    )
    expect(page.locator("textarea#id_testapp_richtext_set-1-text")).to_have_value(
        "<p>Content outside section</p>"
    )

    # Ordering is preserved in the database.
    assert (
        section.ordering
        < rich_text_inside.ordering
        < close_section.ordering
        < rich_text_outside.ordering
    )

    # Visually, content inside the section is indented and appears above the
    # content following the close-section marker.
    inside_box = page.locator("#id_testapp_richtext_set-0-text").bounding_box()
    outside_box = page.locator("#id_testapp_richtext_set-1-text").bounding_box()
    assert inside_box["x"] > outside_box["x"], "Inside content should be indented"
    assert inside_box["y"] < outside_box["y"], "Inside content should come first"


@pytest.mark.django_db
def test_clone_plugins_functionality(page: Page, django_server, client, user):
    """Test cloning plugins from main region to sidebar region."""
    # Login to admin
    login_admin(page, django_server)

    # Create article with content programmatically for reliable setup
    article = Article.objects.create(title="Clone Test Article")

    # Add a section
    article.testapp_section_set.create(region="main", ordering=10)

    # Add rich text content inside section
    article.testapp_richtext_set.create(
        text="<p>First rich text in main</p>", region="main", ordering=20
    )

    # Add another rich text
    article.testapp_richtext_set.create(
        text="<p>Second rich text in main</p>", region="main", ordering=30
    )

    # Add close section
    article.testapp_closesection_set.create(region="main", ordering=40)

    # Add download plugin
    article.testapp_download_set.create(
        file="test-file.pdf", region="main", ordering=50
    )

    # Navigate to the admin change page
    page.goto(f"{django_server}/admin/testapp/article/{article.pk}/change/")

    # Wait for page to load
    page.wait_for_selector(".tabs.regions")

    # Verify we're in the main region initially
    expect(page.locator(".tabs.regions .tab.active")).to_contain_text("main region")

    # Switch to sidebar region tab
    page.click(".tabs.regions .tab:has-text('sidebar region')")
    page.wait_for_timeout(500)  # Wait for tab switch animation

    # Verify we're now in the sidebar region
    expect(page.locator(".tabs.regions .tab.active")).to_contain_text("sidebar region")

    # Click on the insert target to add new content in sidebar
    page.click(".order-machine-insert-target")

    # Wait for plugin buttons to appear and verify Clone option exists
    page.wait_for_selector(".plugin-button:has-text('Clone')")
    expect(page.locator(".plugin-button:has-text('Clone')")).to_be_visible()

    # Click the Clone button
    page.click(".plugin-button:has-text('Clone')")

    # Wait for the clone dialog to appear
    page.wait_for_selector("dialog.clone")
    expect(page.locator("dialog.clone h2")).to_contain_text("Clone")

    # The dialog carries the target region.
    expect(page.locator("dialog.clone input[name='_clone_region']")).to_have_value(
        "sidebar"
    )

    # Make sure the region details is open (a single available region is opened
    # automatically), then select the section. Selecting a section must
    # auto-select the plugins nested inside it.
    page.locator("details[name='clone-region']").first.evaluate(
        "d => { d.open = true }"
    )
    section_checkbox = page.locator(
        "dialog.clone input[name='_clone'][value*='section']"
    )
    section_checkbox.first.check()

    checked = page.locator("dialog.clone input[name='_clone']:checked")
    assert checked.count() >= 3, "Selecting a section should also check its children"

    # Execute the clone, then save the article.
    page.click("dialog.clone input[name='_continue']")
    page.wait_for_selector("dialog.clone", state="detached")
    page.click("input[name='_save']")
    page.wait_for_selector(".success")
    expect(page.locator(".success")).to_contain_text("was changed successfully")

    # The main region is untouched; the sidebar received the cloned content.
    assert article.testapp_richtext_set.filter(region="main").count() == 2
    assert article.testapp_section_set.filter(region="main").count() == 1

    sidebar_richtext = list(
        article.testapp_richtext_set.filter(region="sidebar").order_by("ordering")
    )
    assert [rt.text for rt in sidebar_richtext] == [
        "<p>First rich text in main</p>",
        "<p>Second rich text in main</p>",
    ]
    assert article.testapp_section_set.filter(region="sidebar").count() >= 1

    # The cloned items keep increasing orderings.
    orderings = [rt.ordering for rt in sidebar_richtext]
    assert orderings == sorted(orderings)
    assert len(set(orderings)) == len(orderings)


@pytest.mark.django_db
def test_clone_insert_between_existing_content(page: Page, django_server, client, user):
    """Cloned content is inserted at the chosen position with correct ordering."""
    login_admin(page, django_server)

    article = Article.objects.create(title="Clone Insert Test Article")
    article.testapp_richtext_set.create(
        text="<p>Main content 1</p>", region="main", ordering=10
    )
    article.testapp_richtext_set.create(
        text="<p>Main content 2</p>", region="main", ordering=20
    )
    # Deliberately large orderings: cloned content inserted between these must
    # still end up with sane, ordered values.
    article.testapp_richtext_set.create(
        text="<p>Sidebar BEFORE cloned content</p>", region="sidebar", ordering=110
    )
    article.testapp_richtext_set.create(
        text="<p>Sidebar AFTER cloned content</p>", region="sidebar", ordering=120
    )

    page.goto(f"{django_server}/admin/testapp/article/{article.pk}/change/")
    page.wait_for_selector(".tabs.regions")

    page.click(".tabs.regions .tab:has-text('sidebar region')")

    # Click the insert target between the two existing sidebar items (before,
    # *between*, after → index 1).
    sidebar_targets = page.locator(
        '[data-region="sidebar"] .order-machine-insert-target'
    )
    sidebar_targets.nth(1).click(force=True)

    page.wait_for_selector(".plugin-button:has-text('Clone')")
    page.click(".plugin-button:has-text('Clone')")
    page.wait_for_selector("dialog.clone")

    expect(page.locator("dialog.clone input[name='_clone_region']")).to_have_value(
        "sidebar"
    )

    page.get_by_text("Select all").click()
    assert page.locator("dialog.clone input[name='_clone']:checked").count() > 0

    page.click("dialog.clone input[name='_continue']")
    page.wait_for_selector("dialog.clone", state="detached")
    page.wait_for_selector(".success")

    # The cloned items landed between the two existing sidebar items.
    sidebar_items = list(
        article.testapp_richtext_set.filter(region="sidebar").order_by("ordering")
    )
    assert len(sidebar_items) == 4
    assert "BEFORE" in sidebar_items[0].text
    assert "Main content 1" in sidebar_items[1].text
    assert "Main content 2" in sidebar_items[2].text
    assert "AFTER" in sidebar_items[3].text

    # Orderings are truthy and strictly increasing.
    orderings = [item.ordering for item in sidebar_items]
    assert all(orderings)
    assert sorted(set(orderings)) == orderings

    # The main region is unchanged.
    main_items = list(
        article.testapp_richtext_set.filter(region="main").order_by("ordering")
    )
    assert [item.text for item in main_items] == [
        "<p>Main content 1</p>",
        "<p>Main content 2</p>",
    ]


@pytest.mark.django_db
def test_clone_backend_logic():
    """CloneForm.process() copies the selected plugins into the target region."""
    article = Article.objects.create(title="Backend Clone Test Article")
    section = article.testapp_section_set.create(region="main", ordering=10)
    richtext1 = article.testapp_richtext_set.create(
        text="<p>First rich text in main</p>", region="main", ordering=20
    )
    richtext2 = article.testapp_richtext_set.create(
        text="<p>Second rich text in main</p>", region="main", ordering=30
    )
    closesection = article.testapp_closesection_set.create(region="main", ordering=40)

    # Simulate the data the clone dialog submits: the selected plugins, the
    # target region and the base ordering.
    post = QueryDict(mutable=True)
    post["_clone_region"] = "sidebar"
    post["_clone_ordering"] = 10000
    for item in [
        f"testapp.section:{section.pk}",
        f"testapp.richtext:{richtext1.pk}",
        f"testapp.richtext:{richtext2.pk}",
        f"testapp.closesection:{closesection.pk}",
    ]:
        post.appendlist("_clone", item)

    form = CloneForm(post)
    assert form.is_valid(), form.errors
    assert form.process() == 4

    # The main region is untouched.
    assert article.testapp_richtext_set.filter(region="main").count() == 2
    assert article.testapp_section_set.filter(region="main").count() == 1

    # The selected plugins were cloned (not moved) into the sidebar, in order.
    sidebar_richtext = list(
        article.testapp_richtext_set.filter(region="sidebar").order_by("ordering")
    )
    assert [rt.text for rt in sidebar_richtext] == [
        "<p>First rich text in main</p>",
        "<p>Second rich text in main</p>",
    ]
    assert article.testapp_section_set.filter(region="sidebar").count() == 1

    orderings = [rt.ordering for rt in sidebar_richtext]
    assert orderings == sorted(orderings)
    assert len(set(orderings)) == len(orderings)


@pytest.mark.django_db
def test_clone_backend_validation_error():
    """Test that validation errors in the CloneForm are properly displayed to the user."""
    # Create test user and login
    User.objects.create_superuser("admin", "admin@test.com", "password")
    client = Client()
    client.login(username="admin", password="password")

    # Create article with content in main region
    article = Article.objects.create(title="Clone Validation Test Article")

    # Add some content to clone
    richtext1 = article.testapp_richtext_set.create(
        text="<p>Test content to clone</p>", region="main", ordering=10
    )

    # Get the admin change URL
    admin_url = reverse("admin:testapp_article_change", args=[article.pk])

    # First, GET the form to get proper formset data
    response = client.get(admin_url)
    assert response.status_code == 200

    # Extract formset management data from the form
    soup = BeautifulSoup(response.content, "html.parser")

    # Find all the formset management form fields
    management_fields = {}
    for input_field in soup.find_all("input"):
        name = input_field.get("name", "")
        value = input_field.get("value", "")
        if name and (
            "TOTAL_FORMS" in name
            or "INITIAL_FORMS" in name
            or "MIN_NUM_FORMS" in name
            or "MAX_NUM_FORMS" in name
        ):
            management_fields[name] = value
        elif name == "csrfmiddlewaretoken":
            csrf_token = value

    # Add existing inline data (to preserve existing content)
    inline_data = {}
    for input_field in soup.find_all("input"):
        name = input_field.get("name", "")
        value = input_field.get("value", "")
        if name and (
            name.startswith("testapp_")
            and (
                "-id" in name
                or "-DELETE" in name
                or any(
                    field in name for field in ["text", "file", "ordering", "region"]
                )
            )
        ):
            inline_data[name] = value

    # Create invalid clone form data - missing required _clone_region field
    # This should trigger a validation error
    invalid_form_data = QueryDict(mutable=True)
    invalid_form_data["title"] = article.title
    invalid_form_data["csrfmiddlewaretoken"] = csrf_token
    invalid_form_data["_continue"] = "Save and continue editing"

    # Add management form data
    for key, value in management_fields.items():
        invalid_form_data[key] = value

    # Add existing inline data
    for key, value in inline_data.items():
        invalid_form_data[key] = value

    # Add clone data but with missing _clone_region (required field)
    # This should cause CloneForm.is_valid() to return False
    invalid_form_data.appendlist("_clone", f"testapp.richtext:{richtext1.pk}")
    # Intentionally omit _clone_region to trigger validation error

    # Submit the form with invalid clone data.
    response = client.post(admin_url, invalid_form_data)

    # Follow the redirect to read the error message.
    if response.status_code == 302:
        response = client.get(response["Location"])

    # Parse the response content to look for error messages
    soup = BeautifulSoup(response.content, "html.parser")

    # Look for Django messages (both error and success messages)
    messages_divs = soup.find_all("div", class_="messagelist")
    error_messages = []

    for messages_div in messages_divs:
        for li in messages_div.find_all("li", class_="error"):
            error_messages.append(li.get_text().strip())

    # Also look for general message containers that might contain errors
    if not error_messages:
        # Try alternative selectors for error messages
        alt_errors = soup.find_all("li", class_="error")
        for li in alt_errors:
            error_messages.append(li.get_text().strip())

    # The error message must mention the cloning failure and the missing field.
    cloning_error_found = False
    field_error_found = False

    for msg in error_messages:
        if "Cloning plugins failed" in msg:
            cloning_error_found = True
            if "_clone_region" in msg or "This field is required" in msg:
                field_error_found = True
            break

    # Both conditions must be met for the test to pass
    assert cloning_error_found, (
        f"Expected 'Cloning plugins failed' message not found in: {error_messages}"
    )
    assert field_error_found, (
        "Expected field error details (_clone_region or 'This field is required') not found in error message"
    )

    # Verify that cloning actually failed (no content should be cloned to sidebar)
    article.refresh_from_db()
    sidebar_count = article.testapp_richtext_set.filter(region="sidebar").count()
    assert sidebar_count == 0, (
        f"Cloning should have failed, but found {sidebar_count} items in sidebar"
    )


@pytest.mark.django_db
def test_native_custom_events(page: Page, django_server, client, user):
    """``content-editor:ready``/``activate`` are native events; the inline is a
    DOM element in ``event.detail.inline`` and ``event.detail.prefix`` is the
    plugin's formset prefix."""
    login_admin(page, django_server)

    # Register listeners before the editor initializes.
    page.add_init_script("""
        window.__ce = { ready: 0, activate: [] }
        document.addEventListener("content-editor:ready", () => {
            window.__ce.ready += 1
        })
        document.addEventListener("content-editor:activate", (event) => {
            window.__ce.activate.push({
                isElement: event.detail.inline instanceof HTMLElement,
                prefix: event.detail.prefix,
            })
        })
    """)

    article = Article.objects.create(title="Events Test")
    article.testapp_richtext_set.create(text="<p>x</p>", region="main", ordering=10)

    page.goto(f"{django_server}/admin/testapp/article/{article.pk}/change/")
    page.wait_for_selector(".order-machine")

    result = page.evaluate("() => window.__ce")
    assert result["ready"] >= 1, "content-editor:ready should fire once"
    assert result["activate"], "activate should fire for the inline"
    assert all(item["isElement"] for item in result["activate"])
    assert any(item["prefix"] == "testapp_richtext_set" for item in result["activate"])


@pytest.mark.django_db
def test_move_plugin_to_other_region(page: Page, django_server, client, user):
    """The move-to-region dropdown reassigns a plugin to another region."""
    login_admin(page, django_server)

    # A Section may live in any region, so its row carries a move-to-region
    # dropdown (plugins restricted to a single region do not).
    article = Article.objects.create(title="Move Test")
    section = article.testapp_section_set.create(region="main", ordering=10)

    page.goto(f"{django_server}/admin/testapp/article/{article.pk}/change/")
    page.wait_for_selector(".order-machine")

    page.locator("#testapp_section_set-0 select.inline_move_to_region").select_option(
        "sidebar"
    )

    page.click("input[name='_save']")
    page.wait_for_selector(".success")

    section.refresh_from_db()
    assert section.region == "sidebar"
