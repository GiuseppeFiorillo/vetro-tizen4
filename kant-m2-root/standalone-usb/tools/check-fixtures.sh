#!/bin/sh
set -eu
node --test tests/target.test.cjs tests/firmware.test.cjs tests/privacy.test.cjs tests/vdfs.test.cjs
node tools/audit-source.cjs .
node usb/run-fixtures.cjs
node usb/test-maintenance.cjs
python3 usb/test-maintenance-command.py
python3 usb/test-read-result.py
