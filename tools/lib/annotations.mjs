/** 批注读写：serve.mjs 与 mcp.mjs 共用同一套实现。 */
import fs from 'node:fs/promises'
import path from 'node:path'

export const ID_RE = /^\d{5,6}$/
export const KEY_RE = /^(index|zh)::[0-9a-f]{8}(#\d+)?$/
const MAX_QUOTE = 2000
const MAX_TEXT = 20000
const KEEP_BAK = 3

let chain = Promise.resolve()

const annDir = (root) => path.join(root, '_duiye', 'annotations')
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

export function writeAnnotation(root, id, { key, layer, quote, text }) {
  if (!ID_RE.test(id)) throw new Error(`非法编号：${id}`)
  if (!KEY_RE.test(key)) throw new Error(`非法批注键：${key}`)
  if (!['index', 'zh'].includes(layer)) throw new Error(`非法层名：${layer}`)
  if (quote && quote.length > MAX_QUOTE) throw new Error('quote 超过 2000 字')
  if (text && text.length > MAX_TEXT) throw new Error('text 超过 20000 字')

  // 同一文件的写入串行化
  chain = chain.then(async () => {
    const data = await readAnnotations(root, id)
    data.v = 1
    data.article = id
    data.items = data.items || {}
    if (!text) {
      delete data.items[key]
    } else {
      const prev = data.items[key] || {}
      data.items[key] = {
        layer,
        quote: quote || prev.quote || '',
        text,
        at: new Date().toISOString(),
        relinked: prev.relinked || 0,
      }
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
