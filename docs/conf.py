import datetime
import os
import re
import subprocess
import sys


sys.path.append(os.path.abspath(".."))

project = "django-content-editor"
author = "Feinheit AG"
copyright = f"2009-{datetime.date.today().year}, {author}"
version = __import__("content_editor").__version__
release = subprocess.check_output(
    "git fetch --tags; git describe", shell=True, text=True
).strip()
language = "en"

#######################################
project_slug = re.sub(r"[^a-z]+", "", project)

extensions = [
    # 'sphinx.ext.autodoc',
    # 'sphinx.ext.viewcode',
]
templates_path = ["_templates"]
source_suffix = ".rst"
master_doc = "index"

exclude_patterns = ["build", "Thumbs.db", ".DS_Store"]
pygments_style = "sphinx"
todo_include_todos = False

html_theme = "sphinx_rtd_theme"
html_static_path = ["_static"]

# Theme options
html_theme_options = {
    "navigation_depth": 3,
    "collapse_navigation": False,
    "sticky_navigation": True,
    "includehidden": True,
    "titles_only": False,
}
htmlhelp_basename = project_slug + "doc"

latex_elements = {
    "papersize": "a4",
}
latex_documents = [
    (
        master_doc,
        project_slug + ".tex",
        project + " Documentation",
        author,
        "manual",
    )
]
man_pages = [
    (
        master_doc,
        project_slug,
        project + " Documentation",
        [author],
        1,
    )
]
texinfo_documents = [
    (
        master_doc,
        project_slug,
        project + " Documentation",
        author,
        project_slug,
        "",  # Description
        "Miscellaneous",
    )
]
