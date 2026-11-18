"""Parse the generated maintenance command; never execute it."""
import json, os, shlex, subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
command=json.loads((root/'out/maintenance-command.json').read_text())['command']
args=shlex.split(command)
if args[:2]!=['/usr/bin/node','-e'] or len(args)!=3:raise ValueError('Invalid POSIX maintenance command')
subprocess.run([os.environ['NODE4'],'-e',"new (require('vm').Script)(process.argv[1]);",args[2]],check=True)
print('PASS maintenance shell quoting and Node 4 syntax (not executed)')
