# Upgrading the Tizen 4 port to Vetro 0.7.0

This records the initial offline preparation. Subsequent installation, cold-boot
testing and the physically tested two-step USB Home recovery correction are
recorded in VALIDATION.md. References to pending hardware checks below describe
the preparation stage, not the current installed status.

Upstream: [andrearicci93/vetro v0.7.0](https://github.com/andrearicci93/vetro/tree/v0.7.0), commit fb83fd055681127761e322b434d82c4626a55a05. Port baseline: version-matched original/fork 0.5.0 releases described in 0.5-PORT-COMPARISON.md. Original 0.5 to original 0.7 changes 692 paths across the compared source trees, so overwriting the old folder or replaying every old patch blindly would lose functionality.

This port starts from the new app/dock/tuner source, reapplies the still-needed legacy port, then integrates the Kant-M2 launch fixes with new 0.7 launch behavior. The existing 0.5 app, installed TV and USB installer remain unchanged. No TV connection was used for this upgrade. All physical validation below is explicitly still pending.

## Decisions about our fixes

| Fix/adaptation | Decision in 0.7 | Evidence and validation |
| --- | --- | --- |
| Netflix and YouTube owner-native launch | Retained, adapted | Upstream does not replace the old TV's special native/owner route. Normal legacy entries keep it. New Shard/plugin-owned entries defer to the Shard route instead; regression coverage checks both. This preserves the route previously verified to retain the signed-in account. Hardware retest pending. |
| Legacy Samsung Home tile | Retained | New upstream Home launch support targets newer Home behavior; the tested old owner-aware AUL route still needs its two activations. Cancellation tied to the current guard token is preserved and tested, including warm launch cancellation. Hardware timing retest pending; the previously accepted roughly five-second cold delay is not a 0.7 measurement. |
| Home-key database override and Home guard | Retained | Our override avoids launching Samsung Home on physical Home and is already cold-boot tested on the old build. Upstream 0.7 adds a compositor key claim tested on a newer TV; that does not establish old-TV compatibility. Legacy startup omits --claim-home, keeps the existing override and guard, and tests that selection. Modern runtime behavior remains available. |
| Guard/child command diagnostics | Retained, bounded | Kept as opt-in diagnostics and bounded trace output: both the guard log and the Home launch shell trace are written only when the launcher is started with --debug-guard. They are not evidence of a new timing fix; do not remove them based solely on passing desktop tests. |
| Old .NET runtime, AppDir and input routes | Retained and extended | Launcher and pairing display rebuilt against .NET Core 2 references. New NativeLibrary calls use dlopen/dlsym because the managed API is absent on .NET 2. New asset paths use the actual assembly directory under corerun. |
| Node 4 Buffer shims | Partly absorbed upstream | 0.7 already copies array/Buffer bytes correctly. Combined that implementation with the fork's zero-filled allocation, input/range validation and non-function finally handling. Actual Node 4.4.3 fixture and syntax checks pass. |
| Old SQLite/schema/icon handling | Retained and extended | The old CLI lacks -readonly; new modules need the same treatment as old queries. Port catalog/schema/icon fallbacks remain. Query and registry regression suites pass locally. |
| Standalone root, pairing and USB recovery | Retained | Protected root daemon/startup/service, vendor-original script and Home-key runtime files match the installed baseline byte for byte during packaging. Manifest and native source hashes are verified. This is a packaging guarantee, not a new hardware recovery test. |
| New 0.7 early firmware/boot hook | Guarded against managed root | It refuses to install while our standalone root config and hook exist, including the temporary vendor-restored rearming window. A regression test checks that vendor and installed hook states are preserved. Runtime firmware blocking remains a separate feature. |
| New Home-picture cleanup | Disabled on legacy route | Its three-second cleanup could conflict with the known slow legacy intentional Home startup. The legacy launcher and service skip this newer cleanup; modern behavior remains unchanged. Native and service tests cover the split. |

## Features with known limits

The new optional TV tuner is still a .NET 3.1 component. It has not been ported to .NET 2 or validated on this TV. Prerequisite detection prevents starting it when the required runtime is unavailable; its presence in the package does not mean it works on Tizen 4. Likewise, the new early-boot Quick Boot/firmware hook must not take ownership of the standalone root hook and declines that operation. Other new device-specific features still require controlled hardware checks.

Update-channel guards from the fork remain. An original 0.7 release is not a compatible update artifact for this port merely because its version matches. Do not bypass the configured channel/signature checks or install an original binary over this port.

## Local validation and build

- 145 app test suites pass in an offline Linux container with SQLite and TV-style Bash /bin/sh behavior. The separate Dash fallback remains covered.
- 6,719 native launcher checks pass, zero failures, using the desktop .NET test harness.
- Four root-agent integration suites pass on actual Node 4.4.3, including mock-agent authentication rejection, reconnect and command routing.
- The actual Node 4.4.3 compatibility fixture passes; all 66 service JavaScript files parse with that runtime.
- Launcher and standalone pairing helper compile against .NET Core 2 reference assemblies. This verifies the managed API surface, not ARM/EFL execution.
- The portable native build script uses local reference DLLs; proprietary firmware/reference DLLs are not distributed in the app source. See tools/build-native.sh and native/current/manifest.json.
- npm run build verifies source/native fingerprints, both standalone manifests and seven protected root/Home-key files. The resulting build has 164 static runtime files. The checked-in profiles/tested-payload.json stores only reference hashes; old runtime copies are excluded.
- Two final package builds are compared by file hash; the checked-in tested-payload hash map records the tested result.

The container tests use no network. Build scripts package local files only; they do not contact the TV, flash media or deploy anything. Hardware tests must later cover physical Home, intentional Home cold/warm launch and return, signed-in streaming apps, pairing denial/authorization, standby, cold boot/rearming and USB recovery before treating 0.7 as a replacement for the validated build.
