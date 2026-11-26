import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import {
  WORKBENCH_ACTIONS,
  readWorkbenchTask,
  type WorkbenchAction,
  type WorkbenchTask,
} from './workbench-task'
import {
  readExecutionTerminals,
  type ExecutionTerminal,
} from './workbench-terminals'

export { WORKBENCH_ACTIONS, type WorkbenchAction } from './workbench-task'

export interface WorkbenchState {
  terminalAPI?: boolean
  executionTerminals?: ExecutionTerminal[]
  taskAPI?: boolean
  task?: WorkbenchTask | null
  buttons: Record<WorkbenchAction, boolean>
  counts: {
    total: number
    running: number
    pass: number
    warn: number
    fail: number
    terminals: number
  }
}
export function useWorkbenchBridge(props: {
  frame: RefObject<HTMLIFrameElement | null>
  url: string
  theme?: 'light' | 'dark'
}) {
  const frame = props.frame
  const url = props.url
  const resolvedTheme = props.theme ?? 'light'
  const theme = useRef(resolvedTheme)
  const [state, setState] = useState<WorkbenchState | null>(null)
  const [connected, setConnected] = useState(false)
  const [pendingAction, setPendingAction] = useState<WorkbenchAction | null>(
    null
  )
  const [error, setError] = useState<'rejected' | 'timeout' | null>(null)
  const [pending, setPending] = useState(false)
  const channel = useRef('')
  const request = useRef('')
  const lastReply = useRef(0)
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined)
  const handshake = useCallback(() => {
    if (!url || !frame.current?.contentWindow) return
    frame.current.contentWindow.postMessage(
      {
        source: 'dragon-lab',
        version: 1,
        type: 'hello',
        theme: theme.current,
        channel: channel.current,
      },
      new URL(url).origin
    )
  }, [frame, url])
  useEffect(() => {
    setState(null)
    setConnected(false)
    setPendingAction(null)
    setError(null)
    setPending(false)
    request.current = ''
    lastReply.current = 0
    channel.current = crypto.randomUUID()
    if (!url) return
    const origin = new URL(url).origin
    const listener = (event: MessageEvent) => {
      const message = event.data
      if (
        event.origin !== origin ||
        event.source !== frame.current?.contentWindow ||
        !message ||
        message.source !== 'taisha-workbench' ||
        message.version !== 1 ||
        message.channel !== channel.current
      ) {
        return
      }
      if (message.type === 'state') {
        if (
          !message.buttons ||
          !WORKBENCH_ACTIONS.every(
            (action) => typeof message.buttons[action] === 'boolean'
          )
        ) {
          return
        }
        const counts = message.counts
        if (
          !counts ||
          !['total', 'running', 'pass', 'warn', 'fail', 'terminals'].every(
            (key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0
          )
        ) {
          return
        }
        lastReply.current = Date.now()
        setConnected(true)
        setState((previous) => {
          let task = readWorkbenchTask(message.task)
          const old = previous?.task
          if (
            old &&
            (!task ||
              (task.runId === old.runId
                ? task.seq <= old.seq
                : task.startedAt < old.startedAt))
          ) {
            task = old
          }
          return {
            buttons: message.buttons,
            counts,
            terminalAPI: message.terminalAPI === true,
            executionTerminals: readExecutionTerminals(
              message.executionTerminals
            ).map((stream) => {
              const oldStream = previous?.executionTerminals?.find(
                (item) =>
                  item.nodeId === stream.nodeId &&
                  item.sessionId === stream.sessionId &&
                  item.runId === stream.runId
              )
              return oldStream && oldStream.seq >= stream.seq
                ? oldStream
                : stream
            }),
            taskAPI: message.taskAPI === true,
            task,
          }
        })
      } else if (message.type === 'ack' && message.id === request.current) {
        clearTimeout(timeout.current)
        request.current = ''
        setPending(false)
        setPendingAction(null)
        setError(message.accepted === true ? null : 'rejected')
      }
    }
    window.addEventListener('message', listener)
    handshake()
    const timer = setInterval(() => {
      if (lastReply.current && Date.now() - lastReply.current > 8000) {
        setConnected(false)
      }
      handshake()
    }, 2500)
    return () => {
      clearInterval(timer)
      clearTimeout(timeout.current)
      window.removeEventListener('message', listener)
    }
  }, [frame, url, handshake])
  useEffect(() => {
    theme.current = resolvedTheme
    handshake()
  }, [handshake, resolvedTheme])
  const run = useCallback(
    (action: WorkbenchAction) => {
      if (
        !state?.buttons[action] ||
        !state.taskAPI ||
        !connected ||
        request.current ||
        !frame.current?.contentWindow ||
        !url
      ) {
        return
      }
      request.current = crypto.randomUUID()
      setPending(true)
      setPendingAction(action)
      setError(null)
      frame.current.contentWindow.postMessage(
        {
          source: 'dragon-lab',
          version: 1,
          type: 'action',
          channel: channel.current,
          id: request.current,
          action,
        },
        new URL(url).origin
      )
      timeout.current = setTimeout(() => {
        request.current = ''
        setPending(false)
        setError('timeout')
        setPendingAction(null)
        setConnected(false)
      }, 5000)
    },
    [connected, frame, state, url]
  )
  const loaded = useCallback(() => {
    setError(null)
    setState(null)
    setConnected(false)
    setPendingAction(null)
    setPending(false)
    request.current = ''
    clearTimeout(timeout.current)
    lastReply.current = 0
    channel.current = crypto.randomUUID()
    handshake()
  }, [handshake])
  return {
    state,
    connected,
    error,
    pending,
    pendingAction,
    run,
    handshake,
    loaded,
  }
}
