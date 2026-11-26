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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance, type i18n } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { ONTOverview } from '@/features/dashboard/ont-api'

import { ONTMonitorPanel } from '../ont-monitor-panel'

const { getONTOverview, getONTHistory, saveONTConfig, refreshONT } = vi.hoisted(
  () => ({
    getONTOverview: vi.fn(),
    getONTHistory: vi.fn(),
    saveONTConfig: vi.fn(),
    refreshONT: vi.fn(),
  })
)
vi.mock('@/features/dashboard/ont-api', () => ({
  getONTOverview,
  getONTHistory,
  saveONTConfig,
  refreshONT,
}))

const disabled: ONTOverview = {
  config: {
    address: 'https://192.168.100.1',
    username: '',
    password_set: false,
    enabled: false,
    insecure_tls: false,
    interval_seconds: 300,
  },
  state: 'disabled',
  pages: [],
  last_success: 0,
  last_attempt: 0,
  next_poll: 0,
}

function renderPanel(
  data: ONTOverview | Error = disabled,
  languageInstance?: i18n
) {
  if (data instanceof Error) getONTOverview.mockRejectedValue(data)
  else getONTOverview.mockResolvedValue(data)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      {languageInstance ? (
        <I18nextProvider i18n={languageInstance}>
          <ONTMonitorPanel />
        </I18nextProvider>
      ) : (
        <ONTMonitorPanel />
      )}
    </QueryClientProvider>
  )
  return client
}

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  const button = screen.getByRole('button', { name: 'Configure ONT' })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
}

beforeEach(() => {
  vi.resetAllMocks()
  saveONTConfig.mockResolvedValue(undefined)
  refreshONT.mockResolvedValue(undefined)
  getONTHistory.mockResolvedValue({
    points: [],
    events: [],
    total_samples: 0,
    retention_days: 30,
    downsampled: false,
  })
})

describe('ONT monitoring', () => {
  test.each(['zhCN', 'zhTW'])(
    'enabled monitoring renders nonzero collection times in %s without crashing the console',
    async (language) => {
      const instance = createInstance()
      await instance.init({
        lng: language,
        fallbackLng: 'en',
        resources: { en: { translation: {} } },
      })
      const client = renderPanel(
        {
          ...disabled,
          config: { ...disabled.config, enabled: true },
          state: 'collecting',
          last_attempt: 1795116750,
          next_poll: 1795117050,
        },
        instance
      )
      const lastAttempt = await screen.findByText('Last attempt')
      expect(lastAttempt.nextElementSibling).toHaveTextContent('2026')
      expect(
        screen.getByText('Next poll').nextElementSibling
      ).toHaveTextContent('2026')
      expect(screen.getByRole('region', { name: 'ONT monitor' })).toBeVisible()
      expect(screen.getByText('Collecting')).toBeVisible()
      client.clear()
    }
  )
  test('disabled monitoring shows setup instructions and prevents collection', async () => {
    const client = renderPanel()
    expect(
      await screen.findByText(
        'Configure the router login and enable monitoring to start collecting status and configuration.'
      )
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Refresh ONT status' })
    ).toBeDisabled()
    client.clear()
  })

  test('enabling monitoring requires credentials before saving', async () => {
    const user = userEvent.setup()
    const client = renderPanel()
    await openSettings(user)
    await user.click(
      screen.getByRole('switch', { name: 'Enable ONT monitoring' })
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Enter a username')).toBeVisible()
    expect(screen.getByText('Enter a password')).toBeVisible()
    expect(screen.getByLabelText('Username')).toHaveAttribute(
      'aria-invalid',
      'true'
    )
    expect(saveONTConfig).not.toHaveBeenCalled()
    client.clear()
  })

  test('editing an interval keeps the saved password and does not populate it in the form', async () => {
    const user = userEvent.setup()
    const client = renderPanel({
      ...disabled,
      config: {
        ...disabled.config,
        enabled: true,
        username: 'admin',
        password_set: true,
      },
    })
    await openSettings(user)
    expect(screen.getByLabelText('Password')).toHaveValue('')
    const interval = screen.getByLabelText('Polling interval (seconds)')
    await user.clear(interval)
    await user.type(interval, '600')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(saveONTConfig).toHaveBeenCalledWith(
        expect.objectContaining({ interval_seconds: 600, password: undefined })
      )
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    client.clear()
  })

  test('failed credential save clears the password and shows an actionable error', async () => {
    const user = userEvent.setup()
    saveONTConfig.mockRejectedValueOnce(new Error('request failed'))
    const client = renderPanel()
    await openSettings(user)
    await user.type(screen.getByLabelText('Password'), 'test-only-password')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ONT settings could not be saved.'
    )
    expect(screen.getByLabelText('Password')).toHaveValue('')
    client.clear()
  })

  test('an interval below the minimum is rejected without sending credentials', async () => {
    const user = userEvent.setup()
    const client = renderPanel()
    await openSettings(user)
    const interval = screen.getByLabelText('Polling interval (seconds)')
    await user.clear(interval)
    await user.type(interval, '10')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(
      await screen.findByText('Polling interval must be 60–86400 seconds')
    ).toBeVisible()
    expect(interval).toHaveAttribute('aria-invalid', 'true')
    expect(saveONTConfig).not.toHaveBeenCalled()
    client.clear()
  })

  test('login failures retain the last snapshot and prevent refresh during backoff', async () => {
    const client = renderPanel({
      ...disabled,
      config: { ...disabled.config, enabled: true },
      state: 'error',
      error: 'login_busy',
      last_success: 100,
      next_poll: 4102444800,
      pages: [
        {
          path: '/html/amp/opticinfo/opticinfo.asp',
          records: [{ name: 'Optics', fields: { RxPower: '-21.3 dBm' } }],
        },
      ],
    })
    expect(
      await screen.findByText(
        'ONT session limit reached. Sign out of the router web page and wait for the next poll.'
      )
    ).toBeVisible()
    expect(
      screen.getByText(
        'Showing the last successful data. The latest collection failed.'
      )
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Refresh ONT status' })
    ).toBeDisabled()
    expect(screen.getAllByText('-21.3 dBm')[0]).toBeVisible()
    client.clear()
  })

  test('failed initial load offers a retry that can recover to the configuration card', async () => {
    const client = renderPanel(new Error('offline'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load ONT monitoring.'
    )
    getONTOverview.mockResolvedValue(disabled)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Configure ONT' })
      ).toBeEnabled()
    )
    client.clear()
  })

  test('detailed equipment is grouped in category tabs while monitoring remains visible', async () => {
    const client = renderPanel({
      ...disabled,
      config: { ...disabled.config, enabled: true },
      pages: [
        {
          path: '/html/ssmp/deviceinfo/deviceinfo.asp',
          records: [
            {
              name: 'Device',
              fields: { SerialNumber: 'HW-SERIAL-123', Uptime: '86400' },
            },
          ],
        },
        {
          path: '/html/amp/opticinfo/opticinfo.asp',
          records: [
            {
              name: 'Optics',
              fields: { RxPower: '-22.37 dBm', Temperature: '39.2 C' },
            },
          ],
        },
        {
          path: '/html/amp/wlaninfo/wlaninfo.asp',
          records: [
            {
              name: 'WLAN',
              fields: { SSID: 'Dragon WiFi', AssociatedDeviceNumber: '4' },
            },
          ],
        },
      ],
    })
    const dynamic = await screen.findByRole('region', {
      name: 'Live monitoring',
    })
    const configuration = screen.getByRole('region', {
      name: 'Device configuration',
    })
    expect(dynamic).toBeVisible()
    await userEvent.click(
      screen.getByRole('tab', { name: /Optical transceiver/ })
    )
    expect(configuration).toHaveTextContent('-22.37 dBm')
    expect(
      screen.getByRole('tab', { name: /Optical transceiver/ })
    ).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(
      screen.getByRole('tab', { name: /Device information/ })
    )
    expect(configuration).toHaveTextContent('HW-SERIAL-123')
    expect(configuration).toHaveTextContent('1d 0h 0m')
    await userEvent.click(screen.getByRole('tab', { name: /Wireless network/ }))
    expect(configuration).toHaveTextContent('Dragon WiFi')
    expect(
      screen
        .getByText(/Collection coverage.*0\/3|Collection coverage.*3\/3/)
        .closest('details')
    ).not.toHaveAttribute('open')
    client.clear()
  })

  test('changing the history window loads that range and displays marked events with their evidence', async () => {
    const user = userEvent.setup()
    getONTHistory.mockResolvedValue({
      points: [],
      events: [
        {
          id: 'ip-1',
          timestamp: 1795116750,
          kind: 'ip_changed',
          severity: 'info',
          connection: 'INTERNET',
          previous: '203.0.113.1',
          current: '203.0.113.2',
        },
      ],
      total_samples: 12,
      retention_days: 30,
      downsampled: false,
    })
    const client = renderPanel({
      ...disabled,
      config: { ...disabled.config, enabled: true },
    })
    expect(await screen.findByText('WAN IP changed')).toBeVisible()
    expect(screen.getByText('203.0.113.1')).toBeVisible()
    expect(screen.getByText('203.0.113.2')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '7 days' }))
    await waitFor(() => expect(getONTHistory).toHaveBeenCalledWith(168))
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    client.clear()
  })
})
