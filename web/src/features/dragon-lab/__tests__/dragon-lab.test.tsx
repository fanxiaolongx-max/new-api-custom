import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { DragonLab } from '..'
import { labConsoleURL, type LabConfig } from '../api'

const mocks = vi.hoisted(() => ({
  getLabConfig: vi.fn(),
  saveLabConfig: vi.fn(),
  getLabTool: vi.fn(),
  getVirtualMachines: vi.fn(),
  getIBMC: vi.fn(),
}))
vi.mock('../api', async () => ({
  ...(await vi.importActual('../api')),
  getLabConfig: mocks.getLabConfig,
  saveLabConfig: mocks.saveLabConfig,
  getLabTool: mocks.getLabTool,
}))
vi.mock('@/features/dashboard/api', () => ({
  getVirtualMachines: mocks.getVirtualMachines,
}))
vi.mock('@/features/dashboard/ibmc-api', () => ({ getIBMC: mocks.getIBMC }))
vi.mock('@/features/dashboard/components/overview/ibmc-serial', () => ({
  default: () => <div aria-label='Existing COM1 console' />,
}))
vi.mock('@/components/layout', () => ({
  PublicLayout: (props: { children: React.ReactNode }) => props.children,
}))
vi.mock('@/components/layout/components/footer', () => ({
  Footer: () => null,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a {...props} href={props.to} />
  ),
}))

const fixture: LabConfig = {
  nodes: [
    {
      id: 'pc',
      address: '62.2.90.164',
      gateway: '',
      console_id: 1,
      console_mode: 'remote',
    },
    {
      id: 'sw1',
      address: '192.168.56.254/24',
      gateway: '',
      console_id: 7,
      console_mode: 'remote',
    },
    {
      id: 'sw2',
      address: '60.11.40.1',
      gateway: '',
      console_id: 0,
      console_mode: 'pending',
    },
    {
      id: 'ibmc',
      address: '192.168.2.100 → 8.35.155.29',
      gateway: '',
      console_id: 0,
      console_mode: 'sol',
    },
    {
      id: 'os',
      address: '60.11.42.99/19',
      gateway: '60.11.40.1',
      console_id: 6,
      console_mode: 'remote',
    },
  ],
  links: [
    'pc-sw1',
    'sw1-ibmc',
    'pc-sw2',
    'sw2-os-a',
    'sw2-os-b',
    'ibmc-os',
  ].map((id) => ({
    id,
    source_port: 'GE0/0/2',
    target_port: 'enp0s9',
    source_address: '192.168.56.10',
    target_address: '60.11.42.99/19',
    vlan: '10',
    phase: 'planned',
  })) as LabConfig['links'],
}
function setup(role = 100, labAccess = false, desktop = false) {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'lab-admin',
    role,
    permissions: {
      admin_permissions: { dragon_lab: { full: labAccess, desktop } },
    },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <DragonLab />
    </QueryClientProvider>
  )
  return { ...view, client }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getLabConfig.mockResolvedValue(structuredClone(fixture))
  mocks.saveLabConfig.mockResolvedValue(fixture)
  mocks.getLabTool.mockResolvedValue(
    '<html><script>window.example = true</script><body>Tool</body></html>'
  )
  mocks.getVirtualMachines.mockResolvedValue({
    success: true,
    data: [
      { name: 'win7', state: 'running' },
      { name: 'openEuler', state: 'running' },
    ],
  })
  mocks.getIBMC.mockResolvedValue({ serial: true })
})
afterEach(() => useAuthStore.getState().auth.reset())
describe('Dragon Lab topology', () => {
  test('unprivileged visitors see no addresses or live consoles and make no private requests', async () => {
    const { client } = setup(10)
    expect(screen.getByText('Dragon Lab')).toBeInTheDocument()
    expect(screen.queryByText('62.2.90.164')).not.toBeInTheDocument()
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
    expect(mocks.getLabConfig).not.toHaveBeenCalled()
    expect(mocks.getVirtualMachines).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Configure topology' })
    ).toBeDisabled()
    client.clear()
  })
  test('delegated administrator can configure the lab and load its live consoles without becoming Root', async () => {
    const { client } = setup(10, true)
    await screen.findByText('62.2.90.164')
    expect(
      screen.getByRole('button', { name: 'Configure topology' })
    ).toBeEnabled()
    await waitFor(() =>
      expect(
        document.querySelectorAll('iframe.lab-console-frame')
      ).toHaveLength(3)
    )
    expect(useAuthStore.getState().auth.user?.role).toBe(10)
    client.clear()
  })
  test('a delegated user sees the Debian desktop shortcut only with its separate permission', async () => {
    const first = setup(10, true)
    await screen.findByText('62.2.90.164')
    expect(screen.queryByRole('button', { name: 'Debian desktop' })).toBeNull()
    first.unmount()
    first.client.clear()
    const second = setup(10, true, true)
    const desktop = await screen.findByRole('button', {
      name: 'Debian desktop',
    })
    expect(desktop).toHaveAttribute(
      'href',
      '/guacamole/#/client/NQBjAHBvc3RncmVzcWw'
    )
    expect(desktop).toHaveAttribute('target', '_blank')
    second.client.clear()
  })
  test('administrator sees all bound consoles automatically and pending SW2 is not shown as online', async () => {
    const { client } = setup()
    await screen.findByText('62.2.90.164')
    await waitFor(() =>
      expect(
        document.querySelectorAll('iframe.lab-console-frame')
      ).toHaveLength(3)
    )
    expect(
      await screen.findByLabelText('Existing COM1 console')
    ).toBeInTheDocument()
    const pending = screen.getByRole('article', {
      name: 'SW2 · business switch',
    })
    expect(within(pending).getByText('Awaiting setup')).toBeInTheDocument()
    expect(within(pending).queryByRole('iframe')).not.toBeInTheDocument()
    client.clear()
  })
  test('pausing live views disconnects all embedded consoles without sending VM power commands', async () => {
    const { client } = setup()
    await screen.findByText('62.2.90.164')
    await userEvent.click(
      screen.getByRole('button', { name: 'Pause live views' })
    )
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
    expect(
      screen.queryByLabelText('Existing COM1 console')
    ).not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Resume live views' })
    )
    await waitFor(() =>
      expect(
        document.querySelectorAll('iframe.lab-console-frame')
      ).toHaveLength(3)
    )
    client.clear()
  })
  test('expanding a console opens an in-page window and closing restores the same live session and focus', async () => {
    const { client } = setup()
    const frame = await screen.findByTitle(
      'Device console: Operations & installation PC'
    )
    const expand = screen.getByRole('button', {
      name: 'Expand console: Operations & installation PC',
    })
    await userEvent.click(expand)
    const floating = screen.getByRole('dialog', {
      name: 'Operations & installation PC',
    })
    expect(
      within(floating).getByTitle(
        'Device console: Operations & installation PC'
      )
    ).toBe(frame)
    expect(
      within(floating).getByRole('button', {
        name: 'Restore thumbnail: Operations & installation PC',
      })
    ).toHaveAttribute('aria-expanded', 'true')
    expect(document.querySelectorAll('iframe.lab-console-frame')).toHaveLength(
      3
    )
    await userEvent.click(
      within(floating).getByRole('button', { name: 'Close' })
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByTitle('Device console: Operations & installation PC')
    ).toBe(frame)
    expect(expand).toHaveFocus()
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    client.clear()
  })
  test('configuration failure shows recovery guidance without creating live sessions', async () => {
    mocks.getLabConfig.mockRejectedValueOnce(new Error('unavailable'))
    const { client } = setup()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Some lab data is unavailable'
    )
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
    expect(
      screen.getByRole('button', { name: 'Configure topology' })
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
    client.clear()
  })
  test('stopped hosting VMs suppress their remote and serial consoles', async () => {
    mocks.getVirtualMachines.mockResolvedValueOnce({
      success: true,
      data: [
        { name: 'win7', state: 'powered_off' },
        { name: 'openEuler', state: 'powered_off' },
      ],
    })
    const { client } = setup()
    await screen.findByText('62.2.90.164')
    await waitFor(() =>
      expect(
        screen.getAllByText(
          'Virtual machine is not running. Start it before opening the console.'
        )
      ).toHaveLength(3)
    )
    expect(document.querySelectorAll('iframe.lab-console-frame')).toHaveLength(
      1
    )
    expect(
      screen.queryByLabelText('Existing COM1 console')
    ).not.toBeInTheDocument()
    client.clear()
  })
  test('link selection exposes both port names and addresses', async () => {
    const { client } = setup()
    await screen.findByText('62.2.90.164')
    await userEvent.click(
      screen.getByRole('button', { name: 'Link details: LACP member A' })
    )
    const detail = screen.getByRole('region', { name: 'Selected link' })
    expect(detail).toHaveTextContent('GE0/0/2')
    expect(detail).toHaveTextContent('192.168.56.10')
    expect(detail).toHaveTextContent('enp0s9')
    expect(detail).toHaveTextContent('60.11.42.99/19')
    await userEvent.keyboard('{Escape}')
    expect(
      screen.queryByRole('region', { name: 'Selected link' })
    ).not.toBeInTheDocument()
    client.clear()
  })
  test('script tool uses a sandbox without access to the parent application origin', async () => {
    const { client } = setup()
    await screen.findByText('62.2.90.164')
    await userEvent.click(
      screen.getByRole('button', { name: 'Script workbench' })
    )
    await screen.findByRole('dialog')
    await waitFor(() => expect(mocks.getLabTool).toHaveBeenCalled())
    const frame = await screen.findByTitle('Isolated TaiSha script generator')
    expect(frame).toHaveAttribute(
      'sandbox',
      'allow-scripts allow-forms allow-downloads allow-modals'
    )
    expect(frame).not.toHaveAttribute('src')
    client.clear()
  })
  test('saved plan edits change only the submitted draft and keep original configuration intact', async () => {
    const { client } = setup()
    await screen.findByText('62.2.90.164')
    await userEvent.click(
      screen.getByRole('button', { name: 'Configure topology' })
    )
    const field = (
      await screen.findAllByLabelText('Planned address', {}, { timeout: 5000 })
    )[0]
    await userEvent.clear(field)
    await userEvent.type(field, '62.2.90.165')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(mocks.saveLabConfig).toHaveBeenCalled())
    expect(mocks.saveLabConfig.mock.calls[0][0].nodes[0].address).toBe(
      '62.2.90.165'
    )
    expect(fixture.nodes[0].address).toBe('62.2.90.164')
    client.clear()
  })
})
test('console URLs are restricted to numeric registered Guacamole connections', () => {
  expect(labConsoleURL(1)).toBe('/guacamole/#/client/MQBjAHBvc3RncmVzcWw')
  expect(labConsoleURL(0)).toBe('')
  expect(labConsoleURL(-1)).toBe('')
  expect(labConsoleURL(1.2)).toBe('')
  expect(labConsoleURL(Number.NaN)).toBe('')
})

test('iBMC management and OS serial are separate interactive tabs and expansion preserves the management frame', async () => {
  mocks.getLabConfig.mockResolvedValueOnce({
    ...fixture,
    nodes: fixture.nodes.map((node) =>
      node.id === 'ibmc'
        ? { ...node, console_mode: 'remote', console_id: 9 }
        : node
    ),
  })
  const { client } = setup()
  const frame = await screen.findByTitle(
    'Device console: iBMC · management plane'
  )
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Expand console: iBMC · management plane',
    })
  )
  expect(screen.getByTitle('Device console: iBMC · management plane')).toBe(
    frame
  )
  await userEvent.click(screen.getByRole('tab', { name: 'OS serial console' }))
  expect(await screen.findByLabelText('Existing COM1 console')).toBeVisible()
  await userEvent.click(
    screen.getByRole('tab', { name: 'Management terminal' })
  )
  expect(screen.getByTitle('Device console: iBMC · management plane')).toBe(
    frame
  )
  client.clear()
})
