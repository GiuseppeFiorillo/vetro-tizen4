"""Extract only the immutable, separately licensed USB-root build dependency."""
import argparse, json, zipfile
from pathlib import Path, PurePosixPath
from prepare import ROOT, identity

def extract(archive, output):
    lock = json.loads((ROOT / 'sources.lock.json').read_text())['sources']['usbRoot']
    if output.exists():
        raise ValueError('Use a new USB-root staging directory')
    output.resolve().relative_to((ROOT / 'out').resolve())
    with zipfile.ZipFile(archive) as z:
        if identity(z) != (lock['commit'], lock['treeSha256'], lock['fileCount']):
            raise ValueError('USB-root archive commit/content differs from lock')
        seen = set()
        for item in z.infolist():
            p = PurePosixPath(item.filename)
            if p.is_absolute() or '..' in p.parts or '\\' in item.filename or (item.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Unsafe USB-root archive member')
            rel = Path(*p.parts[1:])
            if not rel.parts:
                continue
            if rel in seen:
                raise ValueError('Duplicate USB-root archive member')
            seen.add(rel)
            dest = output / rel
            dest.resolve().relative_to(output.resolve())
            if item.is_dir():
                dest.mkdir(parents=True, exist_ok=True)
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(z.read(item))
    return output

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--archive', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    extract(a.archive.resolve(), a.output.resolve())
