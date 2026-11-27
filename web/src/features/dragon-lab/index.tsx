import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  FileCode2,
  LockKeyhole,
  MonitorPlay,
  Pause,
  Play,
  RefreshCw,
  Settings2,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { PublicLayout } from '@/components/layout'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTheme } from '@/context/theme-provider'
import { getVirtualMachines } from '@/features/dashboard/api'
import { getIBMC } from '@/features/dashboard/ibmc-api'
import { hasPermission } from '@/lib/admin-permissions'
import { canAccessDragonLab } from '@/lib/dragon-lab-access'
import { useAuthStore } from '@/stores/auth-store'

import {
  getLabConfig,
  getLabLinkStatus,
  getLabOSNodes,
  LAB_KEY,
  labHostFields,
  type LabLinkID,
  type LabNodeID,
  type LabOSInstance,
} from './api'
import { LabFactoryReset } from './components/lab-factory-reset'
import { LabInfo } from './components/lab-info'
import { LabNode } from './components/lab-node'
import { LabOSSwitcher } from './components/lab-os-switcher'
import { LabPortMap } from './components/lab-port-map'
import { LabReadiness } from './components/lab-readiness'
import LabTool from './components/lab-tool'
import { LabWiring } from './components/lab-wiring'
import { LAB_NODES } from './topology'
import { useWorkbenchBridge } from './use-workbench-bridge'
import { workbenchTaskActive } from './workbench-task'
import { cardTerminal } from './workbench-terminals'

import './lab.css'

const LabSettings = lazy(() => import('./components/lab-settings'))
// Node-01 is the original openEuler guest described by the saved topology.
const BASE_NODE = 'Node-01'
const OS_NODE_KEY = 'dragon-lab-os-node'
// Parallel stage-2 workers alternate targets; an automatic switch holds this long.
const FOLLOW_HOLD_MS = 8000
export function DragonLab() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const authorized = useAuthStore((state) =>
    canAccessDragonLab(state.auth.user)
  )
  const desktopAccess = useAuthStore((state) =>
    hasPermission(state.auth.user, 'dragon_lab', 'desktop')
  )
  const [paused, setPaused] = useState(false)
  const [compact, setCompact] = useState(true)
  const [expandedNode, setExpandedNode] = useState<LabNodeID | null>(null)
  const [settings, setSettings] = useState(false)
  const [tool, setTool] = useState(false)
  const [detachedTool, setDetachedTool] = useState(false)
  const workbenchFrame = useRef<HTMLIFrameElement>(null)
  const toolOpener = useRef<HTMLElement | null>(null)
  const [selected, setSelected] = useState<LabLinkID | null>(null)
  const [tab, setTab] = useState('topology')
  const config = useQuery({
    queryKey: LAB_KEY,
    queryFn: getLabConfig,
    enabled: authorized,
    staleTime: 60000,
    retry: false,
  })
  const inventory = useQuery({
    queryKey: ['system', 'dragon-lab', 'os-nodes'],
    queryFn: getLabOSNodes,
    enabled: authorized,
    refetchInterval: 10000,
    retry: false,
  })
  const [osName, setOSName] = useState(() => {
    try {
      return localStorage.getItem(OS_NODE_KEY) || BASE_NODE
    } catch {
      return BASE_NODE
    }
  })
  const [slide, setSlide] = useState<'next' | 'prev'>('next')
  const [dismissed, setDismissed] = useState<string[]>([])
  const [removing, setRemoving] = useState<string | null>(null)
  const instances = (
    authorized && Array.isArray(inventory.data) ? inventory.data : []
  ).filter((item) => item.name !== BASE_NODE)
  const nodeNames = [BASE_NODE, ...instances.map((item) => item.name)]
  const instance = instances.find((item) => item.name === osName)
  const topology =
    config.data && instance
      ? {
          ...config.data,
          nodes: config.data.nodes.map(
            (item) => instance.nodes.find((n) => n.id === item.id) ?? item
          ),
          links: config.data.links.map(
            (item) => instance.links.find((n) => n.id === item.id) ?? item
          ),
        }
      : config.data
  const machines = useQuery({
    queryKey: ['system', 'virtual-machines'],
    queryFn: async () => (await getVirtualMachines()).data,
    enabled: authorized,
    refetchInterval: 15000,
    retry: false,
  })
  const linkStatus = useQuery({
    queryKey: ['system', 'dragon-lab', 'link-status'],
    queryFn: getLabLinkStatus,
    enabled: authorized,
    refetchInterval: 10000,
    retry: false,
  })
  const ibmc = useQuery({
    queryKey: ['system', 'ibmc'],
    queryFn: getIBMC,
    enabled: authorized,
    refetchInterval: 20000,
    retry: false,
  })
  const workbench = useWorkbenchBridge({
    theme: resolvedTheme,
    frame: workbenchFrame,
    url: authorized && !detachedTool ? config.data?.workbench_url || '' : '',
  })
  const openTool = () => {
    toolOpener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setDetachedTool(false)
    setTool(true)
  }
  const switchNode = (name: string, direction: 'next' | 'prev') => {
    setSlide(direction)
    setOSName(name)
    try {
      localStorage.setItem(OS_NODE_KEY, name)
    } catch {
      // Remembering the last node is a convenience only.
    }
  }
  // While a workbench task runs, the iBMC / OS cards show the node it is
  // working on. A manual switch is kept until the task moves to another node.
  const taskTarget = workbench.state?.task?.currentTarget?.trim().toLowerCase()
  const followTarget = workbenchTaskActive(workbench.state?.task)
    ? nodeNames.find((name) => name.toLowerCase() === taskTarget)
    : undefined
  const followDirection =
    followTarget && nodeNames.indexOf(followTarget) < nodeNames.indexOf(osName)
      ? 'prev'
      : 'next'
  const followed = useRef<{ name?: string; at: number }>({ at: 0 })
  useEffect(() => {
    if (!followTarget || followTarget === followed.current.name) return
    const timer = setTimeout(
      () => {
        followed.current = { name: followTarget, at: Date.now() }
        setSlide(followDirection)
        setOSName(followTarget)
      },
      Math.max(0, followed.current.at + FOLLOW_HOLD_MS - Date.now())
    )
    return () => clearTimeout(timer)
  }, [followTarget, followDirection])
  const workbenchHosts = workbench.state?.hosts
  // Guests already in the workbench (matched by host name) need no import prompt.
  const unimported = workbenchHosts
    ? instances.filter(
        (item) =>
          !workbenchHosts.some(
            (host) =>
              host.hostname.trim().toLowerCase() === item.name.toLowerCase()
          )
      )
    : []
  // Workbench host names (as the workbench spells them) of provisioned guests;
  // Node-01 and hand-made hosts are never offered for one-click removal.
  const removable = (workbenchHosts ?? [])
    .map((host) => host.hostname)
    .filter((hostname) =>
      instances.some(
        (item) => item.name.toLowerCase() === hostname.trim().toLowerCase()
      )
    )
  const taskBusy =
    workbench.pending || workbenchTaskActive(workbench.state?.task)
  const removeHost = async (hostname: string) => {
    setRemoving(null)
    const result = await workbench.editHost({
      type: 'remove-host',
      hostname,
    })
    if (result === 'removed') {
      toast.success(
        t('{{name}} removed from the workbench', { name: hostname })
      )
    } else if (result === 'missing') {
      toast.info(
        t('{{name}} is no longer in the workbench', { name: hostname })
      )
    } else if (result === 'last') {
      toast.error(t('The workbench must keep at least one host'))
    } else {
      toast.error(
        t('The workbench could not remove {{name}}. Reload it and retry.', {
          name: hostname,
        })
      )
    }
  }
  const importHost = async (item: LabOSInstance) => {
    const fields = labHostFields(item)
    if (!fields) {
      toast.error(
        t('{{name}} is missing an address in the lab inventory', {
          name: item.name,
        })
      )
      return
    }
    openTool()
    const result = await workbench.editHost({ type: 'prefill-host', fields })
    if (result === 'opened') {
      toast.success(
        t('Review {{name}} in the workbench, then save the host', {
          name: item.name,
        })
      )
    } else if (result === 'exists') {
      toast.info(t('{{name}} is already in the workbench', { name: item.name }))
    } else if (result === 'busy') {
      toast.error(t('Close the open host dialog in the workbench first'))
    } else {
      toast.error(
        t('The workbench could not open the host dialog. Reload it and retry.')
      )
    }
  }
  const running =
    machines.data?.filter(
      (vm) =>
        (vm.name === 'win7' || vm.name === 'openEuler') &&
        vm.state === 'running'
    ).length ?? 0
  const bound =
    config.data?.nodes.filter(
      (node) => node.console_mode === 'remote' && node.console_id > 0
    ).length ?? 0
  const refresh = () => {
    void config.refetch()
    void machines.refetch()
    void ibmc.refetch()
  }
  return (
    <PublicLayout showMainContainer={false}>
      <main
        className={`dragon-lab lab-fit-screen ${compact ? 'is-compact' : ''}`}
      >
        <div className='lab-content'>
          <header className='lab-heading'>
            <div>
              <div className='lab-eyebrow'>
                <i />
                {t('Network engineering / deployment lab')}
              </div>
              <h1>
                Dragon Lab<small>(DPI Pre-Deploy)</small>
              </h1>
              <p>
                {t(
                  'A live topology for your deployment rehearsal. Real consoles, clear port labels, and a separate management plane.'
                )}
              </p>
            </div>
            <div className='lab-toolbar'>
              {authorized && desktopAccess && (
                <Button
                  size='sm'
                  variant='outline'
                  nativeButton={false}
                  render={
                    <a
                      href='/guacamole/#/client/NQBjAHBvc3RncmVzcWw'
                      target='_blank'
                      rel='noreferrer'
                    />
                  }
                >
                  <MonitorPlay size={14} />
                  {t('Debian desktop')}
                </Button>
              )}
              <Button
                size='sm'
                variant='outline'
                disabled={!authorized || !config.data}
                onClick={() => setSettings(true)}
              >
                <Settings2 size={14} />
                {t('Configure topology')}
              </Button>
              <Button
                size='sm'
                variant='outline'
                disabled={!authorized}
                onClick={() => setPaused((value) => !value)}
              >
                {paused ? <Play size={14} /> : <Pause size={14} />}{' '}
                {paused ? t('Resume live views') : t('Pause live views')}
              </Button>
              <LabFactoryReset disabled={!authorized} nodes={nodeNames} />
              <Button
                size='sm'
                disabled={!authorized || !config.data}
                onClick={openTool}
              >
                <FileCode2 size={14} />
                {t('Script workbench')}
              </Button>
              <LabInfo onCompact={setCompact} />
            </div>
          </header>
          {!authorized && (
            <section className='lab-auth-note'>
              <div className='flex items-center gap-3'>
                <LockKeyhole size={17} />
                <p>
                  {t(
                    'This is a private deployment lab. Sign in as the highest-privilege administrator to view addresses and live consoles.'
                  )}
                </p>
              </div>
              <Button
                size='sm'
                nativeButton={false}
                render={<Link to='/sign-in' />}
              >
                {t('Sign in')}
              </Button>
            </section>
          )}
          {authorized && (config.isError || machines.isError) && (
            <div className='lab-error' role='alert'>
              {t(
                'Some lab data is unavailable. Existing consoles may still work; refresh to retry.'
              )}{' '}
              <Button size='sm' variant='ghost' onClick={refresh}>
                {t('Retry')}
              </Button>
            </div>
          )}
          <section
            className='lab-overview-strip'
            aria-label={t('Lab overview')}
          >
            <div className='lab-summary'>
              <div>
                <strong>
                  {String(5 + 2 * instances.length).padStart(2, '0')}
                </strong>
                <span>{t('Topology nodes')}</span>
              </div>
              <div>
                <strong>
                  {authorized && config.data
                    ? String(
                        bound +
                          instances.reduce(
                            (n, item) =>
                              n +
                              item.nodes.filter((node) => node.console_id > 0)
                                .length,
                            0
                          )
                      ).padStart(2, '0')
                    : '—'}
                </strong>
                <span>{t('Remote consoles bound')}</span>
              </div>
              <div>
                <strong>
                  {authorized && machines.data
                    ? `${running + instances.filter((item) => item.state === 'running').length}/${2 + instances.length}`
                    : '—'}
                </strong>
                <span>{t('Lab VMs running')}</span>
              </div>
              <div>
                <strong>02</strong>
                <span>{t('Deployment stages')}</span>
              </div>
            </div>
            <div className='lab-legend'>
              <span>
                <i />
                {t('Management')}
              </span>
              <span>
                <i className='business' />
                {t('Business / LACP')}
              </span>
              <span>
                <i className='sol' />
                SOL
              </span>
              <span>
                <i className='planned' />
                {t('Planned link')}
              </span>
            </div>
          </section>
          <Tabs value={tab} onValueChange={setTab} className='lab-body-tabs'>
            <div className='lab-tabs-bar'>
              <TabsList variant='line'>
                <TabsTrigger value='topology'>{t('Live topology')}</TabsTrigger>
                <TabsTrigger
                  value='ports'
                  disabled={!authorized || !config.data}
                >
                  {t('Port map')}
                </TabsTrigger>
              </TabsList>
              <div className='flex items-center gap-3'>
                <span className='lab-tabs-note'>
                  {t(
                    'Addresses are deployment targets unless verified on the device.'
                  )}
                </span>
                <Button
                  size='sm'
                  variant='ghost'
                  disabled={!authorized}
                  onClick={refresh}
                  aria-label={t('Refresh lab status')}
                >
                  <RefreshCw size={13} />
                </Button>
              </div>
            </div>
            <TabsContent value='topology'>
              <div className='lab-topology-shell'>
                <div className='lab-canvas'>
                  <LabWiring
                    config={authorized ? topology : undefined}
                    instanceStatus={instance?.status}
                    status={authorized ? linkStatus.data : undefined}
                    authorized={authorized}
                    selected={selected}
                    onSelect={(id) => {
                      if (authorized) setSelected(id)
                    }}
                    onEdit={() => setSettings(true)}
                  />
                  {LAB_NODES.map((node) => {
                    const vmName = node.id === 'pc' ? 'win7' : 'openEuler'
                    const machine = ['pc', 'os', 'ibmc'].includes(node.id)
                      ? machines.data?.find((vm) => vm.name === vmName)
                      : undefined
                    const guest = node.id === 'os' || node.id === 'ibmc'
                    return (
                      <LabNode
                        key={
                          guest
                            ? node.id + (instance?.name ?? BASE_NODE)
                            : node.id
                        }
                        definition={node}
                        instanceName={guest ? osName : undefined}
                        instanceState={guest ? instance?.state : undefined}
                        osPicker={
                          node.id === 'os' &&
                          instances.length > 0 && (
                            <LabOSSwitcher
                              names={nodeNames}
                              current={instance?.name ?? BASE_NODE}
                              onChange={switchNode}
                            />
                          )
                        }
                        slide={
                          guest && instances.length > 0 ? slide : undefined
                        }
                        config={
                          authorized
                            ? topology?.nodes.find(
                                (item) => item.id === node.id
                              )
                            : undefined
                        }
                        execution={
                          authorized && config.data?.workbench_url
                            ? {
                                target: guest
                                  ? (cardTerminal(
                                      workbench.state?.executionTerminals,
                                      node.id,
                                      osName
                                    )?.host ??
                                    workbench.state?.task?.currentTarget)
                                  : undefined,
                                active: workbenchTaskActive(
                                  workbench.state?.task
                                ),
                                terminal: cardTerminal(
                                  workbench.state?.executionTerminals,
                                  node.id,
                                  guest ? osName : undefined
                                ),
                                connected: workbench.connected,
                                available:
                                  workbench.state?.terminalAPI === true,
                              }
                            : undefined
                        }
                        machine={guest && instance ? undefined : machine}
                        authorized={authorized}
                        paused={paused}
                        expanded={expandedNode === node.id}
                        onExpandedChange={(expanded) =>
                          setExpandedNode(expanded ? node.id : null)
                        }
                        serialReady={
                          instance
                            ? instance.state === 'running'
                            : Boolean(ibmc.data?.serial)
                        }
                        serialNode={instance?.name}
                        onConfigure={() => setSettings(true)}
                      />
                    )
                  })}
                  <LabReadiness
                    authorized={authorized}
                    onTool={openTool}
                    workbench={workbench.state}
                    onAction={workbench.run}
                    pending={workbench.pending}
                    connected={workbench.connected}
                    pendingAction={workbench.pendingAction}
                    actionError={workbench.error}
                    scope={workbenchHosts
                      ?.filter((host) => host.enabled)
                      .map((host) => host.hostname)}
                    newHosts={unimported
                      .filter((item) => !dismissed.includes(item.name))
                      .map((item) => item.name)}
                    onImport={(name) => {
                      const item = instances.find((i) => i.name === name)
                      if (item) void importHost(item)
                    }}
                    onDismiss={(name) =>
                      setDismissed((list) => [...list, name])
                    }
                    removable={taskBusy ? [] : removable}
                    onRemove={setRemoving}
                  />
                </div>
              </div>
            </TabsContent>
            <TabsContent value='ports'>
              {authorized && config.data && (
                <LabPortMap
                  config={topology ?? config.data}
                  onSelect={(id) => {
                    setSelected(id)
                    setTab('topology')
                  }}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
      {authorized && settings && config.data && (
        <Suspense fallback={null}>
          <LabSettings
            config={config.data}
            onClose={() => setSettings(false)}
          />
        </Suspense>
      )}
      {authorized &&
        config.data &&
        !detachedTool &&
        (tool || config.data.workbench_url) && (
          <LabTool
            instances={workbenchHosts ? unimported : instances}
            onImport={config.data.workbench_url ? importHost : undefined}
            removable={config.data.workbench_url ? removable : undefined}
            onRemove={setRemoving}
            config={config.data}
            open={tool}
            frame={workbenchFrame}
            onFrameLoad={workbench.loaded}
            running={
              workbench.pending || workbenchTaskActive(workbench.state?.task)
            }
            onClose={() => {
              setTool(false)
              toolOpener.current?.focus()
            }}
            onDetach={() => {
              setTool(false)
              setDetachedTool(true)
              toolOpener.current?.focus()
            }}
          />
        )}
      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader className='text-start'>
            <AlertDialogTitle>
              {t('Remove {{name}} from the workbench?', { name: removing })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'Only the host entry in the workbench is deleted. The virtual machine and topology stay as they are, and you can add it again at any time.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant='outline' onClick={() => setRemoving(null)}>
              {t('Cancel')}
            </Button>
            <Button
              variant='destructive'
              disabled={taskBusy}
              onClick={() => removing && void removeHost(removing)}
            >
              {t('Remove from workbench')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PublicLayout>
  )
}
