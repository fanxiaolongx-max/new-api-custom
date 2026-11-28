import { api } from '@/lib/api'

export interface IBMCNode {
  node: string
  vm: string
}

export interface IBMCStatus {
  name: string
  node?: string
  nodes?: IBMCNode[]
  console_id?: number
  simulation: boolean
  state: string
  uuid: string
  memory_mb: number
  cpu_count: number
  firmware: string
  os: string
  state_changed: string
  boot: string[]
  nic: string
  mac: string
  serial: boolean
  serial_busy: boolean
  uid: boolean
  alarm: string
  media: { id: string; size: number }[]
  mounted_media: string
  snapshots: { id: string; name: string }[]
  events: {
    id: string
    time: number
    action: string
    success: boolean
    detail: string
  }[]
  inventory: Record<string, string>
}
export interface IBMCAction {
  node?: string
  action:
    | 'start'
    | 'shutdown'
    | 'poweroff'
    | 'reset'
    | 'save'
    | 'pause'
    | 'resume'
    | 'boot'
    | 'mount'
    | 'eject'
    | 'snapshot'
    | 'uid'
    | 'alarm'
  device?: string
  media?: string
  enabled?: boolean
  severity?: string
}
export async function getIBMCForNode(node?: string): Promise<IBMCStatus> {
  const response = await api.get<{ data: IBMCStatus }>('/api/system/ibmc', {
    params: node ? { node } : undefined,
    skipErrorHandler: true,
  })
  return response.data.data
}
export async function getIBMC(): Promise<IBMCStatus> {
  return getIBMCForNode()
}
export async function controlIBMC(action: IBMCAction) {
  await api.post('/api/system/ibmc/action', action)
}
export async function serialIBMC(request: {
  operation: 'open' | 'write' | 'close'
  auto_login?: boolean
  session?: string
  data?: string
  // A provisioned lab guest such as Node-02; omitted for the original openEuler.
  node?: string
}): Promise<{ session: string; cursor: number }> {
  const response = await api.post<{
    data: { session: string; cursor: number }
  }>('/api/system/ibmc/serial', request, { skipErrorHandler: true })
  return response.data.data
}
export async function readIBMCSerial(
  session: string,
  cursor: number,
  node?: string
) {
  const response = await api.get<{
    data: { cursor: number; data: string; truncated: boolean }
  }>('/api/system/ibmc/serial', {
    params: node ? { cursor, node } : { cursor },
    headers: { 'X-IBMC-Session': session },
    skipErrorHandler: true,
  })
  return response.data.data
}
