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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { TemperaturePanel } from '../temperature-panel'

const { getSystemTemperature } = vi.hoisted(() => ({ getSystemTemperature: vi.fn() }))
vi.mock('@/features/dashboard/api', () => ({ getSystemTemperature }))

test('shows warm status and current-sample history when the CPU is hot and history is empty', async () => {
  const user = userEvent.setup()
  getSystemTemperature.mockResolvedValue({ success: true, data: {
    available: true,
    current: { timestamp: 1792418400, time_str: '12:00', cpu: 86, nvme: 0, pch: 0 },
    history: [],
    sensors: [{ name: 'coretemp', label: 'Package id 0', display_name: 'CPU sensor', temp_c: 86, category: 'cpu' }],
  } })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><TemperaturePanel /></QueryClientProvider>)

  expect(await screen.findByText('Warm')).toBeInTheDocument()
  expect(screen.queryByText('No temperature history yet. Recording in progress...')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Sensors/ }))
  expect(screen.getByText('CPU sensor')).toBeInTheDocument()
  client.clear()
})
