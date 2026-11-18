"""Deterministic payload archive, regular files only."""
import gzip,tarfile,sys
from pathlib import Path
tree,output=map(Path,sys.argv[1:])
with output.open('wb') as raw,gzip.GzipFile(fileobj=raw,filename='',mtime=0) as gz,tarfile.open(fileobj=gz,mode='w',format=tarfile.USTAR_FORMAT) as tar:
    for p in sorted(tree.rglob('*')):
        assert not p.is_symlink()
        info=tarfile.TarInfo('./'+p.relative_to(tree).as_posix());info.mtime=0;info.uid=info.gid=0;info.uname=info.gname='root'
        if p.is_dir():info.type=tarfile.DIRTYPE;info.mode=0o755;tar.addfile(info)
        else:
            info.size=p.stat().st_size;info.mode=0o644
            with p.open('rb') as f:tar.addfile(info,f)
