'use strict';

// Signs the Kant-M2 chain package with the existing Partner profile.
// Input:  chain/build.cjs file list (app sources + chain adapter + daemon)
// Output: chain/dist/vetro-chain-signed.wgt
//
// The unsigned source file is never touched (same shape as rooting/build.cjs).
// Passwords and certificate paths come from the environment so they are not
// stored in this repository:
//   AUTHOR_P12, DIST_P12, AUTHOR_PW, DIST_PW
// All four values are required; certificate locations are host-independent.

const fs = require('fs');
const path = require('path');

const signingRequire = require('module').createRequire(
    path.join(__dirname, '..', 'rooting', 'on-boot-probe', 'package.json'));

const DIST = path.join(__dirname, 'dist');
const OUT = process.env.OUT ? path.resolve(process.env.OUT) : path.join(DIST, 'vetro-chain-signed.wgt');
const AUTHOR_P12 = process.env.AUTHOR_P12 ? path.resolve(process.env.AUTHOR_P12) : null;
const DIST_P12 = process.env.DIST_P12 ? path.resolve(process.env.DIST_P12) : null;
const AUTHOR_PW = process.env.AUTHOR_PW;
const DISTRIBUTOR_PW = process.env.DIST_PW;

function loadP12(der, password, forge) {
    return forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), false, password);
}

async function main() {
    if (!AUTHOR_P12 || !DIST_P12 || !AUTHOR_PW || !DISTRIBUTOR_PW) {
        throw new Error('Set AUTHOR_P12, DIST_P12, AUTHOR_PW and DIST_PW (all four variables are required)');
    }
    for (const file of [AUTHOR_P12, DIST_P12]) {
        if (!fs.existsSync(file)) throw new Error('missing certificate: ' + file);
    }

    const forge = signingRequire('node-forge');
    const JSZip = signingRequire('jszip');
    const { Signature } = signingRequire('tizen');

    const authorDer = fs.readFileSync(AUTHOR_P12).toString('binary');
    const distributorDer = fs.readFileSync(DIST_P12).toString('binary');
    const author = loadP12(authorDer, AUTHOR_PW, forge);
    const distributor = loadP12(distributorDer, DISTRIBUTOR_PW, forge);

    const contents = require('./build.cjs').collectChainFiles();

    const authored = await new Signature('AuthorSignature', contents).sign(author);
    const signed = await new Signature('DistributorSignature', authored).sign(distributor);

    const zip = new JSZip();
    for (const file of signed) zip.file(decodeURIComponent(file.uri), file.data);
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    fs.mkdirSync(DIST, { recursive: true });
    fs.writeFileSync(OUT, buffer);

    const names = signed.map(file => decodeURIComponent(file.uri)).sort();
    for (const required of ['author-signature.xml', 'signature1.xml', 'config.xml', 'service/platform.js', 'root-daemon/root-daemon.js']) {
        if (names.indexOf(required) < 0) throw new Error('signed package is missing ' + required);
    }
    console.log('signed chain entries: ' + signed.length);
    console.log('wrote ' + OUT + ' (' + buffer.length + ' bytes)');
    return OUT;
}

module.exports = { main };
if (require.main === module) main().catch(error => {
    console.error(error && error.stack || error);
    process.exit(1);
});
