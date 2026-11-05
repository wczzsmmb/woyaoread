/** 批注读写：serve.mjs 与 mcp.mjs 共用同一套实现。 */
import fs from 'node:fs/promises'
import path from 'node:path'

export const ID_RE = /^\d{5,6}$/
export const KEY_RE = /^(index|zh)::[0-9a-f]{8}(#\d+)?$/
const MAX_QUOTE = 2000
const MAX_TEXT = 20000
const KEEP_BAK = 3

let chain = Promise.resolve()

const annDir = (root) => path.join(root, '_woyaoread', 'annotations')
const fileOf = (root, id) => path.join(annDir(root), `${id}.json`)

async function readJson(p, fallback) {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'))
  } catch {
    return fallback
  }
}

export async function readAnnotations(root, id) {
  if (!ID_RE.test(id)) throw new Error(`非法编号：${id}`)
  const data = await readJson(fileOf(root, id), null)
  if (data) return data
  // 回退：编号位数变化 / 文件名不一致时，按整数找
  const n = Number(id)
  try {
    const files = await fs.readdir(annDir(root))
    const hit = files.find((f) => /^\d{5,6}\.json$/.test(f) && Number(f.slice(0, -5)) === n)
    if (hit) return (await readJson(path.join(annDir(root), hit), null)) || { v: 1, article: hit.slice(0, -5), items: {} }
  } catch {}
  return { v: 1, article: id, items: {} }
}

async function writeAtomic(root, id, data) {
  await fs.mkdir(annDir(root), { recursive: true })
  const target = fileOf(root, id)
  // 备份轮转：.bak → .bak2 → .bak3（保留 3 份）
  try {
    const old = await fs.readFile(target, 'utf8')
    const baks = [`${target}.bak`, `${target}.bak2`, `${target}.bak3`]
    for (let i = baks.length - 1; i > 0; i--) {
      try {
        await fs.rename(baks[i - 1], baks[i])
      } catch {}
    }
    await fs.writeFile(baks[0], old, 'utf8')
  } catch {}
  const tmp = `${target}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, target)
}

const MARKS = ['highlight', 'hl-green', 'hl-blue', 'hl-purple', 'hl-pink', 'wave', 'wave-green', 'wave-pink', 'wave-purple', 'wave2', 'line', 'dash']

/** 锚定补充：n = quote 在块内第几处（0 起），ac = 前后文；都可选，不传保留原值 */
function sanitizeAnchor(anchor, prev) {
  if (!anchor || typeof anchor !== 'object') return { n: prev.n, ac: prev.ac }
  const out = {}
  const n = anchor.n
  if (Number.isInteger(n) && n >= 0 && n <= 99) out.n = n
  else if (n === undefined || n === null) out.n = prev.n
  if (anchor.ac && typeof anchor.ac === 'object') {
    out.ac = {
      b: typeof anchor.ac.b === 'string' ? anchor.ac.b.slice(0, 24) : '',
      a: typeof anchor.ac.a === 'string' ? anchor.ac.a.slice(0, 24) : '',
    }
  } else if (anchor.ac === undefined || anchor.ac === null) out.ac = prev.ac
  return out
}

export function writeAnnotation(root, id, { key, layer, quote, text, mark, anchor }) {
  if (!ID_RE.test(id)) throw new Error(`非法编号：${id}`)
  if (!KEY_RE.test(key)) throw new Error(`非法批注键：${key}`)
  if (!['index', 'zh'].includes(layer)) throw new Error(`非法层名：${layer}`)
  if (quote && quote.length > MAX_QUOTE) throw new Error('quote 超过 2000 字')
  if (text && text.length > MAX_TEXT) throw new Error('text 超过 20000 字')
  if (mark && !MARKS.includes(mark)) throw new Error(`非法划线样式：${mark}`)

  // 同一文件的写入串行化
  chain = chain.then(async () => {
    const data = await readAnnotations(root, id)
    data.v = 1
    data.article = id
    data.items = data.items || {}
    // text 与 mark 都空 = 删除；只有 mark 是「划线」，只有 text 是「想法」
    if (!text && !mark) {
      delete data.items[key]
    } else {
      const prev = data.items[key] || {}
      const a = sanitizeAnchor(anchor, prev)
      // 纯想法不占记号：虚线是「有想法」的渲染结果，不是存下来的 mark
      const nextMark = mark || prev.mark || (text ? '' : 'line')
      const next = {
        layer,
        quote: quote || prev.quote || '',
        text: text || '',
        at: new Date().toISOString(),
        relinked: prev.relinked || 0,
      }
      if (nextMark) next.mark = nextMark
      // JSON.stringify 会丢 undefined：只写有值的锚定字段
      if (a.n !== undefined) next.n = a.n
      if (a.ac !== undefined && a.ac !== null) next.ac = a.ac
      data.items[key] = next
    }
    await writeAtomic(root, id, data)
    return data
  })
  return chain
}

export async function listAnnotationIds(root) {
  try {
    return (await fs.readdir(annDir(root)))
      .filter((f) => /^\d{5,6}\.json$/.test(f))
      .map((f) => f.slice(0, -5))
  } catch {
    return []
  }
}
