'use strict';
// Bounded, read-only evidence. No subprocess, SDB, xattr guesses or root verdict.
var fs = require('fs');
var ACTIVE = '/usr/share/dotnet.tizen/netcoreapp';
function readable(files, name) {
    try { files.accessSync(name, 4 /* R_OK, including Node 4 */); return true; }
    catch (_) { return false; }
}
function elf(files, name) {
    var fd, buffer = Buffer.alloc(64), result = {readable: false, format: null, bits: null, machine: null};
    try {
        fd = files.openSync(name, 'r');
        var size = files.readSync(fd, buffer, 0, buffer.length, 0);
        result.readable = true;
        if (size < 20 || buffer[0] !== 127 || buffer.toString('ascii', 1, 4) !== 'ELF' ||
            (buffer[4] !== 1 && buffer[4] !== 2) || (buffer[5] !== 1 && buffer[5] !== 2)) return result;
        result.format = 'ELF'; result.bits = buffer[4] === 1 ? 32 : 64;
        var machine = buffer[5] === 1 ? buffer.readUInt16LE(18) : buffer.readUInt16BE(18);
        result.machine = {40: 'arm', 183: 'aarch64', 62: 'x86_64', 3: 'x86'}[machine] || 'other';
        return result;
    } catch (_) { return result; }
    finally { if (fd !== undefined) { try { files.closeSync(fd); } catch (_) {} } }
}
function collect(files) {
    files = files || fs;
    var version = null;
    try {
        var resolved = files.realpathSync(ACTIVE);
        var match = /\/(\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?)$/.exec(resolved);
        if (match && match[1].length <= 64) version = match[1];
    } catch (_) {}
    return {source: 'unprivileged-file-reads',
        dotnet: elf(files, '/usr/bin/dotnet'),
        activeCLR: {versionHint: version, coreclrReadable: readable(files, ACTIVE + '/libcoreclr.so'),
            corelibReadable: readable(files, ACTIVE + '/System.Private.CoreLib.dll')},
        rootRoute: {evaluated: false, fileCapabilities: 'unknown', smackPolicy: 'unknown'},
        note: 'File evidence does not prove runtime execution or privileged access'};
}
module.exports = {collect: collect};
