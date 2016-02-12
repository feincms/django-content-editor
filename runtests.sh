#!/bin/sh
tests/venv/bin/coverage run --branch --include="*content_editor*,*testapp*" tests/manage.py test testapp
tests/venv/bin/coverage html
