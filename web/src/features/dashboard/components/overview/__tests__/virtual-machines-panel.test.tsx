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
import { act, render, screen, waitFor, within } from '@testing-library/react'
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

const kindleScreenGet = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ api: { get: kindleScreenGet } }))

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
  test('offers Kindle screen and its separate SSH terminal', async () => {
    const queryClient = renderPanel()
    const row = (await screen.findByText('Kindle')).closest('article')
    if (!row) throw new Error('Kindle row not found')
    expect(
      within(row).getByRole('button', { name: 'View screen' })
    ).toBeInTheDocument()
    expect(
      within(row).getByRole('button', { name: 'Open terminal' })
    ).toHaveAttribute(
      'href',
      '/kindle-terminal/#/client/a2luZGxlAGMAa2luZGxlLXRlcm1pbmFs'
    )
    queryClient.clear()
  })

  test('shows an error when the opened Kindle screen is unavailable', async () => {
    kindleScreenGet.mockRejectedValueOnce(new Error('offline'))
    const queryClient = renderPanel()
    const row = (await screen.findByText('Kindle')).closest('article')
    if (!row) throw new Error('Kindle row not found')
    await userEvent.click(
      within(row).getByRole('button', { name: 'View screen' })
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load the Kindle screen'
    )
    expect(kindleScreenGet).toHaveBeenCalledWith(
      '/api/system/kindle/screen',
      expect.any(Object)
    )
    queryClient.clear()
  })
  test('offers mafuli a separate system terminal without virtual machine power controls', async () => {
    const queryClient = renderPanel()
    const row = (await screen.findByText('mafuli')).closest('article')
    if (!row) throw new Error('mafuli row not found')

    expect(within(row).getByText('SSH terminal')).toBeInTheDocument()
    const terminal = within(row).getByRole('button', { name: 'Open terminal' })
    expect(terminal).toHaveAttribute(
      'href',
      '/terminal/#/client/bWFmdWxpAGMAZGViaWFuLXRlcm1pbmFs'
    )
    expect(terminal).toHaveAttribute('target', '_blank')
    expect(
      within(row).queryByRole('button', { name: 'Shut down' })
    ).not.toBeInTheDocument()
    expect(within(row).queryByText('Running')).not.toBeInTheDocument()
    queryClient.clear()
  })

  test('opens the openEuler SSH workspace when the VM is running', async () => {
    getVirtualMachines.mockResolvedValueOnce({
      success: true,
      data: [
        {
          name: 'openEuler',
          state: 'running',
          os_type: 'Oracle Linux (64-bit)',
          memory_mb: 2048,
          cpu_count: 2,
        },
      ],
    })
    const queryClient = renderPanel()
    const row = (await screen.findByText('openEuler')).closest('article')
    if (!row) throw new Error('openEuler row not found')
    expect(
      within(row).getByRole('button', { name: 'Remote control' })
    ).toHaveAttribute('href', '/guacamole/#/client/NgBjAHBvc3RncmVzcWw')
    queryClient.clear()
  })

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

  test('opens the Debian host desktop even while the virtual machine list is loading', () => {
    getVirtualMachines.mockReturnValue(new Promise(() => {}))
    const queryClient = renderPanel()

    const desktop = screen.getByRole('button', { name: 'Debian desktop' })
    expect(desktop).toHaveAttribute(
      'href',
      '/guacamole/#/client/NQBjAHBvc3RncmVzcWw'
    )
    expect(desktop).toHaveAttribute('target', '_blank')
    expect(desktop).toHaveAttribute('rel', 'noreferrer')
    expect(desktop.parentElement).toHaveClass('flex-wrap')
    expect(desktop).not.toBeDisabled()
    expect(controlVirtualMachine).not.toHaveBeenCalled()

    queryClient.clear()
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

  test('opens running feiniu in the web SSH terminal and keeps the basic console available', async () => {
    const user = userEvent.setup()
    getVirtualMachines.mockResolvedValue({
      success: true,
      data: [
        {
          name: 'feiniu',
          state: 'running',
          os_type: 'Fedora (64-bit)',
          memory_mb: 2048,
          cpu_count: 2,
        },
      ],
    })
    const queryClient = renderPanel()
    const row = (await screen.findByText('feiniu')).closest('article')
    if (!row) throw new Error('feiniu row not found')

    const remoteControl = within(row).getByRole('button', {
      name: 'Remote control',
    })
    expect(remoteControl).toHaveAttribute(
      'href',
      '/guacamole/#/client/NABjAHBvc3RncmVzcWw'
    )
    expect(remoteControl).toHaveAttribute('target', '_blank')
    await user.click(
      within(row).getByRole('button', { name: 'Basic console mode' })
    )
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Remote console: feiniu'
    )
    expect(controlVirtualMachine).not.toHaveBeenCalled()

    queryClient.clear()
  })

  test('shows loading instead of an empty machine list while the first request is pending', async () => {
    let finishLoading!: (result: { success: boolean; data: [] }) => void
    const request = new Promise<{ success: boolean; data: [] }>((resolve) => {
      finishLoading = resolve
    })
    getVirtualMachines.mockReturnValue(request)
    const queryClient = renderPanel()

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(
      screen.queryByText('No managed virtual machines were found.')
    ).not.toBeInTheDocument()

    await act(async () => finishLoading({ success: true, data: [] }))

    expect(
      await screen.findByText('No managed virtual machines were found.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
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

  test('shows restore progress before Start and blocks duplicate commands until completion', async () => {
    const user = userEvent.setup()
    let finishCommand!: (result: { success: boolean }) => void
    const command = new Promise<{ success: boolean }>((resolve) => {
      finishCommand = resolve
    })
    controlVirtualMachine.mockReturnValue(command)
    const queryClient = renderPanel()
    const row = (await screen.findByText('win7')).closest('article')
    if (!row) throw new Error('win7 row not found')
    const start = within(row).getByRole('button', { name: 'Start' })

    await user.click(start)

    const progress = within(row).getByRole('progressbar', {
      name: 'Restoring saved state…',
    })
    expect(progress).not.toHaveAttribute('aria-valuenow')
    expect(
      progress.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(start).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Shut down' })).toBeDisabled()
    await user.click(start)
    expect(controlVirtualMachine).toHaveBeenCalledTimes(1)

    getVirtualMachines.mockResolvedValue({
      success: true,
      data: [
        {
          name: 'win7',
          state: 'restoring',
          os_type: 'Windows 7 (64-bit)',
          memory_mb: 2048,
          cpu_count: 2,
        },
      ],
    })
    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: ['system', 'virtual-machines'],
        exact: true,
      })
    })
    expect(within(row).getByRole('button', { name: 'Start' })).toBeDisabled()
    expect(within(row).getByRole('progressbar')).toBeInTheDocument()
    expect(within(row).queryByText('Unknown')).not.toBeInTheDocument()

    getVirtualMachines.mockResolvedValue({
      success: true,
      data: [
        {
          name: 'win7',
          state: 'running',
          os_type: 'Windows 7 (64-bit)',
          memory_mb: 2048,
          cpu_count: 2,
        },
      ],
    })

    await act(async () => finishCommand({ success: true }))
    await waitFor(() =>
      expect(within(row).queryByRole('progressbar')).not.toBeInTheDocument()
    )
    expect(
      within(row).queryByRole('button', { name: 'Start' })
    ).not.toBeInTheDocument()
    expect(
      within(row).getByRole('button', { name: 'Remote control' })
    ).toBeInTheDocument()
    queryClient.clear()
  })

  test('refreshes actual state after a timeout and shows uncertainty instead of claiming boot failure', async () => {
    const user = userEvent.setup()
    let failCommand!: (error: Error) => void
    const command = new Promise<{ success: boolean }>((_, reject) => {
      failCommand = reject
    })
    controlVirtualMachine.mockReturnValue(command)
    const queryClient = renderPanel()
    const row = (await screen.findByText('win7')).closest('article')
    if (!row) throw new Error('win7 row not found')
    await user.click(within(row).getByRole('button', { name: 'Start' }))
    getVirtualMachines.mockResolvedValue({
      success: true,
      data: [
        {
          name: 'win7',
          state: 'running',
          os_type: 'Windows 7 (64-bit)',
          memory_mb: 2048,
          cpu_count: 2,
        },
      ],
    })

    await act(async () => failCommand(new Error('timeout')))

    expect(await within(row).findByRole('alert')).toHaveTextContent(
      'Command response failed. Refresh to confirm the virtual machine state.'
    )
    expect(await within(row).findByText('Running')).toBeInTheDocument()
    expect(within(row).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(
      within(row).getByRole('button', { name: 'Remote control' })
    ).toBeInTheDocument()
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
