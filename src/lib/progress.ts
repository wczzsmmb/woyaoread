/** 阅读进度与「最近阅读」：只存在本机，属于界面状态，不是内容数据。 */
import { reactive, watch } from 'vue'

const K_PROGRESS = 'woyaoread:progress:v1'
const K_RECENT = 'woyaoread:recent:v1'
const K_STARRED = 'woyaoread:starred:v1'
const MAX_RECENT = 12

function load<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...(JSON.parse(raw) as object) } as T : fallback
  } catch {
    return fallback
  }
}

export const progress = reactive<Record<string, number>>(load(K_PROGRESS, {}))
export const recent = reactive<{ ids: string[] }>(load(K_RECENT, { ids: [] }))
export const starred = reactive<{ ids: string[] }>(load(K_STARRED, { ids: [] }))

watch(progress, (v) => localStorage.setItem(K_PROGRESS, JSON.stringify(v)), { deep: true })
watch(recent, (v) => localStorage.setItem(K_RECENT, JSON.stringify(v)), { deep: true })
watch(starred, (v) => localStorage.setItem(K_STARRED, JSON.stringify(v)), { deep: true })

export const isStarred = (id: string) => starred.ids.includes(id)

export function toggleStar(id: string) {
  const i = starred.ids.indexOf(id)
  if (i >= 0) starred.ids.splice(i, 1)
  else starred.ids.unshift(id)
  return isStarred(id)
}

export const progressOf = (id: string) => progress[id] || 0

export function setProgress(id: string, pct: number) {
  const v = Math.max(0, Math.min(1, pct))
  if (Math.abs((progress[id] || 0) - v) < 0.005) return
  progress[id] = Number(v.toFixed(3))
}

export function touchRecent(id: string) {
  const ids = recent.ids.filter((x) => x !== id)
  ids.unshift(id)
  recent.ids = ids.slice(0, MAX_RECENT)
}

export function clearProgress() {
  for (const k of Object.keys(progress)) delete progress[k]
  recent.ids = []
}

export const recentIds = () => recent.ids
