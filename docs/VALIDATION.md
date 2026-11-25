# Validation

Tested on **UE65NU7100 / T-KTM2LDEUC-1400.2**, 25 November 2026, with
Developer Mode off. Other KANT-M2 models and firmware remain untested.

## Hardware checks

- Physical Home opens only Vetro; navigation works.
- The Samsung Home tile opens native Home, and Home returns to Vetro.
- Netflix opens normally; YouTube retains the usual signed-in account.
- A 30-second unplug/restart started 0.7.0 automatically. A new kernel boot ID,
  root access, automatic root rearming and current-boot recovery/Home supervisors verified.
- Pairing survived restart; unpaired status and root execution returned HTTP 401.
- Physical USB recovery was tested with Samsung Home confirmed not running.
  Recovery stopped Vetro, restored stock key routing and showed Samsung Home.
  Paired maintenance/root remained available and unpaired requests stayed blocked.
- Removing the USB and clearing its verified recovery latch restored Vetro.
- A final integrity check verified all 164 runtime files after removing old TV
  diagnostics and optional rollback backups, without restarting active services.

The recovery service needs two native owner Home activations one second apart:
the first cold activation can start a hidden process. The same approach is used
by the tested Home tile. The correction was installed after the successful cold
boot; another full cold boot of that final correction has not been performed.

## Offline checks

The local Linux checks cover 145 app suites, 6,719 launcher logic checks, four
legacy adapter suites, actual Node 4.4.3 compatibility and parsing of all 66 service
modules. The .NET 2 launcher/pairing source compiled against private references.
The generated recovery service is tested with fake native cold/warm launches and
failure propagation. Public CI repeats checks that need no private firmware.

The protected runtime and tested payload fingerprints are in profiles/. Native
source/artifact fingerprints are in native/current/manifest.json. These are
checksums, not device dumps or deployment state.

## Limits

The optional tuner needs .NET 3.1 and is unavailable on the tested .NET 2 runtime.
New model-specific/experimental features are not all validated. The independent
early firmware hook must not take over the startup file managed by standalone root.
A desktop test harness is not a TV emulator.

Version rollback was exercised during validation; optional older-version backups
were later removed at the owner's request. USB recovery remains a return to stock
Home while retaining paired maintenance, not an archive of an older Vetro version.
