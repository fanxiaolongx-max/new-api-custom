/* Dragon Lab / TaiSha bridge v1. Only the allowlisted parent can invoke the six
 * existing buttons. Only explicitly redacted terminal snapshots may be mirrored; no input is forwarded. */
;(() => {
  'use strict'
  const allowedOrigin = 'https://api2.fanxiaolong.uk'
  const buttons = {
    reach: 'dcBtnReach',
    dryrun: 'dcBtnDry',
    selected: 'dcBtnAll',
    stage1: 'dcBtnS1',
    stage2: 'dcBtnS2',
    stop: 'dcBtnStop',
  }
  const stats = {
    total: 'dcKpiTotal',
    running: 'dcKpiRun',
    pass: 'dcKpiPass',
    warn: 'dcKpiWarn',
    fail: 'dcKpiFail',
    terminals: 'dcKpiPty',
  }
  let subscribedAPI
  let unsubscribe
  let terminalAPI
  let unsubscribeTerminals
  let channel = ''
  let scheduled
  const completed = new Map()
  function reply(payload) {
    if (!channel || window.parent === window) return
    window.parent.postMessage(
      { source: 'taisha-workbench', version: 1, channel, ...payload },
      allowedOrigin
    )
  }
  function taskSnapshot(api) {
    const task = api?.getSnapshot()
    if (!task) return null
    const { progress, summary, terminals } = task
    return {
      requestId: task.requestId,
      runId: task.runId,
      action: task.action,
      seq: task.seq,
      status: task.status,
      phase: task.phase,
      currentStage: task.currentStage,
      currentTarget: task.currentTarget,
      message: task.message,
      progress: {
        completed: progress?.completed,
        total: progress?.total,
        percent: progress?.percent,
      },
      summary: {
        passed: summary?.passed,
        warnings: summary?.warnings,
        failed: summary?.failed,
      },
      terminals: {
        active: terminals?.active,
        retained: terminals?.retained,
        released: terminals?.released,
        canRelease: terminals?.canRelease,
        cleanupError: terminals?.cleanupError,
      },
      checks: Array.isArray(task.checks)
        ? task.checks.slice(0, 10000).map((check) => ({
            target: check.target,
            check: check.check,
            status: check.status,
            message: check.message,
          }))
        : [],
      startedAt: task.startedAt,
      updatedAt: task.updatedAt,
      elapsedMs: task.elapsedMs,
    }
  }
  function workbenchAPI() {
    const api = window.TaiShaWorkbench
    if (
      !api ||
      !['run', 'getSnapshot', 'subscribe'].every(
        (key) => typeof api[key] === 'function'
      )
    ) {
      return null
    }
    if (subscribedAPI !== api) {
      unsubscribe?.()
      subscribedAPI = api
      unsubscribe = api.subscribe(() => state())
    }
    return api
  }
  function state() {
    const api = workbenchAPI()
    const canStream = Boolean(api && typeof api.getTerminalSnapshot === 'function' && typeof api.subscribeTerminals === 'function')
    if (canStream && terminalAPI !== api) {
      unsubscribeTerminals?.()
      terminalAPI = api
      unsubscribeTerminals = api.subscribeTerminals(() => {
        clearTimeout(scheduled)
        scheduled = setTimeout(state, 60)
      })
    }
    let streams = []
    if (canStream) {
      try {
        const snapshot = api.getTerminalSnapshot()
        if (Array.isArray(snapshot?.streams)) streams = snapshot.streams.slice(0, 5).filter((stream) => stream?.redacted === true && ['pc', 'sw1', 'sw2', 'ibmc', 'os'].includes(stream.nodeId) && typeof stream.text === 'string' && stream.text.length <= 16000).map((stream) => ({ nodeId: stream.nodeId, sessionId: stream.sessionId, runId: stream.runId, seq: stream.seq, text: stream.text, status: stream.status, redacted: true }))
      } catch { /* A failed feed must not prevent task controls from working. */ }
    }
    const available = {}
    for (const [action, id] of Object.entries(buttons)) {
      const button = document.querySelector(`#${id}`)
      if (!button) {
        reply({ type: 'unavailable' })
        return
      }
      available[action] = Boolean(api && !button.disabled)
    }
    const counts = {}
    for (const [key, id] of Object.entries(stats)) {
      const text = document.querySelector(`#${id}`)?.textContent || ''
      const number = Number(text.match(/\d+/)?.[0] || 0)
      counts[key] = Number.isSafeInteger(number) ? number : 0
    }
    reply({
      type: 'state',
      buttons: available,
      counts,
      terminalAPI: canStream,
      executionTerminals: streams,
      taskAPI: Boolean(api),
      task: taskSnapshot(api),
    })
  }
  window.addEventListener('message', async (event) => {
    const request = event.data
    if (
      event.origin !== allowedOrigin ||
      event.source !== window.parent ||
      window.parent === window ||
      !request ||
      request.source !== 'dragon-lab' ||
      request.version !== 1 ||
      typeof request.channel !== 'string' ||
      !/^[a-zA-Z0-9-]{8,80}$/.test(request.channel)
    ) {
      return
    }
    if (request.type === 'hello') {
      if (channel !== request.channel) completed.clear()
      channel = request.channel
      if (
        (request.theme === 'dark' || request.theme === 'light') &&
        document.documentElement.getAttribute('data-ui-skin') !== request.theme
      ) {
        document.querySelector('#btnThemeToggle')?.click()
      }
      state()
      return
    }
    if (
      request.type !== 'action' ||
      request.channel !== channel ||
      typeof request.id !== 'string' ||
      !/^[a-zA-Z0-9-]{8,80}$/.test(request.id) ||
      typeof request.action !== 'string' ||
      !Object.hasOwn(buttons, request.action)
    ) {
      return
    }
    if (completed.has(request.id)) {
      reply(await completed.get(request.id))
      return
    }
    const api = workbenchAPI()
    const button = document.querySelector(`#${buttons[request.action]}`)
    const execution = (async () => {
      if (!api || !button || button.disabled) {
        return { type: 'ack', id: request.id, accepted: false }
      }
      try {
        const result = await api.run(request.action, { requestId: request.id })
        return {
          type: 'ack',
          id: request.id,
          accepted: true,
          runId: result.runId,
        }
      } catch {
        return { type: 'ack', id: request.id, accepted: false }
      }
    })()
    completed.set(request.id, execution)
    if (completed.size > 100) completed.delete(completed.keys().next().value)
    reply(await execution)
    state()
  })
  function observe() {
    const observer = new MutationObserver(() => {
      clearTimeout(scheduled)
      scheduled = setTimeout(state, 60)
    })
    for (const id of [...Object.values(buttons), ...Object.values(stats)]) {
      const node = document.querySelector(`#${id}`)
      if (node) {
        observer.observe(node, {
          attributes: true,
          attributeFilter: ['disabled'],
          childList: true,
          subtree: true,
          characterData: true,
        })
      }
    }
    state()
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observe, { once: true })
  } else observe()
})()
