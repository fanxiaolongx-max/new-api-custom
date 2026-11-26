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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  CheckCircle2,
  Database,
  RefreshCw,
  Router,
  Settings,
  SlidersHorizontal,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getONTOverview,
  getONTHistory,
  refreshONT,
} from '@/features/dashboard/ont-api'
import {
  ontCategory,
  ontCategoryLabel,
} from '@/features/dashboard/ont-presentation'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

import { ONTCharts } from './ont-charts'
import { ONTError } from './ont-error'
import { ONTEventFeed } from './ont-event-feed'
import { ONTFieldGrid } from './ont-field-grid'
import { ONTMetricCards } from './ont-metric-cards'
import { ONTSettings } from './ont-settings'
import { ONTTrafficPanel } from './ont-traffic-panel'

export function ONTMonitorPanel() {
  const { t, i18n } = useTranslation()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hours, setHours] = useState(24)
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['system', 'ont'],
    queryFn: getONTOverview,
    refetchInterval: 10000,
    staleTime: 5000,
    retry: false,
  })
  const data = query.data
  const history = useQuery({
    queryKey: ['system', 'ont', 'history', hours],
    queryFn: () => getONTHistory(hours),
    enabled: Boolean(data?.config.enabled || data?.last_success),
    refetchInterval: 30000,
    staleTime: 15000,
    retry: false,
  })
  const refresh = useMutation({
    mutationFn: refreshONT,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['system', 'ont'] }),
  })
  let status = t('Pending')
  if (data?.state === 'disabled') status = t('Disabled')
  if (data?.state === 'collecting') status = t('Collecting')
  if (data?.state === 'ok') status = t('Connected')
  if (data?.state === 'partial') status = t('Partial')
  if (data?.state === 'error' || query.isError) status = t('Error')
  const formatTime = (timestamp: number) =>
    timestamp
      ? new Date(timestamp * 1000).toLocaleString(toIntlLocale(i18n.language))
      : '—'
  const loginBackoff = ['authentication', 'login_busy', 'locked'].includes(
    data?.error ?? ''
  )
  const waiting = Boolean(
    data &&
    (data.last_attempt + 60 > Date.now() / 1000 ||
      (loginBackoff && data.next_poll > Date.now() / 1000))
  )
  const timeWindows = [
    { hours: 1, label: t('1 hour') },
    { hours: 6, label: t('6 hours') },
    { hours: 24, label: t('24 hours') },
    { hours: 168, label: t('7 days') },
    { hours: 720, label: t('30 days') },
  ]
  const failures =
    data?.failures ?? data?.pages.filter((page) => page.error) ?? []

  return (
    <section
      aria-label={t('ONT monitor')}
      className='bg-card overflow-hidden rounded-2xl border shadow-xs'
    >
      <header className='flex flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-r from-sky-500/5 via-transparent to-violet-500/5 px-4 py-3 sm:px-5'>
        <div className='flex items-center gap-2.5'>
          <IconBadge tone='info' size='sm'>
            <Router />
          </IconBadge>
          <div>
            <h3 className='text-sm font-semibold'>{t('ONT monitor')}</h3>
            <p className='text-muted-foreground font-mono text-[10px]'>
              {data?.config.address ?? 'HG8145V5'} · HG8145V5
            </p>
          </div>
          <Badge
            variant='outline'
            className={cn(
              'text-[10px]',
              data?.state === 'ok' && 'border-emerald-500/30 text-emerald-500',
              data?.state === 'partial' && 'border-amber-500/30 text-amber-500'
            )}
          >
            {status}
          </Badge>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='ghost'
            size='sm'
            aria-label={t('Refresh ONT status')}
            disabled={
              !data?.config.enabled ||
              data.state === 'collecting' ||
              waiting ||
              refresh.isPending
            }
            onClick={() => refresh.mutate()}
          >
            <RefreshCw className='size-3.5' />
            {t('Refresh')}
          </Button>
          <Button
            variant='outline'
            size='sm'
            disabled={!data}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className='size-3.5' />
            {t('Configure ONT')}
          </Button>
        </div>
      </header>
      <div className='space-y-5 p-3 sm:p-5'>
        {query.isLoading && <Skeleton className='h-40 w-full' />}
        {query.isError && (
          <p role='alert' className='text-destructive text-sm'>
            {t(
              'Unable to load ONT monitoring. Check server configuration and try again.'
            )}{' '}
            <Button
              variant='link'
              size='sm'
              onClick={() => void query.refetch()}
            >
              {t('Retry')}
            </Button>
          </p>
        )}
        {data && (
          <>
            {!data.config.enabled && (
              <p className='text-muted-foreground rounded-lg border border-dashed p-4 text-xs'>
                {t(
                  'Configure the router login and enable monitoring to start collecting status and configuration.'
                )}
              </p>
            )}
            {data.config.enabled && data.error && data.error !== 'partial' && (
              <div
                role='status'
                className='rounded-lg border border-amber-500/20 bg-amber-500/5 p-3'
              >
                <ONTError code={data.error} />
              </div>
            )}
            {data.config.enabled && (
              <dl className='text-muted-foreground grid gap-2 text-[10px] sm:grid-cols-3'>
                <div className='flex flex-wrap gap-x-2'>
                  <dt>{t('Last attempt')}</dt>
                  <dd className='text-foreground font-mono'>
                    {formatTime(data.last_attempt)}
                  </dd>
                </div>
                <div className='flex flex-wrap gap-x-2'>
                  <dt>{t('Last successful collection')}</dt>
                  <dd className='text-foreground font-mono'>
                    {formatTime(data.last_success)}
                  </dd>
                </div>
                <div className='flex flex-wrap gap-x-2'>
                  <dt>{t('Next poll')}</dt>
                  <dd className='text-foreground font-mono'>
                    {formatTime(data.next_poll)}
                  </dd>
                </div>
              </dl>
            )}
            {data.last_success > 0 && data.state === 'error' && (
              <p className='text-[11px] text-amber-600'>
                {t(
                  'Showing the last successful data. The latest collection failed.'
                )}
              </p>
            )}
            <section aria-label={t('Live monitoring')} className='space-y-4'>
              <div className='flex flex-wrap items-center justify-between gap-3 border-b pb-3'>
                <div className='flex items-center gap-2'>
                  <span className='rounded-md bg-sky-500/10 p-1.5 text-sky-500'>
                    <Activity className='size-4' aria-hidden='true' />
                  </span>
                  <div>
                    <h4 className='text-sm font-semibold'>
                      {t('Live monitoring')}
                    </h4>
                    <p className='text-muted-foreground text-[10px]'>
                      {t('Optics, Internet state and observed changes')}
                    </p>
                  </div>
                </div>
                <div
                  role='group'
                  aria-label={t('History time window')}
                  className='bg-muted/50 flex flex-wrap gap-0.5 rounded-lg p-0.5'
                >
                  {timeWindows.map((window) => (
                    <Button
                      key={window.hours}
                      size='sm'
                      variant={hours === window.hours ? 'secondary' : 'ghost'}
                      className='h-6 px-2 text-[10px]'
                      aria-pressed={hours === window.hours}
                      onClick={() => setHours(window.hours)}
                    >
                      {window.label}
                    </Button>
                  ))}
                </div>
              </div>
              <ONTMetricCards
                current={data.current}
                history={history.data?.points ?? []}
              />
              <ONTCharts
                history={history.data}
                loading={history.isLoading}
                failed={history.isError}
                interval={data.config.interval_seconds}
              />
              <div className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]'>
                <span className='flex items-center gap-1'>
                  <Database className='size-3' aria-hidden='true' />
                  {t('Recorded samples')}:{' '}
                  <strong className='text-foreground font-mono'>
                    {history.data?.total_samples ?? 0}
                  </strong>
                </span>
                <span>{t('History retention: 30 days')}</span>
                <span>
                  {t('Sampling interval')}: {data.config.interval_seconds} s
                </span>
                {history.data?.downsampled && (
                  <span>
                    {t(
                      'Long windows are reduced for display; marked samples are retained.'
                    )}
                  </span>
                )}
              </div>
              {data.history_error && (
                <p role='alert' className='text-destructive text-xs'>
                  {t(
                    'History storage failed. Live readings are available but this sample may not be saved.'
                  )}
                </p>
              )}
              <ONTTrafficPanel
                current={data.current}
                history={history.data?.points ?? []}
                interval={data.config.interval_seconds}
              />
              <ONTEventFeed events={history.data?.events ?? []} />
            </section>
            <section
              aria-label={t('Device configuration')}
              className='space-y-4 border-t pt-5'
            >
              <div className='flex items-center gap-2'>
                <span className='rounded-md bg-violet-500/10 p-1.5 text-violet-500'>
                  <SlidersHorizontal className='size-4' aria-hidden='true' />
                </span>
                <div>
                  <h4 className='text-sm font-semibold'>
                    {t('Device configuration')}
                  </h4>
                  <p className='text-muted-foreground text-[10px]'>
                    {t(
                      'Collected device identity and configuration; sensitive values are excluded.'
                    )}
                  </p>
                </div>
              </div>
              <ONTFieldGrid pages={data.pages} />
            </section>
            <details className='bg-muted/10 rounded-xl border'>
              <summary className='text-muted-foreground cursor-pointer px-3 py-2.5 text-[11px]'>
                {t('Collection coverage')} ·{' '}
                {data.pages.filter((page) => page.records.length > 0).length}/
                {data.pages.length}
              </summary>
              <section
                aria-label={t('Collection coverage')}
                className='space-y-2 border-t p-3'
              >
                <div className='flex items-center justify-between gap-2'>
                  <h4 className='text-muted-foreground text-[11px] font-medium'>
                    {t('Collection coverage')}
                  </h4>
                  <span className='font-mono text-[10px]'>
                    {
                      data.pages.filter((page) => page.records.length > 0)
                        .length
                    }
                    /{data.pages.length}
                  </span>
                </div>
                <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
                  {data.pages.map((page) => (
                    <div
                      key={page.path}
                      className={cn(
                        'min-w-0 rounded-lg border px-2.5 py-2',
                        page.error && 'border-amber-500/20 bg-amber-500/5'
                      )}
                    >
                      <div className='mb-1 flex items-center gap-1.5 text-[10px] font-medium'>
                        <CheckCircle2
                          className={cn(
                            'size-3 shrink-0',
                            page.error ? 'text-amber-500' : 'text-emerald-500'
                          )}
                          aria-hidden='true'
                        />
                        {ontCategoryLabel(ontCategory(page.path), t)}
                        <span className='text-muted-foreground ml-auto font-mono'>
                          {page.records.length}
                        </span>
                      </div>
                      <p className='text-muted-foreground font-mono text-[9px] break-all'>
                        {page.path}
                      </p>
                      {page.error && <ONTError code={page.error} />}
                    </div>
                  ))}
                </div>
                {data.failures &&
                  failures.map((page) => (
                    <div
                      key={page.path}
                      className='rounded-md border border-amber-500/20 p-2'
                    >
                      <p className='font-mono text-[9px] break-all'>
                        {page.path}
                      </p>
                      <ONTError code={page.error} />
                    </div>
                  ))}
              </section>
            </details>
          </>
        )}
      </div>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className='max-h-[85vh] overflow-y-auto'>
          {settingsOpen && data && (
            <ONTSettings
              config={data.config}
              onSaved={() => setSettingsOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
