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
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api } from '@/lib/api'

export function KindleScreen(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const screen = useQuery({
    queryKey: ['kindle', 'screen'],
    queryFn: async () =>
      (
        await api.get<Blob>('/api/system/kindle/screen', {
          responseType: 'blob',
          skipErrorHandler: true,
        })
      ).data,
    enabled: props.open,
    refetchInterval: 10000,
    retry: false,
  })
  const url = useMemo(
    () => (screen.data ? URL.createObjectURL(screen.data) : null),
    [screen.data]
  )
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url]
  )
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-h-[calc(100vh-2rem)] sm:max-w-6xl'>
        <DialogHeader>
          <DialogTitle>{t('Kindle screen')}</DialogTitle>
          <DialogDescription>
            {t(
              'Refreshes every 10 seconds. The capture does not show the frontlight or physical screen defects.'
            )}
          </DialogDescription>
        </DialogHeader>
        {screen.isError && (
          <p role='alert'>{t('Unable to load the Kindle screen')}</p>
        )}
        {url && (
          <img
            src={url}
            alt={t('Kindle screen')}
            className='max-h-[75vh] w-full object-contain'
          />
        )}
        {!url && !screen.isError && <p role='status'>{t('Loading')}</p>}
      </DialogContent>
    </Dialog>
  )
}
