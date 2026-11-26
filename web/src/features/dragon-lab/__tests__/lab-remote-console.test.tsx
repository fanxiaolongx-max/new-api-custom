import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { LabRemoteConsole } from '../components/lab-remote-console'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('a small card scales a desktop-sized live viewport and resizing keeps the same iframe', () => {
  let width = 512
  let height = 210
  let resize: () => void = () => {}
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    () => width
  )
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
    () => height
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback
      }
      observe() {}
      disconnect() {}
    }
  )
  const { unmount } = render(
    <LabRemoteConsole
      src='/guacamole/#/client/MQBjAHBvc3RncmVzcWw'
      title='PC console'
    />
  )
  const frame = screen.getByTitle('PC console')
  expect(frame).toHaveStyle({
    width: '1280px',
    height: '525px',
    transform: 'scale(0.4)',
  })
  expect(frame).not.toHaveAttribute('tabindex', '-1')
  width = 1600
  height = 800
  act(resize)
  expect(screen.getByTitle('PC console')).toBe(frame)
  expect(frame).toHaveStyle({
    width: '1600px',
    height: '800px',
    transform: 'scale(1)',
  })
  width = 512
  height = 210
  act(resize)
  expect(screen.getByTitle('PC console')).toBe(frame)
  expect(frame).toHaveStyle({ transform: 'scale(0.4)' })
  unmount()
  vi.unstubAllGlobals()
})
