import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { LabNode } from '../components/lab-node'
import { LAB_NODES } from '../topology'
import { readExecutionTerminals } from '../workbench-terminals'

const terminal = {
  nodeId: 'os' as const,
  sessionId: 'pty-1',
  runId: 'run-1',
  seq: 1,
  text: '<script>text only</script>\n[root@os]# ip addr',
  status: 'running' as const,
  redacted: true,
}

test('only bounded, redacted streams from known nodes enter the execution view', () => {
  expect(
    readExecutionTerminals([
      terminal,
      { ...terminal, nodeId: 'sw1', redacted: false },
      { ...terminal, nodeId: 'unknown' },
      { ...terminal, nodeId: 'pc', text: 'x'.repeat(16001) },
    ])
  ).toHaveLength(1)
  expect(
    readExecutionTerminals([{ ...terminal, text: '\x1b[32mOK\x1b[0m' }])[0].text
  ).toBe('OK')
})

test('a node defaults to read-only execution and keeps the interactive session when switching and expanding', async () => {
  const definition = LAB_NODES.find((node) => node.id === 'os')
  if (!definition) throw new Error('Missing OS node')
  const props = {
    definition,
    config: {
      id: 'os' as const,
      address: '60.11.42.99',
      gateway: '',
      console_id: 6,
      console_mode: 'remote' as const,
    },
    authorized: true,
    paused: false,
    serialReady: false,
    onConfigure: vi.fn(),
    expanded: false,
    onExpandedChange: vi.fn(),
    execution: { terminal, connected: true, available: true },
  }
  const view = render(<LabNode {...props} />)
  expect(screen.getByLabelText('Execution output')).toHaveTextContent(
    '[root@os]# ip addr'
  )
  expect(document.querySelector('script')).toBeNull()
  expect(document.querySelector('iframe')).toBeNull()
  await userEvent.click(screen.getByRole('tab', { name: 'Manual terminal' }))
  const frame = screen.getByTitle('Device console: TaiShan OS · openEuler')
  expect(frame).toHaveAttribute('src', expect.stringContaining('/guacamole/'))
  await userEvent.click(screen.getByRole('tab', { name: 'Execution feed' }))
  view.rerender(
    <LabNode
      {...props}
      expanded
      execution={{
        ...props.execution,
        terminal: { ...terminal, seq: 2, text: 'next command' },
      }}
    />
  )
  expect(screen.getByLabelText('Execution output')).toHaveTextContent(
    'next command'
  )
  await userEvent.click(screen.getByRole('tab', { name: 'Manual terminal' }))
  expect(screen.getByTitle('Device console: TaiShan OS · openEuler')).toBe(
    frame
  )
})

test('an idle node defaults to manual access and explains a missing feed when selected', async () => {
  render(
    <LabNode
      definition={LAB_NODES[0]}
      authorized
      paused={false}
      serialReady={false}
      expanded={false}
      onExpandedChange={vi.fn()}
      onConfigure={vi.fn()}
      execution={{ connected: true, available: false }}
    />
  )
  expect(screen.getByRole('tab', { name: 'Manual terminal' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await userEvent.click(screen.getByRole('tab', { name: 'Execution feed' }))
  expect(
    screen.getByText('The workbench terminal feed is not connected yet.')
  ).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Manual terminal' })).toBeEnabled()
})

test('execution automatically takes over an idle thumbnail and returns to the same manual session when finished', async () => {
  const definition = LAB_NODES.find((node) => node.id === 'os')
  if (!definition) throw new Error('Missing OS node')
  const props = {
    definition,
    config: {
      id: 'os' as const,
      address: '60.11.42.99',
      gateway: '',
      console_id: 6,
      console_mode: 'remote' as const,
    },
    authorized: true,
    paused: false,
    serialReady: false,
    onConfigure: vi.fn(),
    expanded: false,
    onExpandedChange: vi.fn(),
  }
  const execution = {
    connected: true,
    available: true,
    active: false,
    terminal,
  }
  const view = render(<LabNode {...props} execution={execution} />)
  const frame = screen.getByTitle('Device console: TaiShan OS · openEuler')
  expect(screen.getByRole('tab', { name: 'Manual terminal' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  view.rerender(
    <LabNode {...props} execution={{ ...execution, active: true }} />
  )
  expect(screen.getByRole('tab', { name: 'Execution feed' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await userEvent.click(screen.getByRole('tab', { name: 'Manual terminal' }))
  view.rerender(
    <LabNode
      {...props}
      execution={{
        ...execution,
        active: true,
        terminal: { ...terminal, seq: 2, text: 'more output' },
      }}
    />
  )
  expect(screen.getByRole('tab', { name: 'Manual terminal' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await userEvent.click(screen.getByRole('tab', { name: 'Execution feed' }))
  view.rerender(<LabNode {...props} execution={execution} />)
  expect(screen.getByRole('tab', { name: 'Manual terminal' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(screen.getByTitle('Device console: TaiShan OS · openEuler')).toBe(
    frame
  )
})
