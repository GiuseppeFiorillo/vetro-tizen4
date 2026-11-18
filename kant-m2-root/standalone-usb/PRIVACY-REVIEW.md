# Publication review

The Kant-M2 contributions and their already-published commit history were checked
for private network addresses, MAC addresses, literal device identifiers,
personal home paths, credential material and private/generated artifacts.
ASCII and UTF-16 strings in the pinned native files were included. No personal
data matches were found. A local, ignored denylist supplied additional identifier
checks; neither its values nor private diagnostics are published.

Loopback and documentation-network addresses used by code/tests are non-personal.
Native file/assembly version resources are distinguished from IP addresses.
Firmware/profile digests and the UE65NU7100 tested-model description identify
software or hardware type, not an individual device.

The remaining local source was inventoried. Reusable missing firmware assessment
and selective-reader helpers were included after making them portable and testing
them. Retired SDK/listener setup, one-off live-TV transitions, reset operations,
private diagnostics and unvalidated emulator experiments are not installed or
published as working components. See `SOURCE-COVERAGE.md` for their maintained
equivalents where applicable.

`tools/audit-source.cjs` and its host tests are part of the offline CI checks to
help catch future accidental additions. Inputs, source caches, native build
folders, generated images, logs and credentials remain excluded from Git and the
public-source portion of generated bundles.
