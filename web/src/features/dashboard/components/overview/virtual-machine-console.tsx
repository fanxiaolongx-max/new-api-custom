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
import { useMutation, useQuery } from '@tanstack/react-query'
import { Keyboard, MousePointer2, RefreshCw } from 'lucide-react'
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  getVirtualMachineScreenshot,
  sendVirtualMachineKeyboard,
  sendVirtualMachineMouse,
} from '@/features/dashboard/api'
import { cn } from '@/lib/utils'

const SPECIAL_KEYS: Record<string, number[]> = {
  Enter: [0x1c, 0x9c],
  Backspace: [0x0e, 0x8e],
  Tab: [0x0f, 0x8f],
  Escape: [0x01, 0x81],
  Delete: [0xe0, 0x53, 0xe0, 0xd3],
  ArrowUp: [0xe0, 0x48, 0xe0, 0xc8],
  ArrowDown: [0xe0, 0x50, 0xe0, 0xd0],
  ArrowLeft: [0xe0, 0x4b, 0xe0, 0xcb],
  ArrowRight: [0xe0, 0x4d, 0xe0, 0xcd],
}

const CTRL_ALT_DELETE = [0x1d, 0x38, 0xe0, 0x53, 0xe0, 0xd3, 0xb8, 0x9d]

interface VirtualMachineConsoleProps {
  machineName: string | null
  onOpenChange: (open: boolean) => void
}

function pointerButtons(event: PointerEvent<HTMLImageElement>): number {
  let buttons = 0
  if ((event.buttons & 1) !== 0) buttons |= 1
  if ((event.buttons & 2) !== 0) buttons |= 2
  if ((event.buttons & 4) !== 0) buttons |= 4
  return buttons
}

export function VirtualMachineConsole(props: VirtualMachineConsoleProps) {
  const { t } = useTranslation()
  const imageRef = useRef<HTMLImageElement>(null)
  const lastMoveAt = useRef(0)

  const screenshotQuery = useQuery({
    queryKey: ['virtual-machines', props.machineName, 'screenshot'],
    queryFn: () => getVirtualMachineScreenshot(props.machineName ?? ''),
    enabled: Boolean(props.machineName),
    refetchInterval: (query) =>
      query.state.status === 'error' ? false : 1000,
    retry: 1,
  })

  const screenshotUrl = useMemo(() => {
    if (!screenshotQuery.data) return null
    return URL.createObjectURL(screenshotQuery.data)
  }, [screenshotQuery.data])

  useEffect(() => {
    return () => {
      if (screenshotUrl) URL.revokeObjectURL(screenshotUrl)
    }
  }, [screenshotUrl])

  const keyboardMutation = useMutation({
    mutationFn: (input: { text: string } | { scancodes: number[] }) =>
      sendVirtualMachineKeyboard(props.machineName ?? '', input),
  })
  const mouseMutation = useMutation({
    mutationFn: (input: { x: number; y: number; buttons: number }) =>
      sendVirtualMachineMouse(props.machineName ?? '', input),
  })

  const sendPointer = (event: PointerEvent<HTMLImageElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x =
      Math.round(
        ((event.clientX - rect.left) / rect.width) *
          (event.currentTarget.naturalWidth - 1)
      ) + 1
    const y =
      Math.round(
        ((event.clientY - rect.top) / rect.height) *
          (event.currentTarget.naturalHeight - 1)
      ) + 1
    mouseMutation.mutate({
      x: Math.max(1, Math.min(event.currentTarget.naturalWidth, x)),
      y: Math.max(1, Math.min(event.currentTarget.naturalHeight, y)),
      buttons: pointerButtons(event),
    })
  }

  const handlePointerMove = (event: PointerEvent<HTMLImageElement>) => {
    if (event.buttons === 0) return
    const now = Date.now()
    if (now - lastMoveAt.current < 200) return
    lastMoveAt.current = now
    sendPointer(event)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const scancodes = SPECIAL_KEYS[event.key]
    if (scancodes) {
      event.preventDefault()
      keyboardMutation.mutate({ scancodes })
      return
    }
    if (event.key.length === 1) {
      event.preventDefault()
      keyboardMutation.mutate({ text: event.key })
    }
  }

  const emptyScreen = screenshotQuery.isError ? (
    <div className='max-w-xl space-y-2 px-6 text-center'>
      <p className='font-medium'>
        {t('Unable to load the virtual machine screen')}
      </p>
      <p className='text-muted-foreground text-sm'>
        {t(
          'The VirtualBox display is unavailable. If an RDP session is active, use Remote control or disconnect RDP and retry.'
        )}
      </p>
    </div>
  ) : (
    <span className='text-muted-foreground text-sm'>
      {t('Loading remote screen…')}
    </span>
  )

  return (
    <Dialog open={Boolean(props.machineName)} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-h-[calc(100vh-2rem)] sm:max-w-6xl'>
        <DialogHeader>
          <DialogTitle>
            {t('Remote console: {{name}}', { name: props.machineName ?? '' })}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Click the screen to control the pointer, then type with your keyboard. The picture refreshes once per second.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-wrap items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() =>
              keyboardMutation.mutate({ scancodes: CTRL_ALT_DELETE })
            }
          >
            <Keyboard data-icon='inline-start' />
            {t('Send Ctrl+Alt+Delete')}
          </Button>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => screenshotQuery.refetch()}
            disabled={screenshotQuery.isFetching}
          >
            <RefreshCw
              data-icon='inline-start'
              className={cn(screenshotQuery.isFetching && 'animate-spin')}
            />
            {t('Refresh screen')}
          </Button>
          <span className='text-muted-foreground inline-flex items-center gap-1 text-xs'>
            <MousePointer2 className='size-3.5' aria-hidden='true' />
            {t('Basic console mode')}
          </span>
        </div>

        <div
          role='application'
          tabIndex={0}
          aria-label={t('Virtual machine remote screen')}
          onKeyDown={handleKeyDown}
          className='focus-visible:ring-ring bg-muted flex min-h-72 items-center justify-center overflow-hidden rounded-lg border outline-none focus-visible:ring-2'
        >
          {screenshotUrl ? (
            <img
              ref={imageRef}
              src={screenshotUrl}
              alt={t('Current screen of {{name}}', {
                name: props.machineName ?? '',
              })}
              draggable={false}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                sendPointer(event)
              }}
              onPointerMove={handlePointerMove}
              onPointerUp={sendPointer}
              className='max-h-[70vh] max-w-full touch-none object-contain select-none'
            />
          ) : (
            emptyScreen
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
