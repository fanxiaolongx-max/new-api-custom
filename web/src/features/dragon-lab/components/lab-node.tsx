import {
  Expand,
  ExternalLink,
  LockKeyhole,
  Monitor,
  Minimize2,
  X,
  Network,
  Pause,
  Server,
  Terminal,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { VirtualMachine } from '@/features/dashboard/api'

import { labConsoleURL, type LabNodeConfig } from '../api'
import { STATE_KEYS, type LAB_NODES } from '../topology'
import type { ExecutionTerminal } from '../workbench-terminals'
import { LabExecution } from './lab-execution'
import { LabRemoteConsole } from './lab-remote-console'

const SerialConsole = lazy(
  () => import('@/features/dashboard/components/overview/ibmc-serial')
)
type NodeDefinition = (typeof LAB_NODES)[number]
export function LabNode(props: {
  execution?: {
    terminal?: ExecutionTerminal
    connected: boolean
    available: boolean
    active?: boolean
  }
  definition: NodeDefinition
  config?: LabNodeConfig
  machine?: VirtualMachine
  authorized: boolean
  paused: boolean
  serialReady: boolean
  onConfigure: () => void
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}) {
  const { t } = useTranslation()
  const executing = Boolean(
    props.execution?.connected &&
    props.execution.terminal?.status === 'running' &&
    props.execution.active !== false
  )
  const sessionID = props.execution?.terminal?.sessionId
  const runID = props.execution?.terminal?.runId
  const [mode, setMode] = useState(executing ? 'live' : 'manual')
  const [manualOpened, setManualOpened] = useState(!executing)
  useEffect(() => {
    setMode(executing ? 'live' : 'manual')
    if (!executing) setManualOpened(true)
  }, [executing, sessionID, runID])
  const expandButton = useRef<HTMLButtonElement>(null)
  const node = props.definition
  const config = props.config
  const url = labConsoleURL(config?.console_id ?? 0)
  const Icon = {
    pc: Monitor,
    sw1: Network,
    sw2: Network,
    ibmc: Terminal,
    os: Server,
  }[node.id]
  const vmStopped = Boolean(props.machine && props.machine.state !== 'running')
  const bound = Boolean(
    config &&
    ((config.console_mode === 'remote' && url) ||
      (config.console_mode === 'sol' && props.serialReady))
  )
  let state = t('Awaiting setup')
  if (!props.authorized) state = t('Private')
  else if (props.paused) state = t('Paused')
  else if (props.machine) {
    state = t(STATE_KEYS[props.machine.state] ?? 'Unknown')
  } else if (bound) state = t('Console bound')
  let preview: React.ReactNode = (
    <div className='lab-placeholder'>
      <Network size={24} />
      <p>{t('Console not connected')}</p>
      <span>{t('Bind a registered console when this device is ready.')}</span>
      <Button size='sm' variant='outline' onClick={props.onConfigure}>
        {t('Configure')}
      </Button>
    </div>
  )
  if (!props.authorized) {
    preview = (
      <div className='lab-placeholder'>
        <LockKeyhole size={23} />
        <p>{t('Administrator access required')}</p>
      </div>
    )
  } else if (props.paused) {
    preview = (
      <div className='lab-placeholder'>
        <Pause size={23} />
        <p>{t('Live views paused')}</p>
      </div>
    )
  } else if (vmStopped) {
    preview = (
      <div className='lab-placeholder'>
        <Server size={23} />
        <p>
          {t(
            'Virtual machine is not running. Start it before opening the console.'
          )}
        </p>
      </div>
    )
  } else if (config?.console_mode === 'sol' && props.serialReady) {
    preview = (
      <Suspense
        fallback={<div className='lab-placeholder'>{t('Loading...')}</div>}
      >
        <div className='lab-sol'>
          <SerialConsole autoConnect compact autoLogin />
        </div>
      </Suspense>
    )
  } else if (config?.console_mode === 'remote' && url) {
    preview = (
      <LabRemoteConsole
        src={url}
        title={`${t('Device console')}: ${t(node.title)}`}
      />
    )
    if (node.id === 'ibmc') {
      preview = (
        <Tabs defaultValue='management' className='lab-ibmc-tabs'>
          <TabsList variant='line'>
            <TabsTrigger value='management'>
              {t('Management terminal')}
            </TabsTrigger>
            <TabsTrigger value='sol' disabled={!props.serialReady}>
              {t('OS serial console')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value='management' keepMounted>
            {preview}
          </TabsContent>
          <TabsContent value='sol'>
            <Suspense
              fallback={
                <div className='lab-placeholder'>{t('Loading...')}</div>
              }
            >
              <div className='lab-sol'>
                <SerialConsole autoConnect compact autoLogin />
              </div>
            </Suspense>
          </TabsContent>
        </Tabs>
      )
    }
  }
  return (
    <article
      className={`lab-node lab-node-${node.id} ${props.expanded ? 'is-expanded' : ''}`}
      style={{ gridColumn: node.column, gridRow: node.row }}
      role={props.expanded ? 'dialog' : undefined}
      aria-modal={props.expanded ? false : undefined}
      aria-label={t(node.title)}
    >
      <header className='lab-node-header'>
        <span className={`lab-device-icon lab-device-icon-${node.id}`}>
          <Icon size={19} />
        </span>
        <div className='lab-node-title'>
          <h2>{t(node.title)}</h2>
          <span>{t(node.subtitle)}</span>
        </div>
        <span
          className={`lab-runtime ${props.machine?.state === 'running' && !props.paused ? 'is-running' : ''}`}
        >
          {state}
        </span>
        {props.expanded && (
          <button
            type='button'
            className='lab-floating-close'
            aria-label={t('Close')}
            onClick={() => {
              props.onExpandedChange(false)
              expandButton.current?.focus()
            }}
          >
            <X size={18} />
          </button>
        )}
      </header>
      <div className='lab-node-address'>
        <span
          className='lab-mono'
          title={
            props.authorized && config?.gateway
              ? `${t('Default gateway')}: ${config.gateway}`
              : undefined
          }
        >
          {props.authorized
            ? config?.address || t('Not configured')
            : t('Addresses visible after sign-in')}
        </span>
        <div className='lab-node-actions'>
          {url && config?.console_mode === 'remote' && props.authorized && (
            <a
              href={url}
              target='_blank'
              rel='noreferrer'
              title={t('Open in new tab')}
              aria-label={`${t('Open in new tab')}: ${t(node.title)}`}
            >
              <ExternalLink size={13} />
            </a>
          )}
          {props.authorized && (bound || props.execution) && (
            <button
              type='button'
              ref={expandButton}
              title={
                props.expanded ? t('Restore thumbnail') : t('Expand console')
              }
              aria-label={`${props.expanded ? t('Restore thumbnail') : t('Expand console')}: ${t(node.title)}`}
              aria-expanded={props.expanded}
              onClick={() => props.onExpandedChange(!props.expanded)}
            >
              {props.expanded ? <Minimize2 size={14} /> : <Expand size={14} />}
            </button>
          )}
        </div>
      </div>
      <div className='lab-screen'>
        {props.execution && props.authorized && !props.paused ? (
          <Tabs
            value={mode}
            onValueChange={(value) => {
              setMode(value)
              if (value === 'manual') setManualOpened(true)
            }}
            className='lab-execution-tabs'
          >
            <TabsList variant='line'>
              <TabsTrigger value='live'>{t('Execution feed')}</TabsTrigger>
              <TabsTrigger value='manual'>{t('Manual terminal')}</TabsTrigger>
            </TabsList>
            <TabsContent value='live'>
              <LabExecution {...props.execution} />
            </TabsContent>
            <TabsContent value='manual' keepMounted>
              {manualOpened && preview}
            </TabsContent>
          </Tabs>
        ) : (
          preview
        )}
      </div>
      <footer className='lab-node-footer'>
        <span>
          <i
            className={`lab-dot ${node.kind === 'simulated' ? 'is-simulated' : ''}`}
          />
          {node.kind === 'simulated'
            ? t('Simulated iBMC / real COM1')
            : t('Real VM / VRP')}
        </span>
        <span>
          {config?.console_mode === 'sol'
            ? 'SOL · COM1'
            : t('Embedded console')}
        </span>
      </footer>
    </article>
  )
}
