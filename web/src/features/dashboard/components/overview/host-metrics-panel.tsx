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
  HardDrive,
  Layers,
  MemoryStick,
  RotateCw,
  Server,
  Zap,
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
import { IconBadge } from '@/components/ui/icon-badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getSystemHostMetrics,
  type HostMetricsOverview,
  type HostMetricsPoint,
} from '@/features/dashboard/api'
import { cn } from '@/lib/utils'

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const idx = Math.min(i, sizes.length - 1)
  const val = bytes / Math.pow(k, idx)
  return `${val.toFixed(idx >= 3 ? 2 : 1)} ${sizes[idx]}`
}

function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) return '--'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function getUsageStatus(percent: number): {
  colorText: string
  colorBg: string
  colorBorder: string
  progressClass: string
  labelKey: string
} {
  if (percent >= 85) {
    return {
      colorText: 'text-rose-500',
      colorBg: 'bg-rose-500/10',
      colorBorder: 'border-rose-500/20',
      progressClass: '[&>div]:bg-rose-500',
      labelKey: 'High',
    }
  }
  if (percent >= 65) {
    return {
      colorText: 'text-amber-500',
      colorBg: 'bg-amber-500/10',
      colorBorder: 'border-amber-500/20',
      progressClass: '[&>div]:bg-amber-500',
      labelKey: 'Moderate',
    }
  }
  return {
    colorText: 'text-emerald-500',
    colorBg: 'bg-emerald-500/10',
    colorBorder: 'border-emerald-500/20',
    progressClass: '[&>div]:bg-emerald-500',
    labelKey: 'Normal',
  }
}

export function HostMetricsPanel() {
  const { t } = useTranslation()
  const [showDetail, setShowDetail] = useState(false)

  const metricsQuery = useQuery({
    queryKey: ['system-host-metrics'],
    queryFn: async () => {
      const res = await getSystemHostMetrics()
      return res.data
    },
    refetchInterval: 10 * 1000, // 10秒自动刷新
    staleTime: 5 * 1000,
    retry: 1,
  })

  const data: HostMetricsOverview | undefined = metricsQuery.data
  const loading = metricsQuery.isLoading
  const isFetching = metricsQuery.isFetching

  const current: HostMetricsPoint = data?.current ?? {
    timestamp: 0,
    time_str: '--',
    cpu: data?.cpu?.usage_percent ?? 0,
    memory: data?.memory?.usage_percent ?? 0,
  }

  const history = useMemo(() => {
    const rawList =
      data?.history && data.history.length > 0
        ? data.history
        : current.cpu > 0 || current.memory > 0
          ? [current]
          : []

    return rawList.map((item) => {
      let localTimeStr = item.time_str
      if (item.timestamp > 0) {
        const date = new Date(item.timestamp * 1000)
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        const seconds = String(date.getSeconds()).padStart(2, '0')
        localTimeStr = `${hours}:${minutes}:${seconds}`
      }
      return {
        ...item,
        cpu: Number(item.cpu.toFixed(1)),
        memory: Number(item.memory.toFixed(1)),
        time_str: localTimeStr,
      }
    })
  }, [data?.history, current])

  const cpuStatus = getUsageStatus(data?.cpu?.usage_percent ?? 0)
  const memStatus = getUsageStatus(data?.memory?.usage_percent ?? 0)
  const diskStatus = getUsageStatus(data?.storage?.usage_percent ?? 0)

  return (
    <section className='bg-card h-full overflow-hidden rounded-2xl border shadow-xs'>
      {/* 顶部标题栏 */}
      <div className='flex items-center justify-between gap-2 border-b px-4 py-3 sm:px-5'>
        <div className='flex items-center gap-2.5'>
          <IconBadge tone='info' size='sm'>
            <Cpu className='size-4' />
          </IconBadge>
          <div>
            <div className='flex items-center gap-2'>
              <h3 className='text-sm font-semibold'>{t('Host resources')}</h3>
              <span className='inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400'>
                <span className='size-1.5 rounded-full bg-emerald-500 animate-pulse' />
                {t('Live')}
              </span>
            </div>
          </div>
        </div>

        <div className='flex items-center gap-2'>
          <Button
            variant='ghost'
            size='sm'
            className='h-7 px-2 text-xs text-muted-foreground hover:text-foreground'
            onClick={() => metricsQuery.refetch()}
            disabled={isFetching}
            title={t('Refresh')}
          >
            <RotateCw
              className={cn('size-3.5', isFetching && 'animate-spin')}
            />
            <span className='hidden sm:inline ml-1'>{t('Refresh')}</span>
          </Button>

          <Button
            variant='outline'
            size='sm'
            className='h-7 gap-1 px-2.5 text-xs'
            onClick={() => setShowDetail((v: boolean) => !v)}
          >
            {showDetail ? (
              <>
                <ChevronUp className='size-3.5' />
                <span>{t('Collapse details')}</span>
              </>
            ) : (
              <>
                <ChevronDown className='size-3.5' />
                <span>{t('System specs')}</span>
              </>
            )}
          </Button>
        </div>
      </div>

      <div className='space-y-4 p-4 sm:p-5'>
        {/* 四格核心指标 */}
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          {/* 1. CPU 占用 */}
          <div className='relative overflow-hidden rounded-xl border bg-card/60 p-3.5 transition-all hover:bg-accent/5'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
                <Cpu className='size-3.5 text-cyan-500' />
                <span>{t('CPU Usage')}</span>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                  cpuStatus.colorText,
                  cpuStatus.colorBg,
                  cpuStatus.colorBorder
                )}
              >
                {t(cpuStatus.labelKey)}
              </span>
            </div>

            <div className='mt-2 flex items-baseline justify-between'>
              <span className='font-mono text-2xl font-bold tracking-tight tabular-nums text-foreground'>
                {loading ? (
                  <Skeleton className='h-8 w-16' />
                ) : (
                  `${(data?.cpu?.usage_percent ?? 0).toFixed(1)}%`
                )}
              </span>
              <span className='font-mono text-xs text-muted-foreground'>
                {data?.cpu?.logical_cores
                  ? `${data.cpu.logical_cores} ${t('Cores')}`
                  : ''}
              </span>
            </div>

            <div className='mt-3 space-y-1.5'>
              <Progress
                value={Math.min(100, Math.max(0, data?.cpu?.usage_percent ?? 0))}
                className={cn('h-1.5 w-full bg-muted/60', cpuStatus.progressClass)}
              />
              <div className='truncate text-[10px] text-muted-foreground' title={data?.cpu?.model_name}>
                {data?.cpu?.model_name || t('CPU Processor')}
              </div>
            </div>
          </div>

          {/* 2. 内存 (RAM) 占用 */}
          <div className='relative overflow-hidden rounded-xl border bg-card/60 p-3.5 transition-all hover:bg-accent/5'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
                <MemoryStick className='size-3.5 text-violet-500' />
                <span>{t('Memory')}</span>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                  memStatus.colorText,
                  memStatus.colorBg,
                  memStatus.colorBorder
                )}
              >
                {t(memStatus.labelKey)}
              </span>
            </div>

            <div className='mt-2 flex items-baseline justify-between'>
              <span className='font-mono text-2xl font-bold tracking-tight tabular-nums text-foreground'>
                {loading ? (
                  <Skeleton className='h-8 w-16' />
                ) : (
                  `${(data?.memory?.usage_percent ?? 0).toFixed(1)}%`
                )}
              </span>
              <span className='font-mono text-xs text-muted-foreground'>
                {formatBytes(data?.memory?.used_bytes)} / {formatBytes(data?.memory?.total_bytes)}
              </span>
            </div>

            <div className='mt-3 space-y-1.5'>
              <Progress
                value={Math.min(100, Math.max(0, data?.memory?.usage_percent ?? 0))}
                className={cn('h-1.5 w-full bg-muted/60', memStatus.progressClass)}
              />
              <div className='flex items-center justify-between text-[10px] text-muted-foreground font-mono'>
                <span>{t('Available')}: {formatBytes(data?.memory?.available_bytes)}</span>
                {Boolean(data?.memory?.swap_total_bytes) && (
                  <span>Swap: {(data?.memory?.swap_usage_percent ?? 0).toFixed(0)}%</span>
                )}
              </div>
            </div>
          </div>

          {/* 3. 磁盘存储 */}
          <div className='relative overflow-hidden rounded-xl border bg-card/60 p-3.5 transition-all hover:bg-accent/5'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
                <HardDrive className='size-3.5 text-amber-500' />
                <span>{t('Disk storage')}</span>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                  diskStatus.colorText,
                  diskStatus.colorBg,
                  diskStatus.colorBorder
                )}
              >
                {t(diskStatus.labelKey)}
              </span>
            </div>

            <div className='mt-2 flex items-baseline justify-between'>
              <span className='font-mono text-2xl font-bold tracking-tight tabular-nums text-foreground'>
                {loading ? (
                  <Skeleton className='h-8 w-16' />
                ) : (
                  `${(data?.storage?.usage_percent ?? 0).toFixed(1)}%`
                )}
              </span>
              <span className='font-mono text-xs text-muted-foreground'>
                {formatBytes(data?.storage?.used_bytes)} / {formatBytes(data?.storage?.total_bytes)}
              </span>
            </div>

            {data?.storage?.disks && data.storage.disks.length > 1 ? (
              <div className='mt-2.5 space-y-1.5 border-t pt-1.5'>
                {data.storage.disks.map((d, i) => {
                  const dStatus = getUsageStatus(d.usage_percent)
                  return (
                    <div key={i} className='space-y-0.5'>
                      <div className='flex items-center justify-between text-[10px] font-mono text-muted-foreground'>
                        <span className='truncate max-w-[120px]' title={d.display_name || d.mount_point}>
                          {d.display_name || d.mount_point}
                        </span>
                        <span className='font-medium text-foreground'>
                          {d.usage_percent.toFixed(0)}% ({formatBytes(d.used_bytes)} / {formatBytes(d.total_bytes)})
                        </span>
                      </div>
                      <Progress
                        value={Math.min(100, Math.max(0, d.usage_percent))}
                        className={cn('h-1 w-full bg-muted/60', dStatus.progressClass)}
                      />
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className='mt-3 space-y-1.5'>
                <Progress
                  value={Math.min(100, Math.max(0, data?.storage?.usage_percent ?? 0))}
                  className={cn('h-1.5 w-full bg-muted/60', diskStatus.progressClass)}
                />
                <div className='text-[10px] text-muted-foreground font-mono'>
                  {t('Free space')}: {formatBytes(data?.storage?.free_bytes)}
                </div>
              </div>
            )}
          </div>

          {/* 4. 系统负载与运行时间 */}
          <div className='relative overflow-hidden rounded-xl border bg-card/60 p-3.5 transition-all hover:bg-accent/5'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
                <Activity className='size-3.5 text-emerald-500' />
                <span>{t('Load & Uptime')}</span>
              </div>
              <span className='rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'>
                {formatUptime(data?.host?.uptime)}
              </span>
            </div>

            <div className='mt-2 flex items-baseline justify-between'>
              <div className='font-mono text-xs font-semibold tabular-nums text-foreground space-x-1.5'>
                <span>L1: <strong className='text-sm text-foreground'>{data?.load_avg?.load1?.toFixed(2) ?? '--'}</strong></span>
                <span className='text-muted-foreground'>L5: {data?.load_avg?.load5?.toFixed(2) ?? '--'}</span>
                <span className='text-muted-foreground'>L15: {data?.load_avg?.load15?.toFixed(2) ?? '--'}</span>
              </div>
            </div>

            <div className='mt-3 flex items-center justify-between text-[10px] text-muted-foreground font-mono border-t pt-1.5'>
              <span className='flex items-center gap-1'>
                <Layers className='size-3 text-cyan-500' />
                {data?.process?.num_goroutines ?? 0} {t('goroutines')}
              </span>
              <span className='flex items-center gap-1'>
                <Zap className='size-3 text-amber-500' />
                {formatBytes(data?.process?.alloc_bytes)} {t('heap')}
              </span>
            </div>
          </div>
        </div>

        {/* 动态历史走势折线图 */}
        <div>
          <div className='mb-2 flex items-center justify-between'>
            <span className='text-xs font-medium text-muted-foreground flex items-center gap-1.5'>
              <Activity className='size-3.5 text-primary' />
              {t('Resource Usage Trend')} ({history.length} {t('samples')})
            </span>
            <div className='flex items-center gap-3 text-[11px] font-mono'>
              <span className='inline-flex items-center gap-1.5 text-cyan-500'>
                <span className='size-2 rounded-full bg-cyan-500' />
                CPU ({current.cpu.toFixed(1)}%)
              </span>
              <span className='inline-flex items-center gap-1.5 text-violet-500'>
                <span className='size-2 rounded-full bg-violet-500' />
                {t('Memory')} ({current.memory.toFixed(1)}%)
              </span>
            </div>
          </div>

          {loading ? (
            <Skeleton className='h-36 w-full rounded-xl' />
          ) : history.length > 0 ? (
            <div className='h-36 w-full'>
              <ResponsiveContainer width='100%' height='100%'>
                <AreaChart
                  data={history}
                  margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id='cpuMetricGrad' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='5%' stopColor='#06b6d4' stopOpacity={0.35} />
                      <stop offset='95%' stopColor='#06b6d4' stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id='memMetricGrad' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='5%' stopColor='#8b5cf6' stopOpacity={0.35} />
                      <stop offset='95%' stopColor='#8b5cf6' stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray='3 3' vertical={false} opacity={0.12} />
                  <XAxis
                    dataKey='time_str'
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }}
                    minTickGap={28}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }}
                    unit='%'
                  />
                  <Tooltip content={<CustomMetricsTooltip />} />
                  <Area
                    type='monotone'
                    dataKey='cpu'
                    name='CPU'
                    stroke='#06b6d4'
                    strokeWidth={2}
                    fillOpacity={1}
                    fill='url(#cpuMetricGrad)'
                    isAnimationActive={false}
                  />
                  <Area
                    type='monotone'
                    dataKey='memory'
                    name={t('Memory')}
                    stroke='#8b5cf6'
                    strokeWidth={2}
                    fillOpacity={1}
                    fill='url(#memMetricGrad)'
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className='flex h-28 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground'>
              {t('Awaiting metrics sampling...')}
            </div>
          )}
        </div>

        {/* 展开的系统规格详情 */}
        {showDetail && data && (
          <div className='rounded-xl border bg-muted/20 p-3.5 space-y-2.5 animate-in fade-in-50 duration-200'>
            <div className='flex items-center gap-1.5 text-xs font-semibold text-foreground'>
              <Server className='size-3.5 text-primary' />
              {t('Server Host Specifications')}
            </div>
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono'>
              <div className='rounded-lg bg-card p-2 border'>
                <div className='text-[10px] text-muted-foreground uppercase'>{t('Hostname')}</div>
                <div className='truncate font-semibold' title={data.host.hostname}>
                  {data.host.hostname || '--'}
                </div>
              </div>
              <div className='rounded-lg bg-card p-2 border'>
                <div className='text-[10px] text-muted-foreground uppercase'>{t('OS / Arch')}</div>
                <div className='truncate font-semibold'>
                  {data.host.os} ({data.host.arch})
                </div>
              </div>
              <div className='rounded-lg bg-card p-2 border'>
                <div className='text-[10px] text-muted-foreground uppercase'>{t('Swap Space')}</div>
                <div className='truncate font-semibold'>
                  {formatBytes(data.memory.swap_used_bytes)} / {formatBytes(data.memory.swap_total_bytes)}
                </div>
              </div>
              <div className='rounded-lg bg-card p-2 border'>
                <div className='text-[10px] text-muted-foreground uppercase'>{t('GC Cycles')}</div>
                <div className='truncate font-semibold'>
                  {data.process.num_gc} {t('times')}
                </div>
              </div>
            </div>

            {data.storage?.disks && data.storage.disks.length > 0 && (
              <div className='pt-2 border-t space-y-1.5'>
                <div className='text-[10px] text-muted-foreground uppercase font-mono'>
                  {t('Disk Partitions')}
                </div>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono'>
                  {data.storage.disks.map((d, i) => (
                    <div key={i} className='rounded-lg bg-card p-2 border flex items-center justify-between'>
                      <div className='truncate pr-2'>
                        <div className='font-semibold'>{d.display_name}</div>
                        <div className='text-[10px] text-muted-foreground'>{d.mount_point} · {d.fstype}</div>
                      </div>
                      <div className='text-right shrink-0'>
                        <div className='font-semibold'>{d.usage_percent.toFixed(1)}%</div>
                        <div className='text-[10px] text-muted-foreground'>{formatBytes(d.used_bytes)} / {formatBytes(d.total_bytes)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function CustomMetricsTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className='rounded-xl border bg-popover/95 backdrop-blur-md px-3 py-2 text-xs shadow-lg space-y-1 font-mono'>
      <div className='text-muted-foreground text-[10px] border-b pb-1 mb-1'>
        {label}
      </div>
      {payload.map((entry: any, index: number) => (
        <div key={index} className='flex items-center justify-between gap-4'>
          <span className='flex items-center gap-1.5' style={{ color: entry.color }}>
            <span
              className='size-2 rounded-full'
              style={{ backgroundColor: entry.color }}
            />
            {entry.name}:
          </span>
          <span className='font-bold tabular-nums text-foreground'>
            {entry.value}%
          </span>
        </div>
      ))}
    </div>
  )
}
