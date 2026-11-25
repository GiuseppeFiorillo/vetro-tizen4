'use strict';
// Add the tested Home-key routing integration and update all integrity links.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm');
const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const once=require('../lib/standalone.cjs').once;
function build(input,output){
 input=path.resolve(input);output=path.resolve(output);
 if(!output.startsWith(path.join(root,'out')+path.sep)||fs.existsSync(output))throw Error('Choose a new output under this repository\'s out/ directory');
 const provenance=JSON.parse(fs.readFileSync(input+'.provenance.json')),payload={};
 for(const [n,h]of Object.entries(provenance.files)){if(n.includes('..')||path.isAbsolute(n))throw Error('Unsafe provenance path');const b=fs.readFileSync(path.join(input,n));if(sha(b)!==h)throw Error('Input changed: '+n);payload[n]=b;}
 if(provenance.profile!=='ktm2ldeuc-1400.2')throw Error('Unsupported firmware profile');
 for(const n of ['home-key.js','home-key-launch.js'])payload['standalone/'+n]=fs.readFileSync(path.join(root,'overlay/runtime',n));
 payload['standalone/units/vetro-home-key.service']=fs.readFileSync(path.join(root,'overlay/runtime/vetro-home-key.service'));
 const permanent='standalone/permanent.js',pilot='standalone/pilot.js';
 payload[permanent]=Buffer.from(once(payload[permanent].toString(),'p.watch();',"cp.execFileSync('/usr/bin/systemctl',['start','--no-block','vetro-home-key.service'],{timeout:10000});p.watch();",'optional Home-key startup'));
 payload[pilot]=Buffer.from(once(payload[pilot].toString(),"  if(c.recoveryHome)try{command(['start'", "  // Restore vendor key routing synchronously before opening recovery Home.\n  try{command(['stop','vetro-home-key.service']);}catch(e){try{require('./home-key.js').restore('recovery-fallback');}catch(ignored){}}\n  if(c.recoveryHome)try{command(['restart'",'Home-key recovery order'));
 const oldPermanent=sha(payload['standalone/permanent-manifest.json']);
 for(const n of ['manifest.json','permanent-manifest.json']){
  const m=JSON.parse(payload['standalone/'+n]);
  m.files['units/vetro-home-key.service']=sha(payload['standalone/units/vetro-home-key.service']);
  if(n==='permanent-manifest.json')for(const name of ['home-key.js','home-key-launch.js','permanent.js','pilot.js'])m.files[name]=sha(payload['standalone/'+name]);
  payload['standalone/'+n]=Buffer.from(JSON.stringify(m,null,2)+'\n');
 }
 payload['root/hook.awk']=Buffer.from(once(payload['root/hook.awk'].toString(),oldPermanent,sha(payload['standalone/permanent-manifest.json']),'boot manifest link'));
 const config=JSON.parse(payload['root/config.json']);config.hookHash=sha(payload['root/hook.awk']);config.hashes[config.template]=config.hookHash;payload['root/config.json']=Buffer.from(JSON.stringify(config,null,2)+'\n');
 for(const [n,b]of Object.entries(payload)){if(n.endsWith('.js'))new vm.Script(b.toString(),{filename:n});const p=path.join(output,n);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b);}
 provenance.homeKeyOverride={version:1,sourcePayloadHash:sha(fs.readFileSync(input+'.provenance.json')),testedModel:'UE65NU7100',testedFirmware:'T-KTM2LDEUC-1400.2',defaultHistoricalBuildUnchanged:true};
 provenance.files=Object.fromEntries(Object.entries(payload).sort().map(([n,b])=>[n,sha(b)]));
 fs.writeFileSync(output+'.provenance.json',JSON.stringify(provenance,null,2)+'\n');return provenance;
}
if(require.main===module){try{const p=build(process.argv[2],process.argv[3]);console.log(JSON.stringify({files:Object.keys(p.files).length,homeKeyOverride:p.homeKeyOverride},null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={build};
