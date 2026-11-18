'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{crc32,parseUImage,verify}=require('../tools/verify-firmware.cjs');
function fixture(){const k=Buffer.alloc(0x2000),u=Buffer.alloc(64+k.length);u.writeUInt32BE(0x27051956);u.writeUInt32BE(k.length,12);u.writeUInt32BE(crc32(k),24);k.copy(u,64);u.writeUInt32BE(crc32(u.subarray(0,64)),4);return u;}
test('uImage parser verifies header and payload CRCs',()=>{const r=parseUImage(fixture());assert(r.checks.every(x=>x.pass));assert.equal(r.kernel.length,0x2000);});
test('payload changes fail CRC without being executed',()=>{const u=fixture();u[100]^=1;assert.equal(parseUImage(u).checks[1].pass,false);});
test('compressed, malformed and truncated inputs are refused',()=>{assert.throws(()=>parseUImage(Buffer.alloc(16)),/header/);const u=fixture();u[31]=1;assert.throws(()=>parseUImage(u),/uncompressed/);assert.throws(()=>parseUImage(fixture().subarray(0,70)),/Truncated/);});
test('valid CRCs alone do not approve a kernel or missing modules',()=>{const r=verify(fixture(),{});assert.equal(r.matchesReferenceInputs,false);assert(r.checks.some(c=>c.name.includes('fingerprint')&&!c.pass));assert.match(r.assessment,/not hardware validation/);});
