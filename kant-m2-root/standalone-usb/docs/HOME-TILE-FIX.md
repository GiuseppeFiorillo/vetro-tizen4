# Samsung Home tile candidate fix

The historical replay image targets the correct Home app (`com.samsung.tv.csfs`)
but uses `app_launcher -s`. On the tested Kant-M2 TV that command can report
success without showing Home. Independent USB recovery already uses the native
owner launch: `aul_test launch_async_for_uid com.samsung.tv.csfs 5001`.

[PR #4](https://github.com/GiuseppeFiorillo/vetro-tizen4/pull/4) corrects the system
launcher dispatch only for the legacy `corerun` runtime. Modern runtimes and other
system tiles retain their current routes. The Home activation already cancels
the close guard. The corrected tile itself awaits live hardware confirmation.

## Prepare a candidate without changing historical replay

`--home-launch-fix` applies the extra hash-checked patch after the normal four.
It marks the result as an unpromoted candidate and requires a native rebuild:

```sh
docker compose run --rm builder python3 tools/prepare.py --archive .cache/tizen4-3ecb6856ae253fa8df8aa23ecd4bb17102f08046.zip --output out/home-fix-source --home-launch-fix
dotnet run -c Release --project out/home-fix-source/dock/tests
dotnet build -c Release -p:VetroLauncherTfm=netcoreapp2.0 out/home-fix-source/dock/Launcher.csproj -o out/home-fix-build/dock
docker compose run --rm builder python3 tools/record-native.py --source out/home-fix-source --dock-output out/home-fix-build/dock --output out/home-fix-native
docker compose run --rm -e VETRO_VENDOR_SCRIPT=/inputs/parseinfo.sh builder node tools/build-payload.cjs --source out/home-fix-source --native out/home-fix-native --output out/home-fix-payload
```

The .NET commands require the native-build SDK/reference packs described in the
main README; the minimal image-builder container does not include that SDK.
Use new output directories for repeated attempts. `record-native.py` records
artifact/source identity; it is not a hardware-approval mechanism.

The normal source/image replay remains unchanged. Its reference hashes and pinned
native artifacts are not replaced by this option, and the USB packager refuses
the unpromoted candidate. Live deployment requires a backed-up native update and
consistent manifest/boot-hook hashes; copying only the DLL can break the next
startup. This document does not perform or prescribe an unverified live update.

Host validation: the focused launcher suite passed 5,160 checks; the cumulative
standalone source passed 5,176 checks. Both .NET 2.0 builds passed. Eleven source
checks include explicit candidate marking and refusal to reuse the old binary.
No new TV deployment is claimed. Hardware evidence is UE65NU7100 /
T-KTM2LDEUC-1400.2 only; other Kant-M2 models remain untested.
