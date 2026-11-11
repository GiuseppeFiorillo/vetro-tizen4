'use strict';
// Node 4.4-compatible negative tests for the loopback server: a wrong HMAC and
// a non-root AUTH are rejected before any command can run.
require('../../app/service/compat.js').install();

var net = require('net');
var crypto = require('crypto');
var assert = require('assert');
var RootAgentServer = require('../service/root-agent-server.js').RootAgentServer;

var secret = crypto.randomBytes(32);

function frame(nonce, payload) {
    var mac = crypto.createHmac('sha256', secret).update(nonce).update('\x00').update(payload, 'utf8').digest('hex');
    return payload + '\t' + mac + '\n';
}

function b64(text) { return new Buffer(text, 'utf8').toString('base64'); }
function auth(uid) { return 'AUTH\t' + process.pid + '\t' + uid + '\t' + uid + '\t' + uid + '\t' + uid + '\t0\t' + b64('_'); }

function greeting(socket, callback) {
    var buffer = '';
    socket.once('data', function (chunk) {
        buffer += chunk.toString('utf8');
        var match = /^SAMSUNG-TV-ROOT\/1\t([a-f0-9]{64})\n/.exec(buffer);
        assert.ok(match, 'greeting');
        callback(new Buffer(match[1], 'hex'));
    });
}

function waitForClose(socket, callback) {
    var done = false;
    function finish() { if (!done) { done = true; callback(); } }
    socket.on('close', finish);
    socket.on('error', finish);
    setTimeout(finish, 2000);
}

function run() {
    var server = new RootAgentServer({ secret: secret, verifyRealRoot: false });
    server.start(function (port) {
        var bad = net.connect(port, '127.0.0.1');
        greeting(bad, function (nonce) {
            bad.write('AUTH\t' + process.pid + '\t0\t0\t0\t0\t0\t' + b64('_') + '\t' + new Array(65).join('0') + '\n');
            waitForClose(bad, function () {
                var nonRoot = net.connect(port, '127.0.0.1');
                greeting(nonRoot, function (nonce2) {
                    nonRoot.write(frame(nonce2, auth(1)));
                    waitForClose(nonRoot, function () {
                        var good = net.connect(port, '127.0.0.1');
                        greeting(good, function (nonce3) {
                            good.write(frame(nonce3, auth(0)));
                            var buffer = '';
                            good.on('data', function (chunk) {
                                buffer += chunk.toString('utf8');
                                var index;
                                while ((index = buffer.indexOf('\n')) !== -1) {
                                    var line = buffer.slice(0, index);
                                    buffer = buffer.slice(index + 1);
                                    var separator = line.lastIndexOf('\t');
                                    var payload = line.slice(0, separator);
                                    var observed = line.slice(separator + 1);
                                    var expected = crypto.createHmac('sha256', secret).update(nonce3).update('\x00').update(payload, 'utf8').digest('hex');
                                    assert.equal(observed, expected);
                                    var fields = payload.split('\t');
                                    if (fields[0] === 'EXEC') {
                                        var reply = 'RESULT\t' + fields[1] + '\t0\t0\t' + b64('ok') + '\t';
                                        good.write(frame(nonce3, reply));
                                    }
                                }
                            });
                            setTimeout(function () {
                                assert.ok(server._conn, 'valid AUTH accepted');
                                server.execute('id', 5000).then(function (result) {
                                    assert.equal(result.stdout, 'ok');
                                    server.close();
                                    assert.equal(server._conn, null, 'bad and non-root connections never became the agent');
                                    console.log('PASS auth rejection on ' + process.version);
                                }).catch(function (error) {
                                    console.error('FAIL ' + (error && error.stack || error));
                                    process.exit(1);
                                });
                            }, 200);
                        });
                    });
                });
            });
        });
    });
}

run();
