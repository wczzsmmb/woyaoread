/** 阅读时长：只记在本地，属于界面状态，不进内容、不进批注。 */
import { reactive, watch } from 'vue'

const KEY = 'woyaoread:rtime:v1'
const TICK = 10 // 秒

function load(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {}
  } catch {
    return {}
  }
}

/** 篇目 id → 累计分钟 */
export const readMinutes = reactive<Record<string, number>>(load())

watch(readMinutes, (v) => localStorage.setItem(KEY, JSON.stringify(v)), { deep: true })

let timer: number | undefined
let current = ''

/** 十秒一跳：页面不可见时不计时（切到后台、锁屏都不算） */
export function startClock(id: string) {
  stopClock()
  current = id
  timer = window.setInterval(() => {
    if (!current || document.visibilityState !== 'visible') return
    const m = ((readMinutes[current] || 0) * 60 + TICK) / 60
    readMinutes[current] = Number(m.toFixed(3))
  }, TICK * 1000)
}

export function stopClock() {
  clearInterval(timer)
  timer = undefined
  current = ''
}

/** 面板里显示：至少 1 分钟，免得刚打开就是「0 分钟」 */
export const minutesOf = (id: string) => Math.max(1, Math.round(readMinutes[id] || 0))
