#!/usr/bin/env python3
"""Exercise verification against an owner-prepared signed package, never a TV."""
import importlib.util
import pathlib
import tempfile
import sys
import zipfile
from lxml import etree
from cryptography.exceptions import InvalidSignature

spec = importlib.util.spec_from_file_location('verify_wgt', pathlib.Path(__file__).with_name('verify-wgt.py'))
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
source = pathlib.Path(sys.argv[1])
assert v.verify(source)['author-signature.xml']['signatureValid']
with zipfile.ZipFile(source) as z:
    files = {n: z.read(n) for n in z.namelist()}

def refuse(changed):
    with tempfile.TemporaryDirectory() as temp:
        target = pathlib.Path(temp)/'changed.wgt'
        with zipfile.ZipFile(target, 'w') as z:
            for name, data in changed.items(): z.writestr(name, data)
        try: v.verify(target)
        except (ValueError, KeyError, InvalidSignature): return
        raise AssertionError('Tampered archive accepted')

refuse(dict(files, **{'config.xml': files['config.xml'] + b' '}))
refuse(dict(files, **{'unsigned-extra.txt': b'extra'}))
missing = dict(files); del missing['config.xml']; refuse(missing)
tampered = dict(files)
r = etree.fromstring(files['author-signature.xml'])
sig = r.find('d:SignatureValue', v.NS)
sig.text = ('A' if sig.text[0] != 'A' else 'B') + sig.text[1:]
tampered['author-signature.xml'] = etree.tostring(r)
refuse(tampered)
print('PASS signed WGT plus rejection of changed payload, extra file, missing file, altered signature')
