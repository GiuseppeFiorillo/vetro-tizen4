'use strict';
// Node 4 compatible. Paths come only from a private, root-owned configuration.
var fs=require('fs'),crypto=require('crypto'),cp=require('child_process');
function create(c) {
    var stopped=false, timer=null, began=Date.now();
    function digest(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
    function log(s){try{if(fs.statSync(c.log).size>131072)fs.writeFileSync(c.log,'');}catch(e){}
        try{fs.appendFileSync(c.log,new Date().toISOString()+' '+s+'\n');}catch(e){}}
    function exists(p){try{fs.lstatSync(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
    function disabled(){return exists(c.disable);}
    function validateIdentity() {
        if(!new RegExp('^BUILD_ID='+c.build+'$','m').test(fs.readFileSync(c.osRelease,'utf8')))throw Error('firmware changed');
        if(digest(c.vendor)!==c.vendorHash)throw Error('vendor backup checksum mismatch');
        var st=fs.lstatSync(c.hook),h=digest(c.hook);
        if(!st.isFile()||st.isSymbolicLink()||(h!==c.vendorHash&&h!==c.hookHash))throw Error('unrecognized startup file; refusing overwrite');
        if(c.enforceRoot && (process.getuid()!==0||st.uid!==0))throw Error('root ownership required');
    }
    function validate(){validateIdentity();Object.keys(c.hashes).forEach(function(p){if(digest(p)!==c.hashes[p])throw Error('checksum mismatch: '+p);});}
    function syncDir(p){var d=fs.openSync(p,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
    function replace(bytes) {
        var p=c.hook+'.vetro-new.'+process.pid+'.'+crypto.randomBytes(8).toString('hex'),d;
        // Exclusive creation refuses stale files and symlinks.
        d=fs.openSync(p,'wx',365);
        try {
            try{var off=0;while(off<bytes.length){var n=fs.writeSync(d,bytes,off,bytes.length-off,off);if(n<=0)throw Error('short write');off+=n;}fs.fchmodSync(d,365);fs.fsyncSync(d);}finally{fs.closeSync(d);}
            if(c.chsmack)cp.execFileSync(c.chsmack,['-a','_',p],{timeout:3000});
            fs.renameSync(p,c.hook);syncDir(c.hookDir);
        } catch(e){try{fs.unlinkSync(p);}catch(ignored){}throw e;}
    }
    function restore(){validateIdentity();if(digest(c.hook)!==c.vendorHash)replace(fs.readFileSync(c.vendor));}
    function rollback(){
        // Persist the marker first so a concurrent health check cannot re-arm.
        if(!exists(c.disable)){var d=fs.openSync(c.disable,'wx',384);try{fs.writeSync(d,'disabled\n');fs.fsyncSync(d);}finally{fs.closeSync(d);}}
        syncDir(c.disableDir);restore();stopped=true;
        if(timer)clearInterval(timer);log('disabled; vendor startup restored');return 'VENDOR_HOOK_RESTORED';
    }
    function healthy(){
        if(c.enforceRoot && process.getuid()!==0)throw Error('daemon lost root');
        var s=fs.readFileSync(c.status,'utf8');
        if(c.enforceRoot && (!/^Uid:\s+0\s+0\s+0\s+0$/m.test(s)||!/^CapEff:\s+0000003fffffffff$/m.test(s)))throw Error('root identity/capabilities incorrect');
        if(c.label && fs.readFileSync(c.label,'utf8').trim()!=='_')throw Error('wrong SMACK label');
        if(String(process.pid)!==fs.readFileSync(c.pid,'utf8').trim()||String(process.pid)!==fs.readFileSync(c.lock,'utf8').trim())throw Error('daemon PID/lock not owned');
    }
    function arm(){
        validate();if(disabled())return false;
        if(digest(c.hook)===c.vendorHash)replace(fs.readFileSync(c.template));
        if(disabled()){restore();stopped=true;log('disable raced rearm; vendor restored');return false;}
        return true;
    }
    function check(){
        if(stopped)return false;
        if(disabled()){restore();stopped=true;if(timer)clearInterval(timer);log('disable marker found; vendor startup restored');return false;}
        if(Date.now()-began<c.healthMs)return false;
        validate();healthy();
        if(digest(c.hook)===c.vendorHash){
            if(!arm())return false;
            log('root health verified; recurring startup armed pid='+process.pid);
        }
        return true;
    }
    function start(){
        // A service restart must also go through the safe, unarmed state.
        restore();if(disabled()){log('disabled; daemon not started');return;}
        require(c.daemon);
        log('daemon started; waiting '+c.healthMs+'ms before rearm');
        timer=setInterval(function(){try{check();}catch(e){log('health/rearm failed: '+e.message);try{restore();}catch(r){log('restore failed: '+r.message);}stopped=true;clearInterval(timer);}},2000);
    }
    return {start:start,rollback:rollback,check:check,restore:restore,validate:validate,arm:arm};
}
module.exports={create:create};
