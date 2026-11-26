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
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { expect, test } from 'vitest'

import type { ONTPoint, ONTTrafficCounter } from '@/features/dashboard/ont-api'
import {
  calculateONTTraffic,
  ontTrafficService,
  sumONTTraffic,
} from '@/features/dashboard/ont-traffic'
import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'

import { ONTTrafficPanel } from '../ont-traffic-panel'

const counter = (
  rx: string | null,
  tx: string | null,
  category: ONTTrafficCounter['category'] = 'wan'
): ONTTrafficCounter => ({
  id: 'wan.1',
  category,
  name: 'INTERNET',
  service: 'INTERNET',
  source: 'waninfo.asp',
  rx_bytes: rx,
  tx_bytes: tx,
})
const point = (
  timestamp: number,
  traffic: ONTTrafficCounter[],
  collected = true
): ONTPoint => ({
  timestamp,
  traffic,
  collected,
  rx_power: null,
  tx_power: null,
  temperature: null,
  voltage: null,
  bias_current: null,
  online: null,
  internet_ip: '',
  wan: [],
  sources: {},
  events: [],
})

test('traffic deltas retain precision above JavaScript integer range and keep scopes separate', () => {
  const old = point(100, [counter('9223372036854775808', '100')])
  const current = point(400, [
    counter('9223372036854775813', '400'),
    counter('500', '600', 'wlan'),
  ])
  const result = calculateONTTraffic(current, old, 300, 'wan')
  expect(result).toHaveLength(1)
  expect(result[0].rxDelta).toBe(5)
  expect(result[0].txDelta).toBe(300)
  expect(result[0].txRate).toBe(1)
  expect(calculateONTTraffic(current, old, 300, 'wlan')[0].rxDelta).toBeNull()
})

test('reset counters, failed samples and long gaps never produce invented or negative rates', () => {
  const old = point(100, [counter('1000', '2000')])
  const reset = calculateONTTraffic(
    point(400, [counter('10', '20')]),
    old,
    300,
    'wan'
  )[0]
  expect(reset.reset).toBe(true)
  expect(reset.rxRate).toBeNull()
  expect(reset.txRate).toBeNull()
  expect(
    calculateONTTraffic(point(400, [counter(null, '2500')]), old, 300, 'wan')[0]
      .rxRate
  ).toBeNull()
  expect(
    calculateONTTraffic(
      point(1000, [counter('2000', '2500')]),
      old,
      300,
      'wan'
    )[0].txRate
  ).toBeNull()
  expect(
    calculateONTTraffic(
      point(400, [counter('2000', '2500')]),
      { ...old, collected: false },
      300,
      'wan'
    )[0].rxRate
  ).toBeNull()
  expect(sumONTTraffic([0, 0])).toBe(0)
  expect(sumONTTraffic([100, null])).toBeNull()
})

test('service classification uses explicit metadata and does not mistake a device path for Internet', () => {
  expect(ontTrafficService({ ...counter('0', '0'), service: 'TR069' })).toBe(
    'management'
  )
  expect(
    ontTrafficService({ ...counter('0', '0'), service: 'TR069_INTERNET' })
  ).toBe('mixed')
  expect(
    ontTrafficService({
      ...counter('0', '0'),
      service: '',
      name: 'InternetGatewayDevice.WANDevice.1',
    })
  ).toBe('unknown')
  expect(
    ontTrafficService({
      ...counter('0', '0'),
      service: '',
      name: '1_INTERNET_R_VID_35',
    })
  ).toBe('internet')
})

test('traffic panel separates WAN service groups from wireless counters and preserves raw hover identifiers', async () => {
  const user = userEvent.setup()
  const internet = {
    ...counter('1024', '2048'),
    id: 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1',
  }
  const management = {
    ...counter('512', '1024'),
    id: 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANIPConnection.1',
    service: 'TR069',
    name: 'TR069',
  }
  const wifi = {
    ...counter('1000000', '2000000', 'wlan'),
    id: 'wifi.1',
    name: 'Home',
    service: '',
  }
  const instance = createInstance()
  await instance.init({ lng: 'en', resources: { en, zh } })
  render(
    <I18nextProvider i18n={instance}>
      <ONTTrafficPanel
        current={point(400, [internet, management, wifi])}
        history={[
          point(100, [
            { ...internet, rx_bytes: '0', tx_bytes: '0' },
            { ...management, rx_bytes: '0', tx_bytes: '0' },
          ]),
        ]}
        interval={300}
      />
    </I18nextProvider>
  )
  const table = screen.getByRole('table', { name: 'Traffic statistics' })
  expect(within(table).getAllByRole('row')).toHaveLength(3)
  expect(
    screen.getByRole('rowheader', { name: /Internet service/ })
  ).toHaveAttribute('title', expect.stringContaining(internet.id))
  expect(table).toHaveTextContent('Remote management')
  expect(table).not.toHaveTextContent('Home')
  await user.click(screen.getByRole('button', { name: 'Wireless interfaces' }))
  expect(
    screen.getByRole('button', { name: 'Wireless interfaces' })
  ).toHaveAttribute('aria-pressed', 'true')
  expect(table).toHaveTextContent('Home')
  expect(table).not.toHaveTextContent('Remote management')
  expect(table).toHaveTextContent('976.56 KiB')
  expect(
    within(table).getByRole('columnheader', { name: 'Received traffic' })
  ).toBeVisible()
  await act(() => instance.changeLanguage('zh'))
  expect(
    within(table).getByRole('columnheader', { name: '接收流量' })
  ).toBeVisible()
  expect(screen.getByRole('button', { name: '无线接口' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await act(() => instance.changeLanguage('en'))
  expect(
    within(table).getByRole('columnheader', { name: 'Received traffic' })
  ).toBeVisible()
})
