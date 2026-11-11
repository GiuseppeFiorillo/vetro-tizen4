#!/bin/sh
# Run the offline test suite and build the installer bundle.
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$HERE"

echo "== offline tests =="
python3 -m unittest tests.test_boot tests.test_supervisor

echo
echo "== installer bundle =="
python3 tools/build_bundle.py

echo
