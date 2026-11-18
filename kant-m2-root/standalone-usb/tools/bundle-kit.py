"""Deterministic local release bundle including corresponding source and licenses."""
import argparse, hashlib, json, zipfile
from pathlib import Path
from prepare import identity
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--build',type=Path,required=True);p.add_argument('--vetro-archive',type=Path,required=True);p.add_argument('--usb-root-archive',type=Path,required=True);p.add_argument('--output',type=Path);a=p.parse_args()
build=a.build.resolve();build.relative_to((ROOT/'out').resolve())
verification=json.loads((build/'package/BUILD-VERIFICATION.json').read_text())
if verification.get('exactTestedImages') is not True: raise ValueError('Verify images first')
lock=json.loads((ROOT/'sources.lock.json').read_text())['sources']
for archive,name in [(a.vetro_archive,'tizen4'),(a.usb_root_archive,'usbRoot')]:
    with zipfile.ZipFile(archive) as z:
        pin=lock[name]
        if identity(z)!=(pin['commit'],pin['treeSha256'],pin['fileCount']):raise ValueError('Wrong corresponding source archive')
reference=json.loads((ROOT/'usb/reference-build.json').read_text())
for name,digest in reference['files'].items():
    if hashlib.sha256((build/'package'/name).read_bytes()).hexdigest()!=digest:raise ValueError('Changed verified package file: '+name)
items={}
for path in (build/'package').iterdir():
    if path.is_file():items[path.name]=path.read_bytes()
excluded={'.cache','out','inputs','.venv','__pycache__','.git','bin','obj','node_modules'}
for path in ROOT.rglob('*'):
    if path.is_file() and not excluded.intersection(path.relative_to(ROOT).parts):
        if path.suffix.lower() in {'.dpapi','.key','.p12','.pfx','.pem','.wgt'}:raise ValueError('Private artifact in source')
        items['SOURCE/standalone-usb/'+path.relative_to(ROOT).as_posix()]=path.read_bytes()
items['SOURCE/dependencies/vetro-tizen4.zip']=a.vetro_archive.read_bytes()
items['SOURCE/dependencies/usb-root.zip']=a.usb_root_archive.read_bytes()
for name in ['stage.S','stage-validation.json']:items['SOURCE/generated-stage/'+name]=(build/'stage'/name).read_bytes()
items['SOURCE/build-provenance.json']=(build/'build-provenance.json').read_bytes()
items['SHA256SUMS.txt']=(''.join(hashlib.sha256(data).hexdigest()+'  '+name+'\n' for name,data in sorted(items.items()))).encode()
output=a.output.resolve() if a.output else build/'Vetro-T-KTM2-standalone-source-build.zip'
output.resolve().relative_to(build)
if output.exists():raise ValueError('Bundle already exists')
with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for name,data in sorted(items.items()):
        info=zipfile.ZipInfo('Vetro-T-KTM2-USB/'+name,date_time=(1980,1,1,0,0,0));info.create_system=3;info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,data,compresslevel=9)
print(json.dumps({'bundle':str(output),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'files':len(items)},indent=2))
