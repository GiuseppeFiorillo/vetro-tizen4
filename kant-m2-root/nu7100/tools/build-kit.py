"""Host-only, exact-target source-to-image build. Never opens disks or contacts a TV."""
import argparse, hashlib, json, os, shutil, subprocess, sys
from pathlib import Path
from prepare import ROOT, prepare
import importlib.util

def run(args, env):
    subprocess.run(list(map(str, args)), cwd=ROOT, env=env, check=True)

def build(a):
    if a.model != 'UE65NU7100' or a.firmware != 'T-KTM2LDEUC-1400.2':
        raise ValueError('Only UE65NU7100 / T-KTM2LDEUC-1400.2 is supported')
    out = a.output.resolve()
    out.relative_to((ROOT / 'out').resolve())
    if out.exists():
        raise ValueError('Use a new staging output directory')
    vendor = a.vendor_script.resolve()
    if vendor.is_symlink() or not vendor.is_file() or hashlib.sha256(vendor.read_bytes()).hexdigest() != '81b774498adafea47f2dba2635eff7f070730bdaa9cc167f23934fded49df0f8':
        raise ValueError('Wrong original vendor-script input')
    env = dict(os.environ, VETRO_VENDOR_SCRIPT=str(vendor), PYTHON=sys.executable, PYTHONDONTWRITEBYTECODE='1')
    out.mkdir(parents=True)
    source, payload, package = out / 'source', out / 'payload', out / 'package'
    prepare(a.vetro_archive.resolve(), source)
    spec = importlib.util.spec_from_file_location('prepare_usb_root', ROOT / 'tools/prepare-usb-root.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    module.extract(a.usb_root_archive.resolve(), out / 'usb-root-source')
    run(['node', ROOT / 'tools/build-payload.cjs', '--source', source, '--output', payload], env)
    run(['node', ROOT / 'usb/build-package.cjs', payload, package], env)
    run([sys.executable, ROOT / 'usb/build_stage.py', '--package', package, '--usb-root', out / 'usb-root-source', '--output', out / 'stage', '--model', a.model, '--firmware', a.firmware], env)
    run([sys.executable, ROOT / 'usb/verify-kit.py', '--package', package, '--stage', out / 'stage', '--payload', payload], env)
    for name in ['Write-Usb.ps1', 'maintenance.cjs']:
        shutil.copyfile(ROOT / 'usb' / name, package / name)
    shutil.copyfile(ROOT / 'usb/OPERATING-INSTRUCTIONS.txt', package / 'OPERATING-INSTRUCTIONS.txt')
    # The generated image keeps the exact historical FAT payload bytes. Current
    # instructions are separate, clearly identified, and not an on-TV code change.
    (package / 'IMAGES.json').write_text(json.dumps({name: {'bytes': (package/name).stat().st_size, 'sha256': hashlib.sha256((package/name).read_bytes()).hexdigest()} for name in ['INSTALL.img', 'RECOVERY.img']}, indent=2) + '\n')
    provenance = {'model': a.model, 'firmware': a.firmware, 'build': 'T-KTM2LDEUC-REL-202606052034', 'vendorInputSha256': hashlib.sha256(vendor.read_bytes()).hexdigest(), 'sourceLock': json.loads((ROOT/'sources.lock.json').read_text()), 'payload': json.loads(Path(str(payload)+'.provenance.json').read_text()), 'newHardwareTestPerformed': False, 'tvContacted': False, 'usbDeviceWritten': False}
    (out / 'build-provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    print(json.dumps({'package': str(package), 'target': a.model, 'firmware': a.firmware, 'matchesTestedImages': True, 'tvChanged': False}, indent=2))

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--model', required=True, choices=['UE65NU7100'])
    p.add_argument('--firmware', required=True, choices=['T-KTM2LDEUC-1400.2'])
    p.add_argument('--vendor-script', type=Path, required=True)
    p.add_argument('--vetro-archive', type=Path, required=True)
    p.add_argument('--usb-root-archive', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    build(p.parse_args())
