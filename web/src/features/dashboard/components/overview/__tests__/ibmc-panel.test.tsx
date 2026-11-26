import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi, beforeEach } from 'vitest'

import type { IBMCStatus } from '@/features/dashboard/ibmc-api'

import IBMCPanel from '../ibmc-panel'

const mocks = vi.hoisted(() => ({ getIBMC: vi.fn(), controlIBMC: vi.fn() }))
vi.mock('@/features/dashboard/ibmc-api', () => mocks)

const vm: IBMCStatus = {
  name: 'openEuler',
  simulation: true,
  state: 'running',
  uuid: 'test-vm',
  memory_mb: 2048,
  cpu_count: 2,
  firmware: 'BIOS',
  os: 'openEuler',
  state_changed: '',
  boot: ['disk', 'none'],
  nic: 'nat',
  mac: '123456',
  serial: true,
  serial_busy: false,
  uid: false,
  alarm: 'normal',
  media: [],
  mounted_media: 'none',
  snapshots: [],
  events: [],
  inventory: {},
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const result = render(
    <QueryClientProvider client={client}>
      <IBMCPanel onClose={vi.fn()} />
    </QueryClientProvider>
  )
  return { ...result, client }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getIBMC.mockResolvedValue(vm)
  mocks.controlIBMC.mockResolvedValue({})
})
describe('virtual iBMC', () => {
  test('running VM disables offline-only changes while keeping serial tab accessible', async () => {
    const { client } = setup()
    await screen.findByText('test-vm')
    await userEvent.click(screen.getByRole('tab', { name: 'Power and boot' }))
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset VM' })).toBeEnabled()
    expect(
      screen.getByRole('tab', { name: 'Serial console (SOL)' })
    ).toBeEnabled()
    client.clear()
  })
  test('forced power off requires confirmation and cancel leaves VM untouched', async () => {
    const { client } = setup()
    await screen.findByText('test-vm')
    await userEvent.click(screen.getByRole('tab', { name: 'Power and boot' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Force power off' })
    )
    expect(mocks.controlIBMC).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mocks.controlIBMC).not.toHaveBeenCalled()
    await userEvent.click(
      screen.getByRole('button', { name: 'Force power off' })
    )
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(mocks.controlIBMC).toHaveBeenCalledWith(
        { action: 'poweroff' },
        expect.anything()
      )
    )
    client.clear()
  })
  test('unavailable agent presents retry and does not offer stale power controls', async () => {
    mocks.getIBMC.mockRejectedValue(new Error('offline'))
    const { client } = setup()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'iBMC agent is unavailable'
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'Start' })
    ).not.toBeInTheDocument()
    client.clear()
  })
  test('powered off guest explains why SSH is disabled and links to power controls', async () => {
    mocks.getIBMC.mockResolvedValue({ ...vm, state: 'poweroff' })
    const { client } = setup()
    await screen.findByText('test-vm')
    await userEvent.click(screen.getByRole('tab', { name: 'Remote control' }))
    expect(
      screen.getByText('Start the VM in Power and boot before opening SSH.')
    ).toBeInTheDocument()
    const link = screen.getByRole('button', { name: 'Open terminal' })
    expect(link).toHaveAttribute('aria-disabled', 'true')
    client.clear()
  })
  test('offline VM without ISO images disables mount and allows boot configuration', async () => {
    mocks.getIBMC.mockResolvedValue({ ...vm, state: 'poweroff' })
    const { client } = setup()
    await screen.findByText('test-vm')
    await userEvent.click(screen.getByRole('tab', { name: 'Virtual media' }))
    expect(screen.getByRole('button', { name: 'Mount ISO' })).toBeDisabled()
    await userEvent.click(screen.getByRole('tab', { name: 'Power and boot' }))
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Reset VM' })).toBeDisabled()
    client.clear()
  })
})
