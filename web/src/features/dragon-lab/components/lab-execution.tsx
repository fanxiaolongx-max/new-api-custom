import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import type { ExecutionTerminal } from '../workbench-terminals'

export function LabExecution(props: {
  terminal?: ExecutionTerminal
  connected: boolean
  available: boolean
}) {
  const { t } = useTranslation()
  const view = useRef<HTMLPreElement>(null)
  const following = useRef(true)
  useEffect(() => {
    if (following.current && view.current) {
      view.current.scrollTop = view.current.scrollHeight
    }
  }, [props.terminal?.text])
  let status = t('Waiting')
  if (!props.connected) status = t('Disconnected')
  else if (props.terminal?.status === 'running') status = t('Running')
  else if (props.terminal?.status === 'closed') status = t('Stopped')
  else if (props.terminal?.status === 'retained') {
    status = t('{{count}} terminals retained', { count: 1 })
  }
  return (
    <div className='lab-execution'>
      <div className='lab-execution-status'>
        {t('Read-only execution feed')}
        <span>{status}</span>
      </div>
      <pre
        ref={view}
        tabIndex={0}
        aria-label={t('Execution output')}
        onScroll={() => {
          const element = view.current
          if (element) {
            following.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              32
          }
        }}
      >
        {props.terminal?.text ||
          t(
            props.available
              ? 'Waiting for execution output for this device.'
              : 'The workbench terminal feed is not connected yet.'
          )}
      </pre>
    </div>
  )
}
