#!/bin/sh
set -eu
node --test tests/target.test.cjs
node usb/run-fixtures.cjs
node usb/test-maintenance.cjs
python3 usb/test-maintenance-command.py
python3 usb/test-read-result.py
