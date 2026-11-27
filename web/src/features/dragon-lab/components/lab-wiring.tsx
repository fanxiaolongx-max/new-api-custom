import { useTranslation } from 'react-i18next'

import type { LabConfig, LabLinkID, LabLinkStatus } from '../api'
import { LAB_LINKS } from '../topology'

export function LabWiring(props: {
  config?: LabConfig
  status?: LabLinkStatus
  authorized: boolean
  onSelect: (id: LabLinkID) => void
}) {
  const { t } = useTranslation()
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
          return (
            <g
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
        props.status &&
        LAB_LINKS.flatMap((link) =>
          (props.status?.links[link.id] ?? []).map((endpointID, index) => {
            const endpoint = props.status?.endpoints[endpointID]
            const state = props.status?.stale
              ? 'unknown'
              : (endpoint?.state ?? 'unknown')
            const [x, y] = link.ends[index]
            const label = endpoint?.label ?? endpointID
            const detail = props.status?.stale
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
