#!/bin/sh
# Offline .NET 2 build. Supply a local, lawfully obtained runtime reference pack.
# Does not install or contact a TV. Run from any working directory.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
: "${VETRO_NET2_REFS:?Set VETRO_NET2_REFS to the directory containing .NET Core 2 reference DLLs}"
export VETRO_NET2_REFS
mkdir -p out/native-compile/dock out/native-compile/pairing
sdk=$(dotnet --list-sdks | tail -1 | cut -d' ' -f1)
sdkroot=$(dotnet --list-sdks | tail -1 | sed 's/.*\[\(.*\)\]/\1/')
csc=$sdkroot/$sdk/Roslyn/bincore/csc.dll
python3 - <<'PY'
import os
from pathlib import Path
base=Path('out/native-compile')
refs=['-r:"'+str(p.resolve())+'"' for p in sorted(Path(os.environ['VETRO_NET2_REFS']).glob('*.dll')) if not p.name.endswith('.ni.dll')]
if not refs:
    raise SystemExit('No .NET 2 reference DLLs found')
(base/'Target.cs').write_text('[assembly:System.Runtime.Versioning.TargetFramework(".NETCoreApp,Version=v2.0")]\n[assembly:System.Reflection.AssemblyVersion("0.7.0.0")]\n')
for name,files,out in [('dock',list(Path('dock/src').rglob('*.cs')),base/'dock/tvlauncher-dotnet-2.0.dll'),('pairing',[Path('overlay/pairing/PairingDisplay.cs'),Path('dock/src/Native/Efl.cs')],base/'pairing/vetro-pairing-display.dll')]:
    lines=['-noconfig','-nostdlib+','-target:exe','-optimize+','-deterministic+','-langversion:latest','-out:'+str(out)]+refs+[str(base/'Target.cs')]+[str(p) for p in sorted(files)]
    (base/(name+'.rsp')).write_text('\n'.join(lines)+'\n')
PY
dotnet "$csc" @out/native-compile/dock.rsp
dotnet "$csc" @out/native-compile/pairing.rsp
cp native/current/pinned/dock/tvlauncher-dotnet-2.0.runtimeconfig.json out/native-compile/dock/
cp native/current/pinned/pairing/vetro-pairing-display.runtimeconfig.json out/native-compile/pairing/
printf '%s\n' 'Built into out/native-compile; pinned artifacts were not overwritten.'
