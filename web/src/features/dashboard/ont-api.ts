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
import { api } from '@/lib/api'

export interface ONTConfig {
  enabled: boolean
  address: string
  username: string
  interval_seconds: number
  insecure_tls: boolean
  password_set: boolean
}

export interface ONTOverview {
  config: ONTConfig
  state: 'disabled' | 'pending' | 'collecting' | 'ok' | 'partial' | 'error'
  error?: string
  last_attempt: number
  last_success: number
  next_poll: number
  failures?: { path: string; error?: string }[]
  current?: ONTPoint
  history_error?: boolean
  pages: {
    path: string
    error?: string
    records: { name: string; fields: Record<string, string> }[]
  }[]
}

export interface ONTEvent {
  id: string
  timestamp: number
  kind:
    | 'optical_shift'
    | 'ip_changed'
    | 'link_down'
    | 'link_up'
    | 'device_alarm'
    | 'collection_failed'
    | 'collection_recovered'
  severity: 'info' | 'warning' | 'critical'
  metric?: string
  connection?: string
  previous?: string
  current?: string
}

export interface ONTTrafficCounter {
  id: string
  category: 'wan' | 'ethernet' | 'wlan' | 'pon'
  name: string
  service: string
  source: string
  rx_bytes: string | null
  tx_bytes: string | null
}

export interface ONTPoint {
  traffic?: ONTTrafficCounter[]
  timestamp: number
  collected: boolean
  rx_power: number | null
  tx_power: number | null
  temperature: number | null
  voltage: number | null
  bias_current: number | null
  online: boolean | null
  internet_ip: string
  wan: {
    id: string
    name: string
    service: string
    ip: string
    status: string
    online: boolean | null
  }[]
  sources: Record<string, string>
  events: ONTEvent[]
  active_alarms?: string[]
  alarm_reported?: boolean
  error?: string
}

export interface ONTHistory {
  points: ONTPoint[]
  events: ONTEvent[]
  total_samples: number
  retention_days: number
  downsampled: boolean
}

export async function getONTHistory(hours: number): Promise<ONTHistory> {
  const response = await api.get<{ success: boolean; data: ONTHistory }>(
    '/api/system/ont/history',
    { params: { hours } }
  )
  return response.data.data
}

export type ONTConfigInput = Omit<ONTConfig, 'password_set'> & {
  password?: string
}

export async function getONTOverview(): Promise<ONTOverview> {
  const response = await api.get<{ success: boolean; data: ONTOverview }>(
    '/api/system/ont'
  )
  return response.data.data
}

export async function saveONTConfig(config: ONTConfigInput): Promise<void> {
  try {
    await api.put('/api/system/ont/settings', config, {
      skipErrorHandler: true,
    })
  } catch {
    // Axios errors contain the request body. Never retain credentials in a
    // mutation error or pass them to the application's console error logger.
    throw new Error(
      'ONT settings could not be saved. Check the settings and server configuration.'
    )
  }
}

export async function refreshONT(): Promise<void> {
  await api.post('/api/system/ont/refresh')
}
