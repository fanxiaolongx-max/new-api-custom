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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { VirtualMachinesPanel } from '../virtual-machines-panel'

const {
  controlVirtualMachine,
  getVirtualMachineSettings,
  getVirtualMachines,
  updateVirtualMachineSettings,
} = vi.hoisted(() => ({
  controlVirtualMachine: vi.fn(),
  getVirtualMachineSettings: vi.fn(),
  getVirtualMachines: vi.fn(),
  updateVirtualMachineSettings: vi.fn(),
}))

vi.mock('@/features/dashboard/api', () => ({
  controlVirtualMachine,
  getVirtualMachineSettings,
  getVirtualMachines,
  updateVirtualMachineSettings,
  getVirtualMachineScreenshot: vi.fn(),
  sendVirtualMachineKeyboard: vi.fn(),
  sendVirtualMachineMouse: vi.fn(),
}))

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <VirtualMachinesPanel />
    </QueryClientProvider>
  )
  return queryClient
}

describe('virtual machine management', () => {
  beforeEach(() => {
    getVirtualMachines.mockResolvedValue({
      success: true,
      data: [
        {
          name: 'win7',
          state: 'saved',
          os_type: 'Windows 7 (64-bit)',
          memory_mb: 2048,
          cpu_count: 2,
        },
        {
          name: 'win11',
          state: 'running',
          os_type: 'Windows 11 (64-bit)',
          memory_mb: 4096,
          cpu_count: 2,
        },
        {
          name: 'feiniu',
          state: 'saved',
          os_type: 'Fedora (64-bit)',
          memory_mb: 2048,
          cpu_count: 2,
        },
      ],
    })
    controlVirtualMachine.mockResolvedValue({ success: true })
    getVirtualMachineSettings.mockResolvedValue({
      success: true,
      data: { idle_save_minutes: 30 },
    })
    updateVirtualMachineSettings.mockResolvedValue({
      success: true,
      data: { idle_save_minutes: 45 },
    })
  })

  test('offers start only for stopped machines and remote control for running machines', async () => {
    const queryClient = renderPanel()

    expect(await screen.findByText('win7')).toBeInTheDocument()
    expect(screen.getByText('win11')).toBeInTheDocument()
    const win7Row = screen.getByText('win7').closest('article')
    if (!win7Row) throw new Error('win7 row not found')
    expect(
      within(win7Row).getByRole('button', { name: 'Start' })
    ).toBeInTheDocument()
    const feiniuRow = screen.getByText('feiniu').closest('article')
    if (!feiniuRow) throw new Error('feiniu row not found')
    expect(within(feiniuRow).getByText('Saved')).toBeInTheDocument()
    expect(
      within(feiniuRow).queryByRole('button', { name: 'Start' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remote control' })
    ).toBeInTheDocument()

    queryClient.clear()
  })

  test('requires confirmation before forcing a running machine off', async () => {
    const user = userEvent.setup()
    const queryClient = renderPanel()

    await screen.findByText('win11')
    await user.click(screen.getByRole('button', { name: 'Force power off' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(controlVirtualMachine).not.toHaveBeenCalled()

    const confirmButtons = screen.getAllByRole('button', {
      name: 'Force power off',
    })
    const confirmButton = confirmButtons.at(-1)
    if (!confirmButton) throw new Error('confirmation button not found')
    await user.click(confirmButton)
    expect(controlVirtualMachine).toHaveBeenCalledWith('win11', 'poweroff')

    queryClient.clear()
  })

  test('updates the inactivity timeout immediately', async () => {
    const user = userEvent.setup()
    const queryClient = renderPanel()

    const input = await screen.findByRole('spinbutton', {
      name: 'Inactivity timeout (minutes)',
    })
    await user.clear(input)
    await user.type(input, '45')
    await user.click(screen.getByRole('button', { name: 'Save timeout' }))

    expect(updateVirtualMachineSettings).toHaveBeenCalledWith({
      idle_save_minutes: 45,
    })

    queryClient.clear()
  })

  test.each([
    ['win7', 'Windows 7 (64-bit)', '/guacamole/#/client/MQBjAHBvc3RncmVzcWw'],
    ['winXP', 'Windows XP (32-bit)', '/guacamole/#/client/MgBjAHBvc3RncmVzcWw'],
    ['win11', 'Windows 11 (64-bit)', '/guacamole/#/client/MwBjAHBvc3RncmVzcWw'],
  ])(
    'offers the direct RDP console and keeps the basic console for %s',
    async (name, osType, rdpPath) => {
      getVirtualMachines.mockResolvedValue({
        success: true,
        data: [
          {
            name,
            state: 'running',
            os_type: osType,
            memory_mb: 2048,
            cpu_count: 2,
          },
        ],
      })
      const queryClient = renderPanel()

      const machineRow = (await screen.findByText(name)).closest('article')
      if (!machineRow) throw new Error(`${name} row not found`)
      const remoteLink = within(machineRow).getByRole('button', {
        name: 'Remote control',
      })
      expect(remoteLink.tagName).toBe('A')
      expect(remoteLink).toHaveAttribute('href', rdpPath)
      expect(remoteLink).toHaveAttribute('target', '_blank')
      expect(
        within(machineRow).getByRole('button', { name: 'Basic console mode' })
      ).toBeInTheDocument()

      queryClient.clear()
    }
  )
})
