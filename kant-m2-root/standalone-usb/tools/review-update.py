"""Stage a review candidate and report conflicts; never edits the lock or TV."""
import argparse,json,subprocess
from pathlib import Path
from prepare import ROOT,prepare
p=argparse.ArgumentParser();p.add_argument('--archive',type=Path,required=True);p.add_argument('--label',required=True);p.add_argument('--native',type=Path);a=p.parse_args()
if not a.label or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-' for c in a.label):raise ValueError('Use a simple review label')
dest=ROOT/'out'/('review-'+a.label)
if dest.exists():raise ValueError('Review output exists; choose a new label')
dest.mkdir(parents=True);report={'reviewOnly':True,'lockChanged':False,'tvChanged':False,'stage':'source'}
try:
    report['source']=prepare(a.archive.resolve(),dest/'source',True);report['stage']='payload'
    args=['node',str(ROOT/'tools/build-payload.cjs'),'--source',str(dest/'source'),'--output',str(dest/'payload')]
    if a.native:args+=['--native',str(a.native.resolve())]
    r=subprocess.run(args,text=True,capture_output=True);report['payloadBuilt']=r.returncode==0;report['buildOutput']=r.stdout;report['buildError']=r.stderr
    if r.returncode:raise RuntimeError('Candidate build refused; review buildError')
    report['stage']='ready-for-offline-review';report['hardwareCompatibilityCertified']=False
except Exception as e:report['error']=str(e)
(dest/'review.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if 'error' in report:raise SystemExit(1)
