"""Read-only image, FAT, tar, profile and exact tested-reference verification."""
import argparse, hashlib, importlib.util, json, struct, tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('fat_reader', Path(__file__).with_name('fat-reader.py'))
fat = importlib.util.module_from_spec(spec); spec.loader.exec_module(fat)
def sha(b): return hashlib.sha256(b).hexdigest()
def verify(package, stage, payload):
    reference = json.loads((ROOT / 'usb/reference-build.json').read_text())
    for name, expected in reference['files'].items():
        if sha((package / name).read_bytes()) != expected:
            raise ValueError('Build does not reproduce the tested reference: ' + name)
    if sha((stage / 'stage.bin').read_bytes()) != reference['stageSha256']:
        raise ValueError('Kernel stage differs from tested bytes')
    image = (package / 'INSTALL.img').read_bytes()
    if len(image) != 80*1024*1024 or image[510:512] != b'\x55\xaa':
        raise ValueError('Unexpected image size or signature')
    parts = []
    for i, start, count, kind in [(0,2048,16384,7),(1,18432,131072,12)]:
        entry = image[446+16*i:462+16*i]
        if entry[4] != kind or struct.unpack_from('<II', entry, 8) != (start,count):
            raise ValueError('Wrong MBR extent')
        parts.append(image[start*512:(start+count)*512])
    if parts[0] != (stage/'p1.img').read_bytes(): raise ValueError('Trigger partition mismatch')
    files = fat.read_fat(parts[1])
    if set(files) != {'INSTALL.JS','PACKAGE.JSON','PAYLOAD.TGZ','README.TXT'}: raise ValueError('Unexpected FAT payload members')
    for name, data in files.items():
        if data != (package/name).read_bytes(): raise ValueError('FAT file mismatch: '+name)
    safe = (package/'RECOVERY.img').read_bytes()
    marker = fat.read_fat(safe)
    if len(safe) != 64*1024*1024 or marker.get('VETRO-STANDALONE-ROLLBACK') != b'VETRO-STANDALONE-RECOVERY/1\n': raise ValueError('Recovery marker mismatch')
    count = 0
    with tarfile.open(package/'PAYLOAD.TGZ') as archive:
        for entry in archive.getmembers():
            if entry.issym() or entry.islnk() or entry.name.startswith('/') or '..' in Path(entry.name).parts: raise ValueError('Unsafe tar member')
            if entry.isfile():
                count += 1
                if archive.extractfile(entry).read() != (payload/entry.name).read_bytes(): raise ValueError('Tar payload mismatch')
    if count != reference['payloadFiles']: raise ValueError('Wrong static file count')
    result = {'exactTestedImages':True,'payloadFilesVerified':count,'fatFilesVerified':len(files),'imageSha256':{n:reference['files'][n] for n in ['INSTALL.img','RECOVERY.img']},'newHardwareTestPerformed':False,'tvContacted':False,'usbDeviceWritten':False}
    (package/'BUILD-VERIFICATION.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))

if __name__ == '__main__':
    p=argparse.ArgumentParser()
    for name in ['package','stage','payload']: p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args();verify(a.package,a.stage,a.payload)
