# Kant-M2 standalone Vetro and USB installer

**Draft implementation for Samsung's Kant-M2 (T-KTM2) platform.** End-to-end
testing has only been performed on **UE65NU7100 / T-KTM2LDEUC-1400.2**, build
`T-KTM2LDEUC-REL-202606052034`, Linux 4.1.10. Other Kant-M2 models are untested.
The builder selects a firmware/kernel profile, not a model-name allowlist.
The included profile reproduces that tested build; the USB trigger uses fixed
kernel addresses before installer checks, so firmware/profile matching matters.

This directory contains the full standalone runtime, pairing-display source,
root supervision/rearming code, source adapters, USB installer, image builder,
Windows writer, authenticated maintenance client, tests and licenses. It is a
separate optional build: existing app-only packaging and installation stay intact.
Running the build or tests does not install anything, open a disk, or contact a TV.
The USB writer is a separate, explicitly destructive operator action; no build,
test or CI step invokes it.

## Source lineage and support evidence

`sources.lock.json` records original Vetro, the Tizen 4 port and the separate
AGPL USB-root dependency. This reference uses the exact older Tizen 4 snapshot
that was hardware-tested, then applies the four local launcher patches. It does
not silently substitute the surrounding repository's HEAD. The streaming and
Home diagnostic patches are also proposed separately; they are not dependencies
of this PR. Upstream 0.5.0 is displayed as local compatibility build 0.5.1.

One controlled clean USB installation on this exact TV passed with Developer Mode
off. Authenticated root, the Home bar, native Netflix / signed-in YouTube, repeat
USB-free cold boots, automatic rearming, dashboard-independent USB recovery and
resume were verified. The earlier unlogged installer failed one attempt; only
the logged bootstrap is reproduced here. The cause of that difference is unknown.
First-start icons required a later refresh/restart. No completion overlay was
verified. Builds made during this source extraction were **not** deployed again.
See `usb/OPERATING-INSTRUCTIONS.txt` and the parent standalone proposal.

Known Home-tile issue: the historical image's Samsung Home pill may do nothing
because it uses the generic launch route. A native owner-route correction is
available as an explicit [candidate patch](docs/HOME-TILE-FIX.md); it is not silently
enabled in the byte-identical replay or claimed as newly hardware-validated.

## Reproduce the tested images

Use Docker with Linux containers (Compose v2) from this directory. The Dockerfile
pins Python 3.13.14/zlib 1.3.1, the Node image by digest, Zig 0.15.2, pyelftools
0.33 and Capstone 5.0.9. The Node 4.4.3 host fixture runner is downloaded from
nodejs.org and SHA-256 checked. No developer certificate, SDB or signing key is
needed. Base images and build dependencies require network access while building
the tool image; source retrieval is a separate explicit step. Build/tests then
run with network disabled and source/input mounts read-only.

1. Obtain your **own original** `/opt/etc/parseinfo.sh` from your firmware or an
   existing backup. Do not reset, reconnect to, or modify a TV just to run these
   source tests. Put the file in ignored `inputs/parseinfo.sh`, or set
   `VETRO_BUILD_INPUTS` to your private input directory. Required size: 805 bytes;
   SHA-256: `81b774498adafea47f2dba2635eff7f070730bdaa9cc167f23934fded49df0f8`.
   The source repository contains a placeholder, not Samsung's script or signature.
   Missing/wrong input is rejected before the build.
2. Build the tool image and explicitly fetch the two immutable public archives:

   ```sh
   docker compose build builder
   docker compose run --rm source-fetch python3 tools/fetch.py --source tizen4
   docker compose run --rm source-fetch python3 tools/fetch.py --source usbRoot
   ```

   Reuse existing verified downloads on repeated runs; the fetcher refuses to
   overwrite cache files. It verifies commit, full tree digest and file count.
3. Build into a **new** staging directory (command shown as one line for both
   PowerShell and Unix shells):

   ```sh
   docker compose run --rm builder python3 tools/build-kit.py --profile ktm2ldeuc-1400.2 --firmware T-KTM2LDEUC-1400.2 --vendor-script /inputs/parseinfo.sh --vetro-archive .cache/tizen4-3ecb6856ae253fa8df8aa23ecd4bb17102f08046.zip --usb-root-archive .cache/usbRoot-0c9d176c4f7c5f1822db7663002dda32dde673c0.zip --output out/rebuild
   ```

   The command validates source locks, patches and native fingerprints, builds
   all 104 payload files, archives them deterministically, assembles/validates
   the logged ARM entry, builds both images and compares every historical package
   input and image with `usb/reference-build.json`. Any difference fails the build.
   Output is under `out/rebuild/package`; it includes image hashes and separate
   current operating instructions. Nothing is flashed automatically.

Expected image SHA-256:

| File | SHA-256 |
| --- | --- |
| INSTALL.img | `eb425440a16e97d7480203b6f3a303e7b34d4767379b18c63a078290a95b0974` |
| RECOVERY.img | `3d2e55ab671eb76e8c864bcadc52d7617920b6896ea0919570c01d06191a2d77` |

The FAT payload's `README.TXT` and `PACKAGE.JSON` retain their historical candidate
text for exact image parity. **OPERATING-INSTRUCTIONS.txt takes precedence** for
the tested logged variant. Current build/hardware evidence is separate from those
legacy bytes; a local rebuild does not count as another hardware test. Historical
NU7100 package labels and deployment comments remain inside the replayed bytes
to preserve image hashes; they are not a model-name restriction in the builder.

To make a deterministic local ZIP including corresponding source and both public
dependency archives:

```sh
docker compose run --rm builder python3 tools/bundle-kit.py --build out/rebuild --vetro-archive .cache/tizen4-3ecb6856ae253fa8df8aa23ecd4bb17102f08046.zip --usb-root-archive .cache/usbRoot-0c9d176c4f7c5f1822db7663002dda32dde673c0.zip
```

No firmware input is copied into the ZIP's SOURCE directory. Generated installation
and recovery data necessarily retain the exact original vendor bytes for rollback.
Do not commit the generated kit, inputs, credentials or diagnostics to Git.

## Host tests

The following runs synthetic fixtures without any firmware input. Container root
is used only to exercise ownership changes on temporary fixture files:

```sh
docker compose run --rm builder node --test tests/target.test.cjs
docker compose run --rm builder node usb/run-fixtures.cjs
docker compose run --rm builder node usb/test-maintenance.cjs
docker compose run --rm builder python3 usb/test-maintenance-command.py
```

There are 14 installer cases, 16 rollback cases, five permanent-controller cases
and 14 root-rearming cases, run on host Node 4.4.3. Systemctl/chsmack actions are
mocked, extraction and writes stay in a temporary lab, and no USB device is opened.
The maintenance test uses a mocked pairing service; generated privileged code is
parsed, not executed. CI runs these without secrets or firmware.

With a completed real build, run the same installer fixtures on the actual payload:

```sh
docker compose run --rm builder node usb/run-fixtures.cjs --package out/rebuild/package
```

The ten source/parity/drift tests additionally need `VETRO_VENDOR_SCRIPT` and
`VETRO_TIZEN4_ARCHIVE` set **inside** the container; use `docker compose run -e`
with `/inputs/parseinfo.sh` and the pinned `.cache/` archive paths respectively,
then `node --test tests/compat.test.cjs`. `tests/test-isolation.cjs` accepts
`VETRO_TEST_PAYLOAD=/work/out/rebuild/payload` and checks request/cookie isolation.
`python3 usb/read-result.py --result PATH_TO_RESULT.JSON` or `--image SAVED_INSTALL_IMAGE`
reads existing regular files only; it never opens a raw device. On Windows,
`tools/check-writer.ps1` parses the writer and compiles its helper without writing
or opening a disk. These helpers and the source coverage map are included here.
These checks do not emulate the TV kernel or replace profile-specific hardware
acceptance. The existing root-marker fixtures also remain under the parent tests.

## Offline firmware assessment and privacy checks

`tools/verify-firmware.cjs` compares an owner-supplied uncompressed `uImage` and
extracted exFAT modules against the known firmware/kernel profile. It checks CRCs,
exported symbols, instruction bytes, the scratch cave and module fingerprints;
it does not execute the firmware or automatically approve another profile:

```sh
node tools/verify-firmware.cjs --uimage PATH_TO_UIMAGE --modules PATH_TO_EXTRACTED_MODULES
```

The selective, read-only VDFS2007 reader can extract an explicitly named file
from a supplied `platform.img` into ignored `out/` or `inputs/` only:

```sh
node tools/vdfs-reader.cjs --image PATH_TO_PLATFORM_IMAGE --extract /usr/lib/modules/4.1.10/kernel/exfat_core.ko --output out/exfat_core.ko
```

It is not a general firmware unpacker. The writable `/opt` startup script is not
necessarily present in a platform image; use an existing original backup when
needed. The reader was checked against the supplied firmware's exFAT module and
its known digest. Extracted firmware is not committed or sent to a TV.

`node tools/audit-source.cjs .` checks source and native strings for potentially
personal addresses, device identifiers, home paths and secrets, with matched values
redacted. Loopback/documentation examples and native assembly-version resources
are distinguished from personal IP addresses. An optional `--denylist` JSON file
in ignored `inputs/` can check locally known identifiers without publishing them.
The firmware parser, VDFS reader and privacy scanner have dedicated host fixtures
and are included in the offline CI job.

## Native source and pinned artifacts

Exact replay reuses four hash-verified .NET 2.0 launcher/pairing artifacts in
`native/pinned/`. Every launcher C# input, project file and pairing input is
fingerprinted in `native/manifest.json`; changes refuse silent reuse. This is
reproducible replay with pinned native artifacts, not a claim that arbitrary SDKs
will regenerate byte-identical PE files. Complete corresponding native source is
included in the pinned fork plus local patches and `overlay/pairing/`.

With a suitable .NET SDK and .NET 2 reference packs, build the prepared source:

```sh
dotnet run -c Release --project out/rebuild/source/dock/tests
dotnet build -c Release -p:VetroLauncherTfm=netcoreapp2.0 out/rebuild/source/dock/Launcher.csproj -o out/native/dock
dotnet build -c Release -p:VetroSourceRoot=ABSOLUTE_PREPARED_SOURCE_PATH overlay/pairing/PairingDisplay.csproj -o out/native/pairing
python3 tools/record-native.py --source out/rebuild/source --dock-output out/native/dock --pairing-output out/native/pairing --output out/native-reviewed
```

Both projects were compiled during this extraction; new binaries were not deployed.
The pairing project now takes a portable EFL include path; C# and EFL content are
unchanged. `record-native.py` records provenance, not hardware approval. New native
outputs or source changes require reviewed reference updates and fresh recoverable
hardware validation before an installer can be promoted.

## Recovery and future integration

`overlay/runtime/` owns the independent supervisor and native Home fallback;
`overlay/root/` owns guarded boot/rearming; `overlay/units/` separates owner web and
root services. Pairing is on by default; no account or token is preloaded. Recovery
keeps paired maintenance, latches disabled state and requires explicit authenticated
resume after removing the ordinary FAT recovery marker. It needs a working watcher
and USB mounting; it cannot repair every partial installation or failed boot.

The installation is fresh-only and refuses an existing installation, modified
vendor hook, wrong firmware or administrator disable marker. This is not the
normal Vetro update mechanism. Keep the existing tested recovery and build until
another explicitly bounded upgrade is validated. Decisions about integrating this
optional bundle into the main fork's builder remain open in draft PR #3.

See `LICENSES.md` for MIT/AGPL boundaries. No firmware images, signing certificates,
pairing keys, browser sessions or personal logs are included. Generated output,
inputs and cache are ignored. All source and PR preparation was materially assisted
by OpenAI Codex; independent maintainer review is requested.
