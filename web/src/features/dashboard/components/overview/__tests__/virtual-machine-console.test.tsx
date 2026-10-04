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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { VirtualMachineConsole } from '../virtual-machine-console'

const { getScreenshot, sendMouse } = vi.hoisted(() => ({
  getScreenshot: vi.fn(),
  sendMouse: vi.fn(),
}))

vi.mock('@/features/dashboard/api', () => ({
  getVirtualMachineScreenshot: getScreenshot,
  sendVirtualMachineKeyboard: vi.fn(),
  sendVirtualMachineMouse: sendMouse,
}))

describe('virtual machine pointer control', () => {
  beforeEach(() => {
    getScreenshot.mockResolvedValue(new Blob(['screen'], { type: 'image/png' }))
    sendMouse.mockResolvedValue({ success: true })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:virtual-machine-screen'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
  })

  test('does not send ordinary hover movement and sends a pointer press', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const view = render(
      <QueryClientProvider client={queryClient}>
        <VirtualMachineConsole machineName='winXP' onOpenChange={vi.fn()} />
      </QueryClientProvider>
    )

    const screenImage = await screen.findByAltText('Current screen of winXP')
    Object.defineProperty(screenImage, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperties(screenImage, {
      naturalWidth: { configurable: true, value: 1920 },
      naturalHeight: { configurable: true, value: 1080 },
    })
    vi.spyOn(screenImage, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    fireEvent.pointerMove(screenImage, {
      clientX: 50,
      clientY: 50,
      buttons: 0,
    })
    expect(sendMouse).not.toHaveBeenCalled()

    fireEvent.pointerDown(screenImage, {
      clientX: 50,
      clientY: 50,
      buttons: 1,
      pointerId: 1,
    })
    await waitFor(() => {
      expect(sendMouse).toHaveBeenCalledWith('winXP', {
        x: 961,
        y: 541,
        buttons: 1,
      })
    })

    view.unmount()
    queryClient.clear()
  })

  test('explains that an active RDP session can make the basic console unavailable', async () => {
    getScreenshot.mockRejectedValue(new Error('framebuffer unavailable'))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <VirtualMachineConsole machineName='win7' onOpenChange={vi.fn()} />
      </QueryClientProvider>
    )

    expect(
      await screen.findByText(
        'Unable to load the virtual machine screen',
        {},
        { timeout: 3000 }
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'The VirtualBox display is unavailable. If an RDP session is active, use Remote control or disconnect RDP and retry.'
      )
    ).toBeInTheDocument()

    queryClient.clear()
  })
})
