export const WORKBENCH_ACTIONS = [
  'reach',
  'dryrun',
  'selected',
  'stage1',
  'stage2',
  'stop',
] as const
export type WorkbenchAction = (typeof WORKBENCH_ACTIONS)[number]
export const TASK_STATUSES = [
  'queued',
  'running',
  'stopping',
  'succeeded',
  'warning',
  'failed',
  'cancelled',
] as const
export type WorkbenchTaskStatus = (typeof TASK_STATUSES)[number]
export interface WorkbenchTask {
  requestId: string
  runId: string
  action: WorkbenchAction
  seq: number
  status: WorkbenchTaskStatus
  phase: string
  currentStage: string
  currentTarget: string
  message: string
  progress: { completed: number; total: number | null; percent: number | null }
  summary: { passed: number; warnings: number; failed: number }
  terminals: {
    active: number
    retained: number
    released: number
    canRelease: boolean
    cleanupError: string
  }
  checks: { target: string; check: string; status: string; message: string }[]
  startedAt: number
  updatedAt: number
  elapsedMs: number
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function text(value: unknown, limit = 512): string {
  return typeof value === 'string' ? value.slice(0, limit) : ''
}
// Copy only fields needed by the overview, never arbitrary remote properties.
export function readWorkbenchTask(value: unknown): WorkbenchTask | null {
  if (
    !record(value) ||
    !WORKBENCH_ACTIONS.includes(value.action as WorkbenchAction) ||
    !TASK_STATUSES.includes(value.status as WorkbenchTaskStatus) ||
    !text(value.runId) ||
    !text(value.requestId) ||
    !count(value.seq) ||
    !count(value.startedAt) ||
    !count(value.updatedAt) ||
    !count(value.elapsedMs)
  ) {
    return null
  }
  const { progress, summary, terminals } = value
  if (
    !record(progress) ||
    !count(progress.completed) ||
    !(progress.total === null || count(progress.total)) ||
    !(
      progress.percent === null ||
      (typeof progress.percent === 'number' &&
        Number.isFinite(progress.percent) &&
        progress.percent >= 0 &&
        progress.percent <= 100)
    ) ||
    !record(summary) ||
    !count(summary.passed) ||
    !count(summary.warnings) ||
    !count(summary.failed) ||
    !record(terminals) ||
    !count(terminals.active) ||
    !count(terminals.retained) ||
    !count(terminals.released) ||
    typeof terminals.canRelease !== 'boolean' ||
    !Array.isArray(value.checks) ||
    value.checks.length > 10000
  ) {
    return null
  }
  const checks: WorkbenchTask['checks'] = []
  for (const item of value.checks) {
    if (
      !record(item) ||
      ![
        'pending',
        'running',
        'passed',
        'warning',
        'failed',
        'skipped',
      ].includes(String(item.status))
    ) {
      return null
    }
    checks.push({
      target: text(item.target, 128),
      check: text(item.check, 128),
      status: String(item.status),
      message: text(item.message),
    })
  }
  return {
    requestId: text(value.requestId, 128),
    runId: text(value.runId, 128),
    action: value.action as WorkbenchAction,
    seq: value.seq,
    status: value.status as WorkbenchTaskStatus,
    phase: text(value.phase, 128),
    currentStage: text(value.currentStage, 128),
    currentTarget: text(value.currentTarget, 128),
    message: text(value.message),
    progress: {
      completed: progress.completed,
      total: progress.total as number | null,
      percent: progress.percent as number | null,
    },
    summary: {
      passed: summary.passed,
      warnings: summary.warnings,
      failed: summary.failed,
    },
    terminals: {
      active: terminals.active,
      retained: terminals.retained,
      released: terminals.released,
      canRelease: terminals.canRelease,
      cleanupError: text(terminals.cleanupError),
    },
    checks,
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
    elapsedMs: value.elapsedMs,
  }
}
export function workbenchTaskActive(task?: WorkbenchTask | null) {
  return Boolean(
    task && ['queued', 'running', 'stopping'].includes(task.status)
  )
}
export function workbenchTaskPercent(task: WorkbenchTask): number | null {
  // A skipped check is not executed work: aborted plans must not look complete.
  const skipped = task.checks.filter(
    (check) => check.status === 'skipped'
  ).length
  if (
    (task.status === 'failed' || task.status === 'cancelled') &&
    skipped &&
    task.progress.total &&
    task.checks.length === task.progress.total
  ) {
    return Math.max(
      0,
      Math.min(
        100,
        ((task.progress.completed - skipped) / task.progress.total) * 100
      )
    )
  }
  return task.progress.percent
}
