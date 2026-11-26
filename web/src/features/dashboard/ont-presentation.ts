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

import type { ONTOverview } from './ont-api'
import { ontParameterParts, ontLabelTerm } from './ont-labels'

export type ONTCategory =
  | 'device'
  | 'optics'
  | 'wan'
  | 'wlan'
  | 'ethernet'
  | 'clients'
  | 'other'
export interface ONTFieldGroup {
  id: string
  category: ONTCategory
  identity: string
  source: string
  fields: { name: string; value: string }[]
}

export function ontCategory(path: string): ONTCategory {
  const lower = path.toLowerCase()
  if (lower.includes('optic')) return 'optics'
  if (lower.includes('wlan') || lower.includes('wifi')) return 'wlan'
  if (
    lower.includes('waninfo') ||
    lower.includes('wanstate') ||
    lower.includes('wan_dynamic') ||
    lower.includes('wan_static')
  ) {
    return 'wan'
  }
  if (lower.includes('ethinfo')) return 'ethernet'
  if (lower.includes('lanhost') || lower.includes('userdev')) return 'clients'
  if (lower.includes('deviceinfo') || lower.includes('mainpage')) {
    return 'device'
  }
  return 'other'
}

export function isONTDynamicField(
  category: ONTCategory,
  name: string
): boolean {
  const key = name.toLowerCase().replaceAll(/[^a-z0-9]/g, '')
  if (category === 'clients') return true
  if (/threshold|limit|maximum|minimum|max|min|alarmenable/.test(key)) {
    return false
  }
  if (
    category === 'optics' &&
    !/domain|serial|vendor|version|mode|enable|datecode|wavelength|budgetclass/.test(
      key
    )
  ) {
    return true
  }
  return /status|state|uptime|power|temperature|voltage|bias|bytes|packets|errors|dropped|traffic|rate|speed|signal|rssi|snr|noise|cpu|memory|free|used|current|associated|connected|connectiontime|lastchange|ipaddress|externalip|ipv4address|wanip|gateway|dnsservers|dnsstr|lease|los|lof|alarm/.test(
    key
  )
}

export function buildONTFieldGroups(pages: ONTOverview['pages']): {
  dynamic: ONTFieldGroup[]
  configuration: ONTFieldGroup[]
} {
  const dynamic = new Map<string, ONTFieldGroup>()
  const configuration = new Map<string, ONTFieldGroup>()
  for (const page of pages) {
    const category = ontCategory(page.path)
    for (const record of page.records) {
      const identity =
        Object.entries(record.fields).find(([key]) =>
          /^(connectionname|wanname|ssid|interfacename|name|hostname)$/i.test(
            key
          )
        )?.[1] ?? ''
      const domain =
        Object.entries(record.fields).find(([key]) =>
          /^(domain|path|instanceid)$/i.test(key)
        )?.[1] ?? ''
      const id = `${page.path}:${domain || identity || record.name}`
      for (const [name, value] of Object.entries(record.fields)) {
        const destination = isONTDynamicField(category, name)
          ? dynamic
          : configuration
        let group = destination.get(id)
        if (!group) {
          group = {
            id,
            category,
            identity: identity || record.name,
            source: page.path,
            fields: [],
          }
          destination.set(id, group)
        }
        if (
          !group.fields.some(
            (field) => field.name === name && field.value === value
          )
        ) {
          group.fields.push({ name, value })
        }
      }
    }
  }
  return {
    dynamic: [...dynamic.values()],
    configuration: [...configuration.values()],
  }
}

export function ontCategoryLabel(category: ONTCategory, t: TFunction): string {
  switch (category) {
    case 'device':
      return t('Device information')
    case 'optics':
      return t('Optical transceiver')
    case 'wan':
      return t('WAN connections')
    case 'wlan':
      return t('Wireless network')
    case 'ethernet':
      return t('Ethernet ports')
    case 'clients':
      return t('LAN clients')
    default:
      return t('Additional information')
  }
}

export function ontFieldLabel(name: string, t: TFunction): string {
  const key = name.toLowerCase().replaceAll(/[^a-z0-9]/g, '')
  const parts = ontParameterParts[key]
  if (parts) return parts.map((part) => ontLabelTerm(part, t)).join(' · ')
  switch (key) {
    case 'rxpower':
    case 'receivepower':
    case 'revopticpower':
      return t('Receive optical power')
    case 'txpower':
    case 'transmitpower':
    case 'transopticpower':
      return t('Transmit optical power')
    case 'temperature':
    case 'onttemperature':
      return t('Temperature')
    case 'voltage':
    case 'supplyvoltage':
      return t('Voltage')
    case 'bias':
    case 'biascurrent':
      return t('Laser bias current')
    case 'ipaddress':
    case 'externalipaddress':
    case 'ipv4ipaddress':
      return t('IP address')
    case 'connectionstatus':
    case 'status':
    case 'state':
      return t('Status')
    case 'hardwareversion':
      return t('Hardware version')
    case 'softwareversion':
      return t('Software version')
    case 'serialnumber':
    case 'sn':
      return t('Serial number')
    case 'uptime':
      return t('Uptime')
    case 'macaddress':
      return t('MAC address')
    case 'defaultgateway':
    case 'gateway':
    case 'ipv4gateway':
      return t('Default gateway')
    case 'dnservers':
    case 'dnsservers':
    case 'dnsstr':
      return t('DNS servers')
    case 'subnetmask':
    case 'ipv4subnetmask':
      return t('Subnet mask')
    case 'vlanid':
    case 'xhwvlan':
      return t('VLAN ID')
    case 'speed':
    case 'bitrate':
      return t('Link speed')
    case 'bytessent':
    case 'txbytes':
    case 'totalbytessent':
      return t('Bytes sent')
    case 'bytesreceived':
    case 'rxbytes':
    case 'totalbytesreceived':
      return t('Bytes received')
    case 'packetssent':
      return t('Packets sent')
    case 'packetsreceived':
      return t('Packets received')
    case 'associateddevicenumber':
    case 'devicenum':
    case 'totalassociations':
      return t('Connected clients')
    case 'channel':
      return t('Wi-Fi channel')
    case 'name':
      return t('Name')
    case 'domain':
    case 'path':
      return t('Parameter path')
    case 'productname':
    case 'modelname':
      return t('Device model')
    case 'manufacturer':
      return t('Manufacturer')
    case 'duplexmode':
      return t('Duplex mode')
    case 'standard':
      return t('Wireless standard')
    case 'enable':
    case 'enabled':
      return t('Enabled')
    case 'servicelist':
    case 'xhwservicelist':
      return t('Service type')
    default:
      return t('Unrecognized parameter')
  }
}

export interface ONTEntity {
  id: string
  category: ONTCategory
  identity: string
  recordName?: string
  domain?: string
  sources: string[]
  fields: { name: string; value: string; dynamic: boolean }[]
}

export function buildONTEntities(pages: ONTOverview['pages']): ONTEntity[] {
  const entities = new Map<string, ONTEntity>()
  for (const page of pages) {
    for (const record of page.records) {
      let category = ontCategory(page.path)
      if (
        /associateddevice|userdeviceinfo|^(?:host|lanhost)$/i.test(record.name)
      ) {
        category = 'clients'
      }
      const entries = Object.entries(record.fields)
      let domain = entries.find(([key]) =>
        /^(domain|path|instanceid)$/i.test(key)
      )?.[1]
      if (category === 'wan') {
        domain = domain?.replace(/\.Stats$/i, '')
      }
      const identity =
        entries.find(([key]) =>
          /^(ssid|wanname|connectionname|realname)$/i.test(key)
        )?.[1] ||
        entries.find(([key]) =>
          /^(connectionname|wanname|realname|ssid|interfacename|name|hostname)$/i.test(
            key
          )
        )?.[1]
      const port = domain?.match(/\.LANPort\.(\d+)\./)?.[1]
      const portName = port ? `LAN ${port}` : ''
      const mac = entries.find(([key]) =>
        /^(macaddress|associateddevicemacaddress)$/i.test(key)
      )?.[1]
      const id = `${category}:${domain || mac || `${record.name}:${identity || JSON.stringify(entries)}`}`
      let entity = entities.get(id)
      if (!entity) {
        entity = {
          id,
          category,
          recordName: record.name,
          domain,
          identity:
            identity ||
            mac ||
            portName ||
            domain?.replace(/^InternetGatewayDevice\./, '') ||
            record.name,
          sources: [],
          fields: [],
        }
        entities.set(id, entity)
      }
      if (identity) entity.identity = identity
      if (record.name === 'WANConnection') entity.recordName = record.name
      if (!entity.sources.includes(page.path)) entity.sources.push(page.path)
      for (const [name, value] of entries) {
        if (
          !entity.fields.some(
            (field) =>
              field.name.toLowerCase() === name.toLowerCase() &&
              field.value === value
          )
        ) {
          entity.fields.push({
            name,
            value,
            dynamic: isONTDynamicField(category, name),
          })
        }
      }
    }
  }
  return [...entities.values()]
}

export function isONTKeyField(name: string): boolean {
  return /^(status|connectionstatus|linkstatus|losstatus|los|lof|ipaddress|ipv4ipaddress|externalipaddress|associateddeviceipaddress|ssid|name|modelname|productname|serialnumber|softwareversion|hardwareversion|servicelist|speed|mode|channel|devicenum|associateddevicenumber|uptime|voltage|temperature|bias|biascurrent|rxpower|txpower|revopticpower|transopticpower|rxbytes|txbytes|bytessent|bytesreceived|totalbytessent|totalbytesreceived|xhw[rts]xrate|xhwrssi|rssi|enable|enabled|xhwstandard|standard|dnsstr|gateway|subnetmask)$/i.test(
    name.replaceAll(/[^a-z0-9]/gi, '')
  )
}

export function ontServiceLabel(service: string, t: TFunction): string {
  const upper = service.toUpperCase()
  const kinds = []
  if (/(?:^|[_ ,+])INTERNET(?:$|[_ ,+])/.test(upper)) {
    kinds.push(t('Internet service'))
  }
  if (/TR069|TR-069|CWMP/.test(upper)) kinds.push(t('Remote management'))
  if (/VOICE|VOIP/.test(upper)) kinds.push(t('Voice service'))
  if (/IPTV/.test(upper)) kinds.push(t('IPTV service'))
  return kinds.join(' + ') || t('Unclassified WAN')
}

const ontRecordLabels: Record<string, string> = {
  stcwmp: 'TR-069 management',
  stxmppinfo: 'Remote management',
  stsslweb: 'Certificate authentication',
  stcertificate: 'Certificate authentication',
  stcardcfginfo: 'SIM PIN',
  stsignalstrength: 'Signal strength',
  stdevinfo: 'Device information',
  stdeviceinfo: 'Device information',
  gdgddeviceinfo: 'Device information',
  aisapdeviceinfo: 'Device information',
  stdevicemac: 'MAC address',
  devicelanmac: 'MAC address',
  stmodifyuserinfo: 'User account',
  stnormaluserinfo: 'User account',
  stopticinfo: 'Optical transceiver',
  stoltopticinfo: 'OLT optics',
  ststats: 'Traffic counters',
  wanstats: 'Traffic counters',
  wanethstats: 'Traffic counters',
  lanstats: 'Traffic counters',
  gemstats: 'Traffic counters',
  stpacketinfo: 'Traffic counters',
  stassociateddevice: 'Client',
  userdeviceinfo: 'Client',
  stneighbourap: 'Wireless network',
  stwlan: 'Wireless network',
  stwlanwifi: 'Wireless network',
  stattachconf: 'Wireless configuration',
  stconfigurationbyradio: 'Wireless configuration',
  stwificoverservice: 'Wireless configuration',
  sttopoadjustpolicy: 'Wireless configuration',
  stfonssidinst: 'Public Wi-Fi',
  stssidbandinfo: 'Frequency band',
  aisapbandsteeringinfo: 'Frequency band',
  stlanhostinfo: 'LAN interface',
  stipaddr: 'LAN interface',
  stlandhcpenable: 'DHCP server',
  stdhcp: 'DHCP server',
  dhcppoolclass: 'DHCP server',
  dhcphostclass: 'DHCP server',
  dhcpv6server: 'DHCPv6',
  slandhcp6info: 'DHCPv6',
  stlandhcp6info: 'DHCPv6',
  stddns: 'Dynamic DNS',
  stdnsinfo: 'DNS server',
  ipv6dnsconfigclass: 'IPv6 DNS',
  ststaticroute: 'Static route',
  routeinfo: 'Routing configuration',
  stdftroute: 'Default gateway',
  stporttrigger: 'Port mapping',
  stupnpportmapping: 'Port mapping',
  stportfilter: 'Port filtering',
  stfilterin: 'Inbound IP filtering',
  staclinfo: 'Access permission',
  stalg: 'Application gateways',
  stdos: 'Denial-of-service protection',
  sttimeinfo: 'NTP server',
  stftpsrvcfg: 'FTP',
  stsftpsrvcfg: 'SFTP',
  stusbdevice: 'Device information',
  stdlnaservice: 'Service',
  stsignalingprotocol: 'Voice signaling protocol',
  stprotocolabality: 'Supported signaling protocols',
  stdeviceinfovoicemode: 'Voice mode',
  steasymeshinfo: 'EasyMesh',
  stconfigport: 'Main uplink port',
  stconfigupportmode: 'Uplink port mode',
  stbindphyportinfo: 'LAN port binding',
  bindinfoclass: 'LAN port binding',
  bindinfoclassbywlan: 'SSID binding',
  ontinfo: 'ONT identifier',
  stline: 'Link status',
  stphy: 'Link status',
  stauthstate: 'Authentication',
}

export function ontEntityLabel(entity: ONTEntity, t: TFunction): string {
  const domain =
    entity.domain ||
    entity.fields.find((field) => /^domain$/i.test(field.name))?.value ||
    ''
  const number =
    domain.match(/WANConnectionDevice\.(\d+)/)?.[1] ||
    domain.match(/(?:LANPort|WLANConfiguration)\.(\d+)/)?.[1] ||
    domain.match(/(\d+)\D*$/)?.[1] ||
    ''
  if (entity.category === 'wan') {
    const service =
      entity.fields.find(
        (field) => /^exservicelist$/i.test(field.name) && field.value
      )?.value ||
      entity.fields.find((field) =>
        /^(servicelist|xhwservicelist)$/i.test(field.name)
      )?.value ||
      ''
    if (number) {
      return `${ontServiceLabel(service, t)} · ${t('WAN connection {{number}}', { number })}`
    }
    return t('WAN connections')
  }
  if (
    entity.category === 'ethernet' &&
    (/LANPort/.test(domain) || /^LAN \d+$/i.test(entity.identity))
  ) {
    return t('Ethernet port {{number}}', { number })
  }
  const custom =
    entity.identity &&
    entity.identity !== entity.recordName &&
    !/^(InternetGatewayDevice|WANDevice|X_HW_DEBUG|LANDevice)\./.test(
      entity.identity
    ) &&
    entity.identity !== domain &&
    entity.identity !== '0'
  if (custom && entity.identity !== `LAN ${number}`) return entity.identity
  const recordKey = (entity.recordName || entity.identity)
    .toLowerCase()
    .replaceAll(' ', '')
  const label = ontRecordLabels[recordKey]
  if (label) return `${t(label)}${number ? ` · ${number}` : ''}`
  const parts = ontParameterParts[recordKey]
  if (parts)
    {return `${parts.map((part) => ontLabelTerm(part, t)).join(' · ')}${number ? ` · ${number}` : ''}`}
  return `${ontCategoryLabel(entity.category, t)}${number ? ` · ${number}` : ''}`
}

export function ontFieldValue(
  name: string,
  value: string,
  t: TFunction
): string {
  if (!value || value === '--') return '—'
  const key = name.toLowerCase().replaceAll(/[^a-z0-9]/g, '')
  if (/^(domain|path|instanceid)$/.test(key)) {
    return t('Device parameter object {{number}}', {
      number: value.match(/\d+/g)?.join('.') || '—',
    })
  }
  if (/^(servicelist|exservicelist|xhwservicelist)$/.test(key)) {
    return ontServiceLabel(value, t)
  }
  if (
    /enable|supported|en$|^(wlhide|wmmenable|snooping|autochannel|autoextended|autoswitchap)$/.test(
      key
    )
  ) {
    if (value === '1' || value.toLowerCase() === 'true') return t('Enabled')
    if (value === '0' || value.toLowerCase() === 'false') return t('Disabled')
  }
  if (/status|state|^(los|lof)$/.test(key) && !/time|date/.test(key)) {
    switch (value.toLowerCase()) {
      case 'connected':
        return t('Connected')
      case 'disconnected':
        return t('Disconnected')
      case 'online':
        return t('Online')
      case 'offline':
        return t('Offline')
      case 'up':
        return t('Link up')
      case 'down':
        return t('Link down')
      case 'ok':
      case 'normal':
        return t('Normal')
      default:
        if (/^\d+$/.test(value)) return t('State code {{value}}', { value })
    }
  }
  if (/^(mode|workmode|wanmode|xhwupportmode|xhwworkingmode)$/.test(key)) {
    if (/^(ip_routed|r)$/i.test(value)) return t('Routed')
    if (/^(ip_bridged|b)$/i.test(value)) return t('Bridged')
    if (/^\d+$/.test(value)) return t('Mode code {{value}}', { value })
  }
  if (key === 'speed' && /^[0-9]$/.test(value)) {
    return t('Speed code {{value}}', { value })
  }
  if (key === 'lastconnectionerror' && /^(error_none|none|0)$/i.test(value)) {
    return t('No error')
  }
  if (
    /^(uptime|xhwuptime)$/.test(key) &&
    /^\d+$/.test(value) &&
    Number(value) <= 4294967295
  ) {
    const seconds = Number(value)
    return t('{{days}}d {{hours}}h {{minutes}}m', {
      days: Math.floor(seconds / 86400),
      hours: Math.floor(seconds / 3600) % 24,
      minutes: Math.floor(seconds / 60) % 60,
    })
  }
  return value
}
