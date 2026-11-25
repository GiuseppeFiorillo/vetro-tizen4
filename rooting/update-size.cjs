'use strict';
// Measure the old Tizen 4 updater, not an upstream build on a different trust channel.
// A higher package revision requires reinstall; otherwise the daemon's command cap
// still applies. File contents are staged separately: this measures the apply script.
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const fixtures = path.join(__dirname, 'tests', 'fixtures', 'update-from-050-tizen4');
const LIMIT = 65536;
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

function measure(files, targetInfo) {
    const baseline = require(path.join(fixtures, 'installed.json'));
    if (sha(fs.readFileSync(path.join(fixtures, 'updater.js'))) !== baseline.updaterSha256)
        throw new Error('Frozen Tizen 4 updater fixture changed');
    const Old = require(path.join(fixtures, 'updater.js'));
    const installed = baseline.variants;
    if (!targetInfo) {
        const info = files.find(f => f.name === 'service/build-info.js');
        if (!info) throw new Error('Target build-info is required for update compatibility');
        targetInfo = Old.parseBuildInfo(info.data);
    }
    if (!targetInfo.version || !Number.isInteger(targetInfo.shell) || targetInfo.shell < 1)
        throw new Error('Invalid target package revision');
    const next = {};
    // The 0.5.0 okPath decides what such a TV takes (release.cjs also leaves payload subfolders out).
    files.filter(f => Old.okPath(f.name)).forEach(f => { next[f.name] = sha(f.data); });
    return Object.keys(installed).map(build => {
        const had = installed[build].files;
        const changed = Object.keys(next).filter(n => had[n] !== next[n]).sort();
        const existing = changed.filter(n => had[n]), added = changed.filter(n => !had[n]);
        const from = installed[build];
        const updater = new Old.Updater({ publicKey: 'x', installDir: from.installDir, workDir: from.workDir,
            buildInfo: { version: from.version, shell: from.shell }, execute: () => Promise.resolve({}), dockStopCommand: from.dockStop });
        const bytes = Buffer.byteLength(updater._applyScript(from.version, targetInfo.version, changed, existing, added, next, changed.some(n => /^native\/dock\//.test(n))));
        return { build, from: from.version, installedShell: from.shell, targetShell: targetInfo.shell,
            requiresReinstall: targetInfo.shell > from.shell, changed: changed.length,
            existing: existing.length, added: added.length, bytes, margin: LIMIT - bytes };
    });
}

function assertFits(report) {
    const tooBig = report.filter(r => !r.requiresReinstall && r.bytes > LIMIT);
    if (tooBig.length) throw new Error('An in-place update exceeds the root daemon limit: ' +
        tooBig.map(r => r.build + ' ' + r.bytes + ' bytes').join(', ') + ' (limit ' + LIMIT + ')');
    return report;
}

module.exports = { measure, assertFits, LIMIT };
