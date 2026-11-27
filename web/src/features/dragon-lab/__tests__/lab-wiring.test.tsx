import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import type { LabLinkStatus } from '../api'
import { LabWiring } from '../components/lab-wiring'

const status: LabLinkStatus = {
  updated: Date.now() / 1000,
  stale: false,
  endpoints: {
    'sw2:GE0/0/1': {
      state: 'down',
      label: 'SW2 GE0/0/1',
      detail: 'GigabitEthernet0/0/1 物理 down',
    },
    'os:enp0s9': {
      state: 'warn',
      label: 'OS enp0s9',
      detail: 'LACP 未协商完成',
    },
  },
  links: { 'sw2-os-a': ['sw2:GE0/0/1', 'os:enp0s9'] },
}

test('each wire end shows its live port state', () => {
  render(<LabWiring authorized status={status} onSelect={() => {}} />)
  expect(
    screen.getByRole('img', { name: 'SW2 GE0/0/1: Port down' })
  ).toHaveClass('is-down')
  expect(
    screen.getByRole('img', { name: 'OS enp0s9: Port degraded' })
  ).toHaveClass('is-warn')
})

test('stale data is shown as unknown instead of the last state', () => {
  render(
    <LabWiring
      authorized
      status={{ ...status, stale: true }}
      onSelect={() => {}}
    />
  )
  expect(
    screen.getByRole('img', { name: 'SW2 GE0/0/1: Port status unknown' })
  ).toHaveClass('is-unknown')
})

test('port state stays hidden from users without lab access', () => {
  render(<LabWiring authorized={false} status={status} onSelect={() => {}} />)
  expect(screen.queryByRole('img')).toBeNull()
})

test('selecting another OS uses its own switch ports and endpoint samples', () => {
  const other: LabLinkStatus = {
    ...status,
    endpoints: {},
    links: { 'sw2-os-a': ['sw2:GE0/0/4', 'os:enp0s9'] },
  }
  render(
    <LabWiring
      authorized
      status={status}
      instanceStatus={other}
      onSelect={() => {}}
    />
  )
  expect(
    screen.getByRole('img', { name: 'sw2:GE0/0/4: Port status unknown' })
  ).toHaveClass('is-unknown')
  expect(
    screen.queryByRole('img', { name: 'SW2 GE0/0/1: Port down' })
  ).toBeNull()
})
