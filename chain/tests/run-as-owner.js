'use strict';
// Runs one command as the TV owner account. Used only for the package manager,
// which resolves packages against the caller's user database: as uid 0 the
// client looks under /root/apps_rw and reports "package not found" for apps
// that belong to the owner.
//
//   RUN_CMD='["/usr/bin/pkgcmd","-C","-n","vetrotvapp"]' \
//   RUN_UID=5001 RUN_GID=1051 node -e 'require("/tmp/vetro-chain/run-as-owner.js")'
var cp = require('child_process');
var cmd;
try { cmd = JSON.parse(process.env.RUN_CMD); } catch (e) {
    console.error('RUN_CMD must be a JSON array');
    process.exit(2);
}
if (!Array.isArray(cmd) || !cmd.length) {
    console.error('RUN_CMD must be a non-empty JSON array');
    process.exit(2);
}
var uid = Number(process.env.RUN_UID || 5001);
var gid = Number(process.env.RUN_GID || 1051);
var env = {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    HOME: '/opt/usr/home/owner',
    USER: 'owner',
    LOGNAME: 'owner',
    LANG: process.env.LANG || 'C',
    TZ: process.env.TZ || 'UTC'
};
cp.execFile(cmd[0], cmd.slice(1), {
    uid: uid,
    gid: gid,
    env: env,
    timeout: 120000,
    maxBuffer: 4 * 1024 * 1024,
    encoding: 'utf8'
}, function (error, stdout, stderr) {
    var code = 0;
    if (error) code = typeof error.code === 'number' ? error.code : 1;
    console.log('EXIT=' + code);
    if (stdout) console.log('STDOUT=' + stdout);
    if (stderr) console.log('STDERR=' + stderr);
});
