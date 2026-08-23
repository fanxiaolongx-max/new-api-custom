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
import { CheckIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, Maximize2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { sanitizeImageSrc, type ImageNode } from 'stream-markdown-parser'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type ResponseImageProps = {
  node: ImageNode
}

export function ResponseImage(props: ResponseImageProps) {
  const { t } = useTranslation()
  const [hasError, setHasError] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  const isDataUrl =
    typeof props.node.src === 'string' &&
    props.node.src.trim().startsWith('data:image/')
  const rawSrc = props.node.src ? props.node.src.trim() : ''
  const src = isDataUrl ? rawSrc : sanitizeImageSrc(rawSrc)

  if (!src || hasError) {
    return (
      <span className='border-border/70 text-muted-foreground my-4 inline-flex rounded-md border px-3 py-2 text-xs italic'>
        {props.node.alt || t('Image not available')}
      </span>
    )
  }

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const a = document.createElement('a')
      a.href = src
      a.download = `ai-generated-image-${Date.now()}.${isDataUrl ? 'jpeg' : 'png'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      toast.success(t('Image downloaded'))
    } catch {
      toast.error(t('Failed to download image'))
    }
  }

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      if (isDataUrl) {
        const res = await fetch(src)
        const blob = await res.blob()
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ])
      } else {
        await navigator.clipboard.writeText(src)
      }
      setCopied(true)
      toast.success(t('Image copied to clipboard'))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      await navigator.clipboard.writeText(src)
      setCopied(true)
      toast.success(t('Image URL copied'))
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <>
      <div className='group relative my-4 inline-block max-w-full overflow-hidden rounded-xl border border-border/80 bg-muted/20 shadow-xs transition-all hover:shadow-md'>
        <img
          alt={props.node.alt || 'AI Generated Image'}
          className='block h-auto max-h-[500px] w-auto max-w-full cursor-zoom-in rounded-xl object-contain transition-transform duration-300 group-hover:scale-[1.01]'
          loading='lazy'
          onClick={() => setIsPreviewOpen(true)}
          onError={() => setHasError(true)}
          src={src}
          title={props.node.title ?? undefined}
        />

        {/* Hover Action Bar */}
        <div className='absolute top-2 right-2 flex items-center gap-1 rounded-lg bg-background/80 p-1 shadow-xs backdrop-blur-md opacity-0 transition-opacity duration-200 group-hover:opacity-100'>
          <Button
            className='size-7 text-muted-foreground hover:text-foreground'
            onClick={() => setIsPreviewOpen(true)}
            size='icon'
            title={t('Preview')}
            type='button'
            variant='ghost'
          >
            <Maximize2Icon size={14} />
          </Button>
          <Button
            className='size-7 text-muted-foreground hover:text-foreground'
            onClick={handleCopy}
            size='icon'
            title={t('Copy image')}
            type='button'
            variant='ghost'
          >
            {copied ? (
              <CheckIcon className='text-emerald-500' size={14} />
            ) : (
              <CopyIcon size={14} />
            )}
          </Button>
          <Button
            className='size-7 text-muted-foreground hover:text-foreground'
            onClick={handleDownload}
            size='icon'
            title={t('Download image')}
            type='button'
            variant='ghost'
          >
            <DownloadIcon size={14} />
          </Button>
        </div>
      </div>

      {/* Fullscreen Preview Dialog */}
      <Dialog onOpenChange={setIsPreviewOpen} open={isPreviewOpen}>
        <DialogContent className='max-w-4xl p-2 sm:p-4'>
          <DialogHeader className='px-2 pb-2'>
            <DialogTitle className='text-sm font-medium truncate'>
              {props.node.alt || t('AI Generated Image')}
            </DialogTitle>
          </DialogHeader>
          <div className='relative flex max-h-[80vh] items-center justify-center overflow-auto rounded-lg bg-black/5 p-2 dark:bg-black/40'>
            <img
              alt={props.node.alt || 'AI Generated Image'}
              className='max-h-[75vh] w-auto max-w-full rounded-md object-contain shadow-lg'
              src={src}
            />
          </div>
          <div className='flex items-center justify-end gap-2 px-2 pt-2'>
            <Button
              className='gap-1.5'
              onClick={handleCopy}
              size='sm'
              variant='outline'
            >
              {copied ? (
                <CheckIcon className='text-emerald-500' size={14} />
              ) : (
                <CopyIcon size={14} />
              )}
              <span>{t('Copy')}</span>
            </Button>
            <Button
              className='gap-1.5'
              onClick={handleDownload}
              size='sm'
              variant='default'
            >
              <DownloadIcon size={14} />
              <span>{t('Download')}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
