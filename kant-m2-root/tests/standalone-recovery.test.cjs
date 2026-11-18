'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const recovery = require('../standalone/usb-recovery.js');

function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vetro-recovery-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}
function mount(point, device = '/dev/sda1', type = 'vfat') {
    const encoded = point.replace(/\\/g, '\\134').replace(/ /g, '\\040');
    return '40 20 8:1 / ' + encoded + ' rw,nosuid,nodev - ' + type + ' ' + device + ' rw\n';
}

test('mount discovery decodes kernel escapes and retains supported block filesystems', () => {
    const types = ['vfat', 'msdos', 'fat', 'exfat', 'ntfs', 'fuseblk', 'fuse.ntfs-3g'];
    for (const type of types) {
        const parsed = recovery.mounts(mount('/media/USB stick', '/dev/sdb2', type));
        assert.deepEqual(parsed, [{ device: '/dev/sdb2', mountPoint: '/media/USB stick', fileSystem: type }]);
    }
});
test('malformed, network, loop, relative and unsupported mounts are ignored', () => {
    for (const line of ['', 'malformed', mount('/media/x', '/dev/loop0'), mount('/media/x', '//server/share'),
        mount('/media/x', '/dev/sda1', 'ext4'), mount('relative'), mount('/media/x', '/dev/mmcblk0p1')])
        assert.deepEqual(recovery.mounts(line), []);
});
test('only the bounded exact recovery header is accepted', t => {
    const dir = fixture(t), marker = path.join(dir, recovery.markerName);
    assert.equal(recovery.validMarker(marker), false);
    for (const body of ['', 'wrong', recovery.markerHeader + '\nrun-this', 'x'.repeat(128), recovery.markerHeader + ' '.repeat(128)]) {
        fs.writeFileSync(marker, body);
        assert.equal(recovery.validMarker(marker), false);
    }
    fs.writeFileSync(marker, recovery.markerHeader + '\n');
    assert.equal(recovery.validMarker(marker), true);
});
test('directories and symbolic-link markers are refused', t => {
    const dir = fixture(t), marker = path.join(dir, recovery.markerName), target = path.join(dir, 'target');
    fs.mkdirSync(marker);
    assert.equal(recovery.validMarker(marker), false);
    fs.rmdirSync(marker);
    fs.writeFileSync(target, recovery.markerHeader);
    fs.symlinkSync(target, marker);
    assert.equal(recovery.validMarker(marker), false);
});
test('a marker outside eligible mounted storage is not a recovery request', t => {
    const dir = fixture(t), info = path.join(dir, 'mountinfo');
    fs.writeFileSync(path.join(dir, recovery.markerName), recovery.markerHeader);
    fs.writeFileSync(info, mount(dir, '/dev/loop0'));
    assert.equal(recovery.find({ mountInfo: info }), null);
});
test('find returns the eligible mount and never executes other USB content', t => {
    const dir = fixture(t), info = path.join(dir, 'mountinfo'), sideEffect = path.join(dir, 'executed');
    fs.writeFileSync(path.join(dir, recovery.markerName), recovery.markerHeader);
    fs.writeFileSync(path.join(dir, 'install.sh'), '#!/bin/sh\ntouch ' + sideEffect + '\n', { mode: 0o755 });
    fs.writeFileSync(info, mount(dir));
    assert.deepEqual(recovery.find({ mountInfo: info }), { device: '/dev/sda1', mountPoint: dir, fileSystem: 'vfat' });
    assert.equal(fs.existsSync(sideEffect), false);
});
test('unreadable mount metadata or removed storage gives no recovery request', t => {
    const dir = fixture(t), info = path.join(dir, 'mountinfo');
    assert.equal(recovery.find({ mountInfo: info }), null);
    fs.writeFileSync(info, mount(path.join(dir, 'removed')));
    assert.equal(recovery.find({ mountInfo: info }), null);
});
test('an invalid first marker does not hide a valid second mounted marker', t => {
    const dir = fixture(t), info = path.join(dir, 'mountinfo');
    const first = path.join(dir, 'first'), second = path.join(dir, 'second');
    fs.mkdirSync(first); fs.mkdirSync(second);
    fs.writeFileSync(path.join(first, recovery.markerName), 'wrong');
    fs.writeFileSync(path.join(second, recovery.markerName), recovery.markerHeader);
    fs.writeFileSync(info, mount(first) + mount(second, '/dev/sdb1'));
    assert.equal(recovery.find({ mountInfo: info }).mountPoint, second);
});
