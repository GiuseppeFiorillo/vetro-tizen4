'use strict';
// ES5 fixture: run with the actual TV service runtime as well as current Node.
var assert = require('assert');
var compat = require('../../service/compat.js');
compat.install();
assert.deepEqual(Array.prototype.slice.call(Buffer.from([0, 128, 255])), [0, 128, 255]);
var original = Buffer.from([1, 2, 3]);
var copied = Buffer.from(original);
copied[0] = 9;
assert.equal(original[0], 1);
assert.deepEqual(Array.prototype.slice.call(Buffer.from(new Uint8Array([7, 8]))), [7, 8]);
assert.throws(function () { Buffer.from(10); }, TypeError);
assert.equal(Buffer.from('caffè').toString(), 'caffè');
var memory = new ArrayBuffer(4);
var view = Buffer.from(memory, 1, 2);
assert.equal(view.length, 2);
view[0] = 42;
assert.equal(new Uint8Array(memory)[1], 42);
assert.throws(function () { Buffer.from(memory, 5); }, RangeError);
// Deterministic old allocator: malloc's initial contents must never be trusted.
function DirtyBuffer(size) { var result = Buffer.alloc(size); result.fill(173); return result; }
DirtyBuffer.from = Buffer.from;
compat.install({Buffer: DirtyBuffer});
assert.deepEqual(Array.prototype.slice.call(DirtyBuffer.alloc(8)), [0,0,0,0,0,0,0,0]);
assert.equal(DirtyBuffer.alloc(3, 7).toString('hex'), '070707');
// Real non-root consumers of Buffer.from(array): MQTT encoding and WS masking.
var mqtt = require('../../service/mqtt.js');
var client = new mqtt.MqttClient({clientId: 'legacy-fixture'});
assert.equal(client._connectPacket()[0], 16);
var packets = [];
client._socket = {write: function (packet) { packets.push(packet); }};
client._connected = true;
client.publish('test/topic', 'hello');
client.subscribe('test/#');
assert.equal(packets[0][0], 48);
assert.equal(packets[1][0], 130);
var remote = require('../../service/samsung-remote.js');
assert.equal(remote.encodeFrame('hello')[0], 129);
Promise.resolve(41).finally(null).then(function (value) {
    assert.equal(value, 41);
    return Promise.reject(new Error('preserved')).finally(123).then(function () {
        throw new Error('rejection lost');
    }, function (error) { assert.equal(error.message, 'preserved'); });
}).then(function () { console.log('PASS compatibility fixture on ' + process.version); })
.catch(function (error) { console.error(error.stack); process.exitCode = 1; });
