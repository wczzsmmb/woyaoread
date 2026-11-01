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

export interface AnnItem {
  layer: 'index' | 'zh'
  quote: string
  text: string
  at: string
  relinked?: number
}

export interface ResolvedAnn extends AnnItem {
  key: string
  rowIndex: number
  relinkedNow?: boolean
}
