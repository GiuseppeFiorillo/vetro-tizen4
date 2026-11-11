'use strict';
// TV platform adapter backed by the local root daemon started by the Kant-M2
// USB chain. It keeps Vetro's existing feature code unchanged: the adapter
// exposes the same start/stop/status/execute/install/setApplicationsEnabled
// surface as rooting/service/platform.js, but the transport is a loopback
// agent instead of SDB plus a .NET archive.
//
// Vetro (owner) listens on 127.0.0.1, writes a short-lived request file with
// the port and a random secret, and waits for the root daemon to connect. The
// daemon authenticates with the same SAMSUNG-TV-ROOT/1 protocol used by the
// upstream agent, so root-agent-server.js stays the only verifier.
var fs = require('fs');
var crypto = require('crypto');
var RootAgentServer = require('./root-agent-server.js').RootAgentServer;
var debloatCommands = require('./debloat-commands.js');

var SHARE = process.env.VETRO_ROOT_SHARE || '/opt/usr/home/owner/share';
var REQUEST_DEFAULT = SHARE + '/vetro-root-request.json';
var REQUEST_FALLBACK = '/tmp/vetro-root-request.json';
var requestPath = process.env.VETRO_ROOT_REQUEST || REQUEST_DEFAULT;

var state = {
    when: new Date().toISOString(),
    self: selfIdentity(),
    attempts: [],
    prepared: false,
    preparedRuntime: null,
    running: false,
    unsupported: false,
    rooting: { backend: 'kant-usb-root', phase: 'stopped', failure: null },
    sdbTunnel: { listening: false },
    agent: { connected: false }
};

var secret = crypto.randomBytes(32);
var secretB64 = secret.toString('base64');
var agentServer = null;
var agentConnected = false;

function selfIdentity() {
    var status = '';
    try { status = fs.readFileSync('/proc/self/status', 'utf8'); } catch (e) { }
    function field(n) { var m = status.match(new RegExp('^' + n + ':\\s*(.*)$', 'm')); return m ? m[1].trim() : null; }
    var smack = null;
    try { smack = fs.readFileSync('/proc/self/attr/current', 'utf8').trim(); } catch (e) { }
    return { pid: process.pid, uid: (typeof process.getuid === 'function') ? process.getuid() : null,
        cap_eff: field('CapEff'), smack: smack, node: process.version || null };
}

function rootPhase(phase) { state.rooting.phase = phase; }
function rootFailure(stage, code) { state.rooting.failure = { stage: stage, code: code }; }
function pushAttempt(entry) {
    state.attempts.push(entry);
    if (state.attempts.length > 40) state.attempts.shift();
}

function writeAtomic(file, data) {
    var tmp = file + '.tmp';
    fs.writeFileSync(tmp, data, { mode: 384 /* 0o600: only owner and root */ });
    fs.renameSync(tmp, file);
}

// A stale request from a previous boot must not survive a failed start: the
// daemon reads the file, not this process's memory.
function writeRequest(port) {
    var paths = [requestPath];
    if (!process.env.VETRO_ROOT_REQUEST && requestPath !== REQUEST_FALLBACK) paths.push(REQUEST_FALLBACK);
    var data = JSON.stringify({ version: 1, port: port, secret: secretB64, pid: process.pid, at: new Date().toISOString() }) + '\n';
    var lastError = null;
    for (var i = 0; i < paths.length; i++) {
        try {
            writeAtomic(paths[i], data);
            requestPath = paths[i];
            return paths[i];
        } catch (e) { lastError = e; }
    }
    throw lastError || new Error('root request file could not be written');
}

function removeRequest() {
    var paths = [requestPath, REQUEST_DEFAULT, REQUEST_FALLBACK];
    for (var i = 0; i < paths.length; i++) {
        try { fs.unlinkSync(paths[i]); } catch (e) { }
    }
}

function startAgent() {
    if (state.running) return;
    state.running = true;
    state.unsupported = false;
    state.prepared = false;
    state.preparedRuntime = null;
    state.self = selfIdentity();
    state.rooting = { backend: 'kant-usb-root', phase: 'preparing', failure: null };
    agentServer = new RootAgentServer({
        secret: secret,
        onConnect: function (conn) {
            if (!state.running) { try { conn._socket.destroy(); } catch (e) { } return; }
            agentConnected = true;
            state.prepared = true;
            state.preparedRuntime = process.version;
            rootPhase('connected');
            state.rooting.failure = null;
            state.agent = {
                connected: true,
                pid: conn.identity.pid,
                uid: conn.identity.uid,
                gid: conn.identity.gid,
                cap_eff: conn.identity.cap_eff,
                smack: conn.identity.smack,
                at: Date.now()
            };
            pushAttempt({ t: Date.now(), phase: 'agent-connected', output: 'uid=' + conn.identity.uid + ' cap=' + conn.identity.cap_eff });
        },
        onClose: function () {
            if (!state.running) return;
            agentConnected = false;
            state.agent = { connected: false };
            rootFailure('agent-connection', 'agent-disconnected');
            rootPhase('retrying');
        }
    });

    agentServer.start(function (port) {
        if (!state.running) return;
        state.agentPort = port;
        try {
            writeRequest(port);
        } catch (e) {
            rootFailure('request-file', 'request-write-failed');
            pushAttempt({ t: Date.now(), phase: 'listener', err: String(e.message || e) });
        }
        // The daemon polls the request file and connects on its own. This phase
        // maps to "agent has not called back yet" in Vetro's status screen.
        rootPhase('agent-callback');
        pushAttempt({ t: Date.now(), phase: 'listener', output: 'port=' + port + ' request=' + requestPath });
    });
}

function stopAgent() {
    state.running = false;
    rootPhase('stopped');
    if (agentServer) { try { agentServer.close(); } catch (e) { } agentServer = null; }
    agentConnected = false;
    state.agent = { connected: false };
    removeRequest();
}

function agentExecute(cmd, timeoutMs) {
    if (!agentServer || !agentConnected) {
        var missing = new Error('no root agent connected');
        missing.code = 'no-root-agent';
        return Promise.reject(missing);
    }
    return agentServer.execute(cmd, timeoutMs || 30000);
}

function shellQuote(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

// pkgcmd is the Tizen package manager present on this TV. vd_appinstall (the
// SDB helper used by the upstream adapter) is not installed here. The caller
// still treats the result as unverified: this only dispatches the install.
function install(packageId, wgtPath) {
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(packageId) || !/^\/[A-Za-z0-9_./-]+\.wgt$/.test(wgtPath)) {
        return Promise.reject(new Error('invalid package ID or WGT path'));
    }
    var command = '/usr/bin/pkgcmd -i -t wgt -p ' + shellQuote(wgtPath) + ' --global 2>&1';
    var dispatched = false;
    return agentExecute(command, 120000).then(function (r) {
        dispatched = true;
        if (r.exit_code || r.timed_out) {
            var failed = new Error(r.stderr || r.stdout || 'package installation failed');
            failed.submitted = true;
            failed.result = r;
            throw failed;
        }
        return r.stdout;
    }, function (error) {
        if (!dispatched) error.submitted = error.code === 'no-root-agent' ? false : null;
        throw error;
    });
}

function setApplicationsEnabled(appIds, enabled) {
    try {
        var command = enabled ? debloatCommands.enableCommand(appIds) : debloatCommands.disableCommand(appIds);
        return agentExecute(command, 60000);
    } catch (error) { return Promise.reject(error); }
}

function sdbAccess() {
    return { available: false, enabled: false, active: false, port: null };
}
function setSdbAccess() {
    var error = new Error('SDB access is not provided by the Kant-M2 root chain');
    error.submitted = false;
    return Promise.reject(error);
}

function status() {
    return Object.assign({}, state, {
        mode: 'tv-integration',
        agentLog: agentServer ? agentServer.log : [],
        requestFile: requestPath
    });
}

module.exports = {
    start: startAgent,
    stop: stopAgent,
    status: status,
    execute: agentExecute,
    install: install,
    setApplicationsEnabled: setApplicationsEnabled,
    sdbAccess: sdbAccess,
    setSdbAccess: setSdbAccess
};
