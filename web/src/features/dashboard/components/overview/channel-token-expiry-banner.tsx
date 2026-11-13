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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ShieldAlert,
  Zap,
} from 'lucide-react'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { CardStaggerItem } from '@/components/page-transition'
import { Button } from '@/components/ui/button'
import { getChannels } from '@/features/channels/api'
import { QuickTokenUpdateDialog } from '@/features/channels/components/dialogs/quick-token-update-dialog'
import {
  analyzeChannelTokenExpiry,
  type ChannelTokenExpiryInfo,
} from '@/features/channels/lib/channel-token-utils'
import type { Channel } from '@/features/channels/types'
import { cn } from '@/lib/utils'

type MonitoredChannel = {
  channel: Channel
  expiry: ChannelTokenExpiryInfo
}

export function ChannelTokenExpiryBanner() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null)
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)

  const { data: channelsRes } = useQuery({
    queryKey: ['admin_channels_token_monitor'],
    queryFn: () => getChannels({ p: 0 }),
    staleTime: 60 * 1000,
  })

  const monitoredChannels = useMemo<MonitoredChannel[]>(() => {
    const rawData = channelsRes?.data
    let channels: Channel[] = []
    if (Array.isArray(rawData)) {
      channels = rawData
    } else if (rawData && Array.isArray(rawData.items)) {
      channels = rawData.items
    }

    if (channels.length === 0) return []

    const list: MonitoredChannel[] = []
    for (const ch of channels) {
      if (!ch.key) continue
      const info = analyzeChannelTokenExpiry(ch.key)
      if (info.isJwt) {
        list.push({ channel: ch, expiry: info })
      }
    }

    // Sort by urgency: expired first, then critical, then warning, then healthy
    const rank = { expired: 0, critical: 1, warning: 2, healthy: 3, unknown: 4 }
    return list.sort((a, b) => {
      const rA = rank[a.expiry.status]
      const rB = rank[b.expiry.status]
      if (rA !== rB) return rA - rB
      return (
        (a.expiry.expiresAt?.getTime() || 0) -
        (b.expiry.expiresAt?.getTime() || 0)
      )
    })
  }, [channelsRes?.data])

  const expiredCount = useMemo(
    () => monitoredChannels.filter((m) => m.expiry.isExpired).length,
    [monitoredChannels]
  )
  const expiringSoonCount = useMemo(
    () =>
      monitoredChannels.filter(
        (m) =>
          !m.expiry.isExpired &&
          (m.expiry.status === 'critical' || m.expiry.status === 'warning')
      ).length,
    [monitoredChannels]
  )

  const handleOpenUpdate = (channel: Channel) => {
    setSelectedChannel(channel)
    setUpdateDialogOpen(true)
  }

  const handleRefresh = () => {
    queryClient.invalidateQueries({
      queryKey: ['admin_channels_token_monitor'],
    })
  }

  if (monitoredChannels.length === 0) {
    return null
  }

  return (
    <>
      <CardStaggerItem
        className={cn(
          'relative overflow-hidden rounded-2xl border p-4 sm:p-5 shadow-sm transition-all',
          expiredCount > 0 && 'bg-destructive/[0.04] border-destructive/30',
          expiredCount === 0 &&
            expiringSoonCount > 0 &&
            'bg-amber-500/[0.04] border-amber-500/30',
          expiredCount === 0 &&
            expiringSoonCount === 0 &&
            'bg-card border-border/70'
        )}
      >
        {/* Top Header */}
        <div className='border-border/50 flex flex-wrap items-center justify-between gap-3 border-b pb-3'>
          <div className='flex items-center gap-2.5'>
            <div
              className={cn(
                'flex size-9 items-center justify-center rounded-xl border shadow-xs',
                expiredCount > 0 &&
                  'bg-destructive/10 border-destructive/30 text-destructive',
                expiredCount === 0 &&
                  expiringSoonCount > 0 &&
                  'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
                expiredCount === 0 &&
                  expiringSoonCount === 0 &&
                  'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              )}
            >
              {expiredCount > 0 && <ShieldAlert className='size-5' />}
              {expiredCount === 0 && expiringSoonCount > 0 && (
                <AlertTriangle className='size-5' />
              )}
              {expiredCount === 0 && expiringSoonCount === 0 && (
                <CheckCircle2 className='size-5' />
              )}
            </div>
            <div>
              <div className='flex items-center gap-2'>
                <h3 className='text-foreground text-sm font-semibold tracking-tight sm:text-base'>
                  {t('Channel Credentials & Token Health')}
                </h3>
                {expiredCount > 0 && (
                  <span className='bg-destructive/15 text-destructive rounded-full px-2 py-0.5 text-xs font-semibold'>
                    {t('{{count}} Expired', { count: expiredCount })}
                  </span>
                )}
                {expiredCount === 0 && expiringSoonCount > 0 && (
                  <span className='rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400'>
                    {t('{{count}} Expiring Soon', { count: expiringSoonCount })}
                  </span>
                )}
                {expiredCount === 0 && expiringSoonCount === 0 && (
                  <span className='rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400'>
                    {t('All {{count}} Healthy', {
                      count: monitoredChannels.length,
                    })}
                  </span>
                )}
              </div>
              <p className='text-muted-foreground mt-0.5 text-xs'>
                {expiredCount > 0
                  ? t(
                      'OpenAI Web / AccessToken expired. Quick update to restore model requests.'
                    )
                  : t(
                      'Real-time token expiry countdown for ChatGPT W2A & OAuth channels.'
                    )}
              </p>
            </div>
          </div>

          <div className='flex items-center gap-2'>
            <Button
              size='sm'
              variant='outline'
              className='h-8 gap-1 text-xs'
              render={<Link to='/channels' />}
            >
              <span>{t('All Channels')}</span>
              <ArrowRight size={12} />
            </Button>
          </div>
        </div>

        {/* Channel Cards Grid */}
        <div className='grid grid-cols-1 gap-3 pt-3 md:grid-cols-2 lg:grid-cols-3'>
          {monitoredChannels.map(({ channel, expiry }) => {
            const isExp = expiry.isExpired
            const isCrit = expiry.status === 'critical'
            const isWarn = expiry.status === 'warning'
            let buttonVariant: 'outline' | 'destructive' | 'default' = 'outline'
            if (isExp) buttonVariant = 'destructive'
            else if (isCrit) buttonVariant = 'default'

            return (
              <div
                key={channel.id}
                className={cn(
                  'flex flex-col justify-between rounded-xl border p-3.5 transition-all',
                  isExp && 'bg-destructive/10 border-destructive/40 shadow-xs',
                  !isExp &&
                    isCrit &&
                    'bg-amber-500/10 border-amber-500/40 shadow-xs',
                  !isExp &&
                    !isCrit &&
                    isWarn &&
                    'bg-amber-500/5 border-amber-500/25',
                  !isExp && !isCrit && !isWarn && 'bg-muted/30 border-border/60'
                )}
              >
                <div>
                  <div className='mb-1.5 flex items-start justify-between gap-2'>
                    <div className='min-w-0 flex-1'>
                      <div className='flex items-center gap-1.5'>
                        <span
                          className={cn(
                            'size-2 rounded-full shrink-0',
                            isExp && 'bg-destructive animate-pulse',
                            !isExp && (isCrit || isWarn) && 'bg-amber-500',
                            !isExp && !isCrit && !isWarn && 'bg-emerald-500'
                          )}
                        />
                        <span className='text-foreground truncate font-mono text-xs font-semibold'>
                          {channel.name}
                        </span>
                      </div>
                      <span className='text-muted-foreground font-mono text-[10px]'>
                        ID #{channel.id} ·{' '}
                        {channel.models?.split(',')[0] || 'GPT'}
                      </span>
                    </div>

                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-[11px] font-mono font-semibold whitespace-nowrap',
                        isExp && 'bg-destructive/20 text-destructive',
                        !isExp &&
                          (isCrit || isWarn) &&
                          'bg-amber-500/20 text-amber-700 dark:text-amber-300',
                        !isExp &&
                          !isCrit &&
                          !isWarn &&
                          'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      )}
                    >
                      {expiry.formattedRemaining}
                    </span>
                  </div>

                  <div className='text-muted-foreground mt-1 space-y-0.5 font-mono text-[11px]'>
                    <div className='flex items-center justify-between'>
                      <span>{t('Expires At')}:</span>
                      <span>{expiry.formattedExpiry}</span>
                    </div>
                    {expiry.email && (
                      <div className='flex items-center justify-between truncate'>
                        <span>{t('Account')}:</span>
                        <span className='ml-2 truncate'>{expiry.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className='border-border/40 mt-2 flex items-center justify-end border-t pt-2.5'>
                  <Button
                    type='button'
                    size='sm'
                    variant={buttonVariant}
                    className={cn(
                      'h-7 px-2.5 text-xs gap-1 font-medium shadow-xs',
                      !isExp &&
                        isCrit &&
                        'bg-amber-600 hover:bg-amber-700 text-white'
                    )}
                    onClick={() => handleOpenUpdate(channel)}
                  >
                    <Zap
                      size={11}
                      className={isExp ? 'text-white' : 'text-amber-400'}
                    />
                    <span>{t('Quick Update Token')}</span>
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </CardStaggerItem>

      <QuickTokenUpdateDialog
        open={updateDialogOpen}
        onOpenChange={setUpdateDialogOpen}
        channel={selectedChannel}
        onSuccess={handleRefresh}
      />
    </>
  )
}
