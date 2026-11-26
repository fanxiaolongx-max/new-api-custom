import type { WorkbenchTask } from '../workbench-task'

export const taskFixture: WorkbenchTask = {
  requestId: 'request-test-123',
  runId: 'run-test-123',
  action: 'stage1',
  seq: 1,
  status: 'running',
  phase: 'ibmc_set_ip',
  currentStage: 'Stage 1',
  currentTarget: 'Node-01',
  message: 'Checking the new management address',
  progress: { completed: 2, total: 6, percent: 33 },
  summary: { passed: 2, warnings: 0, failed: 0 },
  terminals: {
    active: 1,
    retained: 0,
    released: 0,
    canRelease: true,
    cleanupError: '',
  },
  checks: [],
  startedAt: 1000,
  updatedAt: 2000,
  elapsedMs: 1000,
}
