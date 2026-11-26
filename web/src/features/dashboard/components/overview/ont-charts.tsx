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
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { ONTHistory } from '@/features/dashboard/ont-api'
import { toIntlLocale } from '@/i18n/languages'

export function ONTCharts(props: {
  history?: ONTHistory
  loading: boolean
  failed: boolean
  interval: number
}) {
  const { t, i18n } = useTranslation()
  const points = props.history?.points ?? []
  const chartPoints = points.flatMap((point, index) => {
    const previous = points[index - 1]
    const gap =
      previous && point.timestamp - previous.timestamp > props.interval * 2 + 30
    const data = {
      ...point,
      online_value: point.online === null ? null : Number(point.online),
    }
    if (!gap) return [data]
    return [
      {
        ...data,
        timestamp: previous.timestamp + props.interval,
        rx_power: null,
        tx_power: null,
        online_value: null,
      },
      data,
    ]
  })
  const timeLabel = (value: number) =>
    new Date(value * 1000).toLocaleTimeString(toIntlLocale(i18n.language), {
      hour: '2-digit',
      minute: '2-digit',
    })
  const events = (props.history?.events ?? []).slice(0, 40)
  const opticalEvents = events.filter((event) => event.kind === 'optical_shift')
  const hasOptics = points.some(
    (point) => point.rx_power !== null || point.tx_power !== null
  )
  const hasStatus = points.some((point) => point.online !== null)
  let empty = t('Waiting for measured history. No data is simulated.')
  if (props.loading) empty = t('Loading...')
  if (props.failed) {
    empty = t('History could not be loaded. Live readings remain available.')
  }

  return (
    <div className='grid gap-3 lg:grid-cols-5'>
      <section
        aria-label={t('Optical power history')}
        className='bg-background/50 min-w-0 rounded-xl border p-3 sm:p-4 lg:col-span-3'
      >
        <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
          <h4 className='text-xs font-semibold'>
            {t('Optical power history')}
          </h4>
          <div className='flex gap-3 font-mono text-[10px]'>
            <span className='text-sky-500'>● RX · dBm</span>
            <span className='text-violet-500'>● TX · dBm</span>
            <span className='text-amber-500'>◆ {t('Marked change')}</span>
          </div>
        </div>
        <div
          className='h-52 min-w-0'
          role='img'
          aria-label={t(
            'Measured receive and transmit optical power over time'
          )}
        >
          {!hasOptics && (
            <div className='text-muted-foreground flex h-full items-center justify-center rounded-lg border border-dashed p-6 text-center text-xs'>
              {empty}
            </div>
          )}
          {hasOptics && (
            <ResponsiveContainer width='100%' height='100%'>
              <LineChart
                data={chartPoints}
                margin={{ top: 12, right: 14, left: -16, bottom: 0 }}
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
                  tickFormatter={timeLabel}
                  tick={{ fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={35}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  labelFormatter={(value) =>
                    new Date(Number(value) * 1000).toLocaleString(
                      toIntlLocale(i18n.language)
                    )
                  }
                  formatter={(value) =>
                    value == null ? '—' : `${Number(value).toFixed(2)} dBm`
                  }
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 10,
                    background: 'var(--popover)',
                    borderColor: 'var(--border)',
                  }}
                />
                <Line
                  dataKey='rx_power'
                  name={t('Receive optical power')}
                  stroke='#0ea5e9'
                  strokeWidth={2}
                  dot={points.length < 2}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  dataKey='tx_power'
                  name={t('Transmit optical power')}
                  stroke='#8b5cf6'
                  strokeWidth={2}
                  dot={points.length < 2}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                {opticalEvents.map((event) => (
                  <ReferenceDot
                    key={event.id}
                    x={event.timestamp}
                    y={Number(event.current)}
                    r={4}
                    fill='#f59e0b'
                    stroke='var(--background)'
                  />
                ))}
                {events
                  .filter((event) => event.kind === 'device_alarm')
                  .map((event) => (
                    <ReferenceLine
                      key={event.id}
                      x={event.timestamp}
                      stroke='#f43f5e'
                      strokeDasharray='3 3'
                      label={{
                        value: '!',
                        position: 'insideTopRight',
                        fill: '#f43f5e',
                        fontSize: 10,
                      }}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className='text-muted-foreground mt-2 text-[10px]'>
          {t(
            'Changes of at least 3 dB between nearby samples are marked for review; this is not a device alarm.'
          )}
        </p>
      </section>
      <section
        aria-label={t('WAN state history')}
        className='bg-background/50 min-w-0 rounded-xl border p-3 sm:p-4 lg:col-span-2'
      >
        <div className='mb-3 flex items-center justify-between gap-2'>
          <h4 className='text-xs font-semibold'>{t('WAN state history')}</h4>
          <span className='text-muted-foreground text-[10px]'>
            {t('IP changes and link events')}
          </span>
        </div>
        <div
          className='h-52 min-w-0'
          role='img'
          aria-label={t('Observed Internet connection state over time')}
        >
          {!hasStatus && (
            <div className='text-muted-foreground flex h-full items-center justify-center rounded-lg border border-dashed p-6 text-center text-xs'>
              {empty}
            </div>
          )}
          {hasStatus && (
            <ResponsiveContainer width='100%' height='100%'>
              <AreaChart
                data={chartPoints}
                margin={{ top: 12, right: 10, left: -12, bottom: 0 }}
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
                  tickFormatter={timeLabel}
                  tick={{ fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={35}
                />
                <YAxis
                  domain={[0, 1]}
                  ticks={[0, 1]}
                  tickFormatter={(value) =>
                    value === 1 ? t('Online') : t('Offline')
                  }
                  tick={{ fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={58}
                />
                <Tooltip
                  labelFormatter={(value) =>
                    new Date(Number(value) * 1000).toLocaleString(
                      toIntlLocale(i18n.language)
                    )
                  }
                  formatter={(value) =>
                    Number(value) === 1 ? t('Online') : t('Offline')
                  }
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 10,
                    background: 'var(--popover)',
                    borderColor: 'var(--border)',
                  }}
                />
                <Area
                  type='stepAfter'
                  dataKey='online_value'
                  name={t('Internet connection')}
                  stroke='#10b981'
                  fill='#10b981'
                  fillOpacity={0.12}
                  strokeWidth={2}
                  connectNulls={false}
                  dot={points.length < 2}
                  isAnimationActive={false}
                />
                {events
                  .filter((event) =>
                    [
                      'ip_changed',
                      'link_down',
                      'link_up',
                      'collection_failed',
                    ].includes(event.kind)
                  )
                  .map((event) => (
                    <ReferenceLine
                      key={event.id}
                      x={event.timestamp}
                      stroke={
                        event.severity === 'critical' ? '#f43f5e' : '#f59e0b'
                      }
                      strokeDasharray='3 3'
                    />
                  ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div
          className='mt-3 flex h-3 gap-0.5'
          aria-label={t('Collection continuity')}
        >
          {points.slice(-90).map((point) => (
            <span
              key={point.timestamp}
              className={`min-w-0 flex-1 rounded-xs ${point.collected ? 'bg-emerald-500/60' : 'bg-amber-500/80'}`}
              title={`${timeLabel(point.timestamp)} · ${point.collected ? t('Collected') : t('Collection interrupted')}`}
            />
          ))}
        </div>
        <p className='text-muted-foreground mt-2 text-[10px]'>
          {t(
            'Missing readings stay as gaps. Collection failures are not treated as network outages.'
          )}
        </p>
      </section>
    </div>
  )
}
