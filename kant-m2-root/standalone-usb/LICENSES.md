# Source and artifact licensing

- Vetro, the Tizen 4 fork, native launcher, EFL bindings and root-daemon base retain
  their MIT license and existing notices. See `LICENSE-Vetro-MIT.txt`, the locked
  Tizen 4 archive and the parent repository's `THIRD_PARTY_NOTICES.md`.
- The Kant-M2 runtime/controller, pairing-display source, compatibility patches,
  profile and source-adapter tooling in this directory are supplied under MIT.
- USB installer, image/stage generation, FAT/archive tools, writer and maintenance
  client under `usb/`, and the new `tools/build-kit.py` / `tools/bundle-kit.py`
  integration are AGPL-3.0-only. See `LICENSE-root-AGPL-3.0.txt`.
- The separately fetched `samsung-tv-usb-root-kant-m2` dependency retains its own
  AGPL-3.0-only license and provenance. Its immutable commit and full source-tree
  digest are recorded separately from Vetro. It is not relabeled MIT.
- Pinned native artifacts are Vetro launcher/pairing builds, with source inputs
  fingerprinted in `native/manifest.json`. Their source and rebuild instructions
  accompany the artifacts; no signing keys or account data are included.
- The selective firmware reader adapts on-disk layouts from `gtors/vdfs-unpack`
  under MIT. Its original notice is retained in `LICENSE-vdfs-unpack-MIT.txt`.
- The original Samsung startup script is an owner-supplied, hash-checked build
  input, not a checked-in source file. No Samsung firmware image is distributed
  in this repository. The locally generated recovery data contains the exact
  original bytes needed to restore that script.

`tools/bundle-kit.py` includes this source, both public dependency archives,
generated stage assembly and licenses alongside a locally generated image kit.
Do not distribute a binary-only kit without corresponding source and notices.
