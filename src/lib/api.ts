import type { Article, SiteIndex } from './types'

const BASE = './data/'

export async function fetchIndex(): Promise<SiteIndex> {
  const r = await fetch(`${BASE}index.json`, { cache: 'no-cache' })
  if (!r.ok) throw new Error(`index.json ${r.status}`)
  return r.json()
}

export async function fetchArticle(id: string): Promise<Article> {
  const r = await fetch(`${BASE}articles/${id}.json`, { cache: 'no-cache' })
  if (!r.ok) throw new Error(`article ${id} ${r.status}`)
  return r.json()
}

/** 有本地服务就用它，没有就只读 */
const PROBE_TIMEOUT = 800

async function tryPing(url: string) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT)
  try {
    const r = await fetch(`${url}/api/ping`, { signal: ctrl.signal, cache: 'no-store' })
    if (!r.ok) return false
    const j = await r.json()
    return Boolean(j?.ok)
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

let state: { ok: boolean; base: string } | null = null

async function ensure() {
  if (state) return state
  if (await tryPing('')) state = { ok: true, base: '' }
  else if (await tryPing('http://127.0.0.1:43999')) state = { ok: true, base: 'http://127.0.0.1:43999' }
  else state = { ok: false, base: '' }
  return state
}

export function resetApiBase() {
  state = null
}

export async function apiGet(path: string) {
  const s = await ensure()
  if (!s.ok) throw new Error('offline')
  const r = await fetch(`${s.base}${path}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}

export async function apiPut(path: string, body: unknown) {
  const s = await ensure()
  if (!s.ok) throw new Error('offline')
  const r = await fetch(`${s.base}${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}

export const norm = (s: string) =>
  String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
