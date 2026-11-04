export interface SiteMeta {
  title: string
  subtitle?: string
}

export interface CatNode {
  name: string
  path: string[]
  ids: string[]
}

export interface ArticleMeta {
  id: string
  n: number
  slug: string
  title: string
  authors?: string
  cats: string[]
  hasZh: boolean
  script?: 'cjk' | 'latin'
  chars: number
  blocks: number
  alignRatio: number
  keywords: string[]
  year: number | null
  updated: string
  hasStyle: boolean
  hasScript: boolean
}

export interface SiteIndex {
  site: SiteMeta
  cats: CatNode[]
  articles: ArticleMeta[]
  ext: { css: boolean; js: string[] }
  builtAt: string
}

export interface Row {
  h: string
  rh: string | null
  type: string
  depth: number | null
  html: string
  text: string
  right: string | null
}

export interface Article {
  id: string
  n: number
  slug: string
  cats: string[]
  title: string
  meta: { author: string; year: number | null; source: string; keywords: string[] }
  hasZh: boolean
  script?: 'cjk' | 'latin'
  chars: number
  alignRatio: number
  blocks: number
  rows: Row[]
  toc: { h: string; text: string; depth: number }[]
  updated: string
  hasStyle: boolean
  hasScript: boolean
}

/**
 * 记号形状：马克笔（五色）/ 波浪（蓝、绿、粉、紫）/ 红直线 / 红虚线。
 * dash = 虚线（也是「有想法」的记号）；wave2 是旧数据，界面已不产生。
 */
export type MarkKind =
  | 'highlight'
  | 'hl-green'
  | 'hl-blue'
  | 'hl-purple'
  | 'hl-pink'
  | 'wave'
  | 'wave-green'
  | 'wave-pink'
  | 'wave-purple'
  | 'wave2'
  | 'line'
  | 'dash'

/** 色点选的颜色同时决定马克笔和波浪线的颜色；金黄没有波浪可用，退蓝波 */
export function waveOf(tint: MarkKind): MarkKind {
  switch (tint) {
    case 'hl-green':
      return 'wave-green'
    case 'hl-pink':
      return 'wave-pink'
    case 'hl-purple':
      return 'wave-purple'
    default:
      return 'wave'
  }
}

/** 马克笔的色点，按工具条上从左到右的顺序（照图：粉 → 紫 → 蓝 → 绿 → 黄） */
export const TINTS: { k: MarkKind; c: string }[] = [
  { k: 'hl-pink', c: '#f2908f' },
  { k: 'hl-purple', c: '#c39be3' },
  { k: 'hl-blue', c: '#7db4f2' },
  { k: 'hl-green', c: '#8ecf78' },
  { k: 'highlight', c: '#f2ce62' },
]

/** 序列化/回显时只认这几种，坏数据退金黄 */
export function isHl(k: string | undefined): k is typeof TINTS[number]['k'] {
  return !!k && TINTS.some((t) => t.k === k)
}

export interface AnnItem {
  layer: 'index' | 'zh'
  quote: string
  text: string
  mark?: MarkKind
  at: string
  relinked?: number
  /** 锚定补充：quote 在这一块里的第 n 处（0 起）；不传按 0 */
  n?: number
  /** 锚定补充：短语前后各 ~12 字的前后文，正文变了也能重新定位 */
  ac?: { b?: string; a?: string }
}

export interface ResolvedAnn extends AnnItem {
  key: string
  rowIndex: number
  relinkedNow?: boolean
}
