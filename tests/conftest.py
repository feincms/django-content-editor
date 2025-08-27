import os

import pytest
from django.contrib.auth.models import User


# Set DJANGO_ALLOW_ASYNC_UNSAFE
os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"

# Default browser to run tests with
os.environ.setdefault("PLAYWRIGHT_BROWSER_NAME", "chromium")


@pytest.fixture
def user():
    """Create a test superuser."""
    u = User.objects.create(
        username="test", is_active=True, is_staff=True, is_superuser=True
    )
    u.set_password("test")
    u.save()
    return u


@pytest.fixture
def client(client, user):
    """Login the test client."""
    client.login(username="test", password="test")
    return client


@pytest.fixture(scope="function")
def browser_context_args(browser_context_args):
    """Modify browser context arguments for tracing."""
    return {
        **browser_context_args,
        "record_video_dir": os.path.join(os.getcwd(), "test-results/videos/"),
        "record_har_path": os.path.join(os.getcwd(), "test-results/har/", "test.har"),
    }


@pytest.fixture
def page(page):
    """Add console and network error logging to the page."""
    # Capture console logs
    page.on("console", lambda msg: print(f"BROWSER CONSOLE {msg.type}: {msg.text}"))

    # Capture JavaScript errors
    page.on("pageerror", lambda err: print(f"BROWSER JS ERROR: {err}"))

    # Capture request failures
    page.on(
        "requestfailed",
        lambda request: print(f"NETWORK ERROR: {request.url} {request.failure}"),
    )

    return page


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """Handle reporting and artifact generation."""
    outcome = yield
    report = outcome.get_result()

    # Take screenshot of failed tests
    if report.when == "call" and report.failed:
        try:
            page = item.funcargs["page"]
            # Take screenshot and save it with test name
            screenshot_dir = os.path.join(os.getcwd(), "test-results/screenshots/")
            os.makedirs(screenshot_dir, exist_ok=True)
            screenshot_path = os.path.join(screenshot_dir, f"{item.name}_failed.png")
            page.screenshot(path=screenshot_path)
            # Save page HTML
            html_path = os.path.join(screenshot_dir, f"{item.name}_failed.html")
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(page.content())

            # Add to report
            report.extra = [
                {
                    "name": "Screenshot",
                    "content": screenshot_path,
                    "mime_type": "image/png",
                },
                {"name": "HTML", "content": html_path, "mime_type": "text/html"},
            ]
        except Exception as e:
            print(f"Failed to capture artifacts: {e}")
