import { Terminal } from '@xterm/xterm'

import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { readIBMCSerial, serialIBMC } from '@/features/dashboard/ibmc-api'

// COM1 is a fixed 80x24 serial terminal. Linux TTY has no SSH-style resize channel.
export default function IBMCSerial(
  props: { autoConnect?: boolean; compact?: boolean; autoLogin?: boolean } = {}
) {
  const { t } = useTranslation()
  const container = useRef<HTMLDivElement>(null)
  const activeTerminal = useRef<Terminal | null>(null)
  const closing = useRef<Promise<unknown>>(Promise.resolve())
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(props.autoConnect ? 1 : 0)
  useEffect(() => {
    if (!attempt || !container.current) return
    setConnecting(true)
    let disposed = false
    let failed = false
    let session = ''
    let cursor = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let inputTimer: ReturnType<typeof setTimeout> | undefined
    let pending = ''
    let writes = Promise.resolve()
    const terminal = new Terminal({
      cols: 80,
      rows: 24,
      fontSize: props.compact ? 8 : 13,
      cursorBlink: true,
      scrollback: 1500,
      theme: { background: '#090e18', foreground: '#d1e5f0' },
    })
    terminal.open(container.current)
    activeTerminal.current = terminal
    const fit = () => {
      if (props.compact && container.current) {
        terminal.options.fontSize = Math.max(
          7,
          Math.min(14, (container.current.clientWidth - 10) / 49)
        )
      }
    }
    const observer =
      typeof ResizeObserver !== 'undefined' && props.compact
        ? new ResizeObserver(fit)
        : null
    observer?.observe(container.current)
    fit()

    const fail = () => {
      if (disposed) return
      failed = true
      clearTimeout(timer)
      setError(true)
      setConnected(false)
      setConnecting(false)
      if (session) {
        closing.current = serialIBMC({ operation: 'close', session }).catch(
          () => {}
        )
      }
    }
    const onInput = terminal.onData((value) => {
      if (!session || failed || disposed) return
      pending += value
      if (inputTimer) return
      inputTimer = setTimeout(() => {
        inputTimer = undefined
        const bytes = new TextEncoder().encode(pending)
        pending = ''
        writes = writes
          .then(async () => {
            for (
              let offset = 0;
              offset < bytes.length && !disposed;
              offset += 4096
            ) {
              const data = btoa(
                String.fromCharCode(...bytes.subarray(offset, offset + 4096))
              )
              await serialIBMC({ operation: 'write', session, data })
            }
          })
          .catch(fail)
      }, 30)
    })
    async function poll() {
      if (disposed || failed) return
      try {
        const result = await readIBMCSerial(session, cursor)
        if (disposed || failed) return
        cursor = result.cursor
        if (result.truncated) terminal.write('\r\n[…]\r\n')
        if (result.data) {
          terminal.write(
            Uint8Array.from(atob(result.data), (char) => char.charCodeAt(0))
          )
        }
        timer = setTimeout(poll, 400)
      } catch {
        fail()
      }
    }
    const opening = closing.current.then(() =>
      serialIBMC({
        operation: 'open',
        ...(props.autoLogin ? { auto_login: true } : {}),
      })
    )
    void opening
      .then(async (result) => {
        session = result.session
        cursor = result.cursor
        if (disposed) {
          await serialIBMC({ operation: 'close', session })
          return
        }
        setConnecting(false)
        setConnected(true)
        setError(false)
        terminal.focus()
        // Do not send an automatic Enter: reconnecting must not execute a half-typed command.
        await poll()
      })
      .catch(fail)
    return () => {
      disposed = true
      clearTimeout(timer)
      clearTimeout(inputTimer)
      observer?.disconnect()
      onInput.dispose()
      activeTerminal.current = null
      terminal.dispose()
      closing.current = opening
        .then((result) =>
          serialIBMC({ operation: 'close', session: result.session })
        )
        .catch(() => {})
    }
  }, [attempt, props.compact, props.autoLogin])
  let connectionLabel = t('Connect serial console')
  if (connecting) connectionLabel = t('Connecting...')
  else if (connected) connectionLabel = t('Disconnect')
  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-muted-foreground text-xs'>
          {t('COM1 · 115200 8N1 · independent of guest networking')}
        </p>
        <div className='flex items-center gap-1'>
          <Button
            size='sm'
            variant='outline'
            disabled={!connected}
            onClick={() => {
              activeTerminal.current?.input('\r', true)
              activeTerminal.current?.focus()
            }}
          >
            {t('Send Enter')}
          </Button>
          <Button
            size='sm'
            disabled={connecting}
            variant={connected ? 'outline' : 'default'}
            onClick={() => {
              setAttempt((value) => (connected ? 0 : value + 1))
              setConnected(false)
              setError(false)
            }}
          >
            {connectionLabel}
          </Button>
        </div>
      </div>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Sign in with your openEuler account. Press Enter if the screen is blank. Type exit before disconnecting to log out.'
        )}
      </p>
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {t(
            'Serial connection failed or is busy. Close other sessions and reconnect.'
          )}
        </p>
      )}
      <div
        className='ibmc-terminal-surface min-h-96 overflow-x-auto rounded-xl border bg-[#090e18] p-4'
        onPointerDown={() => activeTerminal.current?.focus()}
        aria-label={t('Serial terminal')}
      >
        <div className='min-w-[650px]' ref={container} />
      </div>
    </div>
  )
}
