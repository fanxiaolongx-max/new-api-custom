import type { LabNodeID } from './api'

export interface ExecutionTerminal {
  nodeId: LabNodeID
  // The server an iBMC / OS stream belongs to; null for a card-wide stream.
  host: string | null
  sessionId: string
  runId: string
  seq: number
  text: string
  status: 'running' | 'retained' | 'closed'
}

// A bounded, redacted text snapshot, never HTML or a terminal input channel.
export function readExecutionTerminals(value: unknown): ExecutionTerminal[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const streams: ExecutionTerminal[] = []
  for (const item of value.slice(0, 24)) {
    if (!item || typeof item !== 'object') continue
    const stream = item as Record<string, unknown>
    if (
      typeof stream.nodeId !== 'string' ||
      !['pc', 'sw1', 'sw2', 'ibmc', 'os'].includes(stream.nodeId) ||
      (stream.host !== null &&
        stream.host !== undefined &&
        (typeof stream.host !== 'string' || stream.host.length >= 80)) ||
      seen.has(`${stream.nodeId}@${stream.host ?? ''}`) ||
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
    seen.add(`${stream.nodeId}@${stream.host ?? ''}`)
    streams.push({
      nodeId: stream.nodeId as LabNodeID,
      host: typeof stream.host === 'string' ? stream.host : null,
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

// The stream a topology card shows: on the iBMC / OS cards the selected
// server's own stream, else the card-wide one an older workbench sends.
export function cardTerminal(
  streams: ExecutionTerminal[] | undefined,
  nodeId: LabNodeID,
  host?: string
): ExecutionTerminal | undefined {
  const name = host?.toLowerCase()
  return (
    (name
      ? streams?.find(
          (stream) =>
            stream.nodeId === nodeId && stream.host?.toLowerCase() === name
        )
      : undefined) ??
    streams?.find((stream) => stream.nodeId === nodeId && stream.host === null)
  )
}
