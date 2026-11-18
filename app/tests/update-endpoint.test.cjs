'use strict';
// The fork must trust its own release channel, never upstream or an environment override.
const assert = require('assert').strict;
const crypto = require('crypto');
const EventEmitter = require('events');
const loadService = require('./service-harness.cjs');
const root = require('path').resolve(__dirname, '..');
const oldSource = process.env.VETRO_UPDATE_SOURCE;
process.env.VETRO_UPDATE_SOURCE = 'https://raw.githubusercontent.com/andrearicci93/vetro/updates/';
const service = loadService(root);
if (oldSource === undefined) delete process.env.VETRO_UPDATE_SOURCE; else process.env.VETRO_UPDATE_SOURCE = oldSource;
let executions = 0;
service.context.platform = {start() {}, status: () => ({agent: {connected: false}}), execute() { executions++; return Promise.reject(new Error('offline')); }};
function call(method, url, body, instance = service) {
  return new Promise(resolve => {
    const req = new EventEmitter(); req.method = method; req.url = url; req.headers = {};
    let status; const res = {setHeader() {}, writeHead: n => {status = n;}, end: text => resolve({status, body: JSON.parse(text)})};
    instance.router(req, res);
    if (method === 'POST') { req.emit('data', Buffer.from(body || '')); req.emit('end'); }
  });
}
(async () => {
  const s = await call('GET', '/update');
  assert.equal(s.status, 200); assert.equal(s.body.configured, true); assert.equal(s.body.shell, 1);
  assert.equal(s.body.source, 'https://raw.githubusercontent.com/GiuseppeFiorillo/vetro-tizen4/updates/');
  const forkKey = require('../service/update-key.js');
  assert.match(forkKey, /BEGIN PUBLIC KEY/);
  const keys = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
  const publicPem = keys.publicKey.export({type: 'spki', format: 'pem'});
  assert.notEqual(forkKey, publicPem);
  const data = Buffer.from('signed fixture');
  const manifest = JSON.stringify({format: 'vetro-update', v: 1, version: '0.5.1', shell: 1, files: {'service/test.js': {sha256: crypto.createHash('sha256').update(data).digest('hex'), size: data.length}}});
  const raw = JSON.stringify({format: 'vetro-update', v: 1, manifest, signature: crypto.sign('RSA-SHA256', Buffer.from(manifest), keys.privateKey).toString('base64'), files: {'service/test.js': data.toString('base64')}});
  for (const url of ['/update/check', '/update/apply']) {
    const refused = await call('POST', url, raw);
    assert.equal(refused.status, 400); assert.equal(refused.body.code, 'bad-signature');
  }
  assert.equal(executions, 0, 'foreign-signed updates never execute a TV command');
  // With the matching trusted key, the real API verifies the same signed bundle.
  const own = loadService(root, {dependencies: {'./update-key.js': publicPem}});
  const accepted = await call('POST', '/update/check', raw, own);
  assert.equal(accepted.status, 200); assert.equal(accepted.body.ok, true); assert.equal(accepted.body.to, '0.5.1');
  assert.equal((await call('POST', '/update/rollback')).status, 409);
  console.log('PASS fork updates: own feed, foreign signatures refused, trusted signatures accepted, rollback retained');
})().catch(e => { console.error(e); process.exitCode = 1; });
