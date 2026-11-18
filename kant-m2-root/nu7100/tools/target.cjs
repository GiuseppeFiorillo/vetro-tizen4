'use strict';
const fs = require('fs'), crypto = require('crypto');
const profile = require('../profiles/ue65nu7100-1400.2.json');
const vendorHash = '81b774498adafea47f2dba2635eff7f070730bdaa9cc167f23934fded49df0f8';
function target(model, firmware) {
    if (model !== 'UE65NU7100' || firmware !== 'T-KTM2LDEUC-1400.2' ||
        profile.id !== 'ue65nu7100-1400.2' || profile.model !== model || profile.firmware !== firmware ||
        profile.buildId !== 'T-KTM2LDEUC-REL-202606052034')
        throw Error('Only UE65NU7100 / T-KTM2LDEUC-1400.2 / build T-KTM2LDEUC-REL-202606052034 is supported');
}
function vendor() {
    target(profile.model, profile.firmware);
    const filename = process.env.VETRO_VENDOR_SCRIPT;
    if (!filename) throw Error('Set VETRO_VENDOR_SCRIPT to your own original /opt/etc/parseinfo.sh; no firmware is distributed');
    const st = fs.lstatSync(filename);
    if (!st.isFile() || st.isSymbolicLink() || st.size !== 805) throw Error('Unexpected original vendor-script input');
    const bytes = fs.readFileSync(filename);
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== vendorHash) throw Error('Wrong original vendor-script checksum');
    return bytes;
}
module.exports = { target, vendor, vendorHash };
