"""Create a patched staging tree from an immutable, hash-pinned source archive."""
import argparse,hashlib,json,os,subprocess,zipfile
from pathlib import Path,PurePosixPath
ROOT=Path(__file__).resolve().parents[1]
def sha(b):return hashlib.sha256(b).hexdigest()
def identity(z):
    files={PurePosixPath(*PurePosixPath(i.filename).parts[1:]).as_posix():sha(z.read(i)) for i in z.infolist() if not i.is_dir()}
    tree=sha(''.join(n+'\0'+files[n]+'\n' for n in sorted(files)).encode())
    return z.comment.decode('ascii'),tree,len(files)
def prepare(archive,output,candidate=False):
    lock=json.loads((ROOT/'sources.lock.json').read_text())['sources']['tizen4']
    actual=sha(archive.read_bytes())
    if output.exists():raise ValueError('Output must not exist; choose a new staging directory')
    output.resolve().relative_to((ROOT/'out').resolve())
    with zipfile.ZipFile(archive) as z:
        commit,tree,count=identity(z)
        if not candidate and (commit!=lock['commit'] or tree!=lock['treeSha256'] or count!=lock['fileCount']):raise ValueError('Archive commit/content differs from lock; use --candidate for review only')
        if len(commit)!=40 or any(c not in '0123456789abcdef' for c in commit):raise ValueError('Archive has no exact GitHub commit identifier')
        for info in z.infolist():
            p=PurePosixPath(info.filename)
            if p.is_absolute() or '..' in p.parts or '\\' in info.filename or (info.external_attr>>16)&0o170000==0o120000:raise ValueError('Unsafe archive member')
            rel=Path(*p.parts[1:])
            if not rel.parts:continue
            target=output/rel;target.resolve().relative_to(output.resolve())
            if info.is_dir():target.mkdir(parents=True,exist_ok=True)
            else:target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(info))
    for entry in json.loads((ROOT/'patches/series.json').read_text()):
        p=ROOT/'patches'/entry['file']
        if sha(p.read_bytes())!=entry['sha256']:raise ValueError('Patch checksum changed; update reviewed series manifest: '+entry['file'])
        # Staged archives are not Git checkouts. Do not discover the enclosing
        # contributor repository and accidentally interpret patches at its root.
        env=dict(os.environ,GIT_CEILING_DIRECTORIES=str(output.parent.resolve()))
        subprocess.run(['git','apply','--check',str(p)],cwd=output,env=env,check=True)
        subprocess.run(['git','apply',str(p)],cwd=output,env=env,check=True)
    report={'sourceCommit':commit,'archiveSha256':actual,'treeSha256':tree,'candidate':candidate,'sourcePinned':not candidate,'patchesApplied':4,'nativeBuildRequired':False}
    manifest=json.loads((ROOT/'native/manifest.json').read_text())
    mismatch=[]
    for n,h in manifest['launcherInputs'].items():
        p=output/n
        if not p.is_file() or sha(p.read_text(encoding='utf-8').encode())!=h:mismatch.append(n)
    actual_inputs={p.relative_to(output).as_posix() for p in (output/'dock/src').rglob('*.cs')}|{'dock/Launcher.csproj'}
    mismatch+=sorted(actual_inputs-set(manifest['launcherInputs']))
    report['nativeBuildRequired']=bool(mismatch);report['changedNativeInputs']=mismatch
    (output/'standalone-source.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2));return report
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--archive',type=Path,required=True);a.add_argument('--output',type=Path,required=True);a.add_argument('--candidate',action='store_true');v=a.parse_args()
    prepare(v.archive.resolve(),v.output.resolve(),v.candidate)
