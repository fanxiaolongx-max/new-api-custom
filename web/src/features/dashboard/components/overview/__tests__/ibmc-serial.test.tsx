import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import IBMCSerial from '../ibmc-serial'

const mocks = vi.hoisted(() => ({
  serialIBMC: vi.fn(),
  readIBMCSerial: vi.fn(),
  write: vi.fn(),
  dispose: vi.fn(),
  onData: vi.fn(),
  focus: vi.fn(),
  input: vi.fn(),
}))
vi.mock('@/features/dashboard/ibmc-api', () => mocks)
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    options = { fontSize: 13 }
    open() {}
    focus = mocks.focus
    input = mocks.input
    onData = mocks.onData
    write = mocks.write
    dispose = mocks.dispose
  },
}))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.onData.mockReturnValue({ dispose: vi.fn() })
  mocks.serialIBMC.mockImplementation((request: { operation: string }) =>
    Promise.resolve(
      request.operation === 'open' ? { session: 'lease-1', cursor: 5 } : {}
    )
  )
  mocks.readIBMCSerial.mockResolvedValue({
    data: btoa('login:'),
    cursor: 11,
    truncated: false,
  })
})
describe('iBMC serial session', () => {
  test('connect forwards received bytes without submitting a command and unmount releases the lease', async () => {
    const { unmount } = render(<IBMCSerial />)
    expect(mocks.serialIBMC).not.toHaveBeenCalled()
    await userEvent.click(
      screen.getByRole('button', { name: 'Connect serial console' })
    )
    await screen.findByRole('button', { name: 'Disconnect' })
    await waitFor(() =>
      expect([...(mocks.write.mock.calls[0]?.[0] ?? [])]).toEqual([
        108, 111, 103, 105, 110, 58,
      ])
    )
    expect(mocks.readIBMCSerial).toHaveBeenCalledWith('lease-1', 5)
    expect(mocks.serialIBMC).not.toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'write' })
    )
    unmount()
    await waitFor(() =>
      expect(mocks.serialIBMC).toHaveBeenCalledWith({
        operation: 'close',
        session: 'lease-1',
      })
    )
    expect(mocks.dispose).toHaveBeenCalled()
  })
  test('automatic compact preview opens a session without sending a command and releases it when paused', async () => {
    const { unmount } = render(<IBMCSerial autoConnect compact />)
    await screen.findByRole('button', { name: 'Disconnect' })
    expect(mocks.serialIBMC).toHaveBeenCalledWith({ operation: 'open' })
    expect(mocks.serialIBMC).not.toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'write' })
    )
    unmount()
    await waitFor(() =>
      expect(mocks.serialIBMC).toHaveBeenCalledWith({
        operation: 'close',
        session: 'lease-1',
      })
    )
  })
  test('busy serial port shows recoverable error and re-enables connection', async () => {
    mocks.serialIBMC.mockRejectedValueOnce(new Error('busy'))
    render(<IBMCSerial />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Connect serial console' })
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Serial connection failed or is busy'
    )
    expect(
      screen.getByRole('button', { name: 'Connect serial console' })
    ).toBeEnabled()
  })
})

test('compact serial accepts pointer focus and forwards UTF-8 and control keys as exact bytes', async () => {
  render(<IBMCSerial autoConnect compact autoLogin />)
  await screen.findByRole('button', { name: 'Disconnect' })
  expect(mocks.serialIBMC).toHaveBeenCalledWith({
    operation: 'open',
    auto_login: true,
  })
  mocks.focus.mockClear()
  fireEvent.pointerDown(screen.getByLabelText('Serial terminal'))
  expect(mocks.focus).toHaveBeenCalledOnce()
  mocks.onData.mock.calls[0][0]('中文\x03\r')
  await waitFor(() =>
    expect(mocks.serialIBMC).toHaveBeenCalledWith({
      operation: 'write',
      session: 'lease-1',
      data: btoa(
        String.fromCharCode(...new TextEncoder().encode('中文\x03\r'))
      ),
    })
  )
  await userEvent.click(screen.getByRole('button', { name: 'Send Enter' }))
  expect(mocks.input).toHaveBeenCalledWith('\r', true)
})
