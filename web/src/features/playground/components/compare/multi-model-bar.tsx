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
  BotIcon,
  Columns2Icon,
  MessageSquareIcon,
  PlusIcon,
  SparklesIcon,
  XIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import type { ModelOption, PlaygroundConfig } from '../../types'

interface MultiModelBarProps {
  config: PlaygroundConfig
  models: ModelOption[]
  onConfigChange: <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => void
  disabled?: boolean
}

const MODEL_COLOR_SCHEMES = [
  {
    badge: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
  {
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  {
    badge: 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400',
    dot: 'bg-purple-500',
  },
  {
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
]

export function MultiModelBar({
  config,
  models,
  onConfigChange,
  disabled,
}: MultiModelBarProps) {
  const { t } = useTranslation()
  const isCompareMode = config.mode === 'compare'
  const compareModels = config.compareModels && config.compareModels.length > 0
    ? config.compareModels
    : [config.model || 'gpt-4o', 'gemini-3.1-pro']

  const handleToggleMode = (mode: 'single' | 'compare') => {
    onConfigChange('mode', mode)
    if (mode === 'compare' && (!config.compareModels || config.compareModels.length === 0)) {
      onConfigChange('compareModels', [config.model || 'gpt-4o', 'gemini-3.1-pro'])
    }
  }

  const handleAddModel = (modelValue: string) => {
    if (compareModels.includes(modelValue)) {
      toast.info(t('Model already in comparison list'))
      return
    }
    if (compareModels.length >= 4) {
      toast.warning(t('Maximum 4 models allowed in comparison mode'))
      return
    }
    const nextModels = [...compareModels, modelValue]
    onConfigChange('compareModels', nextModels)
    toast.success(t('Added model to comparison'))
  }

  const handleRemoveModel = (modelValue: string) => {
    if (compareModels.length <= 2) {
      toast.warning(t('At least 2 models required for comparison'))
      return
    }
    const nextModels = compareModels.filter((m) => m !== modelValue)
    onConfigChange('compareModels', nextModels)
  }

  const handleApplyPreset = (presetModels: string[]) => {
    // Filter only available models
    const available = presetModels.filter((m) =>
      models.some((opt) => opt.value === m)
    )
    if (available.length < 2) {
      // fallback to first available models
      const fallback = models.slice(0, Math.min(3, models.length)).map((m) => m.value)
      onConfigChange('compareModels', fallback)
    } else {
      onConfigChange('compareModels', available)
    }
    toast.success(t('Comparison preset applied'))
  }

  return (
    <div className='flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-background/80 px-4 py-2 text-xs backdrop-blur-md transition-all'>
      {/* Mode Switch Tabs */}
      <div className='flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 p-0.5 shadow-xs'>
        <button
          type='button'
          disabled={disabled}
          onClick={() => handleToggleMode('single')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-all duration-150',
            !isCompareMode
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <MessageSquareIcon size={13} />
          <span>{t('Single Model')}</span>
        </button>
        <button
          type='button'
          disabled={disabled}
          onClick={() => handleToggleMode('compare')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-all duration-150',
            isCompareMode
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Columns2Icon size={13} />
          <span>{t('Multi-Model Compare')}</span>
          <Badge
            variant='outline'
            className={cn(
              'ml-0.5 h-4 px-1 text-[10px] font-bold uppercase',
              isCompareMode ? 'border-primary-foreground/30 text-primary-foreground' : 'text-primary'
            )}
          >
            Arena
          </Badge>
        </button>
      </div>

      {/* Compare Models Badges & Add Button */}
      {isCompareMode && (
        <div className='flex flex-1 flex-wrap items-center justify-end gap-1.5 sm:gap-2'>
          <span className='hidden text-muted-foreground sm:inline'>
            {t('Comparing {{count}} models:', { count: compareModels.length })}
          </span>

          <div className='flex flex-wrap items-center gap-1.5'>
            {compareModels.map((modelName, index) => {
              const colorScheme =
                MODEL_COLOR_SCHEMES[index % MODEL_COLOR_SCHEMES.length]
              return (
                <div
                  key={modelName}
                  className={cn(
                    'group flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium shadow-2xs transition-all',
                    colorScheme.badge
                  )}
                >
                  <span
                    className={cn('size-1.5 rounded-full animate-pulse', colorScheme.dot)}
                  />
                  <BotIcon size={12} />
                  <span className='max-w-[120px] truncate font-mono text-[11px] font-semibold sm:max-w-[160px]'>
                    {modelName}
                  </span>
                  {compareModels.length > 2 && (
                    <button
                      type='button'
                      disabled={disabled}
                      onClick={() => handleRemoveModel(modelName)}
                      className='ml-0.5 rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100'
                    >
                      <XIcon size={10} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Add Model Dropdown */}
          {compareModels.length < 4 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    disabled={disabled}
                    size='sm'
                    variant='outline'
                    className='h-7 gap-1 rounded-full border-dashed px-2.5 text-xs font-medium'
                  />
                }
              >
                <PlusIcon size={12} />
                <span>{t('Add model')}</span>
              </DropdownMenuTrigger>

              <DropdownMenuContent align='end' className='max-h-72 w-56 overflow-y-auto'>
                <DropdownMenuLabel className='text-xs font-semibold text-muted-foreground'>
                  {t('Select model to add')}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {models
                  .filter((m) => !compareModels.includes(m.value))
                  .map((m) => (
                    <DropdownMenuItem
                      key={m.value}
                      onClick={() => handleAddModel(m.value)}
                      className='text-xs font-mono'
                    >
                      <BotIcon className='mr-2 size-3.5' />
                      <span className='truncate'>{m.label || m.value}</span>
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Quick Presets Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  disabled={disabled}
                  size='sm'
                  variant='ghost'
                  className='h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground'
                />
              }
            >
              <SparklesIcon size={12} />
              <span className='hidden sm:inline'>{t('Presets')}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-48'>
              <DropdownMenuLabel className='text-xs'>
                {t('Comparison Presets')}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  handleApplyPreset(['gpt-4o', 'gemini-3.1-pro'])
                }
              >
                GPT-4o vs Gemini 3.1
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  handleApplyPreset([
                    'gpt-4o',
                    'gemini-3.1-pro',
                    'claude-3-5-sonnet',
                  ])
                }
              >
                {t('Top 3 Flagship Models')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  handleApplyPreset([
                    'gpt-4o',
                    'gemini-3.1-pro',
                    'claude-3-5-sonnet',
                    'deepseek-r1',
                  ])
                }
              >
                {t('All-Stars Arena (4 Models)')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}
