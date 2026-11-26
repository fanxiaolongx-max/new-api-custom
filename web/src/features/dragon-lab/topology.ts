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
    subtitle: 'SSH simulator → SOL → OS',
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
    subtitle: 'Node-01 · Bond4 · 2 × 10G target',
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
  x: number
  y: number
}[] = [
  {
    id: 'pc-sw1',
    title: 'Management access',
    kind: 'management',
    path: 'M400 100 H520',
    x: 460,
    y: 100,
  },
  {
    id: 'sw1-ibmc',
    title: 'Access VLAN',
    kind: 'management',
    path: 'M920 100 H1040',
    x: 980,
    y: 100,
  },
  {
    id: 'pc-sw2',
    title: 'Installation network',
    kind: 'business',
    path: 'M400 250 H460 V490 H520',
    x: 460,
    y: 377,
  },
  {
    id: 'sw2-os-a',
    title: 'LACP member A',
    kind: 'business',
    path: 'M920 490 H1040',
    x: 980,
    y: 490,
  },
  {
    id: 'sw2-os-b',
    title: 'LACP member B',
    kind: 'business',
    path: 'M920 565 H1040',
    x: 980,
    y: 565,
  },
  {
    id: 'ibmc-os',
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
