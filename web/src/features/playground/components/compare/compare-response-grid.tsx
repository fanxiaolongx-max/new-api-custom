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
  AlertCircleIcon,
  BotIcon,
  CheckIcon,
  CopyIcon,
  SparklesIcon,
  TimerIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Loader } from '@/components/ai-elements/loader'
import { MessageContent } from '@/components/ai-elements/message'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import { Response } from '@/components/ai-elements/response'
import { Shimmer } from '@/components/ai-elements/shimmer'
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/sources'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { MESSAGE_STATUS } from '../../constants'
import { getMessageContentStyles } from '../../lib/message/message-styles'
import type { Message, ModelCompareResponse } from '../../types'

interface CompareResponseGridProps {
  message: Message
}

const MODEL_BORDER_COLORS = [
  'border-blue-500/30 hover:border-blue-500/50 bg-blue-500/[0.02]',
  'border-emerald-500/30 hover:border-emerald-500/50 bg-emerald-500/[0.02]',
  'border-purple-500/30 hover:border-purple-500/50 bg-purple-500/[0.02]',
  'border-amber-500/30 hover:border-amber-500/50 bg-amber-500/[0.02]',
]

const MODEL_TAG_COLORS = [
  'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
]

export function CompareResponseGrid({ message }: CompareResponseGridProps) {
  const { t } = useTranslation()
  const responses = message.multiResponses || []
  const count = responses.length

  const gridColsClass =
    count === 2
      ? 'grid-cols-1 md:grid-cols-2'
      : count === 3
        ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'

  return (
    <div className={cn('grid w-full gap-3.5 py-1', gridColsClass)}>
      {responses.map((item, index) => (
        <CompareCard
          key={`${item.model}-${index}`}
          index={index}
          item={item}
          t={t}
        />
      ))}
    </div>
  )
}

function CompareCard({
  item,
  index,
  t,
}: {
  item: ModelCompareResponse
  index: number
  t: (key: string, options?: any) => string
}) {
  const [copied, setCopied] = useState(false)
  const isStreaming = item.status === MESSAGE_STATUS.STREAMING
  const isLoading = item.status === MESSAGE_STATUS.LOADING
  const isComplete = item.status === MESSAGE_STATUS.COMPLETE
  const isError = item.status === MESSAGE_STATUS.ERROR

  const borderColor = MODEL_BORDER_COLORS[index % MODEL_BORDER_COLORS.length]
  const tagColor = MODEL_TAG_COLORS[index % MODEL_TAG_COLORS.length]

  const handleCopy = () => {
    if (!item.content) return
    navigator.clipboard.writeText(item.content)
    setCopied(true)
    toast.success(t('Copied to clipboard'))
    setTimeout(() => setCopied(false), 2000)
  }

  const durationSec =
    item.durationMs !== undefined
      ? (item.durationMs / 1000).toFixed(2)
      : item.completedAt && item.startedAt
        ? ((item.completedAt - item.startedAt) / 1000).toFixed(2)
        : null

  return (
    <div
      className={cn(
        'flex flex-col min-w-0 rounded-xl border bg-card/60 p-4 shadow-xs backdrop-blur-xs transition-all duration-200 hover:shadow-md',
        borderColor
      )}
    >
      {/* Card Header */}
      <div className='flex items-center justify-between gap-2 border-b border-border/50 pb-2.5 mb-3'>
        <div className='flex items-center gap-2 min-w-0'>
          <Badge
            variant='outline'
            className={cn('flex items-center gap-1.5 px-2 py-0.5 font-mono text-xs font-semibold', tagColor)}
          >
            <BotIcon size={13} />
            <span className='truncate max-w-[140px]'>{item.model}</span>
          </Badge>

          {/* Status / Timing Badge */}
          {isLoading && (
            <span className='flex items-center gap-1 text-[11px] text-muted-foreground animate-pulse'>
              <Loader className='size-3' />
              <span>{t('Waiting...')}</span>
            </span>
          )}
          {isStreaming && (
            <span className='flex items-center gap-1 text-[11px] text-primary font-medium animate-pulse'>
              <SparklesIcon size={12} className='animate-spin' />
              <span>{t('Generating...')}</span>
            </span>
          )}
          {isComplete && durationSec && (
            <Badge
              variant='secondary'
              className='h-5 gap-1 px-1.5 text-[10px] font-mono text-muted-foreground'
            >
              <TimerIcon size={10} />
              <span>{durationSec}s</span>
            </Badge>
          )}
          {isError && (
            <Badge
              variant='destructive'
              className='h-5 gap-1 px-1.5 text-[10px]'
            >
              <AlertCircleIcon size={10} />
              <span>{t('Failed')}</span>
            </Badge>
          )}
        </div>

        {/* Action Buttons */}
        <div className='flex items-center gap-1 shrink-0'>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  disabled={!item.content}
                  onClick={handleCopy}
                  size='icon'
                  variant='ghost'
                  className='size-7 rounded-md text-muted-foreground hover:text-foreground'
                />
              }
            >
              {copied ? <CheckIcon size={13} className='text-emerald-500' /> : <CopyIcon size={13} />}
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('Copy response')}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Card Body */}
      <div className='flex-1 min-w-0 text-sm'>
        {/* Reasoning / Thinking chain */}
        {item.reasoning?.content && (
          <Reasoning
            defaultOpen
            duration={item.reasoning.duration}
            isStreaming={item.isReasoningStreaming}
            className='mb-3'
          >
            <ReasoningTrigger />
            <ReasoningContent>{item.reasoning.content}</ReasoningContent>
          </Reasoning>
        )}

        {/* Web Search Sources */}
        {item.sources && item.sources.length > 0 && (
          <Sources className='mb-3'>
            <SourcesTrigger count={item.sources.length} />
            <SourcesContent>
              {item.sources.map((source) => (
                <Source
                  href={source.href}
                  key={`${source.href}-${source.title}`}
                  title={source.title}
                />
              ))}
            </SourcesContent>
          </Sources>
        )}

        {/* Response Content */}
        {isLoading && !item.content && (
          <div className='flex items-center gap-2 py-4 text-muted-foreground'>
            <Loader />
            <Shimmer className='text-xs' duration={1}>
              {t('Thinking and generating response...')}
            </Shimmer>
          </div>
        )}

        {isError && (
          <div className='rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive'>
            <div className='font-semibold flex items-center gap-1.5 mb-1'>
              <AlertCircleIcon size={14} />
              <span>{t('Model Request Failed')}</span>
            </div>
            <p className='break-all font-mono opacity-90'>{item.errorCode || item.content || t('An error occurred while generating response.')}</p>
          </div>
        )}

        {item.content && (
          <MessageContent
            variant='flat'
            className={cn(getMessageContentStyles(), 'text-sm break-words overflow-x-auto')}
          >
            <Response final={isComplete}>{item.content}</Response>
          </MessageContent>
        )}
      </div>
    </div>
  )
}
