'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const target=require('../tools/target.cjs');
test('build target accepts only our exact model and firmware',()=>{
 target.target('UE65NU7100','T-KTM2LDEUC-1400.2');
 for(const [model,firmware]of [['QE49Q6FNA','T-KTM2LDEUC-1400.2'],['UE65NU7100','T-KTM2DEUC-1400.2'],['UE65NU7100','1400.2'],['UE65NU7100','T-KTM2LDEUC-1500.0']])assert.throws(()=>target.target(model,firmware),/Only UE65NU7100/);
});
test('missing or wrong owner-supplied vendor bytes are rejected',t=>{
 const previous=process.env.VETRO_VENDOR_SCRIPT,dir=fs.mkdtempSync(path.join(os.tmpdir(),'vetro-vendor-'));
 t.after(()=>{if(previous===undefined)delete process.env.VETRO_VENDOR_SCRIPT;else process.env.VETRO_VENDOR_SCRIPT=previous;fs.rmSync(dir,{recursive:true,force:true});});
 delete process.env.VETRO_VENDOR_SCRIPT;assert.throws(()=>target.vendor(),/Set VETRO_VENDOR_SCRIPT/);
 const p=path.join(dir,'wrong');fs.writeFileSync(p,Buffer.alloc(805));process.env.VETRO_VENDOR_SCRIPT=p;assert.throws(()=>target.vendor(),/checksum/);
 fs.writeFileSync(p,'wrong');assert.throws(()=>target.vendor(),/Unexpected original/);
});
test('published runtime contains neither a vendor firmware copy nor its embedded base64',()=>{
 assert.equal(fs.existsSync(path.join(__dirname,'../overlay/root/vendor-original')),false);
 assert.match(fs.readFileSync(path.join(__dirname,'../overlay/root/hook.awk'),'utf8'),/\{\{VENDOR_BASE64\}\}/);
});
