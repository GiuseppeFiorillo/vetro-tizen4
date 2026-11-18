"""Record explicitly rebuilt native artifacts; this does not certify their tests."""
import argparse,hashlib,json,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def sha(p,text=False):return hashlib.sha256(p.read_text(encoding='utf-8').encode() if text else p.read_bytes()).hexdigest()
a=argparse.ArgumentParser();a.add_argument('--source',type=Path,required=True);a.add_argument('--dock-output',type=Path,required=True);a.add_argument('--pairing-output',type=Path);a.add_argument('--output',type=Path,required=True);v=a.parse_args()
v.output.resolve().relative_to((ROOT/'out').resolve())
if v.output.exists():raise ValueError('Use a new native-artifact staging directory')
old=json.loads((ROOT/'native/manifest.json').read_text());source=v.source.resolve()
inputs={p.relative_to(source).as_posix():sha(p,True) for p in sorted((source/'dock/src').rglob('*.cs'))};inputs['dock/Launcher.csproj']=sha(source/'dock/Launcher.csproj',True)
pair={n:sha(ROOT/'overlay/pairing'/n,True) for n in old['pairingInputs']}
pair_changed=pair!=old['pairingInputs'] or inputs.get('dock/src/Native/Efl.cs')!=old['launcherInputs']['dock/src/Native/Efl.cs']
if pair_changed and not v.pairing_output:raise ValueError('Pairing source/EFL changed: rebuild and provide --pairing-output too')
pairing=v.pairing_output or ROOT/'native/pinned/pairing'
artifacts={}
for kind,directory,names in [('dock',v.dock_output,['tvlauncher-dotnet-2.0.dll','tvlauncher-dotnet-2.0.runtimeconfig.json']),('pairing',pairing,['vetro-pairing-display.dll','vetro-pairing-display.runtimeconfig.json'])]:
    for n in names:
        p=directory/n
        if not p.is_file():raise ValueError('Missing native output '+str(p))
        if n.endswith('.runtimeconfig.json'):
            r=json.loads(p.read_text())['runtimeOptions']
            if r.get('tfm')!='netcoreapp2.0' or r.get('framework',{}).get('version')!='2.0.0':raise ValueError('Native output no longer targets the tested TV runtime2.0.0')
        dest=v.output/'pinned'/kind/n;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest);artifacts[kind+'/'+n]=sha(dest)
manifest={'artifacts':artifacts,'launcherInputs':inputs,'pairingInputs':pair,'textNormalization':'utf8-lf','note':'Explicitly recorded local build. Run launcher/firmware checks and TV validation; this manifest alone is not proof of correctness.'}
(v.output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({'nativeDirectory':str(v.output),'artifacts':len(artifacts),'pairingRebuilt':bool(v.pairing_output),'testsCertified':False},indent=2))
