/**
 * 草稿校验：ingest 的准入门槛。
 * node tools/validate.mjs <草稿目录> [--json]
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import yaml from 'js-yaml'
import { scopeCss, toBlocks } from './render.mjs'
import { align } from './render.mjs'

const META_KEYS = new Set(['title', 'author', 'year', 'source', 'keywords', 'slug'])
const MAX_BYTES = 20 * 1024 * 1024

async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function dirSize(dir) {
  let total = 0
  let entries = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) total += await dirSize(p)
    else {
      try {
        total += (await fs.stat(p)).size
      } catch {}
    }
  }
  return total
}

function mdImages(md) {
  const out = new Set()
  for (const m of md.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) out.add(m[1])
  for (const m of md.matchAll(/<img[^>]+src="([^"]+)"/g)) out.add(m[1])
  return [...out].filter((s) => !/^(https?:|data:|\/)/.test(s))
}

/** 校验一个草稿目录 */
export async function validateDraft(dir, opts = {}) {
  const errors = []
  const warnings = []
  const stats = {}
  const err = (code, message, extra = {}) => errors.push({ code, message, ...extra })
  const warn = (code, message, extra = {}) => warnings.push({ code, message, ...extra })

  if (!(await exists(path.join(dir, 'index.md')))) {
    err('missing-index', '缺少 index.md')
    return { ok: false, errors, warnings, stats }
  }

  // 行尾统一为 LF，并检测编码损坏
  for (const name of ['index.md', 'zh.md', 'meta.yml', 'style.css', 'script.js']) {
    const p = path.join(dir, name)
    if (!(await exists(p))) continue
    const raw = await fs.readFile(p, 'utf8')
    if (raw.includes('\uFFFD')) warn('bad-encoding', `${name} 里出现了乱码字符（U+FFFD）`)
    if (raw.includes('\r\n')) {
      await fs.writeFile(p, raw.replace(/\r\n/g, '\n'), 'utf8')
      warnings.push({ code: 'crlf-fixed', message: `${name} 的 CRLF 已自动改为 LF` })
    }
  }

  const indexMd = await fs.readFile(path.join(dir, 'index.md'), 'utf8')
  if (!indexMd.trim()) err('empty-index', 'index.md 是空的')

  let left = []
  try {
    left = toBlocks(indexMd, 'index')
  } catch (e) {
    err('parse-failed', `index.md 解析失败：${e.message}`)
  }
  if (!left.length) err('no-blocks', 'index.md 切不出任何块')
  const h1 = left.find((b) => b.type === 'heading' && b.depth === 1)
  if (!h1) warn('no-h1', '没有一级标题，标题将退化为目录名')

  // meta.yml
  const metaPath = path.join(dir, 'meta.yml')
  let meta = {}
  if (await exists(metaPath)) {
    try {
      meta = yaml.load(await fs.readFile(metaPath, 'utf8')) || {}
      if (typeof meta !== 'object' || Array.isArray(meta)) {
        err('bad-meta', 'meta.yml 必须是一个映射')
        meta = {}
      }
      for (const k of Object.keys(meta)) {
        if (!META_KEYS.has(k)) warn('meta-unknown-key', `meta.yml 里有未知字段：${k}`)
      }
      if (meta.keywords && !Array.isArray(meta.keywords)) {
        err('bad-keywords', 'meta.yml 的 keywords 必须是数组')
      }
    } catch (e) {
      err('bad-meta', `meta.yml 解析失败：${e.message}`)
    }
  }
  stats.meta = meta

  // 对照层
  let ratio = 0
  const zhPath = path.join(dir, 'zh.md')
  if (await exists(zhPath)) {
    const zhMd = await fs.readFile(zhPath, 'utf8')
    let right = []
    try {
      right = toBlocks(zhMd, 'zh')
    } catch (e) {
      err('parse-failed', `zh.md 解析失败：${e.message}`)
    }
    if (!right.length) err('empty-zh', 'zh.md 是空的')
    const rows = align(left, right)
    const matched = rows.filter((r) => r.right).length
    ratio = left.length ? matched / left.length : 0
    stats.alignRatio = Number(ratio.toFixed(3))
    if (ratio < 0.2) err('align-low', `zh.md 仅 ${matched}/${left.length} 块能对齐（${Math.round(ratio * 100)}%）`)
    else if (ratio < 0.6) warn('align-partial', `zh.md 只有 ${Math.round(ratio * 100)}% 的块能对齐`)
  }

  // 图片
  const imgs = mdImages(indexMd)
  const missing = []
  for (const src of imgs) {
    if (!(await exists(path.join(dir, src)))) missing.push(src)
  }
  if (missing.length) warn('missing-image', `引用了不存在的图片：${missing.join('、')}`)
  stats.images = imgs.length

  // 体积
  const size = await dirSize(dir)
  stats.bytes = size
  if (size > MAX_BYTES) err('too-large', `草稿体积 ${(size / 1048576).toFixed(1)} MB 超过 20 MB`)

  // 危险内容
  if (/<script\b/i.test(indexMd)) warn('inline-script', 'index.md 里有 <script>，不会被执行；请改用 script.js')
  if (/\son[a-z]+\s*=/i.test(indexMd)) warn('inline-handler', 'index.md 里有 on* 事件属性，不会生效')
  for (const m of indexMd.matchAll(/<iframe[^>]+src="(https?:\/\/[^"]+)"/g)) {
    warn('external-iframe', `外部 iframe：${m[1]}`)
  }

  // 分类路径
  if (opts.cat) {
    for (const seg of String(opts.cat).split('/')) {
      if (!seg.trim()) err('bad-cat', '分类里有空段')
      if (/^\d{5,6}([-_ ]|$)/.test(seg)) err('bad-cat', `分类名不能以 5–6 位数字开头：${seg}`)
    }
  }

  stats.blocks = left.length
  stats.ratio = ratio
  return { ok: errors.length === 0, errors, warnings, stats }
}

/** 校验一篇已入库文章（doctor 用） */
export async function validateArticle(dir) {
  return validateDraft(dir)
}
