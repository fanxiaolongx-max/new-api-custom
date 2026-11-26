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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'

import { ONTFieldGrid } from '../ont-field-grid'

const pages = [
  {
    path: '/html/bbsp/waninfo/waninfo.asp',
    records: [
      {
        name: 'WAN',
        fields: {
          domain: 'wan.1',
          Name: 'INTERNET',
          ConnectionStatus: 'Connected',
          IPAddress: '203.0.113.12',
          MTU: '1492',
        },
      },
    ],
  },
  {
    path: '/html/amp/ethinfo/ethinfo.asp',
    records: [
      {
        name: 'GEInfo',
        fields: { domain: 'lan.1', Name: 'LAN 1', Status: 'Up', Speed: '1000' },
      },
    ],
  },
]
describe('ONT detail explorer', () => {
  test('category tabs reveal only selected equipment and support keyboard navigation', async () => {
    const user = userEvent.setup()
    render(<ONTFieldGrid pages={pages} />)
    const wan = screen.getByRole('tab', { name: /WAN connections/ })
    expect(wan).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('203.0.113.12')
    expect(screen.getByRole('tabpanel')).not.toHaveTextContent(
      'Ethernet port 1'
    )
    wan.focus()
    await user.keyboard('{ArrowRight}{Enter}')
    expect(screen.getByRole('tab', { name: /Ethernet ports/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Ethernet port 1')
  })
  test('advanced fields stay folded and remain searchable', async () => {
    const user = userEvent.setup()
    render(<ONTFieldGrid pages={pages} />)
    expect(screen.queryByText('1492')).not.toBeInTheDocument()
    await user.click(screen.getByText(/Advanced parameters/))
    expect(await screen.findByText('1492')).toBeVisible()
    await user.type(
      screen.getByRole('textbox', { name: 'Search collected fields' }),
      'MTU'
    )
    expect(await screen.findByText('1492')).toBeVisible()
    expect(
      screen.getByRole('table', { name: 'Key readings' })
    ).not.toHaveTextContent('Connected')
    await user.clear(
      screen.getByRole('textbox', { name: 'Search collected fields' })
    )
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Connected')
  })
  test('large client inventories are paginated and search resets the page', async () => {
    const user = userEvent.setup()
    render(
      <ONTFieldGrid
        pages={[
          {
            path: '/html/bbsp/lanhost/lanhost.asp',
            records: Array.from({ length: 30 }, (_, i) => ({
              name: 'Host',
              fields: {
                domain: `host.${i}`,
                Name: `client-${i}`,
                IPAddress: `192.0.2.${i + 1}`,
              },
            })),
          },
        ]}
      />
    )
    const table = screen.getByRole('table', { name: 'Key readings' })
    expect(within(table).getAllByRole('row')).toHaveLength(9)
    expect(within(table).getByText('client-0')).toBeVisible()
    expect(within(table).queryByText('client-8')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(within(table).getByText('client-8')).toBeVisible()
    await user.type(
      screen.getByRole('textbox', { name: 'Search collected fields' }),
      'client-29'
    )
    expect(within(table).getByText('client-29')).toBeVisible()
  })
  test('WAN counters join their named connection instead of creating duplicate cards', () => {
    render(
      <ONTFieldGrid
        pages={[
          {
            path: '/html/bbsp/waninfo/waninfo.asp',
            records: [
              {
                name: 'WANStats',
                fields: {
                  domain: 'wan.1.Stats',
                  rxBytes: '1024',
                  txBytes: '2048',
                },
              },
              {
                name: 'WANConnection',
                fields: {
                  domain: 'wan.1',
                  Name: 'INTERNET',
                  IPAddress: '203.0.113.9',
                  ConnectionStatus: 'Connected',
                },
              },
            ],
          },
        ]}
      />
    )
    expect(
      screen.getByRole('tab', { name: /WAN connections\s*1/ })
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      within(screen.getByRole('table', { name: 'Key readings' })).getAllByRole(
        'row'
      )
    ).toHaveLength(2)
    expect(
      screen.getByRole('figure', { name: 'Traffic counters' })
    ).toHaveTextContent('1 KiB')
    expect(
      screen.getByRole('table', { name: 'Key readings' })
    ).toHaveTextContent('203.0.113.9')
  })
  test('zero-valued associated-device placeholders do not become real client readings', () => {
    render(
      <ONTFieldGrid
        pages={[
          {
            path: '/html/amp/wlaninfo/wlaninfo.asp',
            records: [
              {
                name: 'stAssociatedDevice',
                fields: {
                  domain: '0',
                  AssociatedDeviceMACAddress: '0',
                  AssociatedDeviceIPAddress: '0',
                  X_HW_RSSI: '0',
                },
              },
            ],
          },
        ]}
      />
    )
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('table', { name: 'Key readings' })
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Advanced parameters/)).toBeVisible()
  })
})
