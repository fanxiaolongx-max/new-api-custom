/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Cable, CheckCircle2, CircleHelp, Radio } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  type ONTCategory,
  type ONTEntity,
  ontFieldLabel,
  ontEntityLabel,
  ontFieldValue,
} from '@/features/dashboard/ont-presentation'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

function entityNumber(entity: ONTEntity, names: RegExp): number | null {
  const field = entity.fields.find((field) => names.test(field.name))
  if (!field || !/^-?\d+(\.\d+)?$/.test(field.value)) return null
  const value = Number(field.value)
  return Number.isFinite(value) ? value : null
}

export function ONTEquipmentSummary(props: {
  entities: ONTEntity[]
  category: ONTCategory
}) {
  const { t, i18n } = useTranslation()
  const allFields = props.entities.flatMap((entity) =>
    entity.fields.map((field) => ({ ...field, id: entity.id }))
  )
  const status = props.entities.flatMap((entity) => {
    const field = entity.fields.find((field) =>
      /^(status|connectionstatus|linkstatus)$/i.test(field.name)
    )
    if (!field) return []
    const online = /^(up|connected|online|ok|active)$/i.test(field.value)
    const offline = /^(down|disconnected|offline|inactive)$/i.test(field.value)
    return [{ entity, value: field.value, online, offline }]
  })
  const traffic = props.entities
    .flatMap((entity) => {
      const rx = entityNumber(
        entity,
        /^(rxBytes|BytesReceived|totalBytesReceived)$/i
      )
      const tx = entityNumber(entity, /^(txBytes|BytesSent|totalBytesSent)$/i)
      if (rx === null && tx === null) return []
      return [{ entity, rx, tx }]
    })
    .slice(0, 8)
  const maximum = Math.max(
    1,
    ...traffic.flatMap((item) => [item.rx ?? 0, item.tx ?? 0])
  )
  const signals = props.entities
    .flatMap((entity) => {
      const value = entityNumber(entity, /^(X_HW_RSSI|RSSI)$/i)
      return value !== null && value >= -110 && value < 0
        ? [{ entity, value }]
        : []
    })
    .slice(0, 8)
  const formatBytes = (value: number | null) => {
    if (value === null) return '—'
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
    const unit = Math.min(
      units.length - 1,
      Math.max(0, Math.floor(Math.log2(Math.max(1, value)) / 10))
    )
    return `${new Intl.NumberFormat(toIntlLocale(i18n.language), { maximumFractionDigits: 1 }).format(value / 1024 ** unit)} ${units[unit]}`
  }
  return (
    <div className='grid gap-3 lg:grid-cols-3'>
      <div className='bg-background/60 rounded-xl border p-3 lg:col-span-1'>
        <div className='text-muted-foreground mb-3 text-[10px]'>
          {t('Reported records')}
        </div>
        <div className='flex items-baseline gap-2'>
          <strong className='text-2xl font-semibold tabular-nums'>
            {props.entities.length}
          </strong>
          <span className='text-muted-foreground text-[10px]'>
            {allFields.length} {t('Collected fields')}
          </span>
        </div>
        <div className='mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-[10px]'>
          <div>
            <span className='text-sky-500'>● {t('Live monitoring')}</span>
            <p className='mt-1 font-mono text-sm'>
              {allFields.filter((field) => field.dynamic).length}
            </p>
          </div>
          <div>
            <span className='text-violet-500'>
              ○ {t('Device configuration')}
            </span>
            <p className='mt-1 font-mono text-sm'>
              {allFields.filter((field) => !field.dynamic).length}
            </p>
          </div>
        </div>
        {status.length > 0 && (
          <div className='mt-3 flex flex-wrap gap-3 border-t pt-3 text-[10px]'>
            <span className='flex items-center gap-1 text-emerald-500'>
              <CheckCircle2 className='size-3' aria-hidden='true' />
              {status.filter((item) => item.online).length} {t('Connected')}
            </span>
            <span className='text-muted-foreground'>
              {status.filter((item) => item.offline).length} {t('Disconnected')}
            </span>
            {status.some((item) => !item.online && !item.offline) && (
              <span className='text-muted-foreground flex items-center gap-1'>
                <CircleHelp className='size-3' aria-hidden='true' />
                {
                  status.filter((item) => !item.online && !item.offline).length
                }{' '}
                {t('Unknown')}
              </span>
            )}
          </div>
        )}
      </div>
      <div className='bg-background/60 min-w-0 rounded-xl border p-3 lg:col-span-2'>
        {props.category === 'ethernet' && status.length > 0 && (
          <div
            className='mb-3 flex flex-wrap gap-2'
            aria-label={t('Ethernet ports')}
          >
            {status.slice(0, 8).map((item) => (
              <div
                key={item.entity.id}
                className={cn(
                  'min-w-24 flex-1 rounded-lg border p-2.5',
                  item.online
                    ? 'border-emerald-500/25 bg-emerald-500/5'
                    : 'bg-muted/30'
                )}
              >
                <Cable
                  className={cn(
                    'mb-2 size-5',
                    item.online ? 'text-emerald-500' : 'text-muted-foreground'
                  )}
                  aria-hidden='true'
                />
                <p className='truncate font-mono text-[10px]'>
                  {ontEntityLabel(item.entity, t)}
                </p>
                <p className='text-muted-foreground mt-1 text-[10px]'>
                  {ontFieldValue('Status', item.value, t)} ·{' '}
                  {item.entity.fields.find((field) =>
                    /^speed$/i.test(field.name)
                  )?.value ?? '—'}
                </p>
              </div>
            ))}
          </div>
        )}
        {traffic.length > 0 ? (
          <figure aria-label={t('Traffic counters')}>
            <figcaption className='text-muted-foreground mb-3 flex flex-wrap justify-between gap-2 text-[10px]'>
              <span>{t('Traffic counters')}</span>
              <span>
                <span className='mr-3 text-sky-500'>
                  ● {t('Bytes received')}
                </span>
                <span className='text-violet-500'>● {t('Bytes sent')}</span>
              </span>
            </figcaption>
            <div className='space-y-2.5'>
              {traffic.map((item) => (
                <div
                  key={item.entity.id}
                  className='grid grid-cols-[minmax(60px,1fr)_3fr] items-center gap-3'
                >
                  <div
                    className='truncate font-mono text-[9px]'
                    title={ontEntityLabel(item.entity, t)}
                  >
                    {ontEntityLabel(item.entity, t)}
                  </div>
                  <div>
                    <svg
                      role='img'
                      aria-label={`${ontEntityLabel(item.entity, t)}: ${t('Bytes received')} ${item.rx ?? '—'}, ${t('Bytes sent')} ${item.tx ?? '—'}`}
                      viewBox='0 0 1000 14'
                      preserveAspectRatio='none'
                      className='h-3.5 w-full overflow-visible'
                    >
                      <rect
                        width='1000'
                        height='14'
                        rx='3'
                        className='fill-muted/40'
                      />
                      <rect
                        width={Math.max(0, ((item.rx ?? 0) / maximum) * 1000)}
                        height='5'
                        rx='2'
                        y='1'
                        className='fill-sky-500'
                      />
                      <rect
                        width={Math.max(0, ((item.tx ?? 0) / maximum) * 1000)}
                        height='5'
                        rx='2'
                        y='8'
                        className='fill-violet-500'
                      />
                    </svg>
                    <div className='text-muted-foreground mt-1 flex justify-between font-mono text-[9px]'>
                      <span>{formatBytes(item.rx)}</span>
                      <span>{formatBytes(item.tx)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </figure>
        ) : (
          <div>
            <h5 className='text-muted-foreground mb-3 flex items-center gap-1.5 text-[10px]'>
              <Radio className='size-3' aria-hidden='true' />
              {t('Key readings')}
            </h5>
            {signals.length > 0 ? (
              <div className='grid gap-3 sm:grid-cols-2'>
                {signals.map((item) => (
                  <div key={item.entity.id}>
                    <div className='mb-1 flex justify-between gap-3 font-mono text-[10px]'>
                      <span className='truncate'>
                        {ontEntityLabel(item.entity, t)}
                      </span>
                      <strong className='shrink-0'>{item.value} dBm</strong>
                    </div>
                    <meter
                      min={-110}
                      max={0}
                      value={item.value}
                      aria-label={`${ontEntityLabel(item.entity, t)} RSSI`}
                      className='h-2 w-full'
                    />
                  </div>
                ))}
              </div>
            ) : (
              <dl className='grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3'>
                {allFields
                  .filter((field) =>
                    /^(ModelName|ProductName|SoftwareVersion|HardwareVersion|revOpticPower|transOpticPower|RxPower|TxPower|temperature|voltage|bias|SSID|Channel|DeviceNum)$/i.test(
                      field.name
                    )
                  )
                  .slice(0, 9)
                  .map((field) => (
                    <div key={`${field.id}:${field.name}:${field.value}`}>
                      <dt
                        title={field.name}
                        className='text-muted-foreground text-[9px]'
                      >
                        {ontFieldLabel(field.name, t)}
                      </dt>
                      <dd
                        className='mt-1 truncate font-mono text-[11px]'
                        title={field.value}
                      >
                        {ontFieldValue(field.name, field.value, t)}
                      </dd>
                    </div>
                  ))}
              </dl>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
