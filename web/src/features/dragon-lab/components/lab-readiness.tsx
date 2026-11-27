import {
  ArrowDown,
  ArrowUpRight,
  Check,
  CircleDashed,
  FileCode2,
  LoaderCircle,
  Server,
  X,
} from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

import {
  WORKBENCH_ACTIONS,
  type WorkbenchAction,
  type WorkbenchState,
} from '../use-workbench-bridge'
import { workbenchTaskActive, workbenchTaskPercent } from '../workbench-task'

const passedColor = 'text-emerald-700 dark:text-emerald-400'
const pendingColor = 'text-slate-600 dark:text-slate-400'
const skippedColor = 'text-violet-700 dark:text-violet-300'
const logStatusColor: Record<string, string> = {
  passed: passedColor,
  succeeded: passedColor,
  running: 'text-blue-700 dark:text-blue-300',
  warning: 'text-amber-800 dark:text-amber-300',
  failed: 'text-red-700 dark:text-red-400',
  pending: pendingColor,
  queued: pendingColor,
  skipped: skippedColor,
  cancelled: skippedColor,
  stopping: 'text-orange-700 dark:text-orange-300',
}

export function LabReadiness(props: {
  authorized: boolean
  onTool: () => void
  workbench?: WorkbenchState | null
  onAction?: (action: WorkbenchAction) => void
  connected?: boolean
  pendingAction?: WorkbenchAction | null
  pending?: boolean
  actionError?: boolean | 'rejected' | 'timeout' | null
  // Enabled workbench hosts the six actions run against; undefined when unknown.
  scope?: string[]
  // Provisioned guests the workbench does not list yet.
  newHosts?: string[]
  onImport?: (name: string) => void
  onDismiss?: (name: string) => void
  // Workbench hosts that belong to provisioned guests and may be removed in one click.
  removable?: string[]
  onRemove?: (name: string) => void
}) {
  const { t } = useTranslation()
  const feedbackID = useId()
  const task = props.workbench?.task
  const connected = props.connected !== false
  const stopTask =
    task &&
    (task.status === 'stopping' ||
      task.phase === 'cancelled' ||
      task.terminals.cleanupError)
  const taskAction = stopTask ? 'stop' : task?.action
  const active = workbenchTaskActive(task)
  const percent = task ? workbenchTaskPercent(task) : null
  const statuses = {
    queued: t('Queued'),
    running: t('In progress'),
    stopping: t('Releasing terminals'),
    succeeded: t('Completed'),
    warning: t('Completed with warnings'),
    failed: t('Failed'),
    cancelled: t('Stopped'),
  }
  const feedback =
    task?.terminals.cleanupError ||
    task?.checks.find((check) => check.status === 'failed')?.message ||
    task?.message

  const checkLabels: Record<string, string> = {
    pending: t('Pending'),
    running: t('In progress'),
    passed: 'PASS',
    warning: 'WARN',
    failed: 'FAIL',
    skipped: 'SKIP',
  }
  const labels = {
    reach: t('Check connectivity'),
    dryrun: t('Terminal dry run'),
    selected: t('Run selected tasks'),
    stage1: t('Run stage 1 (iBMC)'),
    stage2: t('Run stage 2 (OS only)'),
    stop: t('Stop and release terminals'),
  }
  const icons = {
    reach: '📡',
    dryrun: '🧪',
    selected: '🚀',
    stage1: '▶',
    stage2: '▶',
    stop: '⏹',
  }
  return (
    <aside className={`lab-readiness ${props.workbench ? 'has-controls' : ''}`}>
      <div className='lab-section-kicker'>DPI / PRE-DEPLOY</div>
      <h2>{t('One topology. Every stage.')}</h2>
      {!props.workbench && (
        <ol className='lab-stages'>
          <li>
            <span>01</span>
            <div>
              <strong>{t('Management & iBMC')}</strong>
              <p>{t('Access VLAN → factory IP → target IP')}</p>
            </div>
            <CircleDashed size={15} />
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>{t('OS & business network')}</strong>
              <p>{t('SOL login → dual-NIC Bond4 → LACP')}</p>
            </div>
            <CircleDashed size={15} />
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>{t('Acceptance & evidence')}</strong>
              <p>{t('Bidirectional ping · SSH · bond status')}</p>
            </div>
            <CircleDashed size={15} />
          </li>
        </ol>
      )}
      {!props.workbench && (
        <p className='lab-plan-note'>
          <Check size={14} />
          {t('Planning labels are not connectivity test results.')}
        </p>
      )}
      <Button size='sm' disabled={!props.authorized} onClick={props.onTool}>
        <FileCode2 size={14} />
        {t('Open script workbench')}
        <ArrowUpRight size={13} />
      </Button>
      {props.authorized &&
        props.newHosts?.map((name) => (
          <div key={name} className='lab-import-prompt' role='status'>
            <Server size={14} aria-hidden />
            <p>{t('{{name}} is ready. Add it to the workbench?', { name })}</p>
            <Button size='xs' onClick={() => props.onImport?.(name)}>
              {t('Add to lab')}
            </Button>
            <Button
              size='xs'
              variant='ghost'
              onClick={() => props.onDismiss?.(name)}
            >
              {t('Later')}
            </Button>
          </div>
        ))}
      {props.workbench && (
        <section
          className='lab-quick-controls'
          aria-label={t('Workbench quick actions')}
        >
          {props.scope && (
            <p className='lab-action-scope'>
              {props.scope.length > 0 ? (
                <>
                  {t('Applies to:')}
                  {props.scope.map((host) => (
                    <span key={host} className='lab-scope-host'>
                      {host}
                      {props.removable?.includes(host) && (
                        <button
                          type='button'
                          aria-label={t('Remove {{name}} from the workbench', {
                            name: host,
                          })}
                          title={t('Remove {{name}} from the workbench', {
                            name: host,
                          })}
                          onClick={() => props.onRemove?.(host)}
                        >
                          <X size={10} aria-hidden />
                        </button>
                      )}
                    </span>
                  ))}
                </>
              ) : (
                t('No hosts are enabled in the workbench')
              )}
            </p>
          )}
          <div className='lab-action-grid'>
            {WORKBENCH_ACTIONS.map((action) => {
              return (
                <Button
                  key={action}
                  size='sm'
                  variant={action === 'selected' ? 'default' : 'outline'}
                  className={
                    taskAction === action || props.pendingAction === action
                      ? `lab-task-button is-${props.pendingAction === action ? 'queued' : task?.status}`
                      : undefined
                  }
                  disabled={
                    props.pending ||
                    !connected ||
                    props.workbench?.taskAPI === false ||
                    !props.workbench?.buttons[action] ||
                    (active && action !== 'stop')
                  }
                  onClick={() => props.onAction?.(action)}
                  aria-label={labels[action]}
                  aria-describedby={
                    taskAction === action ? feedbackID : undefined
                  }
                  title={
                    taskAction === action
                      ? `${labels[action]} · ${task?.message}`
                      : labels[action]
                  }
                >
                  {taskAction === action && percent !== null && (
                    <span
                      className='lab-button-fill'
                      aria-hidden
                      style={{ width: `${percent}%` }}
                    />
                  )}
                  <span className='lab-button-content'>
                    <span className='lab-button-label'>
                      <span aria-hidden>{icons[action]}</span> {labels[action]}
                    </span>
                    {(taskAction === action ||
                      props.pendingAction === action) && (
                      <span
                        className='lab-button-progress'
                        role='progressbar'
                        aria-label={labels[action]}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={
                          taskAction === action && percent !== null
                            ? Math.round(percent)
                            : undefined
                        }
                        aria-valuetext={
                          props.pendingAction === action
                            ? t('Sending request')
                            : `${task ? statuses[task.status] : ''} ${task?.currentTarget || ''}`
                        }
                      >
                        {(props.pendingAction === action ||
                          (active && connected)) && (
                          <LoaderCircle
                            size={10}
                            className='lab-progress-spinner'
                            aria-hidden
                          />
                        )}
                        <span>
                          {props.pendingAction === action
                            ? t('Sending request')
                            : (task && statuses[task.status]) || ''}
                        </span>
                        {taskAction === action && (
                          <>
                            {(task?.currentStage || task?.currentTarget) && (
                              <span className='lab-button-target'>
                                {[task?.currentStage, task?.currentTarget]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            )}
                            {percent !== null && (
                              <strong>{Math.round(percent)}%</strong>
                            )}
                          </>
                        )}
                      </span>
                    )}
                  </span>
                </Button>
              )
            })}
          </div>
          {task && (
            <div
              id={feedbackID}
              className={`lab-task-feedback is-${task.status}`}
              role={task.status === 'failed' ? 'alert' : 'status'}
              aria-live='polite'
            >
              <p
                title={
                  task.status === 'failed' || task.status === 'warning'
                    ? feedback
                    : task.message
                }
              >
                {task.status === 'failed' || task.status === 'warning'
                  ? feedback
                  : task.message}
              </p>
              <span>
                {t('Elapsed: {{seconds}} s', {
                  seconds: Math.floor(task.elapsedMs / 1000),
                })}
                {task.terminals.retained > 0 && (
                  <>
                    {' '}
                    ·{' '}
                    {t('{{count}} terminals retained', {
                      count: task.terminals.retained,
                    })}
                  </>
                )}
                {taskAction === 'stop' && (
                  <>
                    {' '}
                    ·{' '}
                    {t('{{count}} terminals released', {
                      count: task.terminals.released,
                    })}
                  </>
                )}
                {' · '}
                <Dialog>
                  <DialogTrigger className='cursor-pointer underline'>
                    {t('Task logs')}
                  </DialogTrigger>
                  <DialogContent className='sm:max-w-2xl'>
                    <DialogTitle>{t('Task logs')}</DialogTitle>
                    <DialogDescription>
                      {labels[task.action]} ·{' '}
                      <strong className={logStatusColor[task.status]}>
                        {statuses[task.status]}
                      </strong>
                    </DialogDescription>
                    <div className='max-h-[65dvh] overflow-auto break-words'>
                      <p>{task.terminals.cleanupError || task.message}</p>
                      <ol className='mt-2 list-decimal space-y-2 pl-5'>
                        {task.checks.map((item, index) => (
                          // The snapshot uses fixed plan positions, including repeated checks.
                          // oxlint-disable-next-line react/no-array-index-key
                          <li key={index}>
                            <strong>
                              <span className={logStatusColor[item.status]}>
                                {checkLabels[item.status]}
                              </span>
                              {' · '}
                              {item.target} · {item.check}
                            </strong>
                            {item.message && <p>{item.message}</p>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </DialogContent>
                </Dialog>
              </span>
            </div>
          )}
          {!connected && (
            <p role='status' className='lab-action-error'>
              {t('Connection lost. Task status is unknown; reconnecting.')}
            </p>
          )}
          {props.workbench.taskAPI === false && (
            <p role='status' className='lab-action-error'>
              {t('Update the workbench bridge to enable task progress.')}
            </p>
          )}
          <dl className='lab-action-stats'>
            <div>
              <dt>{t('Total')}</dt>
              <dd>{props.workbench.counts.total}</dd>
            </div>
            <div>
              <dt>{t('Running')}</dt>
              <dd>{props.workbench.counts.running}</dd>
            </div>
            <div className='is-pass'>
              <dt>PASS</dt>
              <dd>{props.workbench.counts.pass}</dd>
            </div>
            <div className='is-warn'>
              <dt>WARN</dt>
              <dd>{props.workbench.counts.warn}</dd>
            </div>
            <div className='is-fail'>
              <dt>FAIL</dt>
              <dd>{props.workbench.counts.fail}</dd>
            </div>
            <div>
              <dt>PTY</dt>
              <dd>{props.workbench.counts.terminals}</dd>
            </div>
          </dl>
        </section>
      )}
      {props.actionError && (
        <p role='alert' className='lab-action-error'>
          {props.actionError === 'timeout'
            ? t(
                'No acknowledgement received. Check task status before retrying.'
              )
            : t(
                'The workbench did not accept this action. Open it to check its status.'
              )}
        </p>
      )}
      <p className='lab-run-note'>
        <ArrowDown size={12} />
        {t('Generate here. Run .bat / .ps1 inside win7.')}
      </p>
    </aside>
  )
}
