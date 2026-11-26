import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { LabFactoryReset } from '../components/lab-factory-reset'

const mocks = vi.hoisted(() => ({ factoryResetLab: vi.fn() }))
vi.mock('../api', async () => ({
  ...(await vi.importActual('../api')),
  factoryResetLab: mocks.factoryResetLab,
}))

function renderReset() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <LabFactoryReset />
    </QueryClientProvider>
  )
}

async function openAndConfirm() {
  const user = userEvent.setup()
  renderReset()
  await user.click(screen.getByRole('button', { name: 'Factory reset' }))
  const dialog = screen.getByRole('alertdialog')
  await user.click(
    within(dialog).getByRole('button', { name: 'Factory reset' })
  )
  return dialog
}

describe('lab factory reset', () => {
  beforeEach(() => mocks.factoryResetLab.mockReset())

  test('asks for confirmation before resetting anything', async () => {
    const user = userEvent.setup()
    renderReset()
    await user.click(screen.getByRole('button', { name: 'Factory reset' }))
    expect(
      screen.getByText('Restore the whole lab to factory state?')
    ).toBeInTheDocument()
    expect(mocks.factoryResetLab).not.toHaveBeenCalled()
  })

  test('shows a progress bar while the reset is running', async () => {
    let finish: (value: { ok: boolean; log: string }) => void = () => {}
    mocks.factoryResetLab.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const dialog = await openAndConfirm()
    expect(
      within(dialog).getByRole('progressbar', {
        name: 'Factory reset progress',
      })
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Resetting...' })
    ).toBeDisabled()
    finish({ ok: true, log: 'RESET_OK' })
    expect(
      await within(dialog).findByText('Factory reset succeeded')
    ).toBeInTheDocument()
  })

  test('ends with an explicit success result and a Done button', async () => {
    mocks.factoryResetLab.mockResolvedValue({
      ok: true,
      log: '[1/3] SW1 ... OK\nRESET_OK',
    })
    const dialog = await openAndConfirm()
    expect(
      await within(dialog).findByText('Factory reset succeeded')
    ).toBeInTheDocument()
    expect(within(dialog).getByText(/RESET_OK/)).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Done' })
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: 'Factory reset' })
    ).not.toBeInTheDocument()
  })

  test('ends with an explicit failure result', async () => {
    mocks.factoryResetLab.mockResolvedValue({
      ok: false,
      log: 'FAIL SW1 port state\nRESET_FAIL',
    })
    const dialog = await openAndConfirm()
    expect(
      await within(dialog).findByText('Factory reset failed')
    ).toBeInTheDocument()
  })
})
