import type { LabLinkID, LabNodeID } from './api'

export const LAB_NODES: {
  id: LabNodeID
  title: string
  subtitle: string
  kind: 'physical' | 'simulated'
  column: number
  row: number
}[] = [
  {
    id: 'pc',
    title: 'Operations & installation PC',
    subtitle: 'win7 · .bat / .ps1',
    kind: 'physical',
    column: 1,
    row: 1,
  },
  {
    id: 'sw1',
    title: 'SW1 · management switch',
    subtitle: 'eNSP · S5700-LSW1 · VRP',
    kind: 'physical',
    column: 2,
    row: 1,
  },
  {
    id: 'ibmc',
    title: 'iBMC · management plane',
    subtitle: '{{name}} · SSH simulator → SOL → OS',
    kind: 'simulated',
    column: 3,
    row: 1,
  },
  {
    id: 'sw2',
    title: 'SW2 · business switch',
    subtitle: 'eNSP · S5700 · LACP',
    kind: 'physical',
    column: 2,
    row: 2,
  },
  {
    id: 'os',
    title: 'TaiShan OS · openEuler',
    subtitle: '{{name}} · Bond4 · 2 × 10G target',
    kind: 'physical',
    column: 3,
    row: 2,
  },
]
export const LAB_LINKS: {
  id: LabLinkID
  title: string
  kind: 'management' | 'business' | 'sol'
  path: string
  /** Wire endpoints (source, target) in the 1440×740 canvas, where port status dots sit. */
  ends: [[number, number], [number, number]]
  x: number
  y: number
}[] = [
  {
    id: 'pc-sw1',
    ends: [
      [400, 100],
      [520, 100],
    ],
    title: 'Management access',
    kind: 'management',
    path: 'M400 100 H520',
    x: 460,
    y: 100,
  },
  {
    id: 'sw1-ibmc',
    ends: [
      [920, 100],
      [1040, 100],
    ],
    title: 'Access VLAN',
    kind: 'management',
    path: 'M920 100 H1040',
    x: 980,
    y: 100,
  },
  {
    id: 'pc-sw2',
    ends: [
      [400, 250],
      [520, 490],
    ],
    title: 'Installation network',
    kind: 'business',
    path: 'M400 250 H460 V490 H520',
    x: 460,
    y: 377,
  },
  {
    id: 'sw2-os-a',
    ends: [
      [920, 490],
      [1040, 490],
    ],
    title: 'LACP member A',
    kind: 'business',
    path: 'M920 490 H1040',
    x: 980,
    y: 490,
  },
  {
    id: 'sw2-os-b',
    ends: [
      [920, 565],
      [1040, 565],
    ],
    title: 'LACP member B',
    kind: 'business',
    path: 'M920 565 H1040',
    x: 980,
    y: 565,
  },
  {
    id: 'ibmc-os',
    ends: [
      [1240, 310],
      [1240, 430],
    ],
    title: 'Serial over LAN',
    kind: 'sol',
    path: 'M1240 310 V430',
    x: 1240,
    y: 370,
  },
]
export const STATE_KEYS: Record<string, string> = {
  running: 'Running',
  paused: 'Paused',
  saved: 'Saved',
  powered_off: 'Powered off',
  aborted: 'Aborted',
  error: 'Error',
}
