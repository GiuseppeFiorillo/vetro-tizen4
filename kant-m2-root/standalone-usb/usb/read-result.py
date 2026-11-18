"""Read an existing RESULT.JSON or saved installer image; never open raw devices."""
import argparse, importlib.util, json, stat, struct
from pathlib import Path

def regular(p, maximum):
    s=p.lstat()
    if not stat.S_ISREG(s.st_mode) or p.is_symlink() or s.st_size>maximum:
        raise ValueError('Expected a bounded regular file, not a device or symlink')
    return p.read_bytes()

def result(p):
    return {'result':json.loads(regular(p,65536)), 'source':'existing-result-file'}

def image(p):
    data=regular(p,80*1024*1024)
    if len(data)!=80*1024*1024 or data[510:512]!=b'\x55\xaa':raise ValueError('Expected the saved 80 MiB installer image')
    entry=data[462:478];start,count=struct.unpack_from('<II',entry,8)
    if entry[4]!=12 or (start,count)!=(18432,131072):raise ValueError('Unexpected FAT partition extent')
    spec=importlib.util.spec_from_file_location('fat_reader',Path(__file__).with_name('fat-reader.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    files=module.read_fat(data[start*512:(start+count)*512])
    proof=files.get('RESULT.JSON')
    if proof is not None and len(proof)>65536:raise ValueError('Oversize result')
    return {'result':json.loads(proof) if proof else None,'bootstrapDiagnostic':data[4096:12288].rstrip(b'\0').decode('utf-8',errors='replace'),'source':'saved-image-file'}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);g=p.add_mutually_exclusive_group(required=True)
    g.add_argument('--result',type=Path);g.add_argument('--image',type=Path);a=p.parse_args()
    print(json.dumps(result(a.result) if a.result else image(a.image),indent=2))
