import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { CheckCircle2, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

import { factoryResetLab, type LabResetResult } from '../api'

// A full reset usually takes ~45-55s; SW1 console automation is the first ~35s.
const EXPECTED_SECONDS = 55
const SWITCH_PHASE_SECONDS = 35

export function LabFactoryReset({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<LabResetResult | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const reset = useMutation({
    mutationFn: factoryResetLab,
    onMutate: () => {
      setResult(null)
      setElapsed(0)
    },
    onSuccess: (data) => {
      setResult(data)
      if (data.ok) toast.success(t('Lab restored to factory state'))
      else toast.error(t('Factory reset did not complete'))
      void queryClient.invalidateQueries({ queryKey: ['system', 'ibmc'] })
    },
    onError: (error) => {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.message as string | undefined)
        : undefined
      const text = message || t('Lab reset helper is unavailable')
      setResult({ ok: false, log: text })
      toast.error(text)
    },
  })
  const running = reset.isPending
  useEffect(() => {
    if (!running) return
    const started = Date.now()
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      500
    )
    return () => window.clearInterval(timer)
  }, [running])
  const percent = result
    ? 100
    : Math.min(95, Math.round((elapsed / EXPECTED_SECONDS) * 100))
  const phase =
    elapsed < SWITCH_PHASE_SECONDS
      ? t('Restoring SW1 management port...')
      : t('Restoring iBMC and TaiShan OS...')
  return (
    <>
      <Button
        size='sm'
        variant='outline'
        disabled={disabled}
        onClick={() => {
          if (!running) setResult(null)
          setOpen(true)
        }}
      >
        {running ? (
          <Loader2 size={14} className='animate-spin' />
        ) : (
          <RotateCcw size={14} />
        )}
        {running ? t('Resetting...') : t('Factory reset')}
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(value) => !running && setOpen(value)}
      >
        <AlertDialogContent>
          <AlertDialogHeader className='text-start'>
            <AlertDialogTitle>
              {t('Restore the whole lab to factory state?')}
            </AlertDialogTitle>
            <AlertDialogDescription render={<div />}>
              <ul className='list-disc space-y-1 ps-5 text-start'>
                <li>
                  {t('SW1 GE0/0/2 back to default (hybrid, VLAN 1) and saved')}
                </li>
                <li>{t('iBMC back to the factory address 192.168.2.100')}</li>
                <li>
                  {t(
                    'TaiShan OS: bond removed, sshd_config restored, SELinux enforcing'
                  )}
                </li>
                <li>
                  {t(
                    'Takes about one minute; win7 and openEuler must be running'
                  )}
                </li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(running || result) && (
            <div className='space-y-2' aria-live='polite'>
              <Progress
                value={percent}
                aria-label={t('Factory reset progress')}
              />
              {running && (
                <p className='text-muted-foreground flex justify-between text-xs'>
                  <span>{phase}</span>
                  <span>
                    {elapsed}s / ~{EXPECTED_SECONDS}s
                  </span>
                </p>
              )}
            </div>
          )}
          {result && (
            <div
              role='status'
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${result.ok ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-destructive/50 bg-destructive/10 text-destructive'}`}
            >
              {result.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              {result.ok
                ? t('Factory reset succeeded')
                : t('Factory reset failed')}
            </div>
          )}
          {result && (
            <pre className='max-h-56 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap'>
              {result.log}
            </pre>
          )}
          <AlertDialogFooter>
            {result ? (
              <Button onClick={() => setOpen(false)}>{t('Done')}</Button>
            ) : (
              <>
                <Button
                  variant='outline'
                  disabled={running}
                  onClick={() => setOpen(false)}
                >
                  {t('Cancel')}
                </Button>
                <Button
                  variant='destructive'
                  disabled={running}
                  onClick={() => reset.mutate()}
                >
                  {running && <Loader2 size={14} className='animate-spin' />}
                  {running ? t('Resetting...') : t('Factory reset')}
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
