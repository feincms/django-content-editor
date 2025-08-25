# Django Content Editor Tests

## Clone Functionality Testing

### Key Tests
- `test_clone_plugins_functionality`: End-to-end UI + database testing
- `test_clone_backend_logic`: Backend-only form processing
- `test_clone_insert_between_existing_content`: Insert positioning tests
- `test_clone_backend_validation_error`: Error message validation when cloning form is invalid

### Critical Insights
**Clone Ordering**: `_clone_ordering` = ordering value to insert *before*. After save, existing content gets renormalized but cloned content keeps its target ordering value. This is correct behavior.

**Section Auto-Selection**: JavaScript auto-selects nested checkboxes. Use direct JS evaluation in tests.

**Region Targeting**: Use `[data-region="sidebar"] .order-machine-insert-target` for region-specific insert targets.

## Test Writing Guidelines

### Be Strict - No Fallbacks
- **Always test the exact expected behavior** - don't use fallback logic that would mask failing code
- **Verify specific error messages** - check for exact text, field names, and validation details
- **Assert on precise conditions** - avoid "if this doesn't work, try that" patterns
- **Let tests fail when code is broken** - fallbacks hide bugs and prevent proper debugging
- **Test database state directly** - verify exact counts, field values, and relationships
- **Use specific selectors** - don't fall back to generic ones that might match wrong elements
- **Validate full user experience** - error messages must be visible to actual users

### Common Anti-Patterns to Avoid
- `assert True` after conditional checks (masks real failures)
- `try/except` blocks that suppress assertion errors
- Generic error message checks instead of specific validation
- Counting "at least N" instead of "exactly N" when exact is expected
- Checking "something worked" instead of "the right thing worked correctly"

Example of **BAD** test pattern:
```python
# DON'T DO THIS - fallbacks hide real issues
if "expected error" in messages:
    assert True  # Found expected error
else:
    # Fallback that masks the real problem
    if any_error_messages:
        assert True  # "At least some error occurred"

# DON'T DO THIS - vague assertions
assert len(items) >= 2  # Could be wrong number
try:
    some_assertion()
except AssertionError:
    pass  # Ignoring failures
```

Example of **GOOD** test pattern:
```python
# DO THIS - strict assertions reveal real issues
assert "Cloning plugins failed" in error_message, f"Expected error not found: {error_message}"
assert "This field is required" in error_message, f"Field validation missing: {error_message}"

# DO THIS - precise validation
assert len(sidebar_items) == 3, f"Expected exactly 3 items, got {len(sidebar_items)}"
assert item.ordering == 200, f"Expected ordering 200, got {item.ordering}"
```

### When Adding New Tests
1. **First make the test fail** - verify it catches the bug/missing feature
2. **Make it pass with minimal code** - implement just enough to pass
3. **Verify error messages reach users** - check admin UI displays them correctly
4. **Test edge cases strictly** - empty inputs, invalid data, boundary conditions

### Running Tests
```bash
python -m pytest tests/testapp/test_playwright.py -v
tox -e py313-dj52
```
