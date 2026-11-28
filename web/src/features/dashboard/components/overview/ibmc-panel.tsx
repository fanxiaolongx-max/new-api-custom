import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Cpu,
  HardDrive,
  Monitor,
  Power,
  RefreshCw,
  Server,
  Terminal,
} from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  controlIBMC,
  getIBMC,
  getIBMCForNode,
  type IBMCAction,
  type IBMCNode,
} from '@/features/dashboard/ibmc-api'
import { labConsoleURL } from '@/features/dragon-lab/api'
import { cn } from '@/lib/utils'

import { IBMCInventory } from './ibmc-inventory'
import { VirtualMachineConsole } from './virtual-machine-console'
import { displayVirtualMachineName } from './virtual-machine-names'

const SerialConsole = lazy(() => import('./ibmc-serial'))
const BOOT_KEYS: Record<string, string> = {
  disk: 'Hard disk',
  dvd: 'Virtual DVD',
  net: 'Network boot (PXE)',
  none: 'None',
}
const ALARM_KEYS: Record<string, string> = {
  normal: 'Normal',
  warning: 'Warning',
  critical: 'Critical',
}
const QUERY_KEY = ['system', 'ibmc'] as const
const STATE_KEYS: Record<string, string> = {
  running: 'Running',
  poweroff: 'Powered off',
  saved: 'Saved',
  paused: 'Paused',
  aborted: 'Aborted',
  starting: 'Starting',
  stopping: 'Shutting down',
}
const ACTION_KEYS: Record<string, string> = {
  start: 'Start',
  shutdown: 'Shut down',
  poweroff: 'Force power off',
  reset: 'Reset VM',
  save: 'Save state',
  pause: 'Pause VM',
  resume: 'Resume VM',
  boot: 'Boot order',
  mount: 'Mount ISO',
  eject: 'Eject ISO',
  snapshot: 'Create snapshot',
  uid: 'Simulated locator LED',
  alarm: 'Simulated alarm',
  power_state: 'Power state changed',
}

export default function IBMCPanel(props: { onClose: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [selectedNode, setSelectedNode] = useState('')
  const [knownNodes, setKnownNodes] = useState<IBMCNode[]>([])
  const [tab, setTab] = useState('overview')
  const [kvm, setKvm] = useState(false)
  const [confirmation, setConfirmation] = useState<IBMCAction | null>(null)
  const [media, setMedia] = useState('')
  const [boot, setBoot] = useState('disk')
  const [severity, setSeverity] = useState('warning')
  const requestNode =
    selectedNode && selectedNode !== 'Node-01' ? selectedNode : undefined
  const query = useQuery({
    queryKey: [...QUERY_KEY, selectedNode || 'Node-01'],
    queryFn: () => (requestNode ? getIBMCForNode(requestNode) : getIBMC()),
    refetchInterval: 10000,
  })
  const vm = query.data
  const nodes = vm?.nodes?.length ? vm.nodes : knownNodes
  const activeNode = selectedNode || vm?.node || 'Node-01'
  const activeRequestNode = activeNode === 'Node-01' ? undefined : activeNode
  const sshConsolePath = vm?.console_id
    ? labConsoleURL(vm.console_id)
    : '/guacamole/#/client/NgBjAHBvc3RncmVzcWw'
  const mutation = useMutation({
    mutationFn: controlIBMC,
    onSuccess: async () => {
      toast.success(t('iBMC action completed'))
      await Promise.all([
        client.invalidateQueries({ queryKey: QUERY_KEY }),
        client.invalidateQueries({ queryKey: ['system', 'virtual-machines'] }),
      ])
    },
  })
  const dispatchAction = (action: IBMCAction) => {
    mutation.mutate(
      activeRequestNode ? { ...action, node: activeRequestNode } : action
    )
  }
  const selectNode = (node: string) => {
    if (vm?.nodes?.length) {
      setKnownNodes(vm.nodes)
    }
    setSelectedNode(node)
    setKvm(false)
    setConfirmation(null)
    setMedia('')
  }
  const off = vm?.state === 'poweroff' || vm?.state === 'aborted'
  const running = vm?.state === 'running'
  const paused = vm?.state === 'paused'
  const busy = mutation.isPending
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) props.onClose()
        }}
      >
        <DialogContent className='flex max-h-[94dvh] w-[96vw] max-w-6xl! flex-col overflow-hidden p-0'>
          <DialogHeader className='border-b bg-linear-to-r from-sky-500/10 to-indigo-500/10 p-5 pr-12'>
            <DialogTitle className='flex flex-wrap items-center gap-2'>
              <Server className='size-5 text-sky-500' />
              {t('Virtual iBMC')}
              <Badge variant='outline'>{t('Training simulator')}</Badge>
            </DialogTitle>
            <DialogDescription>
              {t(
                'Real VM controls and COM1 console. Physical iBMC firmware, IPMI and hardware sensors are not emulated.'
              )}
            </DialogDescription>
            {nodes.length > 1 && (
              <div
                className='flex flex-wrap gap-1.5 pt-2'
                role='group'
                aria-label={t('Switch OS node')}
              >
                {nodes.map((item) => {
                  const active = item.node === activeNode
                  return (
                    <Button
                      key={item.node}
                      type='button'
                      size='sm'
                      variant={active ? 'default' : 'outline'}
                      aria-pressed={active}
                      onClick={() => selectNode(item.node)}
                    >
                      {displayVirtualMachineName(item.vm)}
                    </Button>
                  )
                })}
              </div>
            )}
          </DialogHeader>
          <div className='overflow-y-auto p-4 sm:p-5'>
            {query.isPending && <p role='status'>{t('Loading...')}</p>}
            {query.isError && (
              <div
                role='alert'
                className='space-y-2 rounded-xl border border-red-500/30 p-4'
              >
                <p>{t('iBMC agent is unavailable')}</p>
                <Button variant='outline' onClick={() => void query.refetch()}>
                  {t('Retry')}
                </Button>
              </div>
            )}
            {vm && (
              <div className='space-y-4'>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='text-lg font-semibold'>
                      {displayVirtualMachineName(vm.name)}
                    </span>
                    <Badge variant={running ? 'default' : 'secondary'}>
                      {t(STATE_KEYS[vm.state] ?? 'Unknown')}
                    </Badge>
                    <Badge
                      variant={
                        vm.alarm === 'normal' ? 'outline' : 'destructive'
                      }
                    >
                      {t('Simulated alarm')}:{' '}
                      {t(ALARM_KEYS[vm.alarm] ?? 'Unknown')}
                    </Badge>
                    {vm.uid && <Badge>{t('Simulated locator LED')}</Badge>}
                  </div>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => void query.refetch()}
                    disabled={query.isFetching}
                  >
                    <RefreshCw className='size-3' />
                    {t('Refresh')}
                  </Button>
                </div>
                {mutation.isError && (
                  <p role='alert' className='text-destructive text-sm'>
                    {t(
                      'iBMC operation failed. Refresh the state and check that the VM is shut down for boot, media and snapshot changes.'
                    )}
                  </p>
                )}
                <Tabs
                  value={tab}
                  onValueChange={(value) => setTab(String(value))}
                >
                  <div className='overflow-x-auto pb-1'>
                    <TabsList className='w-max'>
                      <TabsTrigger value='overview'>
                        {t('Overview')}
                      </TabsTrigger>
                      <TabsTrigger value='sol'>
                        {t('Serial console (SOL)')}
                      </TabsTrigger>
                      <TabsTrigger value='remote'>
                        {t('Remote control')}
                      </TabsTrigger>
                      <TabsTrigger value='power'>
                        {t('Power and boot')}
                      </TabsTrigger>
                      <TabsTrigger value='media'>
                        {t('Virtual media')}
                      </TabsTrigger>
                      <TabsTrigger value='hardware'>
                        {t('Inventory and diagnostics')}
                      </TabsTrigger>
                      <TabsTrigger value='events'>{t('Event log')}</TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value='overview' className='space-y-4'>
                    <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
                      <Metric
                        title={t('Processor')}
                        value={`${vm.cpu_count} vCPU`}
                        icon={<Cpu className='size-4' />}
                      />
                      <Metric
                        title={t('Memory')}
                        value={`${vm.memory_mb} MB`}
                        icon={<Server className='size-4' />}
                      />
                      <Metric
                        title={t('Operating system')}
                        value={vm.os}
                        icon={<HardDrive className='size-4' />}
                      />
                      <Metric
                        title={t('Serial console (SOL)')}
                        value={
                          vm.serial ? t('Configured') : t('Not configured')
                        }
                        icon={<Terminal className='size-4' />}
                      />
                    </div>
                    <div className='grid gap-3 md:grid-cols-2'>
                      <section className='space-y-3 rounded-xl border p-4'>
                        <h3 className='font-semibold'>
                          {t('Out-of-band access')}
                        </h3>
                        <p className='text-muted-foreground text-xs'>
                          {t(
                            'The serial console works without SSH or guest networking. Power controls remain available while the guest is offline.'
                          )}
                        </p>
                        <div className='flex flex-wrap gap-2'>
                          <Button size='sm' onClick={() => setTab('sol')}>
                            <Terminal className='size-4' />
                            {t('Serial console (SOL)')}
                          </Button>
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() => setTab('remote')}
                          >
                            <Monitor className='size-4' />
                            {t('Remote control')}
                          </Button>
                        </div>
                      </section>
                      <section className='space-y-3 rounded-xl border p-4'>
                        <h3 className='font-semibold'>
                          {t('Management scope')}
                        </h3>
                        <p className='text-muted-foreground text-xs'>
                          {t(
                            'Restricted to the openEuler VM and the highest-privilege DragonAPI administrator. No additional public management ports are opened.'
                          )}
                        </p>
                        <p className='font-mono text-xs break-all'>{vm.uuid}</p>
                        <p className='text-muted-foreground text-xs'>
                          {t('Firmware')}: {vm.firmware} · {t('Boot order')}:{' '}
                          {vm.boot
                            .map((device) => t(BOOT_KEYS[device] ?? device))
                            .join(' → ')}
                        </p>
                      </section>
                    </div>
                  </TabsContent>
                  <TabsContent value='sol'>
                    <Suspense fallback={<p role='status'>{t('Loading...')}</p>}>
                      <SerialConsole
                        key={activeNode}
                        node={activeRequestNode}
                      />
                    </Suspense>
                  </TabsContent>
                  <TabsContent value='remote' className='space-y-4'>
                    <section className='rounded-xl border p-4'>
                      <h3 className='mb-2 font-semibold'>{t('Virtual KVM')}</h3>
                      <p className='text-muted-foreground mb-4 text-sm'>
                        {t(
                          'View the virtual display and send keyboard or mouse input, including during OS startup.'
                        )}
                      </p>
                      <Button disabled={!running} onClick={() => setKvm(true)}>
                        {t('Open KVM console')}
                      </Button>
                    </section>
                    <section className='rounded-xl border p-4'>
                      <h3 className='mb-3 font-semibold'>
                        {t('SSH terminal')}
                      </h3>
                      {!running && (
                        <p className='text-muted-foreground mb-3 text-sm'>
                          {t(
                            'Start the VM in Power and boot before opening SSH.'
                          )}
                        </p>
                      )}
                      <Button
                        variant='outline'
                        disabled={!running}
                        nativeButton={false}
                        render={
                          <a
                            href={sshConsolePath}
                            target='_blank'
                            rel='noreferrer'
                          />
                        }
                      >
                        {t('Open terminal')}
                      </Button>
                    </section>
                  </TabsContent>
                  <TabsContent value='power' className='space-y-4'>
                    <section className='space-y-3 rounded-xl border p-4'>
                      <h3 className='flex items-center gap-2 font-semibold'>
                        <Power className='size-4' />
                        {t('Power management')}
                      </h3>
                      <div className='flex flex-wrap gap-2'>
                        <Button
                          disabled={busy || (!off && vm.state !== 'saved')}
                          onClick={() => dispatchAction({ action: 'start' })}
                        >
                          {t('Start')}
                        </Button>
                        <Button
                          variant='outline'
                          disabled={busy || !running}
                          onClick={() =>
                            setConfirmation({ action: 'shutdown' })
                          }
                        >
                          {t('Shut down')}
                        </Button>
                        <Button
                          variant='outline'
                          disabled={busy || (!running && !paused)}
                          onClick={() => dispatchAction({ action: 'save' })}
                        >
                          {t('Save state')}
                        </Button>
                        <Button
                          variant='outline'
                          disabled={busy || (!running && !paused)}
                          onClick={() =>
                            dispatchAction({
                              action: paused ? 'resume' : 'pause',
                            })
                          }
                        >
                          {paused ? t('Resume VM') : t('Pause VM')}
                        </Button>
                        <Button
                          variant='outline'
                          disabled={busy || !running}
                          onClick={() => setConfirmation({ action: 'reset' })}
                        >
                          {t('Reset VM')}
                        </Button>
                        <Button
                          variant='destructive'
                          disabled={busy || (!running && !paused)}
                          onClick={() =>
                            setConfirmation({ action: 'poweroff' })
                          }
                        >
                          {t('Force power off')}
                        </Button>
                      </div>
                    </section>
                    <section className='space-y-3 rounded-xl border p-4'>
                      <h3 className='font-semibold'>{t('Boot order')}</h3>
                      <p className='text-muted-foreground text-xs'>
                        {t(
                          'Shut down the VM before changing boot order, mounting media or creating a snapshot. DVD and network boot fall back to disk.'
                        )}
                      </p>
                      <div className='flex flex-wrap gap-2'>
                        <NativeSelect
                          aria-label={t('Boot device')}
                          value={boot}
                          onChange={(event) => setBoot(event.target.value)}
                        >
                          <NativeSelectOption value='disk'>
                            {t('Hard disk')}
                          </NativeSelectOption>
                          <NativeSelectOption value='dvd'>
                            {t('Virtual DVD')}
                          </NativeSelectOption>
                          <NativeSelectOption value='net'>
                            {t('Network boot (PXE)')}
                          </NativeSelectOption>
                        </NativeSelect>
                        <Button
                          variant='outline'
                          disabled={!off || busy}
                          onClick={() =>
                            setConfirmation({ action: 'boot', device: boot })
                          }
                        >
                          {t('Apply')}
                        </Button>
                      </div>
                      <p className='font-mono text-xs'>
                        {vm.boot
                          .map((device) => t(BOOT_KEYS[device] ?? device))
                          .join(' → ')}
                      </p>
                    </section>
                  </TabsContent>
                  <TabsContent value='media' className='space-y-4'>
                    <section className='space-y-3 rounded-xl border p-4'>
                      <h3 className='font-semibold'>{t('Virtual media')}</h3>
                      <p className='text-muted-foreground text-xs'>
                        {t(
                          'Only ISO images in the approved host media library can be mounted. Arbitrary paths and remote URLs are not accepted.'
                        )}
                      </p>
                      <p className='text-sm'>
                        {t('Mounted media')}:{' '}
                        <span className='font-mono break-all'>
                          {vm.mounted_media === 'none'
                            ? t('None')
                            : vm.mounted_media}
                        </span>
                      </p>
                      <div className='flex flex-wrap gap-2'>
                        <NativeSelect
                          className='max-w-full'
                          aria-label={t('ISO image')}
                          value={media}
                          onChange={(event) => setMedia(event.target.value)}
                        >
                          <NativeSelectOption value=''>
                            {t('Select an ISO image')}
                          </NativeSelectOption>
                          {vm.media.map((item) => (
                            <NativeSelectOption key={item.id} value={item.id}>
                              {item.id} · {(item.size / 1073741824).toFixed(2)}{' '}
                              GiB
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                        <Button
                          disabled={!off || !media || busy}
                          onClick={() =>
                            setConfirmation({ action: 'mount', media })
                          }
                        >
                          {t('Mount ISO')}
                        </Button>
                        <Button
                          variant='outline'
                          disabled={!off || busy}
                          onClick={() => setConfirmation({ action: 'eject' })}
                        >
                          {t('Eject ISO')}
                        </Button>
                      </div>
                    </section>
                    <section className='space-y-3 rounded-xl border p-4'>
                      <h3 className='font-semibold'>{t('VM snapshots')}</h3>
                      <Button
                        variant='outline'
                        disabled={!off || busy}
                        onClick={() => setConfirmation({ action: 'snapshot' })}
                      >
                        {t('Create snapshot')}
                      </Button>
                      <ul className='divide-y text-xs'>
                        {vm.snapshots.map((item) => (
                          <li
                            className='flex flex-wrap justify-between gap-2 py-2'
                            key={item.id}
                          >
                            <span>{item.name}</span>
                            <span className='text-muted-foreground font-mono'>
                              {item.id}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </TabsContent>
                  <TabsContent value='hardware' className='space-y-4'>
                    <section className='rounded-xl border p-4'>
                      <h3 className='mb-3 font-semibold'>
                        {t('Virtual hardware inventory')}
                      </h3>
                      <IBMCInventory inventory={vm.inventory} />
                    </section>
                    <section className='space-y-3 rounded-xl border p-4'>
                      <h3 className='font-semibold'>
                        {t('Simulation exercises')}
                      </h3>
                      <p className='text-muted-foreground text-xs'>
                        {t(
                          'Locator LED and alarm exercises only change simulator state. Temperature, fans, PSU, RAID, firmware flashing, IPMI and Redfish are not emulated.'
                        )}
                      </p>
                      <div className='flex flex-wrap gap-2'>
                        <Button
                          variant='outline'
                          disabled={busy}
                          onClick={() =>
                            dispatchAction({ action: 'uid', enabled: !vm.uid })
                          }
                        >
                          {t('Toggle simulated locator LED')}
                        </Button>
                        <NativeSelect
                          aria-label={t('Alarm severity')}
                          value={severity}
                          onChange={(event) => setSeverity(event.target.value)}
                        >
                          <NativeSelectOption value='warning'>
                            {t('Warning')}
                          </NativeSelectOption>
                          <NativeSelectOption value='critical'>
                            {t('Critical')}
                          </NativeSelectOption>
                          <NativeSelectOption value='normal'>
                            {t('Normal')}
                          </NativeSelectOption>
                        </NativeSelect>
                        <Button
                          variant='outline'
                          disabled={busy}
                          onClick={() =>
                            dispatchAction({ action: 'alarm', severity })
                          }
                        >
                          {t('Apply simulated alarm')}
                        </Button>
                      </div>
                    </section>
                  </TabsContent>
                  <TabsContent value='events' className='space-y-3'>
                    <div className='flex flex-wrap justify-between gap-2'>
                      <p className='text-muted-foreground text-xs'>
                        {t(
                          'Latest 200 management events are retained. Serial input and passwords are never recorded.'
                        )}
                      </p>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(vm, null, 2)], {
                            type: 'application/json',
                          })
                          const url = URL.createObjectURL(blob)
                          const link = document.createElement('a')
                          link.href = url
                          link.download = `ibmc-${displayVirtualMachineName(vm.name)}-diagnostics.json`
                          link.click()
                          URL.revokeObjectURL(url)
                        }}
                      >
                        {t('Export diagnostics')}
                      </Button>
                    </div>
                    {!vm.events.length && (
                      <p className='text-muted-foreground py-8 text-center text-sm'>
                        {t('No management events yet')}
                      </p>
                    )}
                    <div className='divide-y rounded-xl border'>
                      {vm.events.map((event) => (
                        <div
                          className='grid gap-2 p-3 text-xs sm:grid-cols-[10rem_1fr_auto]'
                          key={event.id}
                        >
                          <time className='text-muted-foreground'>
                            {new Date(event.time * 1000).toLocaleString()}
                          </time>
                          <div>
                            <span className='font-medium'>
                              {t(ACTION_KEYS[event.action] ?? 'Unknown')}
                            </span>
                            {event.detail && (
                              <span className='text-muted-foreground ml-2 font-mono break-all'>
                                {event.detail}
                              </span>
                            )}
                          </div>
                          <span
                            className={cn(
                              event.success
                                ? 'text-emerald-500'
                                : 'text-destructive'
                            )}
                          >
                            {event.success ? t('Success') : t('Failed')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <VirtualMachineConsole
        machineName={kvm && vm ? vm.name : null}
        onOpenChange={setKvm}
      />
      <AlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Confirm VM operation')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'This changes the real openEuler VM. Shutdown interrupts sessions; reset and forced power off can lose unsaved data.'
              )}
              <span className='mt-2 block font-mono break-all'>
                {confirmation && t(ACTION_KEYS[confirmation.action])}{' '}
                {confirmation?.device ?? confirmation?.media ?? ''}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmation) dispatchAction(confirmation)
                setConfirmation(null)
              }}
            >
              {t('Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function Metric(props: {
  title: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <div className='bg-muted/20 rounded-xl border p-4'>
      <div className='text-muted-foreground mb-3 flex items-center justify-between gap-2 text-xs'>
        {props.title}
        {props.icon}
      </div>
      <p className='font-mono text-sm font-semibold break-words'>
        {props.value}
      </p>
    </div>
  )
}
