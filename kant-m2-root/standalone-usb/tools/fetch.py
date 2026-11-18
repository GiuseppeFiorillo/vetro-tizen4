"""Explicitly fetch a pinned public archive, or a separate review candidate."""
import argparse,json,urllib.request,zipfile
from pathlib import Path
from prepare import ROOT,identity
p=argparse.ArgumentParser();p.add_argument('--source',choices=['upstream','tizen4','usbRoot'],default='tizen4');p.add_argument('--commit');p.add_argument('--candidate',action='store_true');a=p.parse_args()
lock=json.loads((ROOT/'sources.lock.json').read_text())['sources'][a.source];commit=a.commit or lock['commit']
if len(commit)!=40 or any(c not in '0123456789abcdef' for c in commit):raise ValueError('Use an exact40-character commit')
if commit!=lock['commit'] and not a.candidate:raise ValueError('A new commit requires --candidate; the lock is never changed automatically')
repository=lock['repository'].removeprefix('https://github.com/');url='https://codeload.github.com/'+repository+'/zip/'+commit
cache=ROOT/'.cache';cache.mkdir(exist_ok=True);output=cache/(a.source+'-'+commit+'.zip');temporary=output.with_suffix('.download')
if output.exists() or temporary.exists():raise ValueError('Download target already exists; inspect/reuse it instead of overwriting')
request=urllib.request.Request(url,headers={'User-Agent':'vetro-standalone-source-lock'})
with urllib.request.urlopen(request,timeout=60) as response,temporary.open('xb') as f:
    while chunk:=response.read(1024*1024):f.write(chunk)
with zipfile.ZipFile(temporary) as z:observed,tree,count=identity(z)
if observed!=commit:raise ValueError('Downloaded archive commit mismatch')
if not a.candidate and (tree!=lock['treeSha256'] or count!=lock['fileCount']):raise ValueError('Downloaded content differs from the pinned source')
temporary.rename(output)
print(json.dumps({'archive':str(output),'commit':commit,'treeSha256':tree,'candidate':a.candidate,'lockChanged':False},indent=2))
