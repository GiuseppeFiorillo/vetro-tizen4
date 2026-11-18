"""Independent read-only FAT chain parser for image validation."""
import struct
def read_fat(blob):
    assert blob[510:512]==b'\x55\xaa' and blob[82:90]==b'FAT32   '
    bps,spc,reserved,copies=struct.unpack_from('<HBHB',blob,11);assert bps==512 and spc>0 and copies==2
    fatsz,root=struct.unpack_from('<I',blob,36)[0],struct.unpack_from('<I',blob,44)[0]
    fat=blob[reserved*bps:(reserved+fatsz)*bps];assert fat==blob[(reserved+fatsz)*bps:(reserved+2*fatsz)*bps]
    data=(reserved+copies*fatsz)*bps
    def chain(start):
        out=bytearray();seen=set();c=start
        while c<0xffffff8:
            assert c>=2 and c not in seen;seen.add(c);off=data+(c-2)*spc*bps;out+=blob[off:off+spc*bps];c=struct.unpack_from('<I',fat,c*4)[0]&0xfffffff
        return bytes(out)
    entries=chain(root);result={};names={};alias=None
    for i in range(0,len(entries),32):
        e=entries[i:i+32]
        if not e[0]:break
        if e[0]==229:continue
        if e[11]==15:
            seq=e[0]&31
            if e[0]&64:names={};alias=e[13]
            names[seq]=[struct.unpack_from('<H',e,j)[0] for j in [1,3,5,7,9,14,16,18,20,22,24,28,30]];continue
        if e[11]&8:continue
        if names:
            checksum=0
            for b in e[:11]:checksum=(((checksum&1)<<7)+(checksum>>1)+b)&255
            assert checksum==alias
            units=sum((names[k] for k in sorted(names)),[]);name=''.join(chr(u) for u in units if u not in [0,65535]);names={}
        else:name=e[:8].decode().rstrip()+('.'+e[8:11].decode().rstrip() if e[8:11].strip() else '')
        start=(struct.unpack_from('<H',e,20)[0]<<16)|struct.unpack_from('<H',e,26)[0];size=struct.unpack_from('<I',e,28)[0]
        result[name]=chain(start)[:size]
    return result
