import { computed, reactive } from 'vue'
import { apiGet, apiPut, norm, resetApiBase } from './api'
import type { AnnItem, Article, MarkKind, ResolvedAnn } from './types'

export const ann = reactive({
  online: false,
  checked: false,
  loading: false,
  items: {} as Record<string, AnnItem>,
  drafts: 0,
  error: '',
})

const KEY = (id: string, key: string) => `woyaoread:draft:${id}:${key}`

function scanDrafts(id: string) {
  let n = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(`woyaoread:draft:${id}:`)) n++
    }
  } catch {}
  return n
}

export async function detect() {
  resetApiBase()
  try {
    const r = await apiGet('/api/ping')
    ann.online = Boolean(r?.ok)
  } catch {
    ann.online = false
  }
  ann.checked = true
  return ann.online
}

export async function loadAnnotations(id: string) {
  ann.loading = true
  ann.error = ''
  ann.drafts = scanDrafts(id)
  try {
    const data = await apiGet(`/api/annotations/${id}`)
    ann.items = data?.items || {}
    ann.online = true
    writeMirror(id)
    if (ann.drafts) await flushDrafts(id)
  } catch (e) {
    // 服务不在：本机 localStorage 镜像兑底，刷新/离线也能恢复
    const mirror = readMirror(id)
    ann.items = mirror || {}
    ann.error = mirror ? '服务未启动，已用本机缓存' : String((e as Error).message || e)
  } finally {
    ann.loading = false
  }
}

const MIRROR = (id: string) => `woyaoread:ann:${id}`
function writeMirror(id: string) {
  try {
    localStorage.setItem(MIRROR(id), JSON.stringify({ v: 1, article: id, items: ann.items }))
  } catch {}
}
function readMirror(id: string): Record<string, AnnItem> | null {
  try {
    const d = JSON.parse(localStorage.getItem(MIRROR(id)) || 'null')
    if (d && d.items && typeof d.items === 'object') return d.items
  } catch {}
  return null
}

/**
 * 前端存的是扁的 n / ac（用起来方便），服务端协议收的是 anchor: { n, ac }。
 * 这层负责转过去 —— 以前直接 PUT 扁字段，服务端 anchor 永远是空的，
 * 同文重复句的「第 n 处 / 前后文」就从来没存下来过。
 */
function toBody(payload: {
  key: string
  layer: 'index' | 'zh'
  quote: string
  text: string
  mark?: MarkKind
  n?: number
  ac?: { b?: string; a?: string }
}) {
  const { n, ac, ...rest } = payload
  const anchor: { n?: number; ac?: { b?: string; a?: string } } = {}
  if (typeof n === 'number') anchor.n = n
  if (ac) anchor.ac = ac
  return Object.keys(anchor).length ? { ...rest, anchor } : rest
}

export async function saveAnnotation(
  id: string,
  payload: {
    key: string
    layer: 'index' | 'zh'
    quote: string
    text: string
    mark?: MarkKind
    n?: number
    ac?: { b?: string; a?: string }
  },
) {
  try {
    await apiPut(`/api/annotations/${id}`, toBody(payload))
    if (payload.text || payload.mark) {
      const prev = ann.items[payload.key]
      ann.items[payload.key] = {
        ...payload,
        at: new Date().toISOString(),
        n: payload.n ?? prev?.n,
        ac: payload.ac ?? prev?.ac,
      }
    } else delete ann.items[payload.key]
    writeMirror(id)
    try {
      localStorage.removeItem(KEY(id, payload.key))
    } catch {}
    ann.online = true
    ann.drafts = scanDrafts(id)
    return true
  } catch {
    // 草稿箱：仅缓冲，主存储永远是 _woyaoread/annotations（含锚定字段一起存）
    try {
      localStorage.setItem(KEY(id, payload.key), JSON.stringify({ ...payload, at: Date.now() }))
      ann.drafts = scanDrafts(id)
    } catch {}
    return false
  }
}

export async function flushDrafts(id: string) {
  const keys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(`woyaoread:draft:${id}:`)) keys.push(k)
    }
  } catch {}
  for (const k of keys) {
    try {
      const payload = JSON.parse(localStorage.getItem(k) || 'null')
      if (!payload) continue
      await apiPut(`/api/annotations/${id}`, toBody(payload))
      localStorage.removeItem(k)
      if (payload.text || payload.mark) {
        const prev = ann.items[payload.key]
        ann.items[payload.key] = { ...payload, at: new Date().toISOString(), n: payload.n ?? prev?.n, ac: payload.ac ?? prev?.ac }
      }
    } catch {
      break
    }
  }
  ann.drafts = scanDrafts(id)
  writeMirror(id)
}

/** 把批注挂回块：先精确哈希，再用 quote 兜底 */
export function resolve(article: Article, items: Record<string, AnnItem>) {
  const map: Record<string, ResolvedAnn> = {}
  const lost: { key: string; item: AnnItem }[] = []
  const byHash = new Map(article.rows.map((r, i) => [r.h, i]))
  const byZh = new Map(article.rows.filter((r) => r.rh).map((r) => [r.rh as string, article.rows.indexOf(r)]))

  for (const [key, item] of Object.entries(items || {})) {
    const [layer, rawHash] = key.split('::')
    if (layer !== 'index' && layer !== 'zh') {
      lost.push({ key, item })
      continue
    }
    let idx = layer === 'zh' ? byZh.get(rawHash) : byHash.get(rawHash)
    if (idx === undefined) idx = byHash.get(rawHash.split('#')[0])
    if (idx === undefined) {
      const q = norm(item.quote || '')
      if (q.length > 6) {
        const hit = article.rows.findIndex((r) => {
          const t = norm(r.text || '')
          return t && (t.includes(q.slice(0, 40)) || q.includes(t.slice(0, 40)))
        })
        if (hit >= 0) {
          map[key] = { ...item, key, rowIndex: hit, relinkedNow: true }
          continue
        }
      }
      lost.push({ key, item })
      continue
    }
    map[key] = { ...item, key, rowIndex: idx }
  }
  return { map, lost }
}

export const annCount = computed(() => Object.keys(ann.items).length)
