'use strict';
// TV-specific package state commands and owner identity resolution.
var SMART_HUB_DEPENDENCY = 'com.samsung.tv.coba.adagent';

// The agent executes commands via `/bin/sh -c "<command>"` with the whole
// command inside DOUBLE quotes: any $ in the command is expanded by that
// outer shell before the script runs (that mangled $1 inside an awk
// program). Wrapping the script as base64 and piping through base64 -d | sh
// removes every quoting hazard — the same shape the /exec probes already
// validated on this TV. Inside the base64 there is no escaping left to
// fight: the uid is taken with cut, never awk.
function b64Wrap(script) {
    return 'echo ' + Buffer.from(script, 'utf8').toString('base64') + ' | base64 -d | sh';
}

// Disable the given app_ids. The real owner UID is resolved on the TV at
// runtime from the ownership of the real owner home, avoiding passwd aliases.
// Native activation is not verified on the Q80A firmware. The application
// currently gates state changes until a reversible round trip is established.
function ownerUidScript(appIds, pkgFlag) {
    var ids = appIds.map(function (i) { return shellQuote(i); }).join(' ');
    return [
        '#!/bin/sh',
        'set -e',
        'u=$(stat -c %u /opt/usr/home/owner)',
        'case "$u" in ""|*[!0-9]*) echo VETRO-UID-NOT-RESOLVED; exit 1;; esac',
        '[ "$u" -gt 0 ] 2>/dev/null || { echo VETRO-UID-INVALID; exit 1; }',
        'for id in ' + ids + '; do',
        'pkgcmd ' + pkgFlag + ' -t app -n "$id" --uid "$u"',
        'done'
    ].join('\n');
}

function disableCommand(appIds) {
    if (appIds.some(function (id) { return id === SMART_HUB_DEPENDENCY || id.indexOf(SMART_HUB_DEPENDENCY + '.') === 0; })) {
        throw new Error('Cannot disable Smart Hub dependency: ' + SMART_HUB_DEPENDENCY);
    }
    return b64Wrap(ownerUidScript(appIds, '-D'));
}

function enableCommand(appIds) {
    return b64Wrap(ownerUidScript(appIds, '-A'));
}

function shellQuote(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

module.exports = {disableCommand: disableCommand, enableCommand: enableCommand};
