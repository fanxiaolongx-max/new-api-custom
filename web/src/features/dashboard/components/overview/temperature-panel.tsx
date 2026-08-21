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
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Cpu,
  Flame,
  HardDrive,
  RotateCw,
  Thermometer,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Button } from '@/components/ui/button'
import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getSystemTemperature,
  type TemperatureOverview,
  type TemperaturePoint,
} from '@/features/dashboard/api'
import { cn } from '@/lib/utils'

function getTempTone(temp: number, type: 'cpu' | 'nvme' | 'pch'): {
  textClass: string
  dotClass: string
  badgeTone: IconBadgeTone
  statusTextKey: string
} {
  if (!temp || temp <= 0) {
    return {
      textClass: 'text-muted-foreground',
      dotClass: 'bg-muted',
      badgeTone: 'info',
      statusTextKey: 'Unknown',
    }
  }

  const warmThreshold = type === 'nvme' ? 65 : 75
  const normalThreshold = type === 'nvme' ? 50 : 60

  if (temp >= warmThreshold) {
    return {
      textClass: 'text-rose-500 font-semibold',
      dotClass: 'bg-rose-500 animate-pulse',
      badgeTone: 'danger',
      statusTextKey: 'Warm',
    }
  }
  if (temp >= normalThreshold) {
    return {
      textClass: 'text-amber-500 font-medium',
      dotClass: 'bg-amber-500',
      badgeTone: 'warning',
      statusTextKey: 'Normal',
    }
  }
  return {
    textClass: 'text-emerald-500 font-medium',
    dotClass: 'bg-emerald-500',
    badgeTone: 'success',
    statusTextKey: 'Cool',
  }
}

export function TemperaturePanel() {
  const { t } = useTranslation()
  const [showSensorsDetail, setShowSensorsDetail] = useState(false)

  const tempQuery = useQuery({
    queryKey: ['system-temperature-overview'],
    queryFn: async () => {
      const res = await getSystemTemperature()
      return res.data
    },
    refetchInterval: 30 * 1000, // 30秒自动轮询刷新
    staleTime: 15 * 1000,
    retry: 1,
  })

  const data: TemperatureOverview | undefined = tempQuery.data
  const loading = tempQuery.isLoading
  const current: TemperaturePoint = data?.current ?? {
    timestamp: 0,
    time_str: '--',
    cpu: 0,
    nvme: 0,
    pch: 0,
  }

  const history = useMemo(() => {
    if (!data?.history || data.history.length === 0) {
      if (current.cpu > 0 || current.nvme > 0 || current.pch > 0) {
        return [current]
      }
      return []
    }
    return data.history
  }, [data?.history, current])

  const cpuTone = getTempTone(current.cpu, 'cpu')
  const nvmeTone = getTempTone(current.nvme, 'nvme')
  const pchTone = getTempTone(current.pch, 'pch')

  const hasSensors = Boolean(data?.available && (current.cpu > 0 || current.nvme > 0 || current.pch > 0))

  return (
    <section className='bg-card h-full overflow-hidden rounded-2xl border shadow-xs'>
      <div className='flex items-center justify-between gap-2 border-b px-4 py-3 sm:px-5'>
        <div className='flex items-center gap-2'>
          <IconBadge tone='warning' size='sm'>
            <Thermometer />
          </IconBadge>
          <h3 className='text-sm font-semibold'>{t('Hardware Temperature')}</h3>
          <span className='inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400'>
            <span className='size-1.5 rounded-full bg-emerald-500 animate-pulse' />
            {t('Live')}
          </span>
        </div>

        <div className='flex items-center gap-1.5'>
          {hasSensors && data?.sensors && data.sensors.length > 0 && (
            <Button
              variant='ghost'
              size='sm'
              className='h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground'
              onClick={() => setShowSensorsDetail(!showSensorsDetail)}
            >
              {showSensorsDetail ? (
                <>
                  <ChevronUp className='size-3.5' />
                  <span>{t('Collapse')}</span>
                </>
              ) : (
                <>
                  <ChevronDown className='size-3.5' />
                  <span>{t('Sensors')} ({data.sensors.length})</span>
                </>
              )}
            </Button>
          )}
          <Button
            variant='ghost'
            size='icon'
            className='size-7 text-muted-foreground hover:text-foreground'
            onClick={() => void tempQuery.refetch()}
            disabled={tempQuery.isFetching}
            title={t('Refresh')}
          >
            <RotateCw className={cn('size-3.5', tempQuery.isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className='space-y-4 p-4 sm:p-5'>
        {/* 实时温度指标卡 */}
        <div className='grid grid-cols-3 gap-2 sm:gap-3'>
          <TempCard
            icon={Cpu}
            label={t('CPU Core')}
            subLabel={t('Processor')}
            value={current.cpu > 0 ? `${current.cpu.toFixed(1)}°C` : '--'}
            tone={cpuTone.badgeTone}
            textClass={cpuTone.textClass}
            dotClass={cpuTone.dotClass}
            statusText={t(cpuTone.statusTextKey)}
            loading={loading}
          />
          <TempCard
            icon={HardDrive}
            label={t('NVMe SSD')}
            subLabel={t('Storage')}
            value={current.nvme > 0 ? `${current.nvme.toFixed(1)}°C` : '--'}
            tone={nvmeTone.badgeTone}
            textClass={nvmeTone.textClass}
            dotClass={nvmeTone.dotClass}
            statusText={t(nvmeTone.statusTextKey)}
            loading={loading}
          />
          <TempCard
            icon={Activity}
            label={t('Motherboard / PCH')}
            subLabel={t('Chipset')}
            value={current.pch > 0 ? `${current.pch.toFixed(1)}°C` : '--'}
            tone={pchTone.badgeTone}
            textClass={pchTone.textClass}
            dotClass={pchTone.dotClass}
            statusText={t(pchTone.statusTextKey)}
            loading={loading}
          />
        </div>

        {/* 传感器详情折叠列表 */}
        {showSensorsDetail && data?.sensors && data.sensors.length > 0 && (
          <div className='rounded-xl border bg-muted/20 p-3'>
            <div className='mb-2 text-[11px] font-medium text-muted-foreground'>
              {t('Detected Hardware Sensors')}
            </div>
            <div className='grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-3'>
              {data.sensors.map((sensor, idx) => (
                <div
                  key={`${sensor.name}-${sensor.label}-${idx}`}
                  className='flex items-center justify-between rounded-lg bg-background/60 px-2.5 py-1.5 text-xs'
                >
                  <span className='truncate font-mono text-[11px] text-muted-foreground' title={`${sensor.name}: ${sensor.label}`}>
                    {sensor.label || sensor.name}
                  </span>
                  <span className='font-mono font-semibold tabular-nums ml-2'>
                    {sensor.temp_c.toFixed(1)}°C
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 历史趋势曲线图 */}
        <div>
          <div className='mb-2 flex items-center justify-between'>
            <span className='text-xs font-medium text-muted-foreground'>
              {t('Temperature Trend')} ({history.length} {t('points')})
            </span>
            <div className='flex items-center gap-3 text-[11px] font-mono'>
              <span className='inline-flex items-center gap-1 text-rose-500'>
                <span className='size-2 rounded-full bg-rose-500' />
                CPU
              </span>
              <span className='inline-flex items-center gap-1 text-emerald-500'>
                <span className='size-2 rounded-full bg-emerald-500' />
                NVMe
              </span>
              <span className='inline-flex items-center gap-1 text-amber-500'>
                <span className='size-2 rounded-full bg-amber-500' />
                PCH
              </span>
            </div>
          </div>

          {loading ? (
            <Skeleton className='h-36 w-full rounded-xl' />
          ) : history.length > 0 ? (
            <div className='h-36 w-full'>
              <ResponsiveContainer width='100%' height='100%'>
                <AreaChart data={history} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id='cpuGrad' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='5%' stopColor='#f43f5e' stopOpacity={0.35} />
                      <stop offset='95%' stopColor='#f43f5e' stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id='nvmeGrad' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='5%' stopColor='#10b981' stopOpacity={0.35} />
                      <stop offset='95%' stopColor='#10b981' stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id='pchGrad' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='5%' stopColor='#f59e0b' stopOpacity={0.3} />
                      <stop offset='95%' stopColor='#f59e0b' stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray='3 3' vertical={false} opacity={0.15} />
                  <XAxis
                    dataKey='time_str'
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }}
                    minTickGap={24}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }}
                    unit='°'
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type='monotone'
                    dataKey='cpu'
                    name='CPU'
                    stroke='#f43f5e'
                    strokeWidth={2}
                    fillOpacity={1}
                    fill='url(#cpuGrad)'
                    isAnimationActive={false}
                  />
                  <Area
                    type='monotone'
                    dataKey='nvme'
                    name='NVMe'
                    stroke='#10b981'
                    strokeWidth={1.8}
                    fillOpacity={1}
                    fill='url(#nvmeGrad)'
                    isAnimationActive={false}
                  />
                  <Area
                    type='monotone'
                    dataKey='pch'
                    name='PCH'
                    stroke='#f59e0b'
                    strokeWidth={1.8}
                    fillOpacity={1}
                    fill='url(#pchGrad)'
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className='flex h-36 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground'>
              {data?.message || t('No temperature history yet. Recording in progress...')}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function TempCard(props: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  subLabel: string
  value: string
  statusText: string
  tone: IconBadgeTone
  textClass: string
  dotClass: string
  loading: boolean
}) {
  const Icon = props.icon
  return (
    <div className='bg-muted/40 rounded-xl p-3 sm:px-4 sm:py-3 transition-colors'>
      <div className='flex items-center justify-between gap-1'>
        <div className='flex items-center gap-1.5 text-muted-foreground text-[11px] font-medium truncate'>
          <IconBadge tone={props.tone} size='xs'>
            <Icon />
          </IconBadge>
          <span className='truncate'>{props.label}</span>
        </div>
        <span className='inline-flex items-center gap-1 shrink-0'>
          <span className={cn('size-1.5 rounded-full', props.dotClass)} />
          <span className='text-[10px] text-muted-foreground font-medium hidden sm:inline'>
            {props.statusText}
          </span>
        </span>
      </div>

      {props.loading ? (
        <Skeleton className='mt-2 h-6 w-16' />
      ) : (
        <div className={cn('mt-2 font-mono text-lg font-bold tracking-tight tabular-nums', props.textClass)}>
          {props.value}
        </div>
      )}
    </div>
  )
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className='rounded-xl border bg-background/95 p-2.5 shadow-md backdrop-blur text-xs'>
      <div className='font-mono font-medium text-muted-foreground mb-1.5'>
        {label}
      </div>
      <div className='space-y-1 font-mono'>
        {payload.map((entry) => (
          <div key={entry.name} className='flex items-center justify-between gap-3'>
            <span className='flex items-center gap-1.5'>
              <span className='size-2 rounded-full' style={{ backgroundColor: entry.color }} />
              <span>{entry.name}:</span>
            </span>
            <span className='font-semibold tabular-nums'>{entry.value ? `${entry.value.toFixed(1)}°C` : '--'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
