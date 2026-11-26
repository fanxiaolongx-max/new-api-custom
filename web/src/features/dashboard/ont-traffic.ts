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
import type { ONTPoint, ONTTrafficCounter } from './ont-api'

export type ONTTrafficScope = ONTTrafficCounter['category']
export type ONTTrafficService =
  | 'internet'
  | 'management'
  | 'voice'
  | 'iptv'
  | 'mixed'
  | 'unknown'
export interface ONTTrafficReading {
  counter: ONTTrafficCounter
  rx: number | null
  tx: number | null
  rxDelta: number | null
  txDelta: number | null
  rxRate: number | null
  txRate: number | null
  reset: boolean
}

export function ontTrafficService(
  counter: ONTTrafficCounter
): ONTTrafficService {
  const service = (counter.service || counter.name).toUpperCase()
  const found: ONTTrafficService[] = []
  if (/(?:^|[_ ,+])INTERNET(?:$|[_ ,+])/.test(service)) found.push('internet')
  if (/(?:^|[_ ,+])TR-?069(?:$|[_ ,+])/.test(service)) found.push('management')
  if (/(?:^|[_ ,+])(?:VOICE|VOIP)(?:$|[_ ,+])/.test(service)) {
    found.push('voice')
  }
  if (/(?:^|[_ ,+])IPTV(?:$|[_ ,+])/.test(service)) found.push('iptv')
  if (found.length > 1) return 'mixed'
  return found[0] || 'unknown'
}

function ontCounter(value: string | null | undefined): bigint | null {
  if (value == null || !/^\d+$/.test(value)) return null
  const parsed = BigInt(value)
  return parsed <= 18446744073709551615n ? parsed : null
}

export function calculateONTTraffic(
  current: ONTPoint | undefined,
  previous: ONTPoint | undefined,
  interval: number,
  scope: ONTTrafficScope
): ONTTrafficReading[] {
  const elapsed =
    current && previous ? current.timestamp - previous.timestamp : 0
  const comparable = Boolean(
    current?.collected &&
    previous?.collected &&
    elapsed > 0 &&
    elapsed <= interval * 2 + 30
  )
  const old = new Map(
    (previous?.traffic ?? [])
      .filter((counter) => counter.category === scope)
      .map((counter) => [counter.id, counter])
  )
  const seen = new Set<string>()
  return (current?.traffic ?? [])
    .filter((counter) => {
      if (counter.category !== scope || seen.has(counter.id)) return false
      seen.add(counter.id)
      return true
    })
    .map((counter) => {
      const before = old.get(counter.id)
      const rx = ontCounter(counter.rx_bytes),
        tx = ontCounter(counter.tx_bytes)
      const oldRx = ontCounter(before?.rx_bytes),
        oldTx = ontCounter(before?.tx_bytes)
      const reset =
        comparable &&
        Boolean(
          (rx !== null && oldRx !== null && rx < oldRx) ||
          (tx !== null && oldTx !== null && tx < oldTx)
        )
      const rxDelta =
        comparable && !reset && rx !== null && oldRx !== null
          ? Number(rx - oldRx)
          : null
      const txDelta =
        comparable && !reset && tx !== null && oldTx !== null
          ? Number(tx - oldTx)
          : null
      return {
        counter,
        rx: rx === null ? null : Number(rx),
        tx: tx === null ? null : Number(tx),
        rxDelta,
        txDelta,
        rxRate: rxDelta === null ? null : rxDelta / elapsed,
        txRate: txDelta === null ? null : txDelta / elapsed,
        reset,
      }
    })
}

export function sumONTTraffic(values: (number | null)[]): number | null {
  return values.length && values.every((value) => value !== null)
    ? values.reduce<number>((total, value) => total + (value ?? 0), 0)
    : null
}

export function formatONTBytes(
  value: number | null | undefined,
  locale: string
): string {
  if (value == null || !Number.isFinite(value) || value < 0) return '—'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB']
  const unit = Math.min(
    units.length - 1,
    Math.max(0, Math.floor(Math.log2(Math.max(1, value)) / 10))
  )
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value / 1024 ** unit)} ${units[unit]}`
}
