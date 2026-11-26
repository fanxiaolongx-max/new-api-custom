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
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { ONTEvent } from '@/features/dashboard/ont-api'
import {
  ontFieldLabel,
  ontFieldValue,
  ontEntityLabel,
} from '@/features/dashboard/ont-presentation'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

export function ONTEventFeed(props: { events: ONTEvent[] }) {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState(0)
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(props.events.length / 6) - 1)
  )
  return (
    <section
      aria-label={t('Event timeline')}
      className='rounded-xl border p-3 sm:p-4'
    >
      <div className='mb-3 flex items-center justify-between gap-2'>
        <h4 className='flex items-center gap-2 text-xs font-semibold'>
          <Activity className='size-3.5' aria-hidden='true' />
          {t('Event timeline')}
        </h4>
        <span className='text-muted-foreground font-mono text-[10px]'>
          {props.events.length}
        </span>
      </div>
      {props.events.length === 0 && (
        <p className='text-muted-foreground py-3 text-xs'>
          {t(
            'No marked events in this time window. History begins with collected samples.'
          )}
        </p>
      )}
      <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-3'>
        {props.events
          .slice(currentPage * 6, (currentPage + 1) * 6)
          .map((event) => {
            let title = t('Device alarm')
            if (event.kind === 'optical_shift') {
              title = t('Optical power change')
            }
            if (event.kind === 'ip_changed') title = t('WAN IP changed')
            if (event.kind === 'link_down') title = t('WAN link disconnected')
            if (event.kind === 'link_up') title = t('WAN link restored')
            if (event.kind === 'collection_failed') {
              title = t('Collection interrupted')
            }
            if (event.kind === 'collection_recovered') {
              title = t('Collection resumed')
            }
            let Icon = CircleDot
            if (event.severity === 'critical') Icon = AlertTriangle
            if (
              event.kind === 'link_up' ||
              event.kind === 'collection_recovered'
            ) {
              Icon = CheckCircle2
            }
            return (
              <article
                key={event.id}
                className={cn(
                  'bg-muted/20 min-w-0 rounded-lg border-l-2 p-2.5',
                  event.severity === 'critical' &&
                    'border-l-rose-500 bg-rose-500/5',
                  event.severity === 'warning' &&
                    'border-l-amber-500 bg-amber-500/5',
                  event.severity === 'info' && 'border-l-sky-500'
                )}
              >
                <div className='mb-1 flex items-center gap-1.5 text-[11px] font-semibold'>
                  <Icon className='size-3 shrink-0' aria-hidden='true' />
                  {title}
                </div>
                <p className='text-muted-foreground mb-1 font-mono text-[10px]'>
                  {new Date(event.timestamp * 1000).toLocaleString(
                    toIntlLocale(i18n.language)
                  )}
                </p>
                {(event.connection || event.metric) && (
                  <p
                    title={`${event.connection || ''} ${event.metric || ''}`}
                    className='mb-1 text-[10px] break-all'
                  >
                    {event.connection
                      ? ontEntityLabel(
                          {
                            id: event.connection,
                            category: 'wan',
                            identity: event.connection,
                            domain: event.connection,
                            recordName: 'WANConnection',
                            sources: [],
                            fields: [
                              {
                                name: 'ServiceList',
                                value: event.connection,
                                dynamic: false,
                              },
                            ],
                          },
                          t
                        )
                      : ''}{' '}
                    {event.metric ? ontFieldLabel(event.metric, t) : ''}
                  </p>
                )}
                {(event.previous || event.current) && (
                  <div className='flex flex-wrap items-center gap-1 font-mono text-[10px] break-all'>
                    <span>
                      {ontFieldValue('Status', event.previous || '', t)}
                    </span>
                    <ArrowRight className='size-3' aria-hidden='true' />
                    <span>
                      {ontFieldValue('Status', event.current || '', t)}
                    </span>
                  </div>
                )}
              </article>
            )
          })}
      </div>
      {props.events.length > 6 && (
        <div className='mt-3 flex items-center justify-end gap-2 text-[10px]'>
          <span className='text-muted-foreground'>
            {t('Showing {{from}}–{{to}} of {{total}}', {
              from: currentPage * 6 + 1,
              to: Math.min((currentPage + 1) * 6, props.events.length),
              total: props.events.length,
            })}
          </span>
          <Button
            size='sm'
            variant='ghost'
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            {t('Previous')}
          </Button>
          <Button
            size='sm'
            variant='ghost'
            disabled={(currentPage + 1) * 6 >= props.events.length}
            onClick={() => setPage(currentPage + 1)}
          >
            {t('Next')}
          </Button>
        </div>
      )}
    </section>
  )
}
