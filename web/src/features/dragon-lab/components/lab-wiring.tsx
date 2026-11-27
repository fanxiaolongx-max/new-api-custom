import { PencilLine, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import type { LabConfig, LabLinkID, LabLinkStatus } from '../api'
import { LAB_LINKS, LAB_NODES } from '../topology'

export function LabWiring(props: {
  config?: LabConfig
  instanceStatus?: LabLinkStatus
  status?: LabLinkStatus
  authorized: boolean
  selected?: LabLinkID | null
  onSelect: (id: LabLinkID | null) => void
  onEdit?: () => void
}) {
  const { t } = useTranslation()
  const sample = (id: LabLinkID) =>
    props.instanceStatus && id !== 'pc-sw1' && id !== 'pc-sw2'
      ? props.instanceStatus
      : props.status
  const stale = (status?: LabLinkStatus) =>
    !status || status.stale || Date.now() / 1000 - status.updated > 45
  return (
    <>
      <svg
        className='lab-wires'
        viewBox='0 0 1440 740'
        preserveAspectRatio='none'
        aria-hidden='true'
      >
        {LAB_LINKS.map((link) => {
          const config = props.config?.links.find((item) => item.id === link.id)
          const status = sample(link.id)
          const states = status?.links[link.id]?.map(
            (id) => status.endpoints[id]?.state ?? 'unknown'
          )
          const wireState =
            stale(status) || !states
              ? 'unknown'
              : (['down', 'warn', 'unknown'].find((state) =>
                  states.some((s) => s === state)
                ) ?? 'up')
          return (
            <g
              data-state={props.authorized ? wireState : undefined}
              key={link.id}
              className={`lab-wire-${link.kind} ${config?.phase === 'configured' ? 'is-configured' : 'is-planned'}${props.selected === link.id ? ' is-selected' : ''}`}
            >
              <path className='lab-wire-halo' d={link.path} />
              <path className='lab-wire-line' d={link.path} />
            </g>
          )
        })}
      </svg>
      {LAB_LINKS.map((link) => {
        const config = props.config?.links.find((item) => item.id === link.id)
        return (
          <button
            type='button'
            key={link.id}
            className={`lab-link-label lab-link-label-${link.kind}`}
            style={{ left: `${link.x / 14.4}%`, top: `${link.y / 7.4}%` }}
            onClick={() =>
              props.onSelect(props.selected === link.id ? null : link.id)
            }
            aria-label={`${t('Link details')}: ${t(link.title)}`}
            aria-expanded={props.selected === link.id}
            data-selected={props.selected === link.id || undefined}
          >
            <strong>{t(link.title)}</strong>
            {props.authorized && config && (
              <>
                <span
                  className='lab-link-ports'
                  title={`${config.source_port} → ${config.target_port}`}
                >
                  {config.source_port} → {config.target_port}
                </span>
                <span className='lab-link-ip' title={config.source_address}>
                  {config.source_address}
                </span>
                <span className='lab-link-ip' title={config.target_address}>
                  {config.target_address}
                </span>
                {config.vlan && <small>VLAN {config.vlan}</small>}
              </>
            )}
          </button>
        )
      })}
      {props.authorized &&
        (props.status || props.instanceStatus) &&
        LAB_LINKS.flatMap((link) =>
          (sample(link.id)?.links[link.id] ?? []).map((endpointID, index) => {
            const status = sample(link.id)
            const endpoint = status?.endpoints[endpointID]
            const state = stale(status)
              ? 'unknown'
              : (endpoint?.state ?? 'unknown')
            const [x, y] = link.ends[index]
            const label = endpoint?.label ?? endpointID
            const detail = stale(status)
              ? t('Port status is out of date')
              : (endpoint?.detail ?? t('No data'))
            return (
              <span
                key={`${link.id}-${endpointID}`}
                className={`lab-port-dot is-${state}`}
                style={{ left: `${x / 14.4}%`, top: `${y / 7.4}%` }}
                title={`${label} · ${t(PORT_STATE_KEYS[state])}\n${detail}`}
                role='img'
                aria-label={`${label}: ${t(PORT_STATE_KEYS[state])}`}
              />
            )
          })
        )}
      {props.authorized &&
        props.selected &&
        (() => {
          const link = LAB_LINKS.find((item) => item.id === props.selected)
          const config = props.config?.links.find(
            (item) => item.id === props.selected
          )
          if (!link || !config) return null
          return (
            <LinkPopover
              key={link.id}
              link={link}
              config={config}
              status={sample(link.id)}
              stale={stale(sample(link.id))}
              onClose={() => props.onSelect(null)}
              onEdit={props.onEdit}
            />
          )
        })()}
    </>
  )
}

function nodeName(id: string, t: (key: string) => string) {
  const node = LAB_NODES.find((item) => item.id === id)
  return node ? t(node.title).split(' · ')[0] : id
}

function LinkPopover(props: {
  link: (typeof LAB_LINKS)[number]
  config: NonNullable<LabConfig['links']>[number]
  status?: LabLinkStatus
  stale: boolean
  onClose: () => void
  onEdit?: () => void
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLElement>(null)
  const { link, config, status, onClose } = props
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const down = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (ref.current?.contains(target)) return
      if (target?.closest?.('.lab-link-label')) return
      onClose()
    }
    document.addEventListener('keydown', key)
    document.addEventListener('pointerdown', down)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('pointerdown', down)
    }
  }, [onClose])
  const [from, to] = link.id.split('-')
  const ids = status?.links[link.id]
  const ends = [
    {
      node: nodeName(from, t),
      port: config.source_port,
      address: config.source_address,
      endpoint: ids ? status?.endpoints[ids[0]] : undefined,
    },
    {
      node: nodeName(to, t),
      port: config.target_port,
      address: config.target_address,
      endpoint: ids ? status?.endpoints[ids[1]] : undefined,
    },
  ]
  const age = status
    ? Math.max(0, Math.round(Date.now() / 1000 - status.updated))
    : null
  const below = link.y < 300
  return (
    <section
      ref={ref}
      role='region'
      aria-label={t('Selected link')}
      className={`lab-link-popover lab-link-popover-${link.kind} ${below ? 'is-below' : 'is-above'}`}
      style={{ left: `${link.x / 14.4}%`, top: `${link.y / 7.4}%` }}
    >
      <header>
        <strong>{t(link.title)}</strong>
        <span className={`lab-link-phase is-${config.phase}`}>
          {config.phase === 'configured' ? t('Configured') : t('Planned')}
        </span>
        {config.vlan && (
          <span className='lab-link-phase'>VLAN {config.vlan}</span>
        )}
        <button type='button' onClick={onClose} aria-label={t('Close')}>
          <X size={12} />
        </button>
      </header>
      <ol>
        {ends.map((end) => {
          const state = props.stale
            ? 'unknown'
            : (end.endpoint?.state ?? 'unknown')
          return (
            <li key={end.node}>
              <i className={`lab-port-dot is-${state}`} aria-hidden='true' />
              <div>
                <p>
                  <b>{end.node}</b>
                  <code>{end.port || '—'}</code>
                  <em className={`is-${state}`}>{t(PORT_STATE_KEYS[state])}</em>
                </p>
                <code>{end.address || '—'}</code>
                {(end.endpoint?.detail || props.stale) && (
                  <small>
                    {props.stale
                      ? t('Port status is out of date')
                      : end.endpoint?.detail}
                  </small>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <footer>
        <span>
          {age === null
            ? t('No data')
            : t('Sampled {{seconds}}s ago', { seconds: age })}
        </span>
        {props.onEdit && (
          <button type='button' onClick={props.onEdit}>
            <PencilLine size={11} />
            {t('Edit labels')}
          </button>
        )}
      </footer>
    </section>
  )
}

const PORT_STATE_KEYS: Record<string, string> = {
  up: 'Port up',
  down: 'Port down',
  warn: 'Port degraded',
  unknown: 'Port status unknown',
}
