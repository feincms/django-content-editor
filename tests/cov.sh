#!/bin/sh
venv/bin/coverage run --branch --include="*content_editor*,*testapp*" ./manage.py test testapp
venv/bin/coverage html
