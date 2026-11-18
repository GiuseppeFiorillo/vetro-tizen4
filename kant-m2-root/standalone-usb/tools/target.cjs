'use strict';
const fs = require('fs'), crypto = require('crypto');
const profile = require('../profiles/ktm2ldeuc-1400.2.json');
const vendorHash = '81b774498adafea47f2dba2635eff7f070730bdaa9cc167f23934fded49df0f8';
function target(id, firmware) {
    if (id !== 'ktm2ldeuc-1400.2' || firmware !== 'T-KTM2LDEUC-1400.2' ||
        profile.id !== id || profile.platform !== 'T-KTM2' || profile.firmware !== firmware ||
        profile.buildId !== 'T-KTM2LDEUC-REL-202606052034')
        throw Error('No matching verified firmware/kernel profile: ktm2ldeuc-1400.2 / T-KTM2LDEUC-REL-202606052034 required');
}
function vendor() {
    target(profile.id, profile.firmware);
    const filename = process.env.VETRO_VENDOR_SCRIPT;
    if (!filename) throw Error('Set VETRO_VENDOR_SCRIPT to your own original /opt/etc/parseinfo.sh; no firmware is distributed');
    const st = fs.lstatSync(filename);
    if (!st.isFile() || st.isSymbolicLink() || st.size !== 805) throw Error('Unexpected original vendor-script input');
    const bytes = fs.readFileSync(filename);
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== vendorHash) throw Error('Wrong original vendor-script checksum');
    return bytes;
}
module.exports = { target, vendor, vendorHash };
