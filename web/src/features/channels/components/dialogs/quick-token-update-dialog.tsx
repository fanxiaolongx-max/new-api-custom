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
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  ExternalLink,
  KeyRound,
  Loader2,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { testChannel, updateChannel } from '@/features/channels/api'
import {
  analyzeChannelTokenExpiry,
  extractAccessTokenFromInput,
} from '@/features/channels/lib/channel-token-utils'
import type { Channel } from '@/features/channels/types'
import { cn } from '@/lib/utils'

interface QuickTokenUpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  channel: Pick<Channel, 'id' | 'name' | 'key' | 'type' | 'status'> | null
  onSuccess?: () => void
}

export function QuickTokenUpdateDialog({
  open,
  onOpenChange,
  channel,
  onSuccess,
}: QuickTokenUpdateDialogProps) {
  const { t } = useTranslation()
  const [newToken, setNewToken] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    time?: number
    message?: string
  } | null>(null)

  useEffect(() => {
    if (open) {
      setNewToken('')
      setTestResult(null)
    }
  }, [open, channel?.id])

  const currentExpiry = useMemo(() => {
    if (!channel?.key) return null
    return analyzeChannelTokenExpiry(channel.key)
  }, [channel?.key])

  const { cleanToken, isJsonExtracted } = useMemo(() => {
    return extractAccessTokenFromInput(newToken)
  }, [newToken])

  const newExpiry = useMemo(() => {
    if (!cleanToken.trim()) return null
    return analyzeChannelTokenExpiry(cleanToken)
  }, [cleanToken])

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setNewToken(text.trim())
        toast.success(t('Pasted from clipboard'))
      }
    } catch {
      toast.error(t('Please paste manually using Ctrl+V / Cmd+V'))
    }
  }

  const handleSaveAndTest = async () => {
    if (!channel?.id) return
    const tokenToSave = cleanToken.trim()
    if (!tokenToSave) {
      toast.error(t('Please enter or paste the new token'))
      return
    }

    setIsSaving(true)
    try {
      // 1. Update channel token with clean extracted token
      const updateRes = await updateChannel(channel.id, { key: tokenToSave })
      if (!updateRes.success) {
        throw new Error(
          updateRes.message || t('Failed to update channel token')
        )
      }

      toast.success(t('Channel token updated successfully!'))

      // 2. Perform quick test
      setIsTesting(true)
      try {
        const testRes = await testChannel(channel.id)
        if (testRes.success) {
          setTestResult({
            success: true,
            time: testRes.time,
            message: `${testRes.time?.toFixed(0)} ms`,
          })
          toast.success(
            t('Channel availability test passed: {{time}}ms', {
              time: testRes.time?.toFixed(0),
            })
          )
        } else {
          setTestResult({
            success: false,
            message: testRes.message || t('Channel test failed'),
          })
        }
      } catch (err: any) {
        setTestResult({
          success: false,
          message: err?.message || t('Test error'),
        })
      } finally {
        setIsTesting(false)
      }

      onSuccess?.()
      setTimeout(() => {
        onOpenChange(false)
      }, 1200)
    } catch (error: any) {
      toast.error(error?.message || t('Failed to save token'))
    } finally {
      setIsSaving(false)
    }
  }

  if (!channel) return null

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <div className='flex items-center gap-2 text-base font-semibold'>
          <Zap className='size-4 text-amber-500' />
          <span>{t('Quick Update Token / Credential')}</span>
        </div>
      }
      description={
        <div className='text-muted-foreground mt-1 flex items-center gap-2 text-xs'>
          <span>{t('Channel')}:</span>
          <span className='text-foreground font-mono font-semibold'>
            {channel.name}
          </span>
          <span className='bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]'>
            #{channel.id}
          </span>
        </div>
      }
      contentClassName='max-w-xl'
    >
      <div className='flex flex-col gap-4 py-1'>
        {/* Current Token Status Card */}
        {currentExpiry && currentExpiry.isJwt && (
          <div
            className={cn(
              'rounded-xl border p-3 text-xs transition-colors',
              currentExpiry.isExpired &&
                'bg-destructive/10 border-destructive/30 text-destructive',
              !currentExpiry.isExpired &&
                currentExpiry.status === 'critical' &&
                'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
              !currentExpiry.isExpired &&
                currentExpiry.status !== 'critical' &&
                'bg-muted/40 border-border/60 text-muted-foreground'
            )}
          >
            <div className='mb-1 flex items-center justify-between font-medium'>
              <div className='flex items-center gap-1.5'>
                {currentExpiry.isExpired ? (
                  <AlertCircle size={14} className='text-destructive' />
                ) : (
                  <CheckCircle2 size={14} className='text-emerald-500' />
                )}
                <span>{t('Current Token Status')}</span>
              </div>
              <span className='font-mono font-semibold'>
                {currentExpiry.formattedRemaining}
              </span>
            </div>
            <div className='flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] opacity-90'>
              <span>
                {t('Expires At')}: {currentExpiry.formattedExpiry}
              </span>
              {currentExpiry.email && <span>({currentExpiry.email})</span>}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className='flex flex-col gap-2'>
          <div className='flex items-center justify-between'>
            <label className='flex items-center gap-1.5 text-xs font-medium'>
              <KeyRound size={13} className='text-primary' />
              <span>{t('New AccessToken / Key')}</span>
            </label>
            <div className='flex items-center gap-1'>
              {newToken && (
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={() => setNewToken('')}
                  className='text-muted-foreground hover:text-destructive h-6 px-2 text-[11px]'
                >
                  <Trash2 size={11} className='mr-1' />
                  {t('Clear')}
                </Button>
              )}
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={handlePaste}
                className='h-6 px-2 text-[11px]'
              >
                <ClipboardPaste size={11} className='mr-1' />
                {t('Paste')}
              </Button>
            </div>
          </div>

          <Textarea
            value={newToken}
            onChange={(e) => setNewToken(e.target.value)}
            placeholder='可直接粘贴整个 https://chatgpt.com/api/auth/session 返回的全部 JSON 内容，或单独粘贴 AccessToken...'
            className='min-h-[100px] resize-y font-mono text-xs leading-relaxed'
          />
        </div>

        {/* JSON Extraction Badge */}
        {isJsonExtracted && (
          <div className='text-primary bg-primary/10 border-primary/25 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium'>
            <Sparkles size={13} className='shrink-0 text-amber-500' />
            <span>
              {t(
                'Smart Recognition: Extracted accessToken ({{len}} chars) from Session JSON successfully!',
                {
                  len: cleanToken.length,
                }
              )}
            </span>
          </div>
        )}

        {/* New Token Realtime Analysis Preview */}
        {newExpiry && (
          <div
            className={cn(
              'rounded-xl border p-3 text-xs',
              newExpiry.isJwt &&
                newExpiry.isExpired &&
                'bg-destructive/10 border-destructive/30 text-destructive',
              newExpiry.isJwt &&
                !newExpiry.isExpired &&
                'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
              !newExpiry.isJwt &&
                'bg-muted/50 border-border text-muted-foreground'
            )}
          >
            {newExpiry.isJwt ? (
              <div>
                <div className='mb-1 flex items-center gap-1.5 font-semibold'>
                  <Sparkles size={13} />
                  <span>
                    {newExpiry.isExpired
                      ? t('Pasted Token is already expired!')
                      : t('Valid OpenAI AccessToken parsed!')}
                  </span>
                </div>
                <div className='mt-1 grid grid-cols-1 gap-1 font-mono text-[11px] opacity-90 sm:grid-cols-2'>
                  <div>
                    {t('Valid Until')}: {newExpiry.formattedExpiry}
                  </div>
                  <div>
                    {t('Remaining')}: {newExpiry.formattedRemaining}
                  </div>
                  {newExpiry.email && (
                    <div className='col-span-full'>
                      {t('Account')}: {newExpiry.email}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className='text-muted-foreground text-[11px]'>
                {t('Standard Key format detected (length: {{len}} chars)', {
                  len: cleanToken.length,
                })}
              </div>
            )}
          </div>
        )}

        {/* How to get AccessToken helper */}
        <div className='border-border/80 bg-muted/25 text-muted-foreground space-y-1.5 rounded-xl border border-dashed p-3 text-xs'>
          <div className='text-foreground flex items-center justify-between font-semibold'>
            <span>{t('💡 极速获取 AccessToken 步骤：')}</span>
            <a
              href='https://chatgpt.com/api/auth/session'
              target='_blank'
              rel='noreferrer'
              className='text-primary inline-flex items-center gap-1 text-[11px] font-medium hover:underline'
            >
              <span>{t('打开官方 Session 链接')}</span>
              <ExternalLink size={11} />
            </a>
          </div>
          <ol className='list-inside list-decimal space-y-1 text-[11px] leading-relaxed'>
            <li>
              {t('在浏览器登录 chatgpt.com 后，访问：')}{' '}
              <a
                href='https://chatgpt.com/api/auth/session'
                target='_blank'
                rel='noreferrer'
                className='text-primary font-mono underline select-all'
              >
                https://chatgpt.com/api/auth/session
              </a>
            </li>
            <li>
              {t('直接按 ')}
              <kbd className='bg-muted text-foreground rounded px-1 py-0.5 font-mono text-[10px] font-semibold'>
                Ctrl+A
              </kbd>{' '}
              {t('或全选并复制页面上的全部 JSON 内容（无需手动寻找 token）')}
            </li>
            <li>
              {t(
                '直接粘贴到上方输入框，系统将自动提取 accessToken 并解析，点击「保存并生效」即可！'
              )}
            </li>
          </ol>
        </div>

        {/* Test Result Indicator */}
        {testResult && (
          <div
            className={cn(
              'rounded-xl border p-2.5 text-xs flex items-center justify-between font-mono',
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-destructive/10 border-destructive/30 text-destructive'
            )}
          >
            <div className='flex items-center gap-1.5'>
              {testResult.success ? (
                <CheckCircle2 size={14} />
              ) : (
                <AlertCircle size={14} />
              )}
              <span>
                {testResult.success
                  ? t('Channel is fully active & available')
                  : t('Test failed')}
              </span>
            </div>
            <span>{testResult.message}</span>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className='mt-2 flex items-center justify-end gap-2 border-t pt-2'>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          disabled={isSaving || isTesting}
          onClick={() => onOpenChange(false)}
        >
          {t('Cancel')}
        </Button>
        <Button
          type='button'
          size='sm'
          disabled={!newToken.trim() || isSaving || isTesting}
          onClick={handleSaveAndTest}
          className='min-w-28'
        >
          {isSaving || isTesting ? (
            <>
              <Loader2 size={13} className='mr-1.5 animate-spin' />
              {isTesting ? t('Testing...') : t('Saving...')}
            </>
          ) : (
            <>
              <Zap size={13} className='mr-1.5 text-amber-300' />
              {t('Save & Apply')}
            </>
          )}
        </Button>
      </div>
    </Dialog>
  )
}
