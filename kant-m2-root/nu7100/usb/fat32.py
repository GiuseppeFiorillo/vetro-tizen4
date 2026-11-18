"""Small deterministic FAT32 image builder for regular package files only."""
import math,struct
from pathlib import Path

def lfn(name,short):
    checksum=0
    for b in short: checksum=(((checksum&1)<<7)+(checksum>>1)+b)&255
    units=list(struct.unpack('<'+'H'*len(name),name.encode('utf-16le')))+[0]
    units += [0xffff]*((-len(units))%13)
    entries=[]
    for i in range(len(units)//13,0,-1):
        e=bytearray(32);e[0]=i|(0x40 if i==len(units)//13 else 0);e[11]=15;e[13]=checksum
        for off,u in zip([1,3,5,7,9,14,16,18,20,22,24,28,30],units[(i-1)*13:i*13]):struct.pack_into('<H',e,off,u)
        entries.append(bytes(e))
    return b''.join(entries)

def create(output,files,label='VETRODATA'):
    total,reserved,copies=131072,32,2;fat_sectors=1
    while True:
        clusters=total-reserved-copies*fat_sectors;need=((clusters+2)*4+511)//512
        if need<=fat_sectors:break
        fat_sectors=need
    boot=bytearray(512);boot[:11]=b'\xeb\x58\x90MSWIN4.1'
    struct.pack_into('<HBHBHHBHHHII',boot,11,512,1,reserved,copies,0,0,0xf8,0,63,255,0,total)
    struct.pack_into('<IHHIHH',boot,36,fat_sectors,0,0,2,1,6)
    struct.pack_into('<BBBI',boot,64,128,0,0x29,0x5654524f)
    boot[71:82]=label.encode('ascii').ljust(11,b' ');boot[82:90]=b'FAT32   ';boot[510:512]=b'\x55\xaa'
    fat=bytearray(fat_sectors*512);struct.pack_into('<III',fat,0,0xffffff8,0xffffffff,0xfffffff)
    root=bytearray(512);root[:11]=boot[71:82];root[11]=8;entry_offset=32;next_cluster=3;data=[]
    for index,(name,content) in enumerate(sorted(files.items())):
        content=bytes(content);parts=name.split('.')
        short_ok=len(parts)<=2 and 1<=len(parts[0])<=8 and (len(parts)==1 or len(parts[1])<=3) and all(c.isalnum() or c in '_-' for c in ''.join(parts)) and name.upper()==name
        short=(parts[0].ljust(8)+(parts[1] if len(parts)==2 else '').ljust(3)).encode('ascii') if short_ok else ('FILE%04d'%index).ljust(8).encode()+b'BIN'
        extra=b'' if short_ok else lfn(name,short)
        if entry_offset+len(extra)+64>512:raise ValueError('Root directory capacity exceeded')
        root[entry_offset:entry_offset+len(extra)]=extra;entry_offset+=len(extra)
        count=max(1,math.ceil(len(content)/512));start=next_cluster
        for c in range(start,start+count):struct.pack_into('<I',fat,c*4,0xfffffff if c==start+count-1 else c+1)
        e=bytearray(32);e[:11]=short;e[11]=32;struct.pack_into('<H',e,20,start>>16);struct.pack_into('<HI',e,26,start&65535,len(content));root[entry_offset:entry_offset+32]=e;entry_offset+=32
        data.append((start,content));next_cluster+=count
    if next_cluster>=clusters+2:raise ValueError('Volume full')
    info=bytearray(512);struct.pack_into('<I',info,0,0x41615252);struct.pack_into('<IIII',info,484,0x61417272,clusters-(next_cluster-2),next_cluster,0);struct.pack_into('<I',info,508,0xaa550000)
    first=reserved+copies*fat_sectors
    with Path(output).open('wb') as f:
        f.truncate(total*512)
        for sector,block in [(0,boot),(1,info),(6,boot),(7,info),(reserved,fat),(reserved+fat_sectors,fat),(first,root)]:f.seek(sector*512);f.write(block)
        for start,content in data:f.seek((first+start-2)*512);f.write(content)
    return {'bytes':total*512,'fileCount':len(files),'fileNames':sorted(files),'label':label}
