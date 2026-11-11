'use strict';
// Diagnostic helper: try running a command as the owner with several uid/gid
// combinations and report the exact spawn result. Read-only when used with
// `id` or `pkgcmd -C/-a`.
var cp = require('child_process');
var cmd;
try { cmd = JSON.parse(process.env.RUN_CMD); } catch (e) {
    console.error('RUN_CMD must be a JSON array');
    process.exit(2);
}
var env = {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    HOME: '/opt/usr/home/owner',
    USER: 'owner',
    LOGNAME: 'owner',
    LANG: 'C'
};
var attempts = [
    { label: 'uid5001-gid100', uid: 5001, gid: 100 },
    { label: 'uid5001-gid1051', uid: 5001, gid: 1051 },
    { label: 'uid5001-only', uid: 5001 },
    { label: 'root', uid: 0, gid: 0 }
];
var index = 0;
function next() {
    if (index >= attempts.length) return;
    var a = attempts[index++];
    var options = { env: env, timeout: 15000, maxBuffer: 1024 * 1024, encoding: 'utf8' };
    if (a.uid !== undefined) options.uid = a.uid;
    if (a.gid !== undefined) options.gid = a.gid;
    var finished = false;
    function report(prefix, error, stdout, stderr) {
        if (finished) return;
        finished = true;
        console.log('[' + a.label + '] ' + prefix + ' exit=' + (error ? (typeof error.code === 'number' ? error.code : 1) : 0));
        if (error && error.message) console.log('[' + a.label + '] error=' + error.message);
        if (stdout) console.log('[' + a.label + '] stdout=' + JSON.stringify(String(stdout).slice(0, 500)));
        if (stderr) console.log('[' + a.label + '] stderr=' + JSON.stringify(String(stderr).slice(0, 500)));
        next();
    }
    try {
        cp.execFile(cmd[0], cmd.slice(1), options, function (error, stdout, stderr) {
            report('ok', error, stdout, stderr);
        });
    } catch (e) {
        report('throw', e);
    }
}
next();
