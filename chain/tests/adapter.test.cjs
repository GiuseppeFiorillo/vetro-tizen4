'use strict';
// Node 4.4-compatible end-to-end test for the chain adapter and a mock root
// agent. Run with .tools/node-v4.4.3-darwin-x64/bin/node.
require('../../app/service/compat.js').install();

var fs = require('fs');
var os = require('os');
var net = require('net');
var path = require('path');
var crypto = require('crypto');
var assert = require('assert');

var dir = path.join(os.tmpdir(), 'vetro-chain-adapter-' + Date.now() + '-' + Math.floor(Math.random() * 1e6));
fs.mkdirSync(dir);
process.env.VETRO_ROOT_SHARE = dir;
process.env.VETRO_ROOT_REQUEST = path.join(dir, 'vetro-root-request.json');

var platform = require('../service/platform.js');
var requestFile = process.env.VETRO_ROOT_REQUEST;

function rmTree(p) {
    if (!fs.existsSync(p)) return;
    fs.readdirSync(p).forEach(function (name) {
        var child = path.join(p, name);
        if (fs.lstatSync(child).isDirectory()) rmTree(child);
        else fs.unlinkSync(child);
    });
    fs.rmdirSync(p);
}

function waitFor(check, timeoutMs, label) {
    return new Promise(function (resolve, reject) {
        var started = Date.now();
        (function poll() {
            var value = false;
            try { value = check(); } catch (e) { value = false; }
            if (value) return resolve(value);
            if (Date.now() - started > timeoutMs) return reject(new Error('timeout: ' + (label || 'condition')));
            setTimeout(poll, 50);
        })();
    });
}

function frame(secret, nonce, payload) {
    var mac = crypto.createHmac('sha256', secret).update(nonce).update('\x00').update(payload, 'utf8').digest('hex');
    return payload + '\t' + mac + '\n';
}

function b64(text) { return new Buffer(text, 'utf8').toString('base64'); }

function MockAgent(port, secret, onResult) {
    var self = this;
    this.commands = [];
    this.socket = net.connect(port, '127.0.0.1');
    this.buffer = '';
    this.nonce = null;
    this.socket.setNoDelay(true);
    this.socket.on('data', function (chunk) {
        self.buffer += chunk.toString('utf8');
        var index;
        while ((index = self.buffer.indexOf('\n')) !== -1) {
            var line = self.buffer.slice(0, index);
            self.buffer = self.buffer.slice(index + 1);
            if (!line) continue;
            if (!self.nonce) {
                var match = /^SAMSUNG-TV-ROOT\/1\t([a-f0-9]{64})$/.exec(line);
                if (!match) throw new Error('bad greeting');
                self.nonce = new Buffer(match[1], 'hex');
                var auth = 'AUTH\t' + process.pid + '\t0\t0\t0\t0\t3fffffffff\t' + b64('_');
                self.socket.write(frame(secret, self.nonce, auth));
                continue;
            }
            var separator = line.lastIndexOf('\t');
            var payload = line.slice(0, separator);
            var observed = line.slice(separator + 1);
            var expected = crypto.createHmac('sha256', secret).update(self.nonce).update('\x00').update(payload, 'utf8').digest('hex');
            assert.equal(observed, expected, 'server frame HMAC');
            var fields = payload.split('\t');
            if (fields[0] === 'EXEC') {
                var command = new Buffer(fields[3], 'base64').toString('utf8');
                self.commands.push(command);
                var result = onResult(command);
                var reply = 'RESULT\t' + fields[1] + '\t' + result.code + '\t' + (result.timedOut ? 1 : 0) + '\t' + b64(result.stdout || '') + '\t' + b64(result.stderr || '');
                self.socket.write(frame(secret, self.nonce, reply));
            }
        }
    });
}

var steps = [];
function step(name, fn) { steps.push({ name: name, fn: fn }); }

step('listener publishes a private request file', function () {
    platform.start();
    return waitFor(function () { return fs.existsSync(requestFile); }, 3000, 'request file').then(function () {
        var request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
        assert.equal(request.version, 1);
        assert.ok(request.port > 0 && request.port < 65536);
        assert.ok(request.secret && request.secret.length >= 32);
        assert.equal(platform.status().mode, 'tv-integration');
        assert.equal(platform.status().agent.connected, false);
        assert.equal(platform.status().unsupported, false);
    });
});

var agent = null;
step('root agent connects and AUTH is accepted', function () {
    var request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    var secret = new Buffer(request.secret, 'base64');
    agent = new MockAgent(request.port, secret, function (command) {
        return { code: 0, stdout: 'ok:' + command, stderr: '' };
    });
    return waitFor(function () { return platform.status().agent.connected === true; }, 3000, 'agent connected').then(function () {
        var status = platform.status();
        assert.equal(status.agent.uid, 0);
        assert.equal(status.rooting.phase, 'connected');
    });
});

step('execute reaches the agent and returns the result shape', function () {
    return platform.execute('id', 5000).then(function (result) {
        assert.equal(result.exit_code, 0);
        assert.equal(result.timed_out, false);
        assert.equal(result.stdout, 'ok:id');
        assert.equal(result.stderr, '');
    });
});

step('install dispatches pkgcmd on this TV', function () {
    return platform.install('testPkg', '/tmp/test.wgt').then(function (output) {
        assert.equal(output, 'ok:/usr/bin/pkgcmd -i -t wgt -p \'/tmp/test.wgt\' --global 2>&1');
        assert.equal(agent.commands[agent.commands.length - 1], '/usr/bin/pkgcmd -i -t wgt -p \'/tmp/test.wgt\' --global 2>&1');
    });
});

step('setApplicationsEnabled uses the debloat command builder', function () {
    return platform.setApplicationsEnabled(['com.example.app'], false).then(function (result) {
        assert.equal(result.exit_code, 0);
        var last = agent.commands[agent.commands.length - 1];
        var wrapped = /^echo ([A-Za-z0-9+/=]+) \| base64 -d \| sh$/.exec(last);
        assert.ok(wrapped, 'debloat command is base64 wrapped: ' + last);
        var script = new Buffer(wrapped[1], 'base64').toString('utf8');
        assert.ok(script.indexOf("for id in 'com.example.app'; do") >= 0, 'target list: ' + script);
        assert.ok(script.indexOf('pkgcmd -D -t app -n "$id" --uid "$u"') >= 0, 'disable command: ' + script);
    });
});

step('a disconnected agent is reported and a new one reconnects', function () {
    agent.socket.destroy();
    return waitFor(function () { return platform.status().agent.connected === false; }, 3000, 'agent disconnected').then(function () {
        assert.equal(platform.status().rooting.phase, 'retrying');
        var request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
        agent = new MockAgent(request.port, new Buffer(request.secret, 'base64'), function (command) {
            return { code: 0, stdout: 'again:' + command, stderr: '' };
        });
        return waitFor(function () { return platform.status().agent.connected === true; }, 3000, 'agent reconnected');
    }).then(function () {
        return platform.execute('true', 5000);
    }).then(function (result) {
        assert.equal(result.stdout, 'again:true');
    });
});

step('stop closes the listener and removes the request file', function () {
    platform.stop();
    assert.equal(platform.status().agent.connected, false);
    assert.equal(fs.existsSync(requestFile), false);
});

(function run() {
    var index = 0;
    function next() {
        if (index >= steps.length) {
            rmTree(dir);
            console.log('PASS chain adapter on ' + process.version + ' (' + steps.length + ' steps)');
            return;
        }
        var current = steps[index++];
        Promise.resolve().then(current.fn).then(function () {
            console.log('  ok  ' + current.name);
            next();
        }).catch(function (error) {
            rmTree(dir);
            console.error('FAIL ' + current.name + ': ' + (error && error.stack || error));
            process.exit(1);
        });
    }
    next();
})();
