#!/usr/bin/env python3
"""Offline verification of this signer's RSA/SHA512 WGT shape; no TV or private keys.

Requires lxml and cryptography. Checks references, coverage and signatures, not
Samsung trust/entitlements, revocation or acceptance by a TV's package manager.
"""
import base64
import datetime
import hashlib
import json
import pathlib
import sys
import subprocess
import urllib.parse
import zipfile
from lxml import etree
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

DS = 'http://www.w3.org/2000/09/xmldsig#'
EXC = 'http://www.w3.org/2001/10/xml-exc-c14n#'
C14N11 = 'http://www.w3.org/2006/12/xml-c14n11'
SHA512 = 'http://www.w3.org/2001/04/xmlenc#sha512'
RSA512 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha512'
NS = {'d': DS}

def canonical(element):
    return etree.tostring(element, method='c14n', exclusive=True, with_comments=False)

def verify(filename):
    with zipfile.ZipFile(filename) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or archive.testzip() is not None:
            raise ValueError('Invalid ZIP or duplicate entries')
        if any(n.startswith('/') or '..' in pathlib.PurePosixPath(n).parts for n in names):
            raise ValueError('Unsafe ZIP path')
        all_files = {n for n in names if not n.endswith('/')}
        expected = {'author-signature.xml': all_files - {'author-signature.xml', 'signature1.xml'},
                    'signature1.xml': all_files - {'signature1.xml'}}
        results = {}
        for name, coverage in expected.items():
            root = etree.fromstring(archive.read(name), etree.XMLParser(resolve_entities=False, no_network=True))
            if root.getroottree().docinfo.doctype or root.xpath('//comment()'):
                raise ValueError('DOCTYPE/comments are not supported in this signer shape')
            signed = root.find('d:SignedInfo', NS)
            if signed.find('d:CanonicalizationMethod', NS).get('Algorithm') != EXC:
                raise ValueError('Unsupported canonicalization')
            if signed.find('d:SignatureMethod', NS).get('Algorithm') != RSA512:
                raise ValueError('Unsupported signature method')
            seen = set()
            for ref in signed.findall('d:Reference', NS):
                uri = ref.get('URI', '')
                transforms = ref.findall('d:Transforms/d:Transform', NS)
                if ref.find('d:DigestMethod', NS).get('Algorithm') != SHA512:
                    raise ValueError('Unsupported digest')
                if uri.startswith('#'):
                    matches = root.xpath('//*[@Id=$identifier]', identifier=uri[1:])
                    if len(matches) != 1 or [t.get('Algorithm') for t in transforms] != [C14N11]:
                        raise ValueError('Ambiguous or unsupported object reference')
                    # This signer uses C14N 1.1 for its Object. Preserve namespace
                    # context; reject inherited xml attributes that would need
                    # subset canonicalization rather than a detached subtree.
                    if any(k.startswith('{http://www.w3.org/XML/1998/namespace}') for e in matches[0].iterancestors() for k in e.attrib):
                        raise ValueError('Unsupported inherited xml attributes')
                    data = subprocess.run(['/usr/bin/xmllint', '--nonet', '--c14n11', '-'],
                                          input=etree.tostring(matches[0], with_tail=False), capture_output=True, check=True).stdout
                else:
                    target = urllib.parse.unquote(uri)
                    if target not in coverage or target in seen or transforms:
                        raise ValueError('Unexpected file reference')
                    seen.add(target)
                    data = archive.read(target)
                digest = base64.b64decode(ref.findtext('d:DigestValue', namespaces=NS), validate=True)
                if hashlib.sha512(data).digest() != digest:
                    raise ValueError('Digest mismatch: ' + uri)
            if seen != coverage:
                raise ValueError('Incomplete signature coverage')
            cert = x509.load_der_x509_certificate(base64.b64decode(root.findtext('d:KeyInfo/d:X509Data/d:X509Certificate', namespaces=NS)))
            key = cert.public_key()
            if not isinstance(key, rsa.RSAPublicKey):
                raise ValueError('Expected RSA certificate')
            key.verify(base64.b64decode(root.findtext('d:SignatureValue', namespaces=NS)), canonical(signed), padding.PKCS1v15(), hashes.SHA512())
            now = datetime.datetime.now(datetime.timezone.utc)
            if not cert.not_valid_before_utc <= now <= cert.not_valid_after_utc:
                raise ValueError('Certificate outside validity window')
            results[name] = {'certificateSHA256': cert.fingerprint(hashes.SHA256()).hex(),
                             'filesCovered': len(seen), 'signatureValid': True}
        results['sha256'] = hashlib.sha256(pathlib.Path(filename).read_bytes()).hexdigest()
        results['trustAndTVAcceptance'] = 'not verified'
        return results

if __name__ == '__main__':
    print(json.dumps(verify(sys.argv[1]), indent=2))
