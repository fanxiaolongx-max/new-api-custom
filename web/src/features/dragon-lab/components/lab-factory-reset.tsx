import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

import {
  factoryResetLab,
  getLabFactoryStatus,
  type LabResetResult,
} from '../api'

// A full reset usually takes ~45-55s; SW1 console automation is the first ~35s.
const EXPECTED_SECONDS = 55
const FACTORY_KEY = ['system', 'dragon-lab', 'factory-status']
const SWITCH_PHASE_SECONDS = 35

export function LabFactoryReset({
  disabled,
  nodes = ['Node-01'],
}: {
  disabled?: boolean
  // Every OS guest is reset; each extra node adds a few console commands.
  nodes?: string[]
}) {
  const expectedSeconds = EXPECTED_SECONDS + 8 * (nodes.length - 1)
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<LabResetResult | null>(null)
  const [elapsed, setElapsed] = useState(0)
  // The monitor samples about once a minute; polling faster would only re-read the file.
  const factory = useQuery({
    queryKey: FACTORY_KEY,
    queryFn: getLabFactoryStatus,
    enabled: !disabled,
    refetchInterval: 60000,
    retry: false,
  })
  const itemLabels = {
    sw1: t('SW1 iBMC port'),
    ibmc: t('iBMC address'),
    bond: t('Bond count'),
    selinux: 'SELinux',
  }
  const differences = (factory.data?.checks ?? [])
    .filter((check) => check.ok === false)
    .map(
      (check) =>
        `${check.node} ${itemLabels[check.item] ?? check.item}${check.target ? ` ${check.target}` : ''}: ${check.actual} → ${check.expected}`
    )
  const factoryState = factory.data?.state
  let factoryTitle = t('Factory state not checked yet')
  if (factoryState === 'factory') {
    factoryTitle = t('Every node is in factory state')
  } else if (factoryState === 'modified') {
    factoryTitle = `${t('Differs from factory state')}:\n${differences.join('\n')}`
  }
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
      // The reset asks the monitor for a fresh check, which lands within ~10s.
      window.setTimeout(
        () => void queryClient.invalidateQueries({ queryKey: FACTORY_KEY }),
        15000
      )
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
    : Math.min(95, Math.round((elapsed / expectedSeconds) * 100))
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
        className={
          factoryState === 'factory' && !running
            ? 'lab-factory-clean'
            : undefined
        }
        title={disabled ? undefined : factoryTitle}
        aria-description={disabled ? undefined : factoryTitle}
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
                  {t('Covers {{count}} OS nodes: {{nodes}}', {
                    count: nodes.length,
                    nodes: nodes.join(', '),
                  })}
                </li>
                <li>
                  {t(
                    "SW1 management ports back to each node's factory VLAN and saved"
                  )}
                </li>
                <li>
                  {t('Every iBMC back to the factory address 192.168.2.100')}
                </li>
                <li>
                  {t(
                    'TaiShan OS: bond removed, sshd_config restored, SELinux enforcing'
                  )}
                </li>
                <li>
                  {t(
                    'Takes about one minute; win7 and every OS node must be running'
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
                    {elapsed}s / ~{expectedSeconds}s
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
