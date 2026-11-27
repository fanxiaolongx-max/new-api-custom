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
import { lazy, Suspense, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
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
  type LabLinkID,
  type LabNodeID,
} from './api'
import { LabFactoryReset } from './components/lab-factory-reset'
import { LabInfo } from './components/lab-info'
import { LabNode } from './components/lab-node'
import { LabPortMap } from './components/lab-port-map'
import { LabReadiness } from './components/lab-readiness'
import LabTool from './components/lab-tool'
import { LabWiring } from './components/lab-wiring'
import { LAB_LINKS, LAB_NODES } from './topology'
import { useWorkbenchBridge } from './use-workbench-bridge'
import { workbenchTaskActive } from './workbench-task'

import './lab.css'

const LabSettings = lazy(() => import('./components/lab-settings'))
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
  const [osName, setOSName] = useState('Node-01')
  const instances =
    authorized && Array.isArray(inventory.data) ? inventory.data : []
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
  const link = topology?.links.find((item) => item.id === selected)
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
              <LabFactoryReset disabled={!authorized} />
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
          <Tabs defaultValue='topology' className='lab-body-tabs'>
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
            {link && (
              <section
                className='lab-selection'
                aria-label={t('Selected link')}
              >
                <div>
                  <strong>
                    {t(
                      LAB_LINKS.find((item) => item.id === link.id)?.title ??
                        link.id
                    )}{' '}
                    ·{' '}
                    {link.phase === 'configured'
                      ? t('Configured')
                      : t('Planned')}
                  </strong>
                  <p>
                    {link.source_port} [{link.source_address || '—'}] →{' '}
                    {link.target_port} [{link.target_address || '—'}]
                    {link.vlan ? ` · VLAN ${link.vlan}` : ''}
                  </p>
                </div>
                <div className='flex gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setSettings(true)}
                  >
                    {t('Edit labels')}
                  </Button>
                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={() => setSelected(null)}
                  >
                    {t('Close')}
                  </Button>
                </div>
              </section>
            )}
            <TabsContent value='topology'>
              <div className='lab-topology-shell'>
                <div className='lab-canvas'>
                  <LabWiring
                    config={authorized ? topology : undefined}
                    instanceStatus={instance?.status}
                    status={authorized ? linkStatus.data : undefined}
                    authorized={authorized}
                    onSelect={(id) => {
                      if (authorized) setSelected(id)
                    }}
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
                            ? node.id + (instance?.name ?? 'Node-01')
                            : node.id
                        }
                        definition={node}
                        instanceName={guest ? instance?.name : undefined}
                        instanceState={guest ? instance?.state : undefined}
                        osPicker={
                          node.id === 'os' &&
                          instances.length > 0 && (
                            <select
                              aria-label={t('Select node')}
                              value={instance?.name ?? 'Node-01'}
                              onChange={(event) =>
                                setOSName(event.target.value)
                              }
                            >
                              <option>Node-01</option>
                              {instances.map((item) => (
                                <option key={item.name}>{item.name}</option>
                              ))}
                            </select>
                          )
                        }
                        config={
                          authorized
                            ? topology?.nodes.find(
                                (item) => item.id === node.id
                              )
                            : undefined
                        }
                        execution={
                          authorized &&
                          config.data?.workbench_url &&
                          !(guest && instance)
                            ? {
                                active: workbenchTaskActive(
                                  workbench.state?.task
                                ),
                                terminal:
                                  workbench.state?.executionTerminals?.find(
                                    (stream) => stream.nodeId === node.id
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
                        serialReady={!instance && Boolean(ibmc.data?.serial)}
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
                  />
                </div>
              </div>
            </TabsContent>
            <TabsContent value='ports'>
              {authorized && config.data && (
                <LabPortMap
                  config={topology ?? config.data}
                  onSelect={setSelected}
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
            instances={instances}
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
    </PublicLayout>
  )
}
