import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { LabInfo } from '../components/lab-info'

vi.mock('@/hooks/use-status', () => ({ useStatus: () => ({ status: {} }) }))
vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'Dragon API',
    footerHtml: '',
    demoSiteEnabled: false,
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: (props: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a {...props} href={props.to} />
  ),
}))
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('information stays closed on load and remains available on demand with project attribution', async () => {
  const onCompact = vi.fn()
  render(<LabInfo onCompact={onCompact} />)
  const button = screen.getByRole('button', { name: 'Lab information' })
  expect(button).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('region', { name: 'Lab information' })).toBeNull()
  expect(screen.getByRole('link', { name: 'New API' })).toBeVisible()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(8000)
  })
  expect(button).toHaveAttribute('aria-expanded', 'false')
  await act(async () => {
    fireEvent.click(button)
    await vi.advanceTimersByTimeAsync(200)
  })
  expect(button).toHaveAttribute('aria-expanded', 'true')
  expect(
    within(screen.getByRole('region', { name: 'Lab information' })).getByRole(
      'link',
      { name: 'New API' }
    )
  ).toHaveAttribute('href', 'https://github.com/QuantumNous/new-api')
})
test('reading the information pauses automatic collapse', async () => {
  const onCompact = vi.fn()
  render(<LabInfo onCompact={onCompact} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Lab information' }))
    await vi.advanceTimersByTimeAsync(200)
  })
  fireEvent.pointerEnter(
    screen.getByRole('region', { name: 'Lab information' })
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(8000)
  })
  expect(
    screen.getByRole('button', { name: 'Lab information' })
  ).toHaveAttribute('aria-expanded', 'true')
  expect(onCompact).not.toHaveBeenCalled()
})
