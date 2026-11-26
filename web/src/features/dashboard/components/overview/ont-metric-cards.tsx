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
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Globe,
  Radio,
  ShieldAlert,
  Thermometer,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Line, LineChart, ResponsiveContainer } from 'recharts'

import type { ONTPoint } from '@/features/dashboard/ont-api'
import { cn } from '@/lib/utils'

function ONTMetric(props: {
  label: string
  value: string
  unit?: string
  icon: typeof Activity
  color: string
  source?: string
  trace?: { timestamp: number; value: number | null }[]
}) {
  const { t } = useTranslation()
  const Icon = props.icon
  return (
    <article className='bg-background/70 relative min-w-0 overflow-hidden rounded-xl border px-3 py-3 sm:px-4'>
      <div className='mb-2 flex items-center justify-between gap-2'>
        <h4 className='text-muted-foreground text-[11px] font-medium'>
          {props.label}
        </h4>
        <Icon
          className={cn('size-3.5 shrink-0', props.color)}
          aria-hidden='true'
        />
      </div>
      <div className='flex min-h-8 flex-wrap items-baseline gap-1.5'>
        <span
          className={cn(
            'break-all font-mono text-xl font-semibold tracking-tight tabular-nums',
            props.color
          )}
        >
          {props.value}
        </span>
        <span className='text-muted-foreground text-[10px]'>{props.unit}</span>
      </div>
      <div className='mt-1 flex h-7 items-end justify-between gap-2'>
        <p
          className='text-muted-foreground min-w-0 text-[9px]'
          title={props.source}
        >
          {props.source ? t('Measured') : t('Not reported')}
        </p>
        {props.trace && props.trace.some((point) => point.value !== null) && (
          <div className='h-7 w-20 shrink-0' aria-hidden='true'>
            <ResponsiveContainer width='100%' height='100%'>
              <LineChart data={props.trace}>
                <Line
                  dataKey='value'
                  stroke='currentColor'
                  className={props.color}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </article>
  )
}

export function ONTMetricCards(props: {
  current?: ONTPoint
  history: ONTPoint[]
}) {
  const { t } = useTranslation()
  const point = props.current
  const number = (value: number | null | undefined, digits: number) =>
    value == null ? '—' : value.toFixed(digits)
  const trace = (
    metric: 'rx_power' | 'tx_power' | 'temperature' | 'voltage' | 'bias_current'
  ) =>
    props.history
      .slice(-60)
      .map((sample) => ({ timestamp: sample.timestamp, value: sample[metric] }))
  let state = t('Unknown')
  let stateColor = 'text-muted-foreground'
  if (point?.online === true) {
    state = t('Online')
    stateColor = 'text-emerald-500'
  }
  if (point?.online === false) {
    state = t('Offline')
    stateColor = 'text-rose-500'
  }
  return (
    <div className='grid grid-cols-2 gap-2.5 md:grid-cols-4'>
      <ONTMetric
        label={t('Receive optical power')}
        value={number(point?.rx_power, 2)}
        unit='dBm'
        icon={ArrowDownLeft}
        color='text-sky-500'
        source={point?.sources.rx_power}
        trace={trace('rx_power')}
      />
      <ONTMetric
        label={t('Transmit optical power')}
        value={number(point?.tx_power, 2)}
        unit='dBm'
        icon={ArrowUpRight}
        color='text-violet-500'
        source={point?.sources.tx_power}
        trace={trace('tx_power')}
      />
      <ONTMetric
        label={t('Internet connection')}
        value={state}
        icon={Radio}
        color={stateColor}
        source={point?.online != null ? 'WAN' : undefined}
      />
      <ONTMetric
        label={t('Internet IP address')}
        value={point?.internet_ip || '—'}
        icon={Globe}
        color='text-foreground'
        source={point?.internet_ip ? 'WAN' : undefined}
      />
      <ONTMetric
        label={t('Temperature')}
        value={number(point?.temperature, 1)}
        unit='°C'
        icon={Thermometer}
        color='text-orange-500'
        source={point?.sources.temperature}
        trace={trace('temperature')}
      />
      <ONTMetric
        label={t('Voltage')}
        value={number(point?.voltage, 3)}
        unit='V'
        icon={Zap}
        color='text-amber-500'
        source={point?.sources.voltage}
        trace={trace('voltage')}
      />
      <ONTMetric
        label={t('Laser bias current')}
        value={number(point?.bias_current, 2)}
        unit='mA'
        icon={Activity}
        color='text-teal-500'
        source={point?.sources.bias_current}
        trace={trace('bias_current')}
      />
      <ONTMetric
        label={t('Active device alarms')}
        value={
          point?.alarm_reported ? String(point.active_alarms?.length ?? 0) : '—'
        }
        icon={ShieldAlert}
        color={
          point?.active_alarms?.length
            ? 'text-rose-500'
            : 'text-muted-foreground'
        }
        source={point?.alarm_reported ? 'ONT' : undefined}
      />
    </div>
  )
}
