# Published source coverage

This optional directory contains the reusable implementation of the working
Kant-M2 setup, tested on UE65NU7100. The original research workspace is not required to rebuild it.

| Working component | Published source |
| --- | --- |
| Original Vetro and Tizen 4 integration | Immutable public archives in `sources.lock.json`, fetched and verified by `tools/fetch.py` |
| Local native launcher fixes | Four checked patches in `patches/`; streaming and Home diagnostics also have independent focused PRs |
| Standalone dashboard adaptation | `lib/standalone.cjs`, `tools/build-payload.cjs`, profile and service templates |
| Native pairing display | `overlay/pairing/`, portable project and fingerprinted native artifacts |
| Root daemon and guarded rearming | `overlay/root/`; the vendor restore bytes are supplied privately at build time |
| Persistent controller, health checks and rollback | `overlay/runtime/` |
| Dashboard-independent USB recovery | Runtime watcher, native Home fallback, recovery marker and image generator |
| Fresh autonomous USB installer | `usb/install.js`, `usb/build-package.cjs`, `tools/build-kit.py` |
| Logged bootstrap, exFAT trigger and image assembly | `usb/build_stage.py`, immutable AGPL dependency and deterministic FAT/archive helpers |
| Windows writing and readback | `usb/Write-Usb.ps1`; never called by build/tests/CI |
| Authenticated status/resume | `usb/maintenance.cjs`; token held only for that invocation |
| Read-only installation diagnostics | `usb/read-result.py`, bounded regular-file/image inputs only |
| Source bundles and provenance | `tools/bundle-kit.py`, source/native/reference manifests and license notices |
| Host validation | `tests/`, `usb/test-*`, fixture runner, pinned tool image and CI job |
| Static firmware/kernel comparison | `tools/verify-firmware.cjs`, regular files only |
| Selective offline firmware reading | `tools/vdfs-reader.cjs`, explicit extraction into ignored directories only |
| Source privacy audit | `tools/audit-source.cjs`, redacted findings and optional private denylist |

Historical live-TV probe scripts, abandoned reverse-shell/developer-mode setup,
one-off deployment commands, emulator experiments and reset/cleanup operations
are not production components of this installer. Their needed behavior is either
represented by the source above or remains explicitly unvalidated research. They
are not added to normal installation or CI. Personal diagnostics, firmware
images, signing material and paired credentials remain outside the source tree.

This is a Kant-M2 implementation for maintainer review with an explicit tested
firmware/kernel profile. Other Kant-M2 models remain untested. The root dependency retains
its separate AGPL license. See `LICENSES.md` and `README.md`.
