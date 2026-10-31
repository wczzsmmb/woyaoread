import { reactive, watch } from 'vue'

export type C3Mode = 'compare' | 'annotations' | 'nav'
export type Ratio = '5:5' | '4:6' | '6:4' | '3:7' | '7:3'

export interface Layout {
  c1: boolean
  c2: boolean
  c3: boolean
  c3Mode: C3Mode
  ratio: Ratio
  sidebar: 200 | 240 | 280 | 320
  fontSize: number
  lineHeight: number
  immersive: boolean
}

const KEY = 'duiye:layout:v1'

const DEFAULTS: Layout = {
  c1: true,
  c2: true,
  c3: true,
  c3Mode: 'compare',
  ratio: '5:5',
  sidebar: 240,
  fontSize: 17,
  lineHeight: 1.9,
  immersive: false,
}

function load(): Layout {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export const layout = reactive<Layout>(load())

export const RATIOS: Record<Ratio, number[]> = {
  '5:5': [1, 1],
  '4:6': [4, 6],
  '6:4': [6, 4],
  '3:7': [3, 7],
  '7:3': [7, 3],
}

watch(
  layout,
  (v) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(v))
    } catch {}
    applyVars()
  },
  { deep: true },
)

export function applyVars() {
  const r = document.documentElement.style
  r.setProperty('--fs', `${layout.fontSize}px`)
  r.setProperty('--lh', String(layout.lineHeight))
  r.setProperty('--c1-w', `${layout.sidebar}px`)
}

/** 三栏变两栏时，c3Mode 自动落到该篇能用的模式 */
export function normalizeC3(hasZh: boolean) {
  if (hasZh && layout.c3Mode === 'nav' && !layout.c3) layout.c3Mode = 'compare'
  if (!hasZh && layout.c3Mode === 'compare') layout.c3Mode = 'nav'
}
