import { useTranslation } from 'react-i18next'

import type { LabConfig, LabLinkID, LabLinkStatus } from '../api'
import { LAB_LINKS } from '../topology'

export function LabWiring(props: {
  config?: LabConfig
  instanceStatus?: LabLinkStatus
  status?: LabLinkStatus
  authorized: boolean
  onSelect: (id: LabLinkID) => void
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
              className={`lab-wire-${link.kind} ${config?.phase === 'configured' ? 'is-configured' : 'is-planned'}`}
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
            onClick={() => props.onSelect(link.id)}
            aria-label={`${t('Link details')}: ${t(link.title)}`}
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
    </>
  )
}

const PORT_STATE_KEYS: Record<string, string> = {
  up: 'Port up',
  down: 'Port down',
  warn: 'Port degraded',
  unknown: 'Port status unknown',
}
