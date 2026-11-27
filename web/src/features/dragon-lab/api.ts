import { api } from '@/lib/api'

export type LabNodeID = 'pc' | 'sw1' | 'sw2' | 'ibmc' | 'os'
export type LabLinkID =
  | 'pc-sw1'
  | 'sw1-ibmc'
  | 'pc-sw2'
  | 'sw2-os-a'
  | 'sw2-os-b'
  | 'ibmc-os'
export interface LabNodeConfig {
  id: LabNodeID
  address: string
  gateway: string
  console_id: number
  console_mode: 'remote' | 'sol' | 'pending'
}
export interface LabLinkConfig {
  id: LabLinkID
  source_port: string
  target_port: string
  source_address: string
  target_address: string
  vlan: string
  phase: 'planned' | 'configured'
}
export interface LabConfig {
  workbench_url?: string
  nodes: LabNodeConfig[]
  links: LabLinkConfig[]
}
export const LAB_KEY = ['system', 'dragon-lab'] as const
export async function getLabConfig(): Promise<LabConfig> {
  const response = await api.get<{ data: LabConfig }>('/api/system/lab', {
    skipErrorHandler: true,
  })
  return response.data.data
}
export async function saveLabConfig(config: LabConfig): Promise<LabConfig> {
  const response = await api.put<{ data: LabConfig }>('/api/system/lab', config)
  return response.data.data
}
export async function getLabTool(): Promise<string> {
  const response = await api.get<string>('/api/system/lab/tool', {
    responseType: 'text',
    skipErrorHandler: true,
  })
  return response.data
}
export interface LabResetResult {
  ok: boolean
  log: string
}
export async function factoryResetLab(): Promise<LabResetResult> {
  const response = await api.post<{
    success: boolean
    message?: string
    data?: LabResetResult
  }>('/api/system/lab/factory-reset', undefined, { skipErrorHandler: true })
  return response.data.data ?? { ok: false, log: response.data.message ?? '' }
}
export type LabPortState = 'up' | 'down' | 'warn' | 'unknown'
export interface LabEndpointStatus {
  state: LabPortState
  label: string
  detail: string
}
export interface LabLinkStatus {
  updated: number
  stale: boolean
  endpoints: Record<string, LabEndpointStatus>
  links: Partial<Record<LabLinkID, [string, string]>>
}
export async function getLabLinkStatus(): Promise<LabLinkStatus> {
  const response = await api.get<{ data: LabLinkStatus }>(
    '/api/system/lab/link-status',
    { skipErrorHandler: true }
  )
  return response.data.data
}
export function labConsoleURL(id: number): string {
  if (!Number.isInteger(id) || id < 1 || id > 999999) return ''
  return `/guacamole/#/client/${btoa(`${id}\0c\0postgresql`).replace(/=+$/, '')}`
}
