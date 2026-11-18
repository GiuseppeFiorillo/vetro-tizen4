# Proposal: standalone Vetro with independent USB recovery

Status: design review, not an installable standalone release. The accompanying
marker detector is inert unless explicitly called. This change neither installs
boot hooks nor starts services, grants root, changes pairing or disables Samsung
Home. Keep the current installation workflow until an integration is reviewed.

## Evidence and support boundary

A local standalone build was tested on **Samsung UE65NU7100,
T-KTM2LDEUC-1400.2**, exact build `T-KTM2LDEUC-REL-202606052034`:

- Dashboard, authenticated root and homescreen ran with Developer Mode off and
  USB disconnected, including two consecutive cold boots with root rearming.
- Home navigation and native Netflix / signed-in YouTube launches worked.
- Inserting a recovery USB returned to Samsung Home even when the dashboard was
  deliberately stopped. A native Home launch path was needed for reliable recovery.
- The final recovery test kept paired maintenance access available and rejected
  unpaired privileged requests. Normal standalone operation was restored after
  removing the marker and explicitly resuming it.
- A fresh installation after factory reset, repeat startup and recovery were
  tested. First-start icons initially failed and worked after restart; startup
  catalog readiness still needs investigation.

These are observations from that local build, not hardware validation of this
PR or evidence that other models are supported. Its full supervisor, installer,
pairing display and root integration are deliberately outside this initial PR.
The accompanying detector uses the same source as the locally tested watcher,
with host regression tests added here.

## Proposed boundaries

1. Keep dashboard and app-only packages independent of rooting implementation.
   Place privileged boot/recovery integration in `kant-m2-root/`, with an explicit
   model/build profile. Unsupported firmware must fail closed.
2. Prepare a separate, checksummed payload and trial configuration. Preserve the
   existing installation and rollback state until a bounded trial passes.
   Never infer permission to change system files from a diagnostic report.
3. Run the web service under the owner identity with no root capabilities. Keep
   the root daemon separate and pairing required for privileged LAN requests.
   Browser pairing must not silently authorize a maintenance client.
4. Start the recovery supervisor independently of the dashboard. A dashboard
   crash or loss of Developer Mode must not prevent recovery. Preserve captured
   preference bytes and metadata, using atomic writes and verified restoration.
5. Only enable permanent startup after cold-boot, repeated rearming, application
   launch and dashboard-independent recovery tests. Do not disable Samsung Home
   or replace system firmware as part of the application installation.

## Marker contract

The root of eligible mounted storage contains a regular, non-symlink file named
`VETRO-STANDALONE-ROLLBACK`, with content:

```text
VETRO-STANDALONE-RECOVERY/1
```

`standalone/usb-recovery.js` reads kernel mount metadata and accepts only a short
marker with the exact header. It never loads or executes a USB script. Its
`/dev/sd*` and filesystem checks are storage heuristics for the tested TV, not
proof that a device is physically USB. Other mount layouts need explicit review.
The local fixture-root option is for tests, not configuration from LAN requests.

The intended consumer latches a disabled state on a valid marker, stops the
standalone dock, restores the saved launcher preference and requests Samsung Home
through the verified native owner launch path. Removing the USB must not silently
re-enable the dock. An explicit authenticated resume is required. Paired
maintenance root/web access remains available in the tested recovery mode.

This marker relies on working USB mounting and the independent supervisor; it is
not a bootloader recovery mechanism or protection against every failed boot.

## Questions for maintainer agreement

- Should standalone remain a separate optional bundle, or become an installation
  mode of the existing chain builder?
- Which profile and evidence format should gate exact firmware support?
- Should recovery retain paired maintenance access as above, or offer a separate
  full shutdown/uninstall action?
- How should standalone updates, health checks and rollback interact with the
  fork's update confirmation workflow?
- How should native pairing display and first-boot catalog readiness be integrated?

Subsequent implementation should include simulator fixtures for crash, stale
state, partial writes, boot mismatch, unexpected file ownership, dashboard outage,
USB insertion, restore failure and authenticated resume. Hardware acceptance must
be repeated for each supported profile. Preserve licenses for any separate USB
root dependency; this proposal does not import its exploit or installation image.

## Host checks

```sh
node --test kant-m2-root/tests/standalone-recovery.test.cjs
```

Run these fixtures on Linux, as in CI; they model Linux mount paths and symlinks.
Tests cover mount filtering/escape decoding, marker content and size, directories
and symlinks, removed media, unrelated executable content and multiple mounts.
They never connect to a TV. Passing them does not validate a standalone installer.

This proposal and its tests were materially assisted by OpenAI Codex. Maintainer
review of the architecture and the reused detector is requested.
