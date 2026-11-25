'use strict';
// Exercise release publishing and the actual frozen 0.5 Tizen 4 updater together.
const assert=require('assert').strict,crypto=require('crypto'),fs=require('fs'),os=require('os'),path=require('path');
const release=require('../release.cjs'),current=require('../../app/service/updater.js');
const Old=require('./fixtures/update-from-050-tizen4/updater.js');
const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),privatePem=keys.privateKey.export({type:'pkcs8',format:'pem'}),publicPem=keys.publicKey.export({type:'spki',format:'pem'});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vetro-fork-migration-'));
const keyModule=require.resolve('../../app/service/update-key.js'),infoModule=require.resolve('../../app/service/build-info.js');
require(keyModule);require(infoModule);
const savedKey=require.cache[keyModule].exports,savedInfo=require.cache[infoModule].exports,savedEnv=process.env.VETRO_UPDATE_KEY;
(async()=>{try{
 fs.writeFileSync(path.join(dir,'private.pem'),privatePem,{mode:0o600});process.env.VETRO_UPDATE_KEY=path.join(dir,'private.pem');require.cache[keyModule].exports=publicPem;
 const output=path.join(dir,'release');release.build(output);
 const index=JSON.parse(fs.readFileSync(path.join(output,'update-index.json'))),raw=fs.readFileSync(path.join(output,index.file),'utf8');
 assert.equal(index.version,'0.7.0');assert.equal(index.shell,1);
 assert.equal(current.verifyBundle(raw,publicPem).manifest.shell,1);
 let executions=0;const old=new Old.Updater({publicKey:publicPem,installDir:path.join(dir,'install'),workDir:path.join(dir,'work'),buildInfo:{version:'0.5.0',shell:1},execute(){executions++;return Promise.reject(new Error('must not execute'));}});
 assert.equal(old.check(raw).newer,true,'the actual 0.5 fork accepts the current signed 0.7 bundle');
 assert.equal(executions,0,'checking compatibility executes no TV command');
 const chain=require('../../chain/build.cjs'),collect=chain.collectChainFiles,releaseId=require.resolve('../release.cjs'),savedRelease=require.cache[releaseId];
 let oversized;
 try {
  chain.collectChainFiles=()=>collect().concat(Array.from({length:16},(_,i)=>({uri:'service/size-fixture-'+i+'.js',data:Buffer.from('/* synthetic size fixture */')})));
  delete require.cache[releaseId];oversized=require('../release.cjs');
 } finally {chain.collectChainFiles=collect;require.cache[releaseId]=savedRelease;}
 const disallowed=path.join(dir,'in-place');assert.throws(()=>oversized.build(disallowed),/in-place update.*limit/i);
 assert(!fs.existsSync(disallowed),'an oversized same-shell release writes no output');
 require.cache[infoModule].exports={...savedInfo,shell:2};
 const reinstall=path.join(dir,'reinstall');oversized.build(reinstall);
 const reinstallIndex=JSON.parse(fs.readFileSync(path.join(reinstall,'update-index.json'))),reinstallRaw=fs.readFileSync(path.join(reinstall,reinstallIndex.file),'utf8');
 assert.equal(reinstallIndex.shell,2);
 assert.throws(()=>old.check(reinstallRaw),e=>e.code==='needs-reinstall');
 await assert.rejects(old.apply(reinstallRaw),e=>e.code==='needs-reinstall');
 assert.equal(executions,0,'a genuinely higher package revision refuses before execution');
 console.log('PASS real 0.7 in-place migration; oversized publishing blocked; higher-shell reinstall refused safely by frozen 0.5 updater');
}finally{require.cache[keyModule].exports=savedKey;require.cache[infoModule].exports=savedInfo;if(savedEnv===undefined)delete process.env.VETRO_UPDATE_KEY;else process.env.VETRO_UPDATE_KEY=savedEnv;fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
