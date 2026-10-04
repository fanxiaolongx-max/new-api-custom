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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CircleStop,
  MonitorPlay,
  Pause,
  Play,
  Power,
  RefreshCw,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import {
  controlVirtualMachine,
  getVirtualMachines,
  type VirtualMachine,
  type VirtualMachineAction,
} from '@/features/dashboard/api'
import { cn } from '@/lib/utils'

import { VirtualMachineConsole } from './virtual-machine-console'

const VM_QUERY_KEY = ['system', 'virtual-machines'] as const
const WEB_RDP_PATHS: Readonly<Record<string, string>> = {
  win7: '/guacamole/#/client/MQBjAHBvc3RncmVzcWw',
  winXP: '/guacamole/#/client/MgBjAHBvc3RncmVzcWw',
  win11: '/guacamole/#/client/MwBjAHBvc3RncmVzcWw',
}
const ACTIVE_VM_STATES = new Set([
  'running',
  'paused',
  'starting',
  'stopping',
  'saving',
])

function stateLabelKey(state: string): string {
  const labels: Record<string, string> = {
    running: 'Running',
    powered_off: 'Powered off',
    saved: 'Saved',
    paused: 'Paused',
    aborted: 'Aborted',
    error: 'Error',
  }
  return labels[state] ?? 'Unknown'
}

function MachineRow(props: {
  machine: VirtualMachine
  companionLocked: boolean
  pending: boolean
  onAction: (action: VirtualMachineAction) => void
  onConsole: () => void
  onForcePowerOff: () => void
}) {
  const { t } = useTranslation()
  const running = props.machine.state === 'running'
  const webRDPPath = WEB_RDP_PATHS[props.machine.name]
  const canStart =
    ['powered_off', 'saved', 'aborted'].includes(props.machine.state) &&
    !props.companionLocked

  return (
    <article className='bg-background/55 flex flex-col gap-3 rounded-xl border p-3 lg:flex-row lg:items-center lg:justify-between'>
      <div className='flex min-w-0 items-center gap-3'>
        <span
          className={cn(
            'size-2.5 shrink-0 rounded-full',
            running ? 'bg-emerald-500' : 'bg-muted-foreground/45'
          )}
          aria-hidden='true'
        />
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <h4 className='font-medium'>{props.machine.name}</h4>
            <Badge variant={running ? 'default' : 'secondary'}>
              {t(stateLabelKey(props.machine.state))}
            </Badge>
          </div>
          <p className='text-muted-foreground mt-0.5 text-xs'>
            {t('{{cpu}} vCPU · {{memory}} MB RAM · {{os}}', {
              cpu: props.machine.cpu_count,
              memory: props.machine.memory_mb,
              os: props.machine.os_type,
            })}
          </p>
        </div>
      </div>

      <div className='flex flex-wrap gap-2'>
        {canStart && (
          <Button
            size='sm'
            onClick={() => props.onAction('start')}
            disabled={props.pending}
          >
            <Play data-icon='inline-start' />
            {t('Start')}
          </Button>
        )}
        {running && (
          <>
            {webRDPPath ? (
              <>
                <Button
                  size='sm'
                  render={
                    <a href={webRDPPath} target='_blank' rel='noreferrer' />
                  }
                  nativeButton={false}
                >
                  <MonitorPlay data-icon='inline-start' />
                  {t('Remote control')}
                </Button>
                <Button variant='outline' size='sm' onClick={props.onConsole}>
                  {t('Basic console mode')}
                </Button>
              </>
            ) : (
              <Button size='sm' onClick={props.onConsole}>
                <MonitorPlay data-icon='inline-start' />
                {t('Remote control')}
              </Button>
            )}
            <Button
              variant='outline'
              size='sm'
              onClick={() => props.onAction('shutdown')}
              disabled={props.pending}
            >
              <Power data-icon='inline-start' />
              {t('Shut down')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => props.onAction('save')}
              disabled={props.pending}
            >
              <Pause data-icon='inline-start' />
              {t('Save state')}
            </Button>
            <Button
              variant='ghost'
              size='sm'
              onClick={props.onForcePowerOff}
              disabled={props.pending}
            >
              <CircleStop data-icon='inline-start' />
              {t('Force power off')}
            </Button>
          </>
        )}
      </div>
    </article>
  )
}

export function VirtualMachinesPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [consoleMachine, setConsoleMachine] = useState<string | null>(null)
  const [forcePowerOffMachine, setForcePowerOffMachine] = useState<
    string | null
  >(null)

  const machinesQuery = useQuery({
    queryKey: VM_QUERY_KEY,
    queryFn: async () => (await getVirtualMachines()).data,
    refetchInterval: 5000,
    retry: 1,
  })

  const actionMutation = useMutation({
    mutationFn: (request: { name: string; action: VirtualMachineAction }) =>
      controlVirtualMachine(request.name, request.action),
    onSuccess: async (_, request) => {
      toast.success(
        t('Virtual machine {{name}} command accepted', { name: request.name })
      )
      await queryClient.invalidateQueries({ queryKey: VM_QUERY_KEY })
    },
  })

  const runAction = (name: string, action: VirtualMachineAction) => {
    actionMutation.mutate({ name, action })
  }
  const win11IsActive = Boolean(
    machinesQuery.data?.some(
      (machine) =>
        machine.name === 'win11' && ACTIVE_VM_STATES.has(machine.state)
    )
  )

  return (
    <section className='bg-card overflow-hidden rounded-2xl border shadow-xs'>
      <div className='flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5'>
        <div className='flex items-center gap-2.5'>
          <IconBadge tone='chart-4' size='sm'>
            <MonitorPlay className='size-4' aria-hidden='true' />
          </IconBadge>
          <div>
            <h3 className='text-sm font-semibold'>{t('Windows workspaces')}</h3>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Starting Win11 saves fnOS automatically; fnOS resumes after Win11 stops.'
              )}
            </p>
          </div>
        </div>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => machinesQuery.refetch()}
          disabled={machinesQuery.isFetching}
        >
          <RefreshCw
            data-icon='inline-start'
            className={cn(machinesQuery.isFetching && 'animate-spin')}
          />
          {t('Refresh')}
        </Button>
      </div>

      <div className='space-y-3 p-4 sm:p-5'>
        {machinesQuery.isError && (
          <div className='border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm'>
            {t('The host virtual machine agent is unavailable.')}
          </div>
        )}
        {machinesQuery.data?.map((machine) => (
          <MachineRow
            key={machine.name}
            machine={machine}
            companionLocked={machine.name === 'feiniu' && win11IsActive}
            pending={
              actionMutation.isPending &&
              actionMutation.variables?.name === machine.name
            }
            onAction={(action) => runAction(machine.name, action)}
            onConsole={() => setConsoleMachine(machine.name)}
            onForcePowerOff={() => setForcePowerOffMachine(machine.name)}
          />
        ))}
        {!machinesQuery.isError && !machinesQuery.data?.length && (
          <p className='text-muted-foreground text-sm'>
            {t('No managed virtual machines were found.')}
          </p>
        )}
      </div>

      <VirtualMachineConsole
        machineName={consoleMachine}
        onOpenChange={(open) => {
          if (!open) setConsoleMachine(null)
        }}
      />

      <AlertDialog
        open={Boolean(forcePowerOffMachine)}
        onOpenChange={(open) => {
          if (!open) setForcePowerOffMachine(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Force power off?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'This is equivalent to unplugging the computer and can corrupt unsaved data. Use normal shutdown first.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => {
                if (forcePowerOffMachine) {
                  runAction(forcePowerOffMachine, 'poweroff')
                }
                setForcePowerOffMachine(null)
              }}
            >
              {t('Force power off')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
