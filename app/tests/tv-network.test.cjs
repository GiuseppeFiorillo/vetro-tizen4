'use strict';
const assert=require('assert').strict,{networkDecode,Store}=require('../service/tv-settings.js');
const v=(type,data)=>({type,data}),props={Type:v('s','ethernet'),Name:v('s','Wired'),State:v('s','ready'),AutoConnect:v('b',false),Ethernet:v('a{sv}',{Interface:v('s','eth0'),Address:v('s','02:00:00:00:00:01'),MTU:v('q',1500)}),IPv4:v('a{sv}',{Method:v('s','dhcp'),Address:v('s','192.0.2.91'),Netmask:v('s','255.255.255.0'),Gateway:v('s','192.0.2.1')}),'IPv4.Configuration':v('a{sv}',{Method:v('s','dhcp')}),Nameservers:v('as',['ipv4.dhcp','192.0.2.72']),'Nameservers.Configuration':v('as',['ipv4.dhcp'])};
const output=JSON.stringify({type:'a(oa{sv})',data:[[['/net/connman/service/example',props]]]})+'\n__LINKS__\n2: eth0: <UP> mtu 1500 qdisc pfifo state UP mode DEFAULT \\ link/ether 02:00:00:00:00:01\n3: wlan0: <BROADCAST> mtu 1500 qdisc noop state DOWN mode DEFAULT \\ link/ether 02:00:00:00:00:02\n__ADDR__\n2: eth0    inet 192.0.2.91/24 scope global eth0\n2: eth0    inet6 2001:db8::91/64 scope global dynamic\n__ROUTES__\ndefault via 192.0.2.1 dev eth0\n__ROUTES6__\ndefault via fe80::1 dev eth0\n';
const d=networkDecode(output);assert.equal(d.configurationError,null);assert.equal(d.active.ipv4.Method,'dhcp');assert.equal(d.active.autoConnect,false);assert.deepEqual(d.active.nameserversConfigured,['ipv4.dhcp']);assert.equal(d.interfaces[1].addresses.length,0);assert.equal(d.interfaces[0].addresses.length,2);assert.equal(d.defaultRoutes6[0].gateway,'fe80::1');assert.equal(d.writable,false);
const fallback=networkDecode(output.replace(/^[^\n]+/,'not JSON'));assert.ok(fallback.configurationError);assert.equal(fallback.interfaces[0].addresses[0].address,'192.0.2.91/24');assert.equal(fallback.active,null);
// The Kant-M2 path: connmanctl (no JSON) plus netstat instead of ip.
const textOutput=[
 '*AR Wired                ethernet_702ad5a7052b_cable',
 '__DETAIL__',
 'S|ethernet_702ad5a7052b_cable',
 '/net/connman/service/ethernet_702ad5a7052b_cable',
 '  Type = ethernet',
 '  Security = [  ]',
 '  State = ready',
 '  Favorite = True',
 '  AutoConnect = True',
 '  Name = Wired',
 '  Ethernet = [ Method=auto, Interface=eth0, Address=70:2A:D5:A7:05:2B, MTU=1500 ]',
 '  IPv4 = [ Method=dhcp, Address=192.168.1.2, Netmask=255.255.255.0, Gateway=192.168.1.1 ]',
 '  IPv4.Configuration = [ Method=dhcp ]',
 '  Nameservers = [ ipv4.dhcp, ipv6.dhcp, 192.168.1.1 ]',
 '__IFCONFIG__',
 'Kernel Interface table',
 'eth0: flags=-28605<UP,BROADCAST,RUNNING,MULTICAST,DYNAMIC>  mtu 1500',
 '        inet 192.168.1.2  netmask 255.255.255.0  broadcast 192.168.1.255',
 '        inet6 fe80::722a:d5ff:fea7:52b  prefixlen 64  scopeid 0x20<link>',
 '        ether 70:2a:d5:a7:05:2b  txqueuelen 1000  (Ethernet)',
 'wlan0: flags=4099<UP,BROADCAST,MULTICAST>  mtu 1500',
 '        ether c0:48:e6:fa:ef:e3  txqueuelen 3000  (Ethernet)',
 '__ROUTES__',
 'Kernel IP routing table',
 'Destination     Gateway         Genmask         Flags   MSS Window  irtt Iface',
 '0.0.0.0         192.168.1.1     0.0.0.0         UG        0 0          0 eth0',
 '__ROUTES6__',
 '::/0                           fe80::5242:89ff:fe7d:6927  UG   1024 0     0 eth0',
 '::/0                           ::                         !n   -1  1  1380 lo'
].join('\n');
const t=networkDecode(textOutput);
assert.equal(t.configurationError,null);assert.equal(t.active.name,'Wired');assert.equal(t.active.ipv4.Address,'192.168.1.2');assert.equal(t.active.interface,'eth0');assert.equal(t.active.autoConnect,true);
assert.deepEqual(t.active.nameservers,['ipv4.dhcp','ipv6.dhcp','192.168.1.1']);assert.equal(t.interfaces.length,2);assert.deepEqual(t.interfaces[0].addresses.map(a=>a.family),['IPv4','IPv6']);assert.equal(t.interfaces[0].mac,'70:2a:d5:a7:05:2b');
assert.equal(t.defaultRoutes[0].gateway,'192.168.1.1');assert.equal(t.defaultRoutes6[0].gateway,'fe80::5242:89ff:fe7d:6927');
(async()=>{let calls=0;const store=new Store(async()=>{calls++;return {exit_code:0,stdout:output};});await Promise.all([store.readNetwork(),store.readNetwork()]);assert.equal(calls,1);console.log('PASS network settings: ConnMan variants, DHCP origins, active route, offline Wi-Fi, IPv6, partial failure and shared request');})().catch(e=>{console.error(e);process.exitCode=1});
