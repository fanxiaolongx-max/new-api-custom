import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { HostCameraPanel } from '../host-camera-panel'

vi.mock('@/lib/api', () => ({
  getFreshAuthHeaders: vi
    .fn()
    .mockResolvedValue({ Authorization: 'Bearer test' }),
}))

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('host camera', () => {
  test('automatically connects with audio muted and stops capture when requested', async () => {
    let media: EventTarget | undefined
    const registerMedia = (instance: EventTarget) => {
      media = instance
    }
    class FakeMediaSource extends EventTarget {
      constructor() {
        super()
        registerMedia(this)
      }
      static isTypeSupported() {
        return true
      }
    }
    const fetch = vi.fn().mockImplementation(() => new Promise(() => {}))
    vi.stubGlobal('MediaSource', FakeMediaSource)
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, {
        createObjectURL: vi.fn().mockReturnValue('blob:camera'),
        revokeObjectURL: vi.fn(),
      })
    )
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<HostCameraPanel />)
    const video = screen.getByLabelText(
      'Live camera and microphone'
    ) as HTMLVideoElement
    expect(video.muted).toBe(true)
    act(() => media?.dispatchEvent(new Event('sourceopen')))
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    const request = fetch.mock.calls[0]
    expect(request[0]).toBe('/api/system/camera/stream')
    const signal = request[1].signal as AbortSignal
    await user.click(screen.getByRole('button', { name: 'Stop' }))
    expect(signal.aborted).toBe(true)
    expect(
      screen.getByText('Camera and microphone are off')
    ).toBeInTheDocument()
    expect(
      screen.queryByLabelText('Live camera and microphone')
    ).not.toBeInTheDocument()
  })

  test('retries automatically after a temporary camera conflict', async () => {
    vi.useFakeTimers()
    let media: EventTarget | undefined
    const registerMedia = (instance: EventTarget) => {
      media = instance
    }
    class FakeMediaSource extends EventTarget {
      constructor() {
        super()
        registerMedia(this)
      }
      static isTypeSupported() {
        return true
      }
    }
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409 })
      .mockImplementationOnce(() => new Promise(() => {}))
    vi.stubGlobal('MediaSource', FakeMediaSource)
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, {
        createObjectURL: vi.fn().mockReturnValue('blob:camera'),
        revokeObjectURL: vi.fn(),
      })
    )
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    render(<HostCameraPanel />)
    await act(async () => {
      media?.dispatchEvent(new Event('sourceopen'))
      await Promise.resolve()
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    await act(async () => {
      media?.dispatchEvent(new Event('sourceopen'))
      await Promise.resolve()
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Connecting to camera…')).toBeInTheDocument()
  })

  test('shows an error and can be stopped when streaming is unsupported', async () => {
    vi.stubGlobal('MediaSource', undefined)
    const user = userEvent.setup()
    render(<HostCameraPanel />)
    expect(
      screen.getByText('Camera or microphone unavailable')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stop' }))
    expect(
      screen.getByText('Camera and microphone are off')
    ).toBeInTheDocument()
  })
})
