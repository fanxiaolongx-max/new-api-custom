import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { LAB_KEY, type LabConfig } from '../api'
import LabTool from '../components/lab-tool'

const mocks = vi.hoisted(() => ({
  getLabTool: vi.fn(),
  saveLabConfig: vi.fn(),
}))
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...mocks,
}))
const config: LabConfig = {
  workbench_url: 'https://workbench.example/t/session',
  nodes: [],
  links: [],
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Harness() {
    const [open, setOpen] = useState(true)
    const query = useQuery({
      queryKey: LAB_KEY,
      queryFn: async () => config,
      initialData: config,
      staleTime: Infinity,
    })
    return open ? (
      <LabTool config={query.data} onClose={() => setOpen(false)} />
    ) : (
      <p>Workbench closed</p>
    )
  }
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>
  )
  return client
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getLabTool.mockResolvedValue('<p>Bundled tool</p>')
  mocks.saveLabConfig.mockImplementation(async (value: LabConfig) => value)
})
afterEach(() => vi.restoreAllMocks())
test('external workbench preserves its own storage, suppresses referrers and closes its frame after opening a separate tab', async () => {
  const tab = { opener: window }
  const open = vi.spyOn(window, 'open').mockReturnValue(tab as Window)
  setup()
  const frame = screen.getByTitle('Script workbench')
  expect(frame).toHaveAttribute('src', config.workbench_url)
  expect(frame).toHaveAttribute(
    'sandbox',
    expect.stringContaining('allow-same-origin')
  )
  expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
  expect(mocks.getLabTool).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Open in new tab' }))
  expect(open).toHaveBeenCalledWith(config.workbench_url, '_blank')
  expect(tab.opener).toBeNull()
  expect(screen.queryByTitle('Script workbench')).not.toBeInTheDocument()
  expect(screen.getByText('Workbench closed')).toBeVisible()
})
test('a blocked popup leaves the embedded workbench open', async () => {
  vi.spyOn(window, 'open').mockReturnValue(null)
  setup()
  await userEvent.click(screen.getByRole('button', { name: 'Open in new tab' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Allow pop-ups')
  expect(screen.getByTitle('Script workbench')).toBeVisible()
})
test('saving an edited address updates the iframe and preserves the rest of the lab configuration', async () => {
  setup()
  await userEvent.click(
    screen.getByRole('button', { name: 'Workbench address' })
  )
  const input = screen.getByLabelText('Workbench address')
  await userEvent.clear(input)
  await userEvent.type(input, 'https://new.example/tool')
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() =>
    expect(screen.getByTitle('Script workbench')).toHaveAttribute(
      'src',
      'https://new.example/tool'
    )
  )
  expect(mocks.saveLabConfig.mock.calls[0][0]).toEqual({
    ...config,
    workbench_url: 'https://new.example/tool',
  })
})
test('clearing the address restores the opaque bundled HTML sandbox', async () => {
  setup()
  await userEvent.click(
    screen.getByRole('button', { name: 'Workbench address' })
  )
  await userEvent.clear(screen.getByLabelText('Workbench address'))
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  const frame = await screen.findByTitle('Isolated TaiSha script generator')
  expect(frame).toHaveAttribute(
    'sandbox',
    'allow-scripts allow-forms allow-downloads allow-modals'
  )
  expect(frame).not.toHaveAttribute('src')
  expect(screen.getByRole('button', { name: 'Open in new tab' })).toBeDisabled()
})

test('hiding the workbench preserves the same live iframe instead of restarting the workflow', () => {
  const client = new QueryClient()
  const close = vi.fn()
  const { rerender } = render(
    <QueryClientProvider client={client}>
      <LabTool config={config} open onClose={close} />
    </QueryClientProvider>
  )
  const frame = screen.getByTitle('Script workbench')
  rerender(
    <QueryClientProvider client={client}>
      <LabTool config={config} open={false} onClose={close} />
    </QueryClientProvider>
  )
  expect(screen.getByTitle('Script workbench')).toBe(frame)
  expect(frame.closest('section')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
