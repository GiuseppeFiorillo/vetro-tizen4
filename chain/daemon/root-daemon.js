'use strict';
// Root-side daemon for the Kant-M2 USB chain.
//
// It runs as uid 0 (started by the chain or by a root shell), waits for the
// Vetro web service to publish /opt/usr/home/owner/share/vetro-root-request.json,
// connects to 127.0.0.1 on the advertised port and speaks the same
// SAMSUNG-TV-ROOT/1 protocol as SamsungTvRootAgent.dll:
//
//   server greeting:  "SAMSUNG-TV-ROOT/1\t<nonce hex>\n"
//   frames:           "payload\tauthenticator\n"
//                     authenticator = hex(HMAC-SHA256(secret, nonce || 0x00 || payload))
//   agent AUTH:       "AUTH\tpid\tuid\teuid\tgid\tegid\tcap_eff\t<smack b64>"
//   server EXEC:      "EXEC\tseq\ttimeout_ms\t<cmd b64>"
//   agent RESULT:     "RESULT\tseq\texitcode\ttimedout\t<stdout b64>\t<stderr b64>"
//
// Node 4.4.3 compatible: no async/await, no let/const, no Buffer.from-only
// helpers. The daemon does not trust the request file for identity: the Vetro
// server checks the claimed pid against /proc before accepting AUTH.
//
// Smack: on this TV the root shell label is "_" while the Vetro service carries
// a per-package label. The daemon re-creates the two RAM-only loopback rules
// needed for the callback and runs every EXEC under the label used by sdbd.
// Both are volatile and must be re-done at each boot by the boot hook.
//
// Tizen 4 start-path detail: systemd starts the boot unit with the label
// "System::Privileged", but the Vetro service verifies AUTH pids by reading
// /proc/<pid>/status and cannot do that for a "System::Privileged" process.
// The USB chain shell runs with the floor label "_", which the service can
// read. The daemon therefore relabels itself to "_" before connecting, so
// the boot hook and the supervisor produce the same working agent.

var fs = require('fs');
var net = require('net');
var crypto = require('crypto');
var childProcess = require('child_process');

var SHARE = process.env.VETRO_ROOT_SHARE || '/opt/usr/home/owner/share';
var REQUEST_FILES = process.env.VETRO_ROOT_REQUEST
    ? [process.env.VETRO_ROOT_REQUEST]
    : [SHARE + '/vetro-root-request.json', '/tmp/vetro-root-request.json'];
var LOCK_FILE = process.env.VETRO_ROOT_LOCK || '/tmp/vetro-root-daemon.lock';
var PID_FILE = process.env.VETRO_ROOT_PID || '/tmp/vetro-root-daemon.pid';
var LOG_FILE = process.env.VETRO_ROOT_LOG || '/tmp/vetro-root-daemon.log';
var POLL_MS = 2000;
var GREETING_TIMEOUT_MS = 8000;
var MAX_FRAME_BYTES = 8 * 1024 * 1024;
var MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
var LOG_LIMIT = 512 * 1024;

// On this TV the root shell runs with the Smack floor label "_". The installed
// Vetro service runs with a per-package label, and Smack denies both the TCP
// callback and the package manager when a process keeps the wrong label. The
// daemon therefore (a) adds the two loopback rules for its own label and the
// server's label at connect time, and (b) runs each command under the label
// sdbd uses for package operations. Both changes are RAM-only; the daemon
// re-creates the rules after every boot. On a host without Smack or without
// /usr/bin/base64 the wrapper is skipped and commands run unchanged.
var SMACK_LABEL_FILE = process.env.VETRO_SMACK_LABEL_FILE || '/proc/self/attr/current';
var SMACK_LOAD_FILE = process.env.VETRO_SMACK_LOAD_FILE || '/sys/fs/smackfs/load2';
var COMMAND_LABEL = process.env.VETRO_ROOT_SMACK_LABEL || 'System::Privileged';
var LABEL_RE = /^[A-Za-z0-9_:.\/-]{1,128}$/;
var BASE64_BIN = process.env.VETRO_BASE64_BIN || '/usr/bin/base64';
var SHELL_BIN = process.env.VETRO_SHELL_BIN || '/bin/sh';
var smackRules = Object.create(null);
var smackEnabled = false;

var link = null;          // { socket, key, buffer, secret, nonce, phase, timer }
var connecting = false;

function log(message) {
    var line = new Date().toISOString() + ' ' + message + '\n';
    try {
        var st = fs.statSync(LOG_FILE);
        if (st.size > LOG_LIMIT) fs.writeFileSync(LOG_FILE, '');
    } catch (e) { }
    try { fs.appendFileSync(LOG_FILE, line); } catch (e) { }
}

// Node 4.4 has a Buffer.from inherited from TypedArray that rejects strings.
function fromString(value, encoding) {
    if (typeof Buffer.from === 'function') {
        try {
            var probe = Buffer.from('a');
            if (probe && probe.length === 1 && probe.toString() === 'a') return Buffer.from(value, encoding);
        } catch (e) { }
    }
    return new Buffer(value, encoding);
}

function toBase64(value) {
    if (value === null || value === undefined) return '';
    if (Buffer.isBuffer(value)) return value.toString('base64');
    return fromString(String(value), 'utf8').toString('base64');
}

function isAlive(pid) {
    try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// Tizen 4: adopt the USB-chain shell's floor label so the Vetro service can
// read /proc/<pid>/status during AUTH. No-op when Smack is absent or the label
// already matches; RAM-only and re-applied on every start.
function adoptFloorLabel() {
    var want = process.env.VETRO_ROOT_DAEMON_LABEL || '_';
    if (!LABEL_RE.test(want)) return;
    var current = '';
    try { current = fs.readFileSync(SMACK_LABEL_FILE, 'utf8').trim(); } catch (e) { return; }
    if (!current || current === want) return;
    try {
        fs.writeFileSync(SMACK_LABEL_FILE, want + '\n');
        log('smack self-label: ' + current + ' -> ' + want);
    } catch (e) {
        log('smack self-label failed: ' + (e.message || e));
    }
}

function acquireLock() {
    // Create the lock exclusively: writeFileSync would overwrite a live lock
    // and let a second daemon run alongside the first.
    for (var attempt = 0; attempt < 2; attempt++) {
        try {
            var fd = fs.openSync(LOCK_FILE, 'wx', 384);
            try { fs.writeSync(fd, String(process.pid)); } finally { fs.closeSync(fd); }
            return true;
        } catch (e) {
            if (e.code !== 'EEXIST') { log('lock error: ' + (e.message || e)); return true; }
        }
        var old = 0;
        try { old = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'), 10); } catch (e) { }
        if (old && old !== process.pid && isAlive(old)) return false;
        // Stale lock (dead owner or unreadable): remove it and retry once.
        // If another daemon wins the race, its fresh lock is detected above.
        try { fs.unlinkSync(LOCK_FILE); } catch (e) { }
    }
    return false;
}

function releaseLock() {
    try {
        var old = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'), 10);
        if (old === process.pid) fs.unlinkSync(LOCK_FILE);
    } catch (e) { }
    try {
        var pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
        if (pid === process.pid) fs.unlinkSync(PID_FILE);
    } catch (e) { }
}

function identity() {
    var status = '';
    try { status = fs.readFileSync('/proc/self/status', 'utf8'); } catch (e) { }
    var cap = /^CapEff:\s*([0-9a-fA-F]+)/m.exec(status);
    var smack = '';
    try { smack = fs.readFileSync('/proc/self/attr/current', 'utf8').trim(); } catch (e) { }
    return {
        pid: process.pid,
        uid: typeof process.getuid === 'function' ? process.getuid() : 0,
        euid: typeof process.geteuid === 'function' ? process.geteuid() : 0,
        gid: typeof process.getgid === 'function' ? process.getgid() : 0,
        egid: typeof process.getegid === 'function' ? process.getegid() : 0,
        cap_eff: cap ? cap[1] : '0',
        smack: smack
    };
}

function shellQuote(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function readLabelFile(file) {
    try { return fs.readFileSync(file, 'utf8').trim(); } catch (e) { return ''; }
}

function readSmackLabel(pid) {
    if (!pid) return '';
    return readLabelFile('/proc/' + String(pid) + '/attr/current');
}

// Smack is only usable when /proc exposes a security label and the TV has the
// base64/sh shell pair used to run a command under a different label. Hosts
// without it (for example macOS during the local tests) keep the plain path.
function detectSmack() {
    if (!readLabelFile(SMACK_LABEL_FILE)) return false;
    try { fs.accessSync(BASE64_BIN, fs.X_OK); } catch (e) { return false; }
    try { fs.accessSync(SHELL_BIN, fs.X_OK); } catch (e) { return false; }
    return true;
}

function addSmackRule(rule) {
    if (smackRules[rule]) return;
    smackRules[rule] = true;
    // smackfs is a pseudo-filesystem without seek support: fs.writeFileSync
    // issues a positioned write and fails with ESPIPE. A plain write(2), which
    // Node uses when position is null, is what the shell redirection does.
    var fd = null;
    try {
        fd = fs.openSync(SMACK_LOAD_FILE, 'w');
        var data = fromString(rule + '\n', 'utf8');
        fs.writeSync(fd, data, 0, data.length, null);
        log('smack rule added: ' + rule);
    } catch (e) {
        log('smack rule failed: ' + rule + ' (' + (e.message || e) + ')');
    } finally {
        if (fd !== null) { try { fs.closeSync(fd); } catch (e) { } }
    }
}

// The request file carries the Vetro server pid. Reading its label has to
// happen before the TCP connect, because Smack denies the connect itself when
// the two labels have no rule.
function ensureSmackRules(pid) {
    if (!smackEnabled) return;
    var own = readLabelFile(SMACK_LABEL_FILE);
    var server = readSmackLabel(pid);
    if (!own || !server) return;
    if (!LABEL_RE.test(own) || !LABEL_RE.test(server) || own === server) return;
    addSmackRule(own + ' ' + server + ' rw');
    addSmackRule(server + ' ' + own + ' rw');
}

// Run the command inside a shell whose security label is the one sdbd uses.
// The command travels base64-encoded so its quoting cannot escape the wrapper.
// If the label write is rejected the command still runs under the old label.
function wrapCommand(command) {
    if (!smackEnabled || !LABEL_RE.test(COMMAND_LABEL)) return command;
    return 'printf %s ' + shellQuote(COMMAND_LABEL) + ' > ' + shellQuote(SMACK_LABEL_FILE) +
        ' 2>/dev/null; ' +
        "(printf %s " + shellQuote(toBase64(command)) + ' | ' + shellQuote(BASE64_BIN) +
        ' -d | ' + shellQuote(SHELL_BIN) + ')';
}

function hmac(secret, nonce, payload) {
    return crypto.createHmac('sha256', secret).update(nonce).update('\x00').update(payload, 'utf8').digest('hex');
}

function constantTimeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    var difference = 0;
    for (var i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return difference === 0;
}

function send(payload) {
    if (!link || !link.socket || link.socket.destroyed) return false;
    var mac = hmac(link.secret, link.nonce, payload);
    try {
        link.socket.write(payload + '\t' + mac + '\n');
        return true;
    } catch (e) {
        log('write error: ' + (e.message || e));
        return false;
    }
}

function resetLink(reason) {
    var old = link;
    link = null;
    if (old && old.timer) { try { clearTimeout(old.timer); } catch (e) { } }
    if (old && old.socket) { try { old.socket.destroy(); } catch (e) { } }
    if (reason) log(reason);
}

function readRequest() {
    var best = null;
    for (var i = 0; i < REQUEST_FILES.length; i++) {
        var file = REQUEST_FILES[i], text, parsed, mtime = 0;
        try {
            text = fs.readFileSync(file, 'utf8');
            parsed = JSON.parse(text);
            if (!parsed || parsed.version !== 1) continue;
            if (typeof parsed.port !== 'number' || !isFinite(parsed.port) ||
                Math.floor(parsed.port) !== parsed.port || parsed.port < 1 || parsed.port > 65535) continue;
            if (typeof parsed.secret !== 'string' || parsed.secret.length < 32) continue;
            var pid = (typeof parsed.pid === 'number' && isFinite(parsed.pid) &&
                Math.floor(parsed.pid) === parsed.pid && parsed.pid > 0) ? parsed.pid : null;
            try { mtime = fs.statSync(file).mtime.getTime(); } catch (e) { mtime = 0; }
            if (!best || mtime > best.mtime) {
                best = { file: file, port: parsed.port, secret: fromString(parsed.secret, 'base64'),
                    pid: pid, mtime: mtime };
            }
        } catch (e) { }
    }
    return best;
}

function requestKey(req) {
    return req.file + '|' + req.port + '|' + req.secret.toString('hex');
}

function handleAuth(line) {
    var match = /^SAMSUNG-TV-ROOT\/1\t([a-f0-9]{64})$/.exec(line);
    if (!match) { resetLink('bad greeting from Vetro'); return; }
    link.nonce = fromString(match[1], 'hex');
    link.phase = 'auth-sent';
    try { clearTimeout(link.timer); } catch (e) { }
    link.timer = null;
    var who = identity();
    var payload = 'AUTH\t' + who.pid + '\t' + who.uid + '\t' + who.euid + '\t' + who.gid + '\t' + who.egid +
        '\t' + who.cap_eff + '\t' + toBase64(who.smack);
    send(payload);
}

function verifiedPayload(line) {
    var separator = line.lastIndexOf('\t');
    if (separator < 0) return null;
    var payload = line.slice(0, separator);
    var observed = line.slice(separator + 1);
    if (!/^[a-f0-9]{64}$/.test(observed)) return null;
    var expected = hmac(link.secret, link.nonce, payload);
    return constantTimeEqual(observed, expected) ? payload : null;
}

function execute(seq, timeoutMs, command) {
    var started = Date.now();
    var finished = false;
    try {
        childProcess.exec(wrapCommand(command), {
            timeout: timeoutMs,
            killSignal: 'SIGKILL',
            maxBuffer: MAX_OUTPUT_BYTES,
            encoding: 'buffer',
            windowsHide: true
        }, function (error, stdout, stderr) {
            if (finished) return;
            finished = true;
            var exitCode = 0;
            var timedOut = 0;
            if (error) {
                exitCode = typeof error.code === 'number' ? error.code : 1;
                timedOut = error.killed || (Date.now() - started) >= (timeoutMs - 50) ? 1 : 0;
            }
            send('RESULT\t' + seq + '\t' + exitCode + '\t' + timedOut + '\t' + toBase64(stdout) + '\t' + toBase64(stderr));
        });
    } catch (e) {
        send('RESULT\t' + seq + '\t1\t0\t\t' + toBase64(String(e.message || e)));
    }
}

function handleFrame(payload) {
    var fields = payload.split('\t');
    if (fields[0] !== 'EXEC' || fields.length !== 4) {
        log('unknown frame: ' + String(fields[0]).slice(0, 20));
        return;
    }
    var seq = fields[1];
    var timeoutMs = Number(fields[2]);
    if (!/^[1-9][0-9]{0,15}$/.test(seq) || !isFinite(timeoutMs) ||
        Math.floor(timeoutMs) !== timeoutMs || timeoutMs < 1 || timeoutMs > 120000) {
        log('invalid EXEC frame');
        return;
    }
    var command = fromString(fields[3], 'base64').toString('utf8');
    if (!command || command.length > 65536) { log('empty or oversized command'); return; }
    execute(seq, timeoutMs, command);
}

function onData(chunk) {
    if (!link) return;
    link.buffer += chunk.toString('utf8');
    if (link.buffer.length > MAX_FRAME_BYTES) { resetLink('oversized frame'); return; }
    var index;
    while ((index = link.buffer.indexOf('\n')) !== -1) {
        var line = link.buffer.slice(0, index);
        link.buffer = link.buffer.slice(index + 1);
        if (!line) continue;
        if (link.phase === 'greeting') {
            handleAuth(line);
            continue;
        }
        var payload = verifiedPayload(line);
        if (payload === null) { resetLink('frame authentication failed'); return; }
        handleFrame(payload);
    }
}

function connect(req) {
    if (connecting || link) return;
    connecting = true;
    var key = requestKey(req);
    var socket = net.connect({ host: '127.0.0.1', port: req.port });
    var current = {
        socket: socket,
        key: key,
        buffer: '',
        secret: req.secret,
        nonce: null,
        phase: 'greeting',
        timer: null
    };
    link = current;
    log('connecting to Vetro 127.0.0.1:' + req.port + ' (' + req.file + ')');
    try { socket.setNoDelay(true); } catch (e) { }
    current.timer = setTimeout(function () {
        if (link === current && current.phase === 'greeting') resetLink('greeting timeout');
    }, GREETING_TIMEOUT_MS);
    socket.on('connect', function () {
        connecting = false;
        log('connected; waiting for greeting');
    });
    socket.on('data', function (chunk) {
        if (link !== current) return;
        try { onData(chunk); } catch (e) { resetLink('data handler error: ' + (e.message || e)); }
    });
    socket.on('error', function (e) {
        if (link === current) resetLink('socket error: ' + (e.message || e));
        else log('late socket error: ' + (e.message || e));
    });
    socket.on('close', function () {
        connecting = false;
        if (link === current) resetLink('Vetro closed the connection');
    });
}

function poll() {
    var req = readRequest();
    if (!req) {
        if (link) resetLink('request file unavailable');
        return;
    }
    ensureSmackRules(req.pid);
    if (link && link.key === requestKey(req)) return;
    if (link) resetLink('request changed');
    connect(req);
}

function shutdown(signal) {
    log('stopping (' + signal + ')');
    resetLink(null);
    releaseLock();
    process.exit(0);
}

function main() {
    adoptFloorLabel();
    var who = identity();
    var allowNonRoot = process.env.VETRO_ROOT_DAEMON_ALLOW_NONROOT === '1';
    if (who.uid !== 0 && !allowNonRoot) {
        log('refusing to run: uid=' + who.uid + ' (expected 0)');
        process.exit(1);
    }
    if (!acquireLock()) {
        log('another daemon is already running');
        process.exit(0);
    }
    smackEnabled = detectSmack();
    try { fs.writeFileSync(PID_FILE, String(process.pid), { mode: 384 }); } catch (e) { }
    log('started pid=' + who.pid + ' uid=' + who.uid + ' euid=' + who.euid + ' cap=' + who.cap_eff +
        ' smack=' + who.smack + ' commandLabel=' + (smackEnabled ? COMMAND_LABEL : 'unchanged'));
    process.on('SIGTERM', function () { shutdown('SIGTERM'); });
    process.on('SIGINT', function () { shutdown('SIGINT'); });
    process.on('exit', function () { releaseLock(); });
    process.on('uncaughtException', function (e) {
        log('uncaught: ' + (e && e.stack || e));
    });
    setInterval(poll, POLL_MS);
    poll();
}

main();
