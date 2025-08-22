# Django Content Editor Tests

## Clone Functionality Testing

### Key Tests
- `test_clone_plugins_functionality`: End-to-end UI + database testing
- `test_clone_backend_logic`: Backend-only form processing
- `test_clone_insert_between_existing_content`: Insert positioning tests

### Critical Insights
**Clone Ordering**: `_clone_ordering` = ordering value to insert *before*. After save, existing content gets renormalized but cloned content keeps its target ordering value. This is correct behavior.

**Section Auto-Selection**: JavaScript auto-selects nested checkboxes. Use direct JS evaluation in tests.

**Region Targeting**: Use `[data-region="sidebar"] .order-machine-insert-target` for region-specific insert targets.

### Running Tests
```bash
python -m pytest tests/testapp/test_playwright.py -v
tox -e py313-dj52
```
