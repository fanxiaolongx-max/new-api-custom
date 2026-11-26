import type { LabNodeID } from './api'

export interface ExecutionTerminal {
  nodeId: LabNodeID
  sessionId: string
  runId: string
  seq: number
  text: string
  status: 'running' | 'retained' | 'closed'
}

// A bounded, redacted text snapshot, never HTML or a terminal input channel.
export function readExecutionTerminals(value: unknown): ExecutionTerminal[] {
  if (!Array.isArray(value)) return []
  const nodes = new Set<string>()
  const streams: ExecutionTerminal[] = []
  for (const item of value.slice(0, 5)) {
    if (!item || typeof item !== 'object') continue
    const stream = item as Record<string, unknown>
    if (
      typeof stream.nodeId !== 'string' ||
      !['pc', 'sw1', 'sw2', 'ibmc', 'os'].includes(stream.nodeId) ||
      nodes.has(stream.nodeId) ||
      stream.redacted !== true ||
      typeof stream.sessionId !== 'string' ||
      stream.sessionId.length > 160 ||
      typeof stream.runId !== 'string' ||
      stream.runId.length > 160 ||
      !Number.isSafeInteger(stream.seq) ||
      Number(stream.seq) < 0 ||
      typeof stream.text !== 'string' ||
      stream.text.length > 16000 ||
      !['running', 'retained', 'closed'].includes(String(stream.status))
    ) {
      continue
    }
    nodes.add(stream.nodeId)
    streams.push({
      nodeId: stream.nodeId as LabNodeID,
      sessionId: stream.sessionId,
      runId: stream.runId,
      seq: Number(stream.seq),
      // Terminal control bytes are intentionally removed before plain-text rendering.
      // oxlint-disable no-control-regex
      text: stream.text
        .replaceAll(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
        .replaceAll(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ''),
      status: stream.status as ExecutionTerminal['status'],
    })
  }
  return streams
}
