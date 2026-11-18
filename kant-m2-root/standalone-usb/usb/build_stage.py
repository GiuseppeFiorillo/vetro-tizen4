"""Build autonomous installer entry from the tested Kant no-UEP-patch stage."""
import argparse,hashlib,json,re,struct,subprocess,sys
from pathlib import Path
from elftools.elf.elffile import ELFFile
from capstone import Cs,CS_ARCH_ARM,CS_MODE_ARM
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--package',type=Path,required=True)
parser.add_argument('--usb-root',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--profile',required=True,choices=['ktm2ldeuc-1400.2'])
parser.add_argument('--firmware',required=True,choices=['T-KTM2LDEUC-1400.2'])
args=parser.parse_args()
out=args.output.resolve();out.relative_to((ROOT/'out').resolve())
if out.exists():raise ValueError('Use a new stage output directory')
out.mkdir(parents=True)
TOOLS=args.usb_root.resolve()/'tools'
# Recheck the extracted dependency, not only the archive used by its caller.
lock=json.loads((ROOT/'sources.lock.json').read_text())['sources']['usbRoot']
files={p.relative_to(args.usb_root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in args.usb_root.rglob('*') if p.is_file()}
tree=hashlib.sha256(''.join(n+'\0'+files[n]+'\n' for n in sorted(files)).encode()).hexdigest()
if tree!=lock['treeSha256']:raise ValueError('Extracted USB-root source differs from lock')
sys.path.insert(0,str(TOOLS))
from build_kernel_stage_kant_umh import emit,SCRATCH
from build_kernel_stage_kant import asm_string
from fat32 import create

diagnostic=True # Only the logged variant passed the controlled clean-TV test.
package=args.package.resolve()
reference=json.loads((ROOT/'usb/reference-build.json').read_text())
for name in ['INSTALL.JS','PAYLOAD.TGZ','PACKAGE.JSON','README.TXT']:
    if hashlib.sha256((package/name).read_bytes()).hexdigest()!=reference['files'][name]:raise ValueError('USB package differs from tested baseline: '+name)
installer=(package/'INSTALL.JS').read_bytes();ih=hashlib.sha256(installer).hexdigest()
command="export PATH=/usr/bin:/bin:/sbin:/usr/sbin;mkdir -p /tmp/vusb;mount -t vfat -o rw,nosuid,nodev,noexec /dev/sda2 /tmp/vusb&&echo '"+ih+"  /tmp/vusb/INSTALL.JS'|sha256sum -c -&&/usr/bin/node -e \"require('/tmp/vusb/INSTALL.JS').run('/tmp/vusb')\""
if diagnostic:
    command="export PATH=/usr/bin:/bin:/sbin:/usr/sbin;(set -x;echo VETRO-USB-DIAG-1;id;ls -l /dev/sda2;"+command+";echo BOOTSTRAP_RC=$?) 2>&1|/usr/bin/dd of=/dev/sda bs=1 seek=4096 count=8192 conv=notrunc;sync"
src=emit('127.0.0.1',4444,patch=False,boot=True)
src,count=re.subn(r'^cmd_b:.*$',lambda _: 'cmd_b:   .asciz "'+asm_string(command)+'"',src,flags=re.M)
assert count==1 and '/dev/tcp/' not in src and 'bash -i' not in src
pat=re.compile(r'#:(lower16|upper16):\((\w+) - _start \+ (0x[0-9a-fA-F]+)\)')
import ziglang
zig=Path(ziglang.__file__).resolve().parent/('zig.exe' if sys.platform=='win32' else 'zig')
def assemble(text,name):
    asm=out/(name+'.S');obj=out/(name+'.o');asm.write_text(text)
    subprocess.run([str(zig),'clang','-target','armv7-none-eabi','-march=armv7-a','-c',str(asm),'-o',str(obj)],check=True)
    with obj.open('rb') as f:
        e=ELFFile(f);symbols={s.name:s['st_value'] for s in e.get_section_by_name('.symtab').iter_symbols()}
        assert not any(s['sh_type'] in ('SHT_REL','SHT_RELA') and s.num_relocations() for s in e.iter_sections())
        return e.get_section_by_name('.text').data(),symbols
_,symbols=assemble(pat.sub('#1',src),'pass1');resolved=[]
def replace(m):
    half,label,base=m.groups();address=symbols[label]-symbols['_start']+int(base,16);value=(address if half=='lower16' else address>>16)&65535
    resolved.append((half,label,address,value));return '#'+str(value)
blob,final=assemble(pat.sub(replace,src),'stage')
assert final==symbols and len(blob)%4==0 and 0xc0008470+len(blob)<=SCRATCH
assert not [i for i in range(0,len(blob),2) if blob[i:i+2]==b'\0\0']
md=Cs(CS_ARCH_ARM,CS_MODE_ARM);loaded=[]
for ins in md.disasm(blob[:symbols['path']],0):
    if ins.mnemonic in ('movw','movt'):
        w=struct.unpack('<I',ins.bytes)[0];loaded.append((ins.mnemonic,((w>>16)&15)<<12|(w&4095)))
position=0
for half,label,address,value in resolved:
    want=('movw' if half=='lower16' else 'movt',value)
    while position<len(loaded) and loaded[position]!=want:position+=1
    assert position<len(loaded);position+=1
(out/'stage.bin').write_bytes(blob)
for tool,args in [('build_cave_blob_kant.py',['--profile','kant','--payload',out/'stage.bin','--out',out/'cave.bin']),('build_trigger_kant.py',['--cave-blob',out/'cave.bin','--out',out/'p1.img']),('verify_trigger_kant.py',[out/'p1.img','--cave-blob',out/'cave.bin'])]:
    subprocess.run([sys.executable,str(TOOLS/tool),*map(str,args)],check=True)
files={n:(package/n).read_bytes() for n in ['INSTALL.JS','PACKAGE.JSON','PAYLOAD.TGZ','README.TXT']}
create(out/'p2.img',files,'VETROSETUP')
image=package/'INSTALL.img'
subprocess.run([sys.executable,str(TOOLS/'build_usb_kant.py'),'--p1',str(out/'p1.img'),'--p2',str(out/'p2.img'),'--out',str(image)],check=True)
create(package/'RECOVERY.img',{'VETRO-STANDALONE-ROLLBACK':b'VETRO-STANDALONE-RECOVERY/1\n','README.TXT':b'Insert into the running TV to disable standalone and restore Samsung Home. Root remains.\n'},'VETROSAFE')
report={'stageBytes':len(blob),'installerSha256':ih,'stageSha256':hashlib.sha256(blob).hexdigest(),'imageSha256':hashlib.sha256(image.read_bytes()).hexdigest(),'resolvedImmediates':len(resolved),'zeroHalfwords':0,'unresolvedRelocations':0,'networkCallback':False,'uepPatch':False,'diagnostic':diagnostic,'diagnosticOffset':4096 if diagnostic else None,'freshHardwareInstallTested':False}
(out/'stage-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
