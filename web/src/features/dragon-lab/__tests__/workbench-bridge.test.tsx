import { readFileSync } from 'node:fs'
import vm from 'node:vm'

import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { useWorkbenchBridge } from '../use-workbench-bridge'
import { taskFixture } from './workbench-task-fixture'

const buttons = {
  reach: true,
  dryrun: true,
  selected: true,
  stage1: true,
  stage2: true,
  stop: false,
}
const counts = { total: 1, running: 0, pass: 0, warn: 0, fail: 0, terminals: 0 }
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
test('only the configured frame, origin and handshake enable actions; commands are sent once and acknowledged', () => {
  const iframe = document.createElement('iframe')
  document.body.append(iframe)
  const child = iframe.contentWindow
  if (!child) throw new Error('Missing iframe window')
  const frame = { current: iframe }
  const post = vi.spyOn(child, 'postMessage').mockImplementation(() => {})
  const hook = renderHook(() =>
    useWorkbenchBridge({ frame, url: 'https://workbench.example/t/test' })
  )
  const channel = post.mock.calls[0][0].channel
  const state = {
    source: 'taisha-workbench',
    version: 1,
    type: 'state',
    taskAPI: true,
    channel,
    buttons,
    counts,
  }
  const deliver = (
    data: object,
    origin = 'https://workbench.example',
    source: Window = child
  ) =>
    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', { data, origin, source })
      )
    )
  expect(post.mock.calls.every((call) => call[0].type === 'hello')).toBe(true)
  deliver(state, 'https://attacker.example')
  deliver(state, 'https://workbench.example', window)
  deliver({ ...state, channel: 'wrong-channel' })
  expect(hook.result.current.state).toBeNull()
  deliver(state)
  expect(hook.result.current.state?.counts.total).toBe(1)
  act(() => {
    hook.result.current.run('selected')
    hook.result.current.run('selected')
  })
  const commands = post.mock.calls.filter((call) => call[0].type === 'action')
  expect(commands).toHaveLength(1)
  expect(commands[0][0].action).toBe('selected')
  expect(commands[0][1]).toBe('https://workbench.example')
  expect(hook.result.current.pending).toBe(true)
  deliver({
    source: 'taisha-workbench',
    version: 1,
    type: 'ack',
    channel,
    id: commands[0][0].id,
    accepted: true,
  })
  expect(hook.result.current.pending).toBe(false)
  act(() => hook.result.current.run('reach'))
  const rejected = post.mock.calls.at(-1)?.[0]
  deliver({
    source: 'taisha-workbench',
    version: 1,
    type: 'ack',
    channel,
    id: rejected.id,
    accepted: false,
  })
  deliver(state)
  expect(hook.result.current.error).toBe('rejected')
  act(() => hook.result.current.loaded())
  expect(hook.result.current.state).toBeNull()
  deliver(state)
  expect(hook.result.current.state).toBeNull()
  hook.unmount()
  iframe.remove()
})
test('lost heartbeats remove stale controls and never start tasks automatically', () => {
  vi.useFakeTimers()
  const iframe = document.createElement('iframe')
  document.body.append(iframe)
  const child = iframe.contentWindow
  if (!child) throw new Error('Missing iframe window')
  const frame = { current: iframe }
  const post = vi.spyOn(child, 'postMessage').mockImplementation(() => {})
  const hook = renderHook(() =>
    useWorkbenchBridge({ frame, url: 'https://workbench.example/t/test' })
  )
  const channel = post.mock.calls[0][0].channel
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://workbench.example',
        source: child,
        data: {
          source: 'taisha-workbench',
          version: 1,
          type: 'state',
          taskAPI: true,
          channel,
          buttons,
          counts,
        },
      })
    )
  )
  expect(hook.result.current.state).not.toBeNull()
  act(() => vi.advanceTimersByTime(10000))
  expect(hook.result.current.state).not.toBeNull()
  expect(hook.result.current.connected).toBe(false)
  expect(post.mock.calls.every((call) => call[0].type === 'hello')).toBe(true)
  hook.unmount()
  iframe.remove()
})
test('cs bridge invokes the task API once, streams snapshots, rejects invalid actions and discloses no passwords', async () => {
  const parent = { postMessage: vi.fn() }
  let listener: (event: unknown) => void | Promise<void> = () => {}
  let subscriber = () => {}
  const api = {
    run: vi.fn(async () => ({ runId: taskFixture.runId })),
    getTerminalSnapshot: vi.fn(() => ({
      streams: [
        {
          nodeId: 'os',
          sessionId: 'pty-1',
          runId: 'run-1',
          seq: 1,
          text: 'safe output',
          redacted: true,
          status: 'running',
          password: 'never-disclose-this-password',
        },
        {
          nodeId: 'sw1',
          text: 'never-disclose-this-password',
          redacted: false,
        },
      ],
    })),
    subscribeTerminals: vi.fn(() => vi.fn()),
    getSnapshot: vi.fn(() => ({
      ...taskFixture,
      password: 'never-disclose-this-password',
    })),
    subscribe: vi.fn((callback: () => void) => {
      subscriber = callback
      return vi.fn()
    }),
  }
  const nodes: Record<
    string,
    {
      disabled?: boolean
      click?: ReturnType<typeof vi.fn>
      textContent?: string
      value?: string
    }
  > = { dcJumpPass: { value: 'never-disclose-this-password' } }
  for (const id of [
    'dcBtnReach',
    'dcBtnDry',
    'dcBtnAll',
    'dcBtnS1',
    'dcBtnS2',
    'dcBtnStop',
  ]) {
    nodes[id] = { disabled: id === 'dcBtnStop', click: vi.fn() }
  }
  for (const id of [
    'dcKpiTotal',
    'dcKpiRun',
    'dcKpiPass',
    'dcKpiWarn',
    'dcKpiFail',
    'dcKpiPty',
  ]) {
    nodes[id] = { textContent: 'Count 0' }
  }
  let skin = 'light'
  nodes.btnThemeToggle = {
    click: vi.fn(() => {
      skin = skin === 'light' ? 'dark' : 'light'
    }),
  }
  const window = {
    parent,
    TaiShaWorkbench: api,
    addEventListener: (_name: string, callback: typeof listener) => {
      listener = callback
    },
  }
  vm.runInNewContext(
    readFileSync('public/dragon-lab-workbench-bridge.js', 'utf8'),
    {
      window,
      document: {
        readyState: 'complete',
        documentElement: { getAttribute: () => skin },
        querySelector: (selector: string) => nodes[selector.slice(1)],
      },
      MutationObserver: class {
        observe() {}
      },
      setTimeout,
      clearTimeout,
    }
  )
  const request = {
    source: 'dragon-lab',
    version: 1,
    channel: 'test-channel-123',
    type: 'hello',
  }
  const deliver = (
    data: object,
    origin = 'https://api2.fanxiaolong.uk',
    source: unknown = parent
  ) => listener({ data, origin, source })
  deliver(request, 'https://attacker.example')
  expect(parent.postMessage).not.toHaveBeenCalled()
  deliver({ ...request, theme: 'dark' }, 'https://attacker.example')
  expect(skin).toBe('light')
  deliver({ ...request, theme: 'dark' })
  expect(skin).toBe('dark')
  deliver({ ...request, theme: 'dark' })
  expect(nodes.btnThemeToggle.click).toHaveBeenCalledOnce()
  deliver({ ...request, theme: 'light' })
  expect(skin).toBe('light')
  deliver({ ...request, theme: 'invalid' })
  expect(nodes.btnThemeToggle.click).toHaveBeenCalledTimes(2)
  expect(parent.postMessage.mock.calls[0][0].type).toBe('state')
  expect(parent.postMessage.mock.calls[0][0].executionTerminals).toEqual([
    {
      nodeId: 'os',
      sessionId: 'pty-1',
      runId: 'run-1',
      seq: 1,
      text: 'safe output',
      redacted: true,
      status: 'running',
    },
  ])
  const action = {
    ...request,
    type: 'action',
    id: 'request-id-123',
    action: 'reach',
  }
  await deliver(action)
  await deliver(action)
  expect(api.run).toHaveBeenCalledExactlyOnceWith('reach', {
    requestId: action.id,
  })
  expect(nodes.dcBtnReach.click).not.toHaveBeenCalled()
  subscriber()
  expect(parent.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({
    type: 'state',
    taskAPI: true,
    task: { runId: taskFixture.runId, status: 'running' },
  })
  await deliver({ ...action, id: 'request-id-456', action: 'stop' })
  expect(nodes.dcBtnStop.click).not.toHaveBeenCalled()
  await deliver({ ...action, id: 'request-id-789', action: 'arbitrary-code' })
  api.run.mockRejectedValueOnce(new Error('never-disclose-this-password'))
  await deliver({ ...action, id: 'request-rejected-123' })
  const replies = parent.postMessage.mock.calls.map((call) => call[0])
  expect(replies).toContainEqual(
    expect.objectContaining({
      type: 'ack',
      id: 'request-rejected-123',
      accepted: false,
    })
  )
  expect(JSON.stringify(parent.postMessage.mock.calls)).not.toContain(
    'never-disclose-this-password'
  )
})

test('theme changes update the connected frame without starting actions or replacing the session', () => {
  const iframe = document.createElement('iframe')
  document.body.append(iframe)
  const child = iframe.contentWindow
  if (!child) throw new Error('Missing iframe window')
  const frame = { current: iframe }
  const post = vi.spyOn(child, 'postMessage').mockImplementation(() => {})
  const hook = renderHook(
    ({ theme }: { theme: 'light' | 'dark' }) =>
      useWorkbenchBridge({
        frame,
        url: 'https://workbench.example/t/test',
        theme,
      }),
    { initialProps: { theme: 'light' as 'light' | 'dark' } }
  )
  const channel = post.mock.calls[0][0].channel
  hook.rerender({ theme: 'dark' })
  expect(post.mock.calls.at(-1)?.[0]).toMatchObject({
    type: 'hello',
    theme: 'dark',
    channel,
  })
  expect(post.mock.calls.every((call) => call[0].type === 'hello')).toBe(true)
  hook.unmount()
  iframe.remove()
})

test('task updates ignore stale sequences and preserve last progress on disconnect', () => {
  vi.useFakeTimers()
  const iframe = document.createElement('iframe')
  document.body.append(iframe)
  const child = iframe.contentWindow
  if (!child) throw new Error('Missing iframe window')
  const post = vi.spyOn(child, 'postMessage').mockImplementation(() => {})
  const frame = { current: iframe }
  const hook = renderHook(() =>
    useWorkbenchBridge({ frame, url: 'https://workbench.example/t/test' })
  )
  const channel = post.mock.calls[0][0].channel
  const send = (task: object) =>
    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://workbench.example',
          source: child,
          data: {
            source: 'taisha-workbench',
            version: 1,
            type: 'state',
            channel,
            taskAPI: true,
            task,
            buttons,
            counts,
          },
        })
      )
    )
  send({
    ...taskFixture,
    seq: 4,
    progress: { completed: 3, total: 6, percent: 50 },
  })
  send({ ...taskFixture, seq: 2 })
  expect(hook.result.current.state?.task?.progress.percent).toBe(50)
  act(() => vi.advanceTimersByTime(10000))
  expect(hook.result.current.connected).toBe(false)
  expect(hook.result.current.state?.task?.progress.percent).toBe(50)
  hook.unmount()
  iframe.remove()
})
