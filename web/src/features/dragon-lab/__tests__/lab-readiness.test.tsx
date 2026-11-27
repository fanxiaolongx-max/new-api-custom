import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { LabReadiness } from '../components/lab-readiness'
import { taskFixture } from './workbench-task-fixture'

test('quick actions appear only after handshake and mirror remote availability', async () => {
  const onAction = vi.fn()
  const props = { authorized: true, onTool: vi.fn(), onAction }
  const view = render(<LabReadiness {...props} />)
  expect(
    screen.queryByRole('button', { name: /Check connectivity/ })
  ).toBeNull()
  view.rerender(
    <LabReadiness
      {...props}
      workbench={{
        buttons: {
          reach: true,
          dryrun: true,
          selected: true,
          stage1: true,
          stage2: true,
          stop: false,
        },
        counts: {
          total: 1,
          running: 0,
          pass: 0,
          warn: 0,
          fail: 0,
          terminals: 0,
        },
      }}
    />
  )
  expect(
    screen.getByRole('button', { name: /Stop and release terminals/ })
  ).toBeDisabled()
  await userEvent.click(
    screen.getByRole('button', { name: /Check connectivity/ })
  )
  expect(onAction).toHaveBeenCalledExactlyOnceWith('reach')
  view.rerender(<LabReadiness {...props} />)
  expect(
    screen.queryByRole('button', { name: /Check connectivity/ })
  ).toBeNull()
})

test('the active button shows real progress and failure remains at the executed steps with its reason', async () => {
  const props = { authorized: true, onTool: vi.fn(), onAction: vi.fn() }
  const workbench = {
    taskAPI: true,
    buttons: {
      reach: true,
      dryrun: true,
      selected: true,
      stage1: true,
      stage2: true,
      stop: true,
    },
    counts: { total: 1, running: 1, pass: 0, warn: 0, fail: 0, terminals: 1 },
  }
  const view = render(
    <LabReadiness {...props} workbench={{ ...workbench, task: taskFixture }} />
  )
  expect(
    screen.getByRole('progressbar', { name: 'Run stage 1 (iBMC)' })
  ).toHaveAttribute('aria-valuenow', '33')
  expect(
    screen.getByRole('button', { name: 'Run stage 1 (iBMC)' })
  ).toBeDisabled()
  view.rerender(
    <LabReadiness
      {...props}
      workbench={{
        ...workbench,
        task: {
          ...taskFixture,
          status: 'failed',
          message: 'SSH connection timed out',
          progress: { completed: 6, total: 6, percent: 100 },
          checks: [
            {
              target: 'SW1',
              check: 'ssh',
              status: 'failed',
              message: 'SSH connection timed out',
            },
            ...Array.from({ length: 5 }, () => ({
              target: 'Node-01',
              check: 'config',
              status: 'skipped',
              message: 'Skipped',
            })),
          ],
        },
      }}
    />
  )
  expect(
    screen.getByRole('progressbar', { name: 'Run stage 1 (iBMC)' })
  ).toHaveAttribute('aria-valuenow', '17')
  expect(screen.getByRole('alert')).toHaveTextContent(
    'SSH connection timed out'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Task logs' }))
  const log = screen.getByRole('dialog', { name: 'Task logs' })
  expect(log).toHaveTextContent('FAIL · SW1 · ssh')
  expect(log).toHaveTextContent('SKIP · Node-01 · config')
  expect(props.onAction).not.toHaveBeenCalled()
})

test('unknown stop progress has no percentage, and disconnect does not report a device failure', () => {
  render(
    <LabReadiness
      authorized
      onTool={vi.fn()}
      connected={false}
      workbench={{
        taskAPI: true,
        buttons: {
          reach: false,
          dryrun: false,
          selected: false,
          stage1: false,
          stage2: false,
          stop: false,
        },
        counts: {
          total: 1,
          running: 1,
          pass: 0,
          warn: 0,
          fail: 0,
          terminals: 1,
        },
        task: {
          ...taskFixture,
          status: 'stopping',
          phase: 'stopping',
          progress: { completed: 0, total: null, percent: null },
        },
      }}
    />
  )
  expect(
    screen.getByRole('progressbar', { name: 'Stop and release terminals' })
  ).not.toHaveAttribute('aria-valuenow')
  expect(
    screen.getByText('Connection lost. Task status is unknown; reconnecting.')
  ).toBeInTheDocument()
  expect(screen.queryByRole('alert')).toBeNull()
})

test('provisioned nodes can be imported into and removed from the workbench, and actions name their hosts', async () => {
  const onImport = vi.fn()
  const onDismiss = vi.fn()
  const onRemove = vi.fn()
  render(
    <LabReadiness
      authorized
      onTool={vi.fn()}
      newHosts={['Node-02']}
      onImport={onImport}
      onDismiss={onDismiss}
      scope={['Node-01', 'Node-02']}
      removable={['Node-02']}
      onRemove={onRemove}
      workbench={{
        buttons: {
          reach: true,
          dryrun: true,
          selected: true,
          stage1: true,
          stage2: true,
          stop: false,
        },
        counts: {
          total: 2,
          running: 0,
          pass: 0,
          warn: 0,
          fail: 0,
          terminals: 0,
        },
      }}
    />
  )
  expect(screen.getByText('Applies to:')).toHaveTextContent(
    'Applies to:Node-01Node-02'
  )
  // Only provisioned guests can be removed; Node-01 has no remove control.
  expect(
    screen.queryByRole('button', { name: 'Remove Node-01 from the workbench' })
  ).toBeNull()
  await userEvent.click(
    screen.getByRole('button', { name: 'Remove Node-02 from the workbench' })
  )
  expect(onRemove).toHaveBeenCalledExactlyOnceWith('Node-02')
  await userEvent.click(screen.getByRole('button', { name: 'Add to lab' }))
  expect(onImport).toHaveBeenCalledExactlyOnceWith('Node-02')
  await userEvent.click(screen.getByRole('button', { name: 'Later' }))
  expect(onDismiss).toHaveBeenCalledExactlyOnceWith('Node-02')
})
