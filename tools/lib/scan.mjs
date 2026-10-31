/**
 * 扫描 papers/ ：数字目录 = 文章，文字目录 = 分类。
 * 编号身份是「整数」，展示时才补零到 5 位（超过 99999 自然 6 位）。
 */
import fs from 'node:fs/promises'
import path from 'node:path'

export const NUM_RE = /^(\d{5,6})(?:[-_ ](.*))?$/

export const displayId = (n) => String(n).padStart(5, '0')

export const rel = (root, p) => path.relative(root, p).split(path.sep).join('/')

async function isDir(p) {
  try {
    return (await fs.stat(p)).isDirectory()
  } catch {
    return false
  }
}

async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/** 递归扫 papers/，返回文章清单 + 分类树 + 错误/警告 */
export async function scan(root = process.cwd()) {
  const papersRoot = path.join(root, 'papers')
  const articles = []
  const errors = []
  const warnings = []
  const byNum = new Map()
  const catNames = new Map() // 分类路径 → { name, path, ids }

  async function recurse(dir, cats) {
    let entries = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_')) continue
      const p = path.join(dir, e.name)
      const m = NUM_RE.exec(e.name)
      if (m) {
        const n = Number(m[1])
        const id = displayId(n)
        const slug = (m[2] || '').trim() || id
        const where = rel(root, p)
        if (!(await exists(path.join(p, 'index.md')))) {
          errors.push({
            code: 'missing-index',
            message: `${where} 是编号目录但缺少 index.md`,
            path: where,
          })
          continue
        }
        if (byNum.has(n)) {
          errors.push({
            code: 'dup-number',
            message: `编号 ${id} 重复：${byNum.get(n)} 与 ${where}`,
            paths: [byNum.get(n), where],
          })
          continue
        }
        byNum.set(n, where)
        articles.push({ n, id, slug, dir: p, relDir: where, cats: [...cats] })
      } else {
        if (await exists(path.join(p, 'index.md'))) {
          warnings.push({
            code: 'index-in-category',
            message: `${rel(root, p)} 是分类目录，但里面有 index.md（会忽略）`,
            path: rel(root, p),
          })
        }
        await recurse(p, [...cats, e.name])
      }
    }
  }

  if (!(await isDir(papersRoot))) {
    await fs.mkdir(papersRoot, { recursive: true })
  }
  await recurse(papersRoot, [])

  articles.sort((a, b) => a.n - b.n)

  for (const a of articles) {
    const key = a.cats.join('/') || '未分类'
    const cur = catNames.get(key) || { name: a.cats.at(-1) || '未分类', path: a.cats, ids: [] }
    cur.ids.push(a.id)
    catNames.set(key, cur)
  }

  const cats = [...catNames.values()].sort((x, y) => {
    const px = x.path.join('/')
    const py = y.path.join('/')
    return px.localeCompare(py, 'zh')
  })

  return { articles, cats, errors, warnings }
}

/** 下一个可用编号（max + 1，永不回收） */
export function nextNumber(articles) {
  return articles.reduce((m, a) => Math.max(m, a.n), 0) + 1
}

export async function readMeta(dir) {
  const p = path.join(dir, 'meta.yml')
  try {
    const raw = await fs.readFile(p, 'utf8')
    const yaml = (await import('js-yaml')).default
    return (yaml.load(raw) || {}) || {}
  } catch {
    return {}
  }
}
