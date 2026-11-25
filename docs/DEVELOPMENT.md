# Development

## Requirements

Use Node.js 22, Linux with SQLite/OpenSSL/Python 3 for the full app suite, and
.NET SDK 10 for desktop launcher checks. Node 4.4.3 is needed to check the actual
legacy runtime. The tested TV uses Bash as /bin/sh; run the integration tests in
a disposable environment with that layout. A separate Dash fallback is covered.
Tests use temporary files and mock services, never a TV.
Some adapter/kernel-identity fixtures need root to validate a root AUTH PID.
Run those in a disposable root container/runner, as CI does.

```sh
npm test
npm run test:chain
npm run test:native
/path/to/node-v4.4.3 tools/check-node4.js
npm run audit
```

## Standalone build

No Samsung firmware is stored here. Supply your own original startup script
outside the repository. Wrong or missing inputs fail closed before output creation.

```sh
VETRO_VENDOR_SCRIPT=/absolute/private/parseinfo.sh npm run build
node tools/test-recovery-home.cjs out/build-TIMESTAMP/current
```

PowerShell:

```powershell
$env:VETRO_VENDOR_SCRIPT = 'D:\private\parseinfo.sh'
npm run build
```

Output includes private vendor bytes and must not be committed. Identical inputs
must produce identical payload hashes. The checked-in profiles/tested-payload.json
contains only tested output hashes; runtime-invariants.json protects root/Home-key code.

The recovery integration test executes the generated service command against a
fake native launcher on Linux. It covers cold/warm activation, native launch
failure and retention of paired maintenance. It never executes a TV command on a device.

## Native rebuilds

Changing native sources makes packaging fail until matching artifacts are rebuilt
and the manifest reviewed. Do not refresh checksums merely to bypass that check.

With SDK 10, Python 3, a POSIX shell and privately supplied .NET Core 2 reference DLLs:

```sh
VETRO_NET2_REFS=/absolute/private/netcore2-refs sh tools/build-native.sh
```

This writes out/native-compile without replacing pinned artifacts. Compare outputs,
review source/artifact hashes, then update native/current/manifest.json and the
corresponding package inputs together. Reference DLLs are not distributed.
Managed compilation does not validate native ABI or hardware behavior.

The .NET 3.1 launcher for newer TVs (app/native/dock/tvlauncher-dotnet.dll) is
built from the same sources by the netcoreapp3.1 step of dock/build.sh. That step
is deterministic and maps the checkout path away, so .NET SDK 10.0.404 reproduces
the shipped file byte for byte. The .NET 2 launcher comes from
tools/build-native.sh only; the netcoreapp2.0 step in dock/build.sh does not
produce the pinned artifact, and the audit refuses a mismatched copy.

The launcher's Home diagnostics are opt-in: with --debug-guard it writes
tvlauncher.guard.log and, on the legacy runtime, a shell trace of the Samsung Home
launch to tvlauncher.home-child.log (cleared above 32 KiB).

Modern launcher/tuner sources retain their upstream build scripts. The tuner
requires an owner-supplied Samsung TV client reference and .NET 3.1; it is not
ported to .NET 2. Do not distribute Samsung reference DLLs.

## Optional WGT tools

These are separate from the Developer-Mode-free standalone runtime:

```sh
npm run build:app
npm run build:chain
npm ci --prefix chain/signing
AUTHOR_P12=/private/author.p12 DIST_P12=/private/distributor.p12 \
AUTHOR_PW='local-secret' DIST_PW='local-secret' node chain/sign.cjs
```

The app-only widget has no root integration; the chain widget adds the legacy
adapter. Signing dependencies have their own lockfile. Certificates/passwords stay
local; signed packages are ignored. These tools do not install or obtain root.

## Publication

Run the audit, tests and a private-input build before publishing. Public CI runs
source, app, adapter and native logic checks; full standalone builds require the
owner's private vendor input. Review staged files. Firmware, reference packs, raw
logs, credentials and generated payloads do not belong in Git.
