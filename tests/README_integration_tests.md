# Integration Tests with Playwright

This directory contains integration tests for django-content-editor using Playwright.

## Overview

The integration tests use Playwright to test the content editor's functionality in a real browser environment, interacting with the actual UI components of the Django admin interface.

## Running Tests

To run the integration tests:

```bash
# Run with tox
tox -e py313-dj52-playwright

# Run tests directly (after installing dependencies)
cd tests
python -m pytest testapp/test_playwright.py -v
```

## Test Structure

The tests are organized as follows:

- `test_playwright.py`: Main test file containing test cases for various content editor features
- `test_playwright_helpers.py`: Helper functions for common operations like login and creating articles
- `conftest.py`: Pytest configuration and shared fixtures

## Test Coverage

The integration tests cover the following functionality:

1. **Basic Content Editor Loading**: Verifies that the content editor loads correctly in the admin interface
2. **Adding Content**: Tests adding rich text and other content types to an article
3. **Drag-and-Drop Ordering**: Tests the drag-and-drop functionality for reordering content items
4. **Tabbed Fieldsets**: Tests the tabbed interface if present
5. **Multiple Content Types**: Tests adding different types of content to an article
6. **Save Shortcut**: Tests the Ctrl+S keyboard shortcut for saving changes

## Troubleshooting

If you encounter issues with the tests:

- **Browser not found**: Make sure Playwright browsers are installed (`playwright install chromium`)
- **Element not found**: The selectors may need adjustment based on the actual DOM structure
- **Timeouts**: Increase timeout values if operations take longer than expected

## Extending the Tests

To add new tests:

1. Add new test functions to `test_playwright.py`
2. Use the helper functions from `test_playwright_helpers.py` for common operations
3. If needed, add new helper functions for specific interactions
