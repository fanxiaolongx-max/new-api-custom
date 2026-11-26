import { useTranslation } from 'react-i18next'

import type { LabConfig, LabLinkID } from '../api'
import { LAB_LINKS } from '../topology'

export function LabPortMap(props: {
  config: LabConfig
  onSelect: (id: LabLinkID) => void
}) {
  const { t } = useTranslation()
  return (
    <div className='lab-table-wrap'>
      <table className='lab-port-table'>
        <thead>
          <tr>
            <th>{t('Connection')}</th>
            <th>{t('Source port / address')}</th>
            <th>{t('Target port / address')}</th>
            <th>VLAN</th>
            <th>{t('Planning state')}</th>
          </tr>
        </thead>
        <tbody>
          {props.config.links.map((link) => (
            <tr key={link.id}>
              <td>
                <button type='button' onClick={() => props.onSelect(link.id)}>
                  {t(
                    LAB_LINKS.find((item) => item.id === link.id)?.title ??
                      link.id
                  )}
                </button>
              </td>
              <td>
                <strong>{link.source_port}</strong>
                <span>{link.source_address || '—'}</span>
              </td>
              <td>
                <strong>{link.target_port}</strong>
                <span>{link.target_address || '—'}</span>
              </td>
              <td>{link.vlan || '—'}</td>
              <td>
                {link.phase === 'configured' ? t('Configured') : t('Planned')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
