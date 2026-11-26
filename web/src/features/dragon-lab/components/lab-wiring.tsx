import { useTranslation } from 'react-i18next'

import type { LabConfig, LabLinkID } from '../api'
import { LAB_LINKS } from '../topology'

export function LabWiring(props: {
  config?: LabConfig
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
    </>
  )
}
