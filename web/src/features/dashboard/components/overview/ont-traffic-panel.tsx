import { ArrowDownLeft, ArrowUpRight, Activity } from 'lucide-react'
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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

import { Button } from '@/components/ui/button'
import type { ONTPoint, ONTTrafficCounter } from '@/features/dashboard/ont-api'
import { ontEntityLabel } from '@/features/dashboard/ont-presentation'
import {
  calculateONTTraffic,
  formatONTBytes,
  ontTrafficService,
  sumONTTraffic,
  type ONTTrafficScope,
  type ONTTrafficService,
} from '@/features/dashboard/ont-traffic'
import { toIntlLocale } from '@/i18n/languages'

export function ONTTrafficPanel(props: {
  current?: ONTPoint
  history: ONTPoint[]
  interval: number
}) {
  const { t, i18n } = useTranslation()
  const [scope, setScope] = useState<ONTTrafficScope>('wan')
  const locale = toIntlLocale(i18n.language) ?? 'en'
  const previous = [...props.history]
    .reverse()
    .find((point) => props.current && point.timestamp < props.current.timestamp)
  const readings = calculateONTTraffic(
    props.current,
    previous,
    props.interval,
    scope
  )
  const bytes = (value: number | null) => formatONTBytes(value, locale)
  const rate = (value: number | null) =>
    value === null ? '—' : `${bytes(value)}/s`
  const scopes = [
    { id: 'wan', label: t('WAN services') },
    { id: 'wlan', label: t('Wireless interfaces') },
    { id: 'ethernet', label: t('Wired interfaces') },
    { id: 'pon', label: t('PON interface') },
  ] as const
  const serviceLabel = (service: ONTTrafficService) => {
    switch (service) {
      case 'internet':
        return t('Internet service')
      case 'management':
        return t('Remote management')
      case 'voice':
        return t('Voice service')
      case 'iptv':
        return t('IPTV service')
      case 'mixed':
        return t('Mixed WAN services')
      default:
        return t('Unclassified WAN')
    }
  }
  const counterLabel = (counter: ONTTrafficCounter) => {
    if (counter.category === 'pon') return t('PON interface')
    return ontEntityLabel(
      {
        id: counter.id,
        identity: counter.name || counter.id,
        domain: counter.id,
        category: counter.category,
        recordName: 'WANConnection',
        sources: [counter.source],
        fields: [
          { name: 'ServiceList', value: counter.service, dynamic: false },
        ],
      },
      t
    )
  }
  const groups =
    scope === 'wan'
      ? [
          ...new Set(
            readings.map((reading) => ontTrafficService(reading.counter))
          ),
        ].map((service) => ({
          id: service,
          name: serviceLabel(service),
          readings: readings.filter(
            (reading) => ontTrafficService(reading.counter) === service
          ),
        }))
      : readings.map((reading) => ({
          id: reading.counter.id,
          name: counterLabel(reading.counter),
          readings: [reading],
        }))
  const maximum = Math.max(
    1,
    ...groups.flatMap((group) => [
      sumONTTraffic(group.readings.map((reading) => reading.rx)) ?? 0,
      sumONTTraffic(group.readings.map((reading) => reading.tx)) ?? 0,
    ])
  )
  const chart = props.history.map((point, index) => {
    const frame = calculateONTTraffic(
      point,
      props.history[index - 1],
      props.interval,
      scope
    )
    return {
      timestamp: point.timestamp,
      rx: sumONTTraffic(frame.map((reading) => reading.rxRate)),
      tx: sumONTTraffic(frame.map((reading) => reading.txRate)),
    }
  })
  return (
    <section
      aria-label={t('Traffic statistics')}
      className='bg-background/40 space-y-3 rounded-xl border p-3 sm:p-4'
    >
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h4 className='flex items-center gap-2 text-xs font-semibold'>
          <Activity className='size-3.5' aria-hidden='true' />
          {t('Traffic statistics')}
        </h4>
        <div
          role='group'
          aria-label={t('Traffic statistics')}
          className='flex flex-wrap gap-1'
        >
          {scopes.map((item) => (
            <Button
              key={item.id}
              variant={scope === item.id ? 'secondary' : 'ghost'}
              size='sm'
              className='h-7 text-[10px]'
              aria-pressed={scope === item.id}
              onClick={() => setScope(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>
      <p className='text-muted-foreground text-[10px]'>
        {t(
          'Counters are device totals, not today. Scopes overlap; do not add them together.'
        )}
      </p>
      {readings.length === 0 ? (
        <p className='text-muted-foreground rounded-lg border border-dashed p-5 text-xs'>
          {t('No traffic counters were reported for this scope.')}
        </p>
      ) : (
        <>
          <div className='grid grid-cols-2 gap-2 lg:grid-cols-4'>
            {[
              {
                label: t('Received traffic'),
                value: bytes(
                  sumONTTraffic(readings.map((reading) => reading.rx))
                ),
                delta: bytes(
                  sumONTTraffic(readings.map((reading) => reading.rxDelta))
                ),
                Icon: ArrowDownLeft,
              },
              {
                label: t('Sent traffic'),
                value: bytes(
                  sumONTTraffic(readings.map((reading) => reading.tx))
                ),
                delta: bytes(
                  sumONTTraffic(readings.map((reading) => reading.txDelta))
                ),
                Icon: ArrowUpRight,
              },
              {
                label: t('Average receive rate'),
                value: rate(
                  sumONTTraffic(readings.map((reading) => reading.rxRate))
                ),
                Icon: ArrowDownLeft,
              },
              {
                label: t('Average transmit rate'),
                value: rate(
                  sumONTTraffic(readings.map((reading) => reading.txRate))
                ),
                Icon: ArrowUpRight,
              },
            ].map((metric) => (
              <article
                key={metric.label}
                className='bg-muted/20 rounded-lg border p-3'
              >
                <div className='text-muted-foreground mb-2 flex items-center justify-between text-[10px]'>
                  {metric.label}
                  <metric.Icon
                    className='size-3 text-sky-500'
                    aria-hidden='true'
                  />
                </div>
                <strong className='font-mono text-base tabular-nums'>
                  {metric.value}
                </strong>
                {metric.delta && (
                  <p className='text-muted-foreground mt-1 text-[9px]'>
                    {t('Sampling increment')}: {metric.delta}
                  </p>
                )}
              </article>
            ))}
          </div>
          <div className='grid gap-4 lg:grid-cols-2'>
            <figure aria-label={t('Cumulative device counters')}>
              <figcaption className='text-muted-foreground mb-3 flex justify-between gap-2 text-[10px]'>
                <span>{t('Cumulative device counters')}</span>
                <span className='flex gap-3'>
                  <span className='text-sky-500'>● {t('Receive')}</span>
                  <span className='text-violet-500'>● {t('Transmit')}</span>
                </span>
              </figcaption>
              <div className='space-y-3'>
                {groups.map((group) => {
                  const rx = sumONTTraffic(
                      group.readings.map((reading) => reading.rx)
                    ),
                    tx = sumONTTraffic(
                      group.readings.map((reading) => reading.tx)
                    )
                  return (
                    <div key={group.id}>
                      <p className='mb-1 truncate text-[10px]'>{group.name}</p>
                      <svg
                        role='img'
                        aria-label={`${group.name}: ${t('Receive')} ${bytes(rx)}, ${t('Transmit')} ${bytes(tx)}`}
                        viewBox='0 0 1000 14'
                        preserveAspectRatio='none'
                        className='h-3.5 w-full'
                      >
                        <rect
                          width='1000'
                          height='14'
                          rx='3'
                          className='fill-muted/40'
                        />
                        <rect
                          width={((rx ?? 0) / maximum) * 1000}
                          height='5'
                          y='1'
                          rx='2'
                          className='fill-sky-500'
                        />
                        <rect
                          width={((tx ?? 0) / maximum) * 1000}
                          height='5'
                          y='8'
                          rx='2'
                          className='fill-violet-500'
                        />
                      </svg>
                      <div className='text-muted-foreground mt-1 flex justify-between font-mono text-[9px]'>
                        <span>{bytes(rx)}</span>
                        <span>{bytes(tx)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </figure>
            <figure aria-label={t('Traffic rate history')}>
              <figcaption className='text-muted-foreground mb-2 text-[10px]'>
                {t('Traffic rate history')}
              </figcaption>
              <div className='h-40 min-w-0'>
                {chart.some(
                  (point) => point.rx !== null || point.tx !== null
                ) ? (
                  <ResponsiveContainer width='100%' height='100%'>
                    <LineChart
                      data={chart}
                      margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray='3 3'
                        vertical={false}
                        opacity={0.15}
                      />
                      <XAxis
                        dataKey='timestamp'
                        type='number'
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(value) =>
                          new Date(Number(value) * 1000).toLocaleTimeString(
                            locale,
                            { hour: '2-digit', minute: '2-digit' }
                          )
                        }
                        tick={{ fontSize: 9 }}
                      />
                      <YAxis
                        width={62}
                        tickFormatter={(value) => rate(Number(value))}
                        tick={{ fontSize: 8 }}
                      />
                      <Tooltip
                        formatter={(value) => rate(Number(value))}
                        labelFormatter={(value) =>
                          new Date(Number(value) * 1000).toLocaleString(locale)
                        }
                        contentStyle={{
                          background: 'var(--color-background)',
                          borderRadius: 8,
                          fontSize: 10,
                        }}
                      />
                      <Line
                        name={t('Average receive rate')}
                        dataKey='rx'
                        stroke='#0ea5e9'
                        dot={
                          chart.filter((point) => point.rx !== null).length < 2
                        }
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                      <Line
                        name={t('Average transmit rate')}
                        dataKey='tx'
                        stroke='#8b5cf6'
                        dot={
                          chart.filter((point) => point.tx !== null).length < 2
                        }
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className='text-muted-foreground flex h-full items-center justify-center rounded-lg border border-dashed text-xs'>
                    {t('Collecting traffic baseline')}
                  </p>
                )}
              </div>
            </figure>
          </div>
          <div className='overflow-x-auto rounded-lg border'>
            <table
              aria-label={t('Traffic statistics')}
              className='w-full min-w-[550px] text-left text-[10px]'
            >
              <thead className='bg-muted/40 text-muted-foreground'>
                <tr>
                  <th className='px-3 py-2'>{t('Name')}</th>
                  <th className='px-3 py-2'>{t('Received traffic')}</th>
                  <th className='px-3 py-2'>{t('Sent traffic')}</th>
                  <th className='px-3 py-2'>{t('Average receive rate')}</th>
                  <th className='px-3 py-2'>{t('Average transmit rate')}</th>
                </tr>
              </thead>
              <tbody>
                {readings.map((reading) => (
                  <tr
                    key={reading.counter.id}
                    className='even:bg-muted/15 border-t'
                  >
                    <th
                      scope='row'
                      className='max-w-60 px-3 py-2 font-medium'
                      title={`${reading.counter.id} · ${reading.counter.name} · ${reading.counter.service}`}
                    >
                      {counterLabel(reading.counter)}
                      {reading.reset && (
                        <span className='mt-1 block text-amber-500'>
                          {t('Counter reset detected')}
                        </span>
                      )}
                    </th>
                    <td
                      title={reading.counter.rx_bytes ?? undefined}
                      className='px-3 py-2 font-mono'
                    >
                      {bytes(reading.rx)}
                    </td>
                    <td
                      title={reading.counter.tx_bytes ?? undefined}
                      className='px-3 py-2 font-mono'
                    >
                      {bytes(reading.tx)}
                    </td>
                    <td className='px-3 py-2 font-mono'>
                      {rate(reading.rxRate)}
                    </td>
                    <td className='px-3 py-2 font-mono'>
                      {rate(reading.txRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className='text-muted-foreground text-[9px]'>
        {t('RX and TX follow the device interface direction.')}{' '}
        {t(
          'Rate is averaged between samples; missing data or counter resets leave a gap.'
        )}{' '}
        {t(
          'Service classification requires firmware metadata. Application-level usage is not available.'
        )}
      </p>
    </section>
  )
}
