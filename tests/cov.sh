#!/bin/sh
venv/bin/coverage run --branch --include="*content_editor*" ./manage.py test testapp
venv/bin/coverage html
