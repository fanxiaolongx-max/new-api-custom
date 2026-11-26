/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { TFunction } from 'i18next'

export const ontParameterParts: Record<string, readonly string[]> = {
  addressconflictdetectionenable: ['Address conflict detection', 'Enabled'],
  alias: ['Alias'],
  associateddeviceipaddress: ['Client', 'IP address'],
  associateddevicemacaddress: ['Client', 'MAC address'],
  authstate: ['Authentication', 'Status'],
  autochannelenable: ['Automatic channel selection', 'Enabled'],
  autoenable: ['Automatic mode', 'Enabled'],
  autoextended: ['Automatic extension', 'Enabled'],
  autoextendedpolicy: ['Automatic extension', 'Policy'],
  autoextendedssidindex: ['Automatic extension', 'SSID index'],
  autoextendpublicwifi: ['Public Wi-Fi', 'Automatic extension'],
  autoswitchap: ['Automatic AP switching'],
  basicauth: ['Basic authentication'],
  basicauthenticationmode: ['Basic authentication'],
  basicencrypt: ['Basic encryption'],
  basicencryptionmodes: ['Basic encryption'],
  beaconperiod: ['Beacon interval'],
  beacontype: ['Beacon type'],
  bias: ['Laser bias current'],
  bondingenable: ['Link bonding', 'Enabled'],
  bondingratio2g: ['2.4 GHz', 'Bonding ratio'],
  bondingratio5g: ['5 GHz', 'Bonding ratio'],
  bridgewanproxyenable: ['Bridged WAN proxy', 'Enabled'],
  bssid: ['BSSID'],
  budgetclass: ['Optical budget class'],
  bytesreceived: ['Bytes received'],
  rxbytes: ['Bytes received'],
  totalbytesreceived: ['Bytes received'],
  bytessent: ['Bytes sent'],
  txbytes: ['Bytes sent'],
  totalbytessent: ['Bytes sent'],
  channel: ['Wi-Fi channel'],
  channelwidth: ['Channel width'],
  childprefixmask: ['Child prefix mask'],
  connectionrequesturl: ['Management connection request', 'URL'],
  connectionrequestusername: ['Management connection request', 'Username'],
  connectionstatus: ['Status'],
  connectiontrigger: ['Connection trigger'],
  datecode: ['Manufacturing date code'],
  ddnscfgenabled: ['Dynamic DNS', 'Enabled'],
  ddnshostname: ['Dynamic DNS', 'Hostname'],
  ddnsprovider: ['Dynamic DNS', 'Provider'],
  description: ['Description'],
  destipaddress: ['Destination', 'IP address'],
  destsubnetmask: ['Destination', 'Subnet mask'],
  devicename: ['Device name'],
  devicenum: ['Connected clients'],
  dhcpend: ['DHCP', 'End address'],
  dhcpleasetime: ['DHCP', 'Lease time'],
  dhcpleasetimeremaining: ['DHCP', 'Remaining lease time'],
  dhcpserverenable: ['DHCP server', 'Enabled'],
  dhcpstart: ['DHCP', 'Start address'],
  dhcpv6leasetime: ['DHCPv6', 'Lease time'],
  direction: ['Direction'],
  discard: ['Discarded packets'],
  discardpacketsreceived: ['Receive', 'Discarded packets'],
  rxdiscarded: ['Receive', 'Discarded packets'],
  discardpacketssent: ['Transmit', 'Discarded packets'],
  txdiscarded: ['Transmit', 'Discarded packets'],
  dnsserverenable: ['DNS server', 'Enabled'],
  dnsstr: ['DNS servers'],
  domain: ['Parameter path'],
  domainname: ['Domain name'],
  dstused: ['Daylight saving time', 'Enabled'],
  dtimperiod: ['DTIM interval'],
  easymeshenable: ['EasyMesh', 'Enabled'],
  eend: ['External port', 'End'],
  enable: ['Enabled'],
  enablecwmp: ['TR-069 management', 'Enabled'],
  enablegwnat: ['Gateway NAT', 'Enabled'],
  enablepin: ['SIM PIN', 'Enabled'],
  enablessid15: ['SSID 1/5', 'Enabled'],
  enablessid26: ['SSID 2/6', 'Enabled'],
  enablessid37: ['SSID 3/7', 'Enabled'],
  enablessid48: ['SSID 4/8', 'Enabled'],
  enddate: ['End date'],
  enddateex: ['End date'],
  endip: ['End address'],
  ipend: ['End address'],
  enum: ['External port', 'Count'],
  errorsreceived: ['Receive', 'Errors'],
  rxerros: ['Receive', 'Errors'],
  errorssent: ['Transmit', 'Errors'],
  txerros: ['Transmit', 'Errors'],
  estart: ['External port', 'Start'],
  etharxbyte: ['Ethernet A', 'Bytes received'],
  etharxpackets: ['Ethernet A', 'Packets received'],
  ethatxbyte: ['Ethernet A', 'Bytes sent'],
  ethatxpackets: ['Ethernet A', 'Packets sent'],
  ethbrxbyte: ['Ethernet B', 'Bytes received'],
  ethbrxpackets: ['Ethernet B', 'Packets received'],
  ethbtxbyte: ['Ethernet B', 'Bytes sent'],
  ethbtxpackets: ['Ethernet B', 'Packets sent'],
  ethnum: ['Ethernet ports', 'Count'],
  externalport: ['External port'],
  fbt11renable: ['802.11r fast roaming', 'Enabled'],
  firewalllevel: ['Firewall level'],
  fonssid2g: ['Public Wi-Fi', '2.4 GHz', 'SSID index'],
  fonssid5g: ['Public Wi-Fi', '5 GHz', 'SSID index'],
  forcedswitchthrehold: ['Forced roaming threshold'],
  fragmentflooden: ['Fragment flood protection', 'Enabled'],
  freq: ['Frequency'],
  ftpenable: ['FTP', 'Enabled'],
  ftpport: ['FTP', 'Port'],
  gateway: ['Default gateway'],
  gatewayipaddress: ['Default gateway'],
  genqueryinterval: ['Multicast general query interval'],
  genresponsetime: ['Multicast response time'],
  h323enable: ['H.323', 'Enabled'],
  hardwareversion: ['Hardware version'],
  highrssithreshold: ['Signal strength', 'High threshold'],
  hostnumberofentries: ['Host entries', 'Count'],
  httpwifienable: ['Web access over Wi-Fi', 'Enabled'],
  hwassociateddevicedescriptions: ['Client', 'Description'],
  icmpechoreplyen: ['ICMP echo reply', 'Enabled'],
  icmpredirecten: ['ICMP redirect', 'Enabled'],
  ieee11iencrypt: ['802.11i encryption'],
  ieee11iencryptionmodes: ['802.11i encryption'],
  iend: ['Internal port', 'End'],
  igmpenable: ['IGMP', 'Enabled'],
  igmpversion: ['IGMP', 'Version'],
  increasedrssithreshold: ['Signal increase threshold'],
  instantno: ['Instance number'],
  interface: ['Interface'],
  internalport: ['Internal port'],
  ipaddr: ['IP address'],
  ipaddress: ['IP address'],
  ipconcern: ['IP inspection'],
  ipfilterinpolicy: ['Inbound IP filtering', 'Policy'],
  ipfilterinright: ['Inbound IP filtering', 'Access permission'],
  ipsecforward: ['IPsec passthrough', 'Enabled'],
  ipstart: ['Start address'],
  startip: ['Start address'],
  ipv6address: ['IPv6 address'],
  ipv6dnsconfigtype: ['IPv6 DNS', 'Configuration type'],
  ipv6dnsservers: ['IPv6 DNS', 'DNS servers'],
  isolationenable: ['Client isolation', 'Enabled'],
  ispextended: ['ISP extension'],
  istart: ['Internal port', 'Start'],
  l2relayenable: ['Layer 2 relay', 'Enabled'],
  l2tpforward: ['L2TP passthrough', 'Enabled'],
  l3enable: ['Layer 3 forwarding', 'Enabled'],
  lay3enable: ['Layer 3 forwarding', 'Enabled'],
  landen: ['LAND attack protection', 'Enabled'],
  lanmac: ['LAN', 'MAC address'],
  lastconnectionerror: ['Last connection error'],
  laststatuschangetime: ['Last status change time'],
  leasetime: ['Lease time'],
  linkstatus: ['Link status'],
  losstatus: ['Optical signal loss'],
  lowerlayers: ['Underlying interfaces'],
  lowratethrehold: ['Low-rate threshold'],
  lowrssithreshold: ['Signal strength', 'Low threshold'],
  mac: ['MAC address'],
  macaddress: ['MAC address'],
  managedflag: ['Managed address flag'],
  manufactureinfo: ['Manufacturing information'],
  manufacturer: ['Manufacturer'],
  manufactureroui: ['Manufacturer OUI'],
  mask: ['Subnet mask'],
  maxaddress: ['Maximum address'],
  maxbitrate: ['Maximum bit rate'],
  maxrtradvinterval: ['Router advertisement', 'Maximum interval'],
  maxtxdistance: ['Maximum transmission distance'],
  mcsrx: ['Receive', 'MCS index'],
  mcstx: ['Transmit', 'MCS index'],
  minaddress: ['Minimum address'],
  miniboost: ['Signal boost'],
  minrtradvinterval: ['Router advertisement', 'Minimum interval'],
  mngssidstate: ['Management SSID', 'Status'],
  mode: ['Operating mode'],
  workmode: ['Operating mode'],
  modelname: ['Device model'],
  modifyflag: ['Modification flag'],
  msecs: ['Milliseconds'],
  mtu: ['Maximum transmission unit'],
  name: ['Name'],
  netmode2g: ['2G network', 'Supported'],
  netmode3g: ['3G network', 'Supported'],
  netmode4g: ['4G network', 'Supported'],
  netmode5g: ['5G network', 'Supported'],
  netmodeauto: ['Automatic network selection', 'Supported'],
  networktype: ['Network type'],
  noise: ['Noise level'],
  notafter: ['Certificate expiry time'],
  notbefore: ['Certificate start time'],
  ntp1: ['NTP server', 'Primary'],
  ntp2: ['NTP server', 'Secondary'],
  ontid: ['ONT identifier'],
  oproto: ['External protocol'],
  option60: ['DHCP option 60'],
  otherconfigflag: ['Other configuration flag'],
  packetlossratethrehold: ['Packet loss threshold'],
  packetsreceived: ['Packets received'],
  rxpackets: ['Packets received'],
  totalpacketsreceived: ['Packets received'],
  packetssent: ['Packets sent'],
  txpackets: ['Packets sent'],
  totalpacketssent: ['Packets sent'],
  periodicinformenable: ['Periodic management reporting', 'Enabled'],
  periodicinforminterval: ['Periodic management reporting', 'Interval'],
  periodicinformtime: ['Periodic management reporting', 'Time'],
  pingsweepen: ['Ping sweep protection', 'Enabled'],
  pinremaintimes: ['SIM PIN', 'Remaining attempts'],
  pinstates: ['SIM PIN', 'Status'],
  policy: ['Policy'],
  portmappingdescription: ['Port mapping', 'Description'],
  portmappingenabled: ['Port mapping', 'Enabled'],
  portmappingleaseduration: ['Port mapping', 'Lease time'],
  portmappingprotocol: ['Port mapping', 'Protocol'],
  power: ['Transmit power'],
  pppoeacname: ['PPPoE access concentrator'],
  pppoewanproxymode: ['PPPoE WAN proxy', 'Operating mode'],
  pppoewansnoopingmode: ['PPPoE WAN snooping', 'Operating mode'],
  pptpenable: ['PPTP passthrough', 'Enabled'],
  preferredlifetime: ['Preferred lifetime'],
  prefix: ['IPv6 prefix'],
  productname: ['Device model'],
  proto: ['Protocol'],
  protocol: ['Protocol'],
  proxyenable: ['Proxy', 'Enabled'],
  pukremaintimes: ['SIM PUK', 'Remaining attempts'],
  qossmartbandwidthvalue: ['Smart QoS', 'Bandwidth'],
  qossmartenablevalue: ['Smart QoS', 'Enabled'],
  raterx: ['Receive', 'Link speed'],
  ratetx: ['Transmit', 'Link speed'],
  regulatorydomain: ['Radio regulatory region'],
  releasetime: ['Release time'],
  remarkipprecedence: ['IP precedence remark'],
  remarkpri: ['Priority remark'],
  retenable: ['Radio enhancement', 'Enabled'],
  retrtcpport: ['Radio enhancement', 'RTCP port'],
  reusecycles: ['Reuse cycles'],
  reusestatus: ['Reuse status'],
  revopticpower: ['Receive optical power'],
  rfband: ['Frequency band'],
  rfoutputpower: ['Radio output power'],
  rfrxpower: ['Radio receive power'],
  right: ['Access permission'],
  robustness: ['Multicast robustness'],
  rootdirpath: ['Root directory'],
  routeralertenable: ['Router alert', 'Enabled'],
  rssi: ['Received signal strength'],
  rtcpenable: ['RTCP', 'Enabled'],
  rtcpport: ['RTCP port'],
  rtspenable: ['RTSP', 'Enabled'],
  rxwavelength: ['Receive wavelength'],
  security: ['Security mode'],
  serialnumber: ['Serial number'],
  serverconnectalgorithm: ['Server connection algorithm'],
  serviceport: ['Service port'],
  sftpenable: ['SFTP', 'Enabled'],
  sftpenabletime: ['SFTP', 'Enable time'],
  sftplanenable: ['SFTP', 'LAN access'],
  sftpmaxduration: ['SFTP', 'Maximum session duration'],
  sftpmaxidledur: ['SFTP', 'Maximum idle duration'],
  sftpport: ['SFTP', 'Port'],
  sftpstatus: ['SFTP', 'Status'],
  sftpwanenable: ['SFTP', 'WAN access'],
  shareallpath: ['Share all directories'],
  signalingprotocol: ['Voice signaling protocol'],
  signalingprotocols: ['Supported signaling protocols'],
  signalstrength: ['Signal strength'],
  sipenable: ['SIP', 'Enabled'],
  smurfen: ['Smurf attack protection', 'Enabled'],
  snoopingenable: ['Multicast snooping', 'Enabled'],
  softwareversion: ['Software version'],
  speed: ['Link speed'],
  spqueryinterval: ['Multicast group query interval'],
  spquerynumber: ['Multicast query count'],
  spresponsetime: ['Multicast group response time'],
  ssid: ['SSID'],
  ssidnum: ['SSID count'],
  ssidreference: ['SSID reference'],
  standard: ['Wireless standard'],
  startdate: ['Start date'],
  startdateex: ['Start date'],
  startupquerycount: ['Startup query count'],
  startupqueryinterval: ['Startup query interval'],
  status: ['Status'],
  stbnumber: ['Set-top box count'],
  stunenable: ['STUN', 'Enabled'],
  stunmaximumkeepaliveperiod: ['STUN', 'Maximum keepalive interval'],
  stunminimumkeepaliveperiod: ['STUN', 'Minimum keepalive interval'],
  stunserverport: ['STUN', 'Server port'],
  subnetmask: ['Subnet mask'],
  syncwifiswitch: ['Wi-Fi synchronization'],
  synflooden: ['SYN flood protection', 'Enabled'],
  syninterval: ['SYN interval'],
  telnetlanenable: ['Telnet', 'LAN access'],
  telnetwifienable: ['Telnet', 'Wi-Fi access'],
  temperature: ['Temperature'],
  tftpenable: ['TFTP', 'Enabled'],
  timer: ['Timer'],
  transmitpower: ['Transmit power'],
  transopticpower: ['Transmit optical power'],
  txpower: ['Transmit optical power'],
  txwavelength: ['Transmit wavelength'],
  type: ['Type'],
  typpon: ['PON type'],
  ulamode: ['IPv6 ULA', 'Operating mode'],
  ulaprefix: ['IPv6 ULA', 'IPv6 prefix'],
  ulaprefixlen: ['IPv6 ULA', 'Prefix length'],
  unicastpacketsreceived: ['Receive', 'Unicast packets'],
  unicastpacketssent: ['Transmit', 'Unicast packets'],
  unsolicitedreportinterval: ['Unsolicited report interval'],
  uptime: ['Uptime'],
  url: ['URL'],
  usage: ['Usage'],
  userlevel: ['User privilege level'],
  username: ['Username'],
  userpolicy: ['User policy'],
  usrnum: ['User count'],
  validlifetime: ['Valid lifetime'],
  value: ['Value'],
  vendorid: ['Vendor identifier'],
  vendorname: ['Vendor name'],
  vendorsn: ['Vendor serial number'],
  voltage: ['Voltage'],
  wanname: ['WAN connection name'],
  winnukeen: ['WinNuke protection', 'Enabled'],
  wlancfg: ['Wireless configuration'],
  wlanmac: ['Wi-Fi', 'MAC address'],
  wlanscheenable: ['Wi-Fi schedule', 'Enabled'],
  wlhide: ['Hidden SSID'],
  wmmenable: ['WMM', 'Enabled'],
  wpaand11iencrypt: ['WPA encryption'],
  wpaencryptionmodes: ['WPA encryption'],
  xhwwpaand11iencryptionmodes: ['WPA encryption'],
  wpaencrypt: ['WPA encryption'],
  wps2: ['WPS 2.0'],
  xhw11ksupported: ['802.11k', 'Supported'],
  xhw11rsupported: ['802.11r', 'Supported'],
  xhw11vsupported: ['802.11v', 'Supported'],
  xhwairtimefairness: ['Airtime fairness'],
  xhwantennanum: ['Antenna count'],
  xhwbeamformingsupported: ['Beamforming', 'Supported'],
  xhwdownratelimit: ['Downstream rate limit'],
  xhwdscp: ['DSCP marking'],
  xhwdualbandsupported: ['Dual-band', 'Supported'],
  xhwenablecertificate: ['Certificate authentication', 'Enabled'],
  xhwhighbandflag: ['High-band flag'],
  xhwht20: ['20 MHz channel width'],
  xhwisolationenable: ['Client isolation', 'Enabled'],
  xhwmacfilterpolicy: ['MAC filtering', 'Policy'],
  xhwmainupport: ['Main uplink port'],
  xhwnoise: ['Noise level'],
  xhwpsmode: ['Power saving mode'],
  xhwrfband: ['Frequency band'],
  xhwrssi: ['Received signal strength'],
  xhwrxrate: ['Receive', 'Link speed'],
  xhwserviceenable: ['Service', 'Enabled'],
  xhwsingalquality: ['Signal quality'],
  xhwsnr: ['Signal-to-noise ratio'],
  xhwstandard: ['Wireless standard'],
  xhwstatus: ['Status'],
  xhwtxrate: ['Transmit', 'Link speed'],
  xhwupportid: ['Uplink port identifier'],
  xhwupportmode: ['Uplink port mode'],
  xhwupratelimit: ['Upstream rate limit'],
  xhwuptime: ['Uptime'],
  xhwvoicemode: ['Voice mode'],
  xhwwmmstatus: ['WMM', 'Status'],
  xhwworkingmode: ['Operating mode'],
  cblan1: ['LAN port binding', '1'],
  cbssid1: ['SSID binding', '1'],
  cblan2: ['LAN port binding', '2'],
  cbssid2: ['SSID binding', '2'],
  cblan3: ['LAN port binding', '3'],
  cbssid3: ['SSID binding', '3'],
  cblan4: ['LAN port binding', '4'],
  cbssid4: ['SSID binding', '4'],
  cblan5: ['LAN port binding', '5'],
  cbssid5: ['SSID binding', '5'],
  cblan6: ['LAN port binding', '6'],
  cbssid6: ['SSID binding', '6'],
  cblan7: ['LAN port binding', '7'],
  cbssid7: ['SSID binding', '7'],
  cblan8: ['LAN port binding', '8'],
  cbssid8: ['SSID binding', '8'],
  exservicelist: ['Service type'],
  servicelist: ['Service type'],
  ipv4addressmode: ['IPv4', 'Configuration type'],
  ipv4enable: ['IPv4', 'Enabled'],
  ipv6enable: ['IPv6', 'Enabled'],
  natenabled: ['Gateway NAT', 'Enabled'],
  priority: ['Priority'],
  wanmode: ['Operating mode'],
}
export function ontLabelTerm(term: string, t: TFunction): string {
  switch (term) {
    case '2.4 GHz':
      return t('2.4 GHz')
    case '20 MHz channel width':
      return t('20 MHz channel width')
    case '2G network':
      return t('2G network')
    case '3G network':
      return t('3G network')
    case '4G network':
      return t('4G network')
    case '5 GHz':
      return t('5 GHz')
    case '5G network':
      return t('5G network')
    case '802.11i encryption':
      return t('802.11i encryption')
    case '802.11k':
      return t('802.11k')
    case '802.11r':
      return t('802.11r')
    case '802.11r fast roaming':
      return t('802.11r fast roaming')
    case '802.11v':
      return t('802.11v')
    case 'Access permission':
      return t('Access permission')
    case 'Address conflict detection':
      return t('Address conflict detection')
    case 'Airtime fairness':
      return t('Airtime fairness')
    case 'Alias':
      return t('Alias')
    case 'Antenna count':
      return t('Antenna count')
    case 'Authentication':
      return t('Authentication')
    case 'Automatic AP switching':
      return t('Automatic AP switching')
    case 'Automatic channel selection':
      return t('Automatic channel selection')
    case 'Automatic extension':
      return t('Automatic extension')
    case 'Automatic mode':
      return t('Automatic mode')
    case 'Automatic network selection':
      return t('Automatic network selection')
    case 'BSSID':
      return t('BSSID')
    case 'Bandwidth':
      return t('Bandwidth')
    case 'Basic authentication':
      return t('Basic authentication')
    case 'Basic encryption':
      return t('Basic encryption')
    case 'Beacon interval':
      return t('Beacon interval')
    case 'Beacon type':
      return t('Beacon type')
    case 'Beamforming':
      return t('Beamforming')
    case 'Bonding ratio':
      return t('Bonding ratio')
    case 'Bridged WAN proxy':
      return t('Bridged WAN proxy')
    case 'Bytes received':
      return t('Bytes received')
    case 'Bytes sent':
      return t('Bytes sent')
    case 'Certificate authentication':
      return t('Certificate authentication')
    case 'Certificate expiry time':
      return t('Certificate expiry time')
    case 'Certificate start time':
      return t('Certificate start time')
    case 'Channel width':
      return t('Channel width')
    case 'Child prefix mask':
      return t('Child prefix mask')
    case 'Client':
      return t('Client')
    case 'Client isolation':
      return t('Client isolation')
    case 'Configuration type':
      return t('Configuration type')
    case 'Connected clients':
      return t('Connected clients')
    case 'Connection trigger':
      return t('Connection trigger')
    case 'Count':
      return t('Count')
    case 'DHCP':
      return t('DHCP')
    case 'DHCP option 60':
      return t('DHCP option 60')
    case 'DHCP server':
      return t('DHCP server')
    case 'DHCPv6':
      return t('DHCPv6')
    case 'DNS server':
      return t('DNS server')
    case 'DNS servers':
      return t('DNS servers')
    case 'DSCP marking':
      return t('DSCP marking')
    case 'DTIM interval':
      return t('DTIM interval')
    case 'Daylight saving time':
      return t('Daylight saving time')
    case 'Default gateway':
      return t('Default gateway')
    case 'Description':
      return t('Description')
    case 'Destination':
      return t('Destination')
    case 'Device model':
      return t('Device model')
    case 'Device name':
      return t('Device name')
    case 'Direction':
      return t('Direction')
    case 'Discarded packets':
      return t('Discarded packets')
    case 'Domain name':
      return t('Domain name')
    case 'Downstream rate limit':
      return t('Downstream rate limit')
    case 'Dual-band':
      return t('Dual-band')
    case 'Dynamic DNS':
      return t('Dynamic DNS')
    case 'EasyMesh':
      return t('EasyMesh')
    case 'Enable time':
      return t('Enable time')
    case 'Enabled':
      return t('Enabled')
    case 'End':
      return t('End')
    case 'End address':
      return t('End address')
    case 'End date':
      return t('End date')
    case 'Errors':
      return t('Errors')
    case 'Ethernet A':
      return t('Ethernet A')
    case 'Ethernet B':
      return t('Ethernet B')
    case 'Ethernet ports':
      return t('Ethernet ports')
    case 'External port':
      return t('External port')
    case 'External protocol':
      return t('External protocol')
    case 'FTP':
      return t('FTP')
    case 'Firewall level':
      return t('Firewall level')
    case 'Forced roaming threshold':
      return t('Forced roaming threshold')
    case 'Fragment flood protection':
      return t('Fragment flood protection')
    case 'Frequency':
      return t('Frequency')
    case 'Frequency band':
      return t('Frequency band')
    case 'Gateway NAT':
      return t('Gateway NAT')
    case 'H.323':
      return t('H.323')
    case 'Hardware version':
      return t('Hardware version')
    case 'Hidden SSID':
      return t('Hidden SSID')
    case 'High threshold':
      return t('High threshold')
    case 'High-band flag':
      return t('High-band flag')
    case 'Host entries':
      return t('Host entries')
    case 'Hostname':
      return t('Hostname')
    case 'ICMP echo reply':
      return t('ICMP echo reply')
    case 'ICMP redirect':
      return t('ICMP redirect')
    case 'IGMP':
      return t('IGMP')
    case 'IP address':
      return t('IP address')
    case 'IP inspection':
      return t('IP inspection')
    case 'IP precedence remark':
      return t('IP precedence remark')
    case 'IPsec passthrough':
      return t('IPsec passthrough')
    case 'IPv4':
      return t('IPv4')
    case 'IPv6':
      return t('IPv6')
    case 'IPv6 DNS':
      return t('IPv6 DNS')
    case 'IPv6 ULA':
      return t('IPv6 ULA')
    case 'IPv6 address':
      return t('IPv6 address')
    case 'IPv6 prefix':
      return t('IPv6 prefix')
    case 'ISP extension':
      return t('ISP extension')
    case 'Inbound IP filtering':
      return t('Inbound IP filtering')
    case 'Instance number':
      return t('Instance number')
    case 'Interface':
      return t('Interface')
    case 'Internal port':
      return t('Internal port')
    case 'Interval':
      return t('Interval')
    case 'L2TP passthrough':
      return t('L2TP passthrough')
    case 'LAN':
      return t('LAN')
    case 'LAN access':
      return t('LAN access')
    case 'LAN port binding':
      return t('LAN port binding')
    case 'LAND attack protection':
      return t('LAND attack protection')
    case 'Laser bias current':
      return t('Laser bias current')
    case 'Last connection error':
      return t('Last connection error')
    case 'Last status change time':
      return t('Last status change time')
    case 'Layer 2 relay':
      return t('Layer 2 relay')
    case 'Layer 3 forwarding':
      return t('Layer 3 forwarding')
    case 'Lease time':
      return t('Lease time')
    case 'Link bonding':
      return t('Link bonding')
    case 'Link speed':
      return t('Link speed')
    case 'Link status':
      return t('Link status')
    case 'Low threshold':
      return t('Low threshold')
    case 'Low-rate threshold':
      return t('Low-rate threshold')
    case 'MAC address':
      return t('MAC address')
    case 'MAC filtering':
      return t('MAC filtering')
    case 'MCS index':
      return t('MCS index')
    case 'Main uplink port':
      return t('Main uplink port')
    case 'Managed address flag':
      return t('Managed address flag')
    case 'Management SSID':
      return t('Management SSID')
    case 'Management connection request':
      return t('Management connection request')
    case 'Manufacturer':
      return t('Manufacturer')
    case 'Manufacturer OUI':
      return t('Manufacturer OUI')
    case 'Manufacturing date code':
      return t('Manufacturing date code')
    case 'Manufacturing information':
      return t('Manufacturing information')
    case 'Maximum address':
      return t('Maximum address')
    case 'Maximum bit rate':
      return t('Maximum bit rate')
    case 'Maximum idle duration':
      return t('Maximum idle duration')
    case 'Maximum interval':
      return t('Maximum interval')
    case 'Maximum keepalive interval':
      return t('Maximum keepalive interval')
    case 'Maximum session duration':
      return t('Maximum session duration')
    case 'Maximum transmission distance':
      return t('Maximum transmission distance')
    case 'Maximum transmission unit':
      return t('Maximum transmission unit')
    case 'Milliseconds':
      return t('Milliseconds')
    case 'Minimum address':
      return t('Minimum address')
    case 'Minimum interval':
      return t('Minimum interval')
    case 'Minimum keepalive interval':
      return t('Minimum keepalive interval')
    case 'Modification flag':
      return t('Modification flag')
    case 'Multicast general query interval':
      return t('Multicast general query interval')
    case 'Multicast group query interval':
      return t('Multicast group query interval')
    case 'Multicast group response time':
      return t('Multicast group response time')
    case 'Multicast query count':
      return t('Multicast query count')
    case 'Multicast response time':
      return t('Multicast response time')
    case 'Multicast robustness':
      return t('Multicast robustness')
    case 'Multicast snooping':
      return t('Multicast snooping')
    case 'NTP server':
      return t('NTP server')
    case 'Name':
      return t('Name')
    case 'Network type':
      return t('Network type')
    case 'Noise level':
      return t('Noise level')
    case 'ONT identifier':
      return t('ONT identifier')
    case 'Operating mode':
      return t('Operating mode')
    case 'Optical budget class':
      return t('Optical budget class')
    case 'Optical signal loss':
      return t('Optical signal loss')
    case 'Other configuration flag':
      return t('Other configuration flag')
    case 'PON type':
      return t('PON type')
    case 'PPPoE WAN proxy':
      return t('PPPoE WAN proxy')
    case 'PPPoE WAN snooping':
      return t('PPPoE WAN snooping')
    case 'PPPoE access concentrator':
      return t('PPPoE access concentrator')
    case 'PPTP passthrough':
      return t('PPTP passthrough')
    case 'Packet loss threshold':
      return t('Packet loss threshold')
    case 'Packets received':
      return t('Packets received')
    case 'Packets sent':
      return t('Packets sent')
    case 'Parameter path':
      return t('Parameter path')
    case 'Periodic management reporting':
      return t('Periodic management reporting')
    case 'Ping sweep protection':
      return t('Ping sweep protection')
    case 'Policy':
      return t('Policy')
    case 'Port':
      return t('Port')
    case 'Port mapping':
      return t('Port mapping')
    case 'Power saving mode':
      return t('Power saving mode')
    case 'Preferred lifetime':
      return t('Preferred lifetime')
    case 'Prefix length':
      return t('Prefix length')
    case 'Primary':
      return t('Primary')
    case 'Priority':
      return t('Priority')
    case 'Priority remark':
      return t('Priority remark')
    case 'Protocol':
      return t('Protocol')
    case 'Provider':
      return t('Provider')
    case 'Proxy':
      return t('Proxy')
    case 'Public Wi-Fi':
      return t('Public Wi-Fi')
    case 'RTCP':
      return t('RTCP')
    case 'RTCP port':
      return t('RTCP port')
    case 'RTSP':
      return t('RTSP')
    case 'Radio enhancement':
      return t('Radio enhancement')
    case 'Radio output power':
      return t('Radio output power')
    case 'Radio receive power':
      return t('Radio receive power')
    case 'Radio regulatory region':
      return t('Radio regulatory region')
    case 'Receive':
      return t('Receive')
    case 'Receive optical power':
      return t('Receive optical power')
    case 'Receive wavelength':
      return t('Receive wavelength')
    case 'Received signal strength':
      return t('Received signal strength')
    case 'Release time':
      return t('Release time')
    case 'Remaining attempts':
      return t('Remaining attempts')
    case 'Remaining lease time':
      return t('Remaining lease time')
    case 'Reuse cycles':
      return t('Reuse cycles')
    case 'Reuse status':
      return t('Reuse status')
    case 'Root directory':
      return t('Root directory')
    case 'Router advertisement':
      return t('Router advertisement')
    case 'Router alert':
      return t('Router alert')
    case 'SFTP':
      return t('SFTP')
    case 'SIM PIN':
      return t('SIM PIN')
    case 'SIM PUK':
      return t('SIM PUK')
    case 'SIP':
      return t('SIP')
    case 'SSID':
      return t('SSID')
    case 'SSID 1/5':
      return t('SSID 1/5')
    case 'SSID 2/6':
      return t('SSID 2/6')
    case 'SSID 3/7':
      return t('SSID 3/7')
    case 'SSID 4/8':
      return t('SSID 4/8')
    case 'SSID binding':
      return t('SSID binding')
    case 'SSID count':
      return t('SSID count')
    case 'SSID index':
      return t('SSID index')
    case 'SSID reference':
      return t('SSID reference')
    case 'STUN':
      return t('STUN')
    case 'SYN flood protection':
      return t('SYN flood protection')
    case 'SYN interval':
      return t('SYN interval')
    case 'Secondary':
      return t('Secondary')
    case 'Security mode':
      return t('Security mode')
    case 'Serial number':
      return t('Serial number')
    case 'Server connection algorithm':
      return t('Server connection algorithm')
    case 'Server port':
      return t('Server port')
    case 'Service':
      return t('Service')
    case 'Service port':
      return t('Service port')
    case 'Service type':
      return t('Service type')
    case 'Set-top box count':
      return t('Set-top box count')
    case 'Share all directories':
      return t('Share all directories')
    case 'Signal boost':
      return t('Signal boost')
    case 'Signal increase threshold':
      return t('Signal increase threshold')
    case 'Signal quality':
      return t('Signal quality')
    case 'Signal strength':
      return t('Signal strength')
    case 'Signal-to-noise ratio':
      return t('Signal-to-noise ratio')
    case 'Smart QoS':
      return t('Smart QoS')
    case 'Smurf attack protection':
      return t('Smurf attack protection')
    case 'Software version':
      return t('Software version')
    case 'Start':
      return t('Start')
    case 'Start address':
      return t('Start address')
    case 'Start date':
      return t('Start date')
    case 'Startup query count':
      return t('Startup query count')
    case 'Startup query interval':
      return t('Startup query interval')
    case 'Status':
      return t('Status')
    case 'Subnet mask':
      return t('Subnet mask')
    case 'Supported':
      return t('Supported')
    case 'Supported signaling protocols':
      return t('Supported signaling protocols')
    case 'TFTP':
      return t('TFTP')
    case 'TR-069 management':
      return t('TR-069 management')
    case 'Telnet':
      return t('Telnet')
    case 'Temperature':
      return t('Temperature')
    case 'Time':
      return t('Time')
    case 'Timer':
      return t('Timer')
    case 'Transmit':
      return t('Transmit')
    case 'Transmit optical power':
      return t('Transmit optical power')
    case 'Transmit power':
      return t('Transmit power')
    case 'Transmit wavelength':
      return t('Transmit wavelength')
    case 'Type':
      return t('Type')
    case 'URL':
      return t('URL')
    case 'Underlying interfaces':
      return t('Underlying interfaces')
    case 'Unicast packets':
      return t('Unicast packets')
    case 'Unsolicited report interval':
      return t('Unsolicited report interval')
    case 'Uplink port identifier':
      return t('Uplink port identifier')
    case 'Uplink port mode':
      return t('Uplink port mode')
    case 'Upstream rate limit':
      return t('Upstream rate limit')
    case 'Uptime':
      return t('Uptime')
    case 'Usage':
      return t('Usage')
    case 'User count':
      return t('User count')
    case 'User policy':
      return t('User policy')
    case 'User privilege level':
      return t('User privilege level')
    case 'Username':
      return t('Username')
    case 'Valid lifetime':
      return t('Valid lifetime')
    case 'Value':
      return t('Value')
    case 'Vendor identifier':
      return t('Vendor identifier')
    case 'Vendor name':
      return t('Vendor name')
    case 'Vendor serial number':
      return t('Vendor serial number')
    case 'Version':
      return t('Version')
    case 'Voice mode':
      return t('Voice mode')
    case 'Voice signaling protocol':
      return t('Voice signaling protocol')
    case 'Voltage':
      return t('Voltage')
    case 'WAN access':
      return t('WAN access')
    case 'WAN connection name':
      return t('WAN connection name')
    case 'WMM':
      return t('WMM')
    case 'WPA encryption':
      return t('WPA encryption')
    case 'WPS 2.0':
      return t('WPS 2.0')
    case 'Web access over Wi-Fi':
      return t('Web access over Wi-Fi')
    case 'Wi-Fi':
      return t('Wi-Fi')
    case 'Wi-Fi access':
      return t('Wi-Fi access')
    case 'Wi-Fi channel':
      return t('Wi-Fi channel')
    case 'Wi-Fi schedule':
      return t('Wi-Fi schedule')
    case 'Wi-Fi synchronization':
      return t('Wi-Fi synchronization')
    case 'WinNuke protection':
      return t('WinNuke protection')
    case 'Wireless configuration':
      return t('Wireless configuration')
    case 'Wireless standard':
      return t('Wireless standard')
    default:
      return term
  }
}
