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
import { GlobeIcon, PaperclipIcon, Trash2Icon } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  PromptInputButton,
  PromptInputTools,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { ATTACHMENT_ACTIONS } from '../../lib'
import type { ParameterEnabled, PlaygroundConfig } from '../../types'
import { PlaygroundParameterPanel } from './playground-parameter-panel'

type PlaygroundInputToolsProps = {
  config: PlaygroundConfig
  disabled?: boolean
  hasMessages?: boolean
  onClearMessages?: () => void
  onConfigChange: <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => void
  onParameterEnabledChange: (
    key: keyof ParameterEnabled,
    value: boolean
  ) => void
  parameterEnabled: ParameterEnabled
}

export function PlaygroundInputTools({
  config,
  disabled,
  hasMessages = false,
  onClearMessages,
  onConfigChange,
  onParameterEnabledChange,
  parameterEnabled,
}: PlaygroundInputToolsProps) {
  const { t } = useTranslation()
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const attachments = usePromptInputAttachments()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      attachments.add(event.target.files)
      // reset value so re-selecting same file triggers onChange
      event.target.value = ''
    }
  }

  const handleScreenCapture = async () => {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        toast.error(t('Screen capture is not supported in this browser'))
        return
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      })
      const video = document.createElement('video')
      video.srcObject = stream
      await video.play()
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)
      stream.getTracks().forEach((track) => track.stop())

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `screenshot-${Date.now()}.png`, {
            type: 'image/png',
          })
          attachments.add([file])
          toast.success(t('Screenshot captured'))
        }
      }, 'image/png')
    } catch (err: unknown) {
      const error = err as { name?: string }
      if (error?.name !== 'NotAllowedError') {
        toast.error(t('Failed to capture screen'))
      }
    }
  }

  const handleFileAction = (action: string) => {
    switch (action) {
      case 'upload-file':
        fileInputRef.current?.click()
        break
      case 'upload-photo':
        photoInputRef.current?.click()
        break
      case 'take-photo':
        cameraInputRef.current?.click()
        break
      case 'take-screenshot':
        void handleScreenCapture()
        break
      default:
        attachments.openFileDialog()
        break
    }
  }

  const isWebSearchActive = Boolean(config.webSearch)

  const handleSearchAction = () => {
    const nextState = !isWebSearchActive
    onConfigChange('webSearch', nextState)
    if (nextState) {
      toast.success(t('Web search enabled'))
    } else {
      toast.info(t('Web search disabled'))
    }
  }

  const handleClearMessages = () => {
    onClearMessages?.()
    setClearConfirmOpen(false)
    toast.success(t('Conversation cleared'))
  }

  return (
    <>
      <input
        accept='*/*'
        className='hidden'
        multiple
        onChange={handleFileInputChange}
        ref={fileInputRef}
        type='file'
      />
      <input
        accept='image/*'
        className='hidden'
        multiple
        onChange={handleFileInputChange}
        ref={photoInputRef}
        type='file'
      />
      <input
        accept='image/*'
        capture='environment'
        className='hidden'
        onChange={handleFileInputChange}
        ref={cameraInputRef}
        type='file'
      />

      <PromptInputTools className='bg-background/70 border-border/60 rounded-lg border p-1 shadow-xs'>
        <Tooltip>
          <DropdownMenu>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <PromptInputButton
                      aria-label={t('Attach')}
                      className='text-muted-foreground hover:text-foreground hover:bg-muted/70 font-medium'
                      disabled={disabled}
                      variant='ghost'
                    />
                  }
                >
                  <PaperclipIcon size={16} />
                </DropdownMenuTrigger>
              }
            />
            <TooltipContent>
              <p>{t('Attach')}</p>
            </TooltipContent>
            <DropdownMenuContent align='start'>
              {ATTACHMENT_ACTIONS.map(({ action, icon: Icon, label }) => (
                <DropdownMenuItem
                  key={action}
                  onClick={() => handleFileAction(action)}
                >
                  <Icon className='mr-2' size={16} />
                  {t(label)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <PromptInputButton
                aria-label={t('Search')}
                className={cn(
                  'transition-all duration-200 font-medium',
                  isWebSearchActive
                    ? 'text-primary bg-primary/10 border-primary/30 ring-1 ring-primary/20 shadow-xs hover:bg-primary/15'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
                )}
                disabled={disabled}
                onClick={handleSearchAction}
                variant='ghost'
              >
                <GlobeIcon size={16} className={cn(isWebSearchActive && 'text-primary')} />
              </PromptInputButton>
            }
          />
          <TooltipContent>
            <p>
              {isWebSearchActive
                ? t('Web search (enabled)')
                : t('Web search (disabled)')}
            </p>
          </TooltipContent>
        </Tooltip>

        <PlaygroundParameterPanel
          config={config}
          disabled={disabled}
          onConfigChange={onConfigChange}
          onParameterEnabledChange={onParameterEnabledChange}
          parameterEnabled={parameterEnabled}
        />

        <Tooltip>
          <TooltipTrigger
            render={
              <PromptInputButton
                aria-label={t('Clear chat history')}
                className='text-muted-foreground hover:text-destructive hover:bg-destructive/10 font-medium'
                disabled={disabled || !hasMessages || !onClearMessages}
                onClick={() => setClearConfirmOpen(true)}
                variant='ghost'
              >
                <Trash2Icon size={16} />
              </PromptInputButton>
            }
          />
          <TooltipContent>
            <p>{t('Clear chat history')}</p>
          </TooltipContent>
        </Tooltip>
      </PromptInputTools>

      <ConfirmDialog
        destructive
        desc={t(
          'All playground messages saved in this browser will be removed. This cannot be undone.'
        )}
        confirmText={t('Clear')}
        handleConfirm={handleClearMessages}
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        title={t('Clear chat history?')}
      />
    </>
  )
}
