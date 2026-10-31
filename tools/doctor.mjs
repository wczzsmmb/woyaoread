/**
 * 全库巡检：编号重复/孔洞/孤儿批注/失联批注/对齐异常。
 * node tools/doctor.mjs [--json]
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { scan, displayId } from './lib/scan.mjs'
import { validateArticle } from './lib/validate.mjs'
import { listAnnotationIds, readAnnotations } from './lib/annotations.mjs'
import { toBlocks } from './lib/render.mjs'

const root = process.cwd()
const asJson = process.argv.includes('--json')

const { articles, cats, errors, warnings } = await scan(root)
const sysErrors = [...errors]
const sysWarnings = [...warnings]

const alignWarn = []
for (const a of articles) {
  const r = await validateArticle(a.dir)
  for (const e of r.errors) sysErrors.push({ ...e, id: a.id, path: a.relDir })
  for (const w of r.warnings) sysWarnings.push({ ...w, id: a.id, path: a.relDir })
  if (a.cats.length === 0) sysWarnings.push({ code: 'no-category', message: `${a.relDir} 在 papers/ 根下，没有分类`, id: a.id })
  if (r.stats.alignRatio !== undefined && r.stats.alignRatio < 0.6) {
    alignWarn.push({ id: a.id, ratio: r.stats.alignRatio })
  }
}

// 编号孔洞
const nums = new Set(articles.map((a) => a.n))
const max = articles.length ? Math.max(...nums) : 0
const holes = []
for (let i = 1; i <= max; i++) if (!nums.has(i)) holes.push(displayId(i))

// 批注：孤儿 + 失联
const annIds = await listAnnotationIds(root)
const articleIds = new Set(articles.map((a) => a.id))
const orphans = annIds.filter((id) => !articleIds.has(id))

let unlinked = []
for (const a of articles) {
  const data = await readAnnotations(root, a.id)
  const keys = Object.keys(data.items || {})
  if (!keys.length) continue
  const indexMd = await fs.readFile(path.join(a.dir, 'index.md'), 'utf8').catch(() => '')
  const zhMd = await fs.readFile(path.join(a.dir, 'zh.md'), 'utf8').catch(() => '')
  const hashes = new Set([
    ...toBlocks(indexMd, 'index').map((b) => b.h),
    ...toBlocks(zhMd, 'zh').map((b) => b.h),
  ])
  const bad = keys.filter((k) => {
    const h = k.split('::')[1]
    return !hashes.has(h) && !hashes.has(h.split('#')[0])
  })
  if (bad.length) unlinked.push({ id: a.id, count: bad.length, sample: bad.slice(0, 3) })
}

const report = {
  ok: sysErrors.length === 0,
  articles: articles.length,
  cats: cats.length,
  holes,
  orphans,
  unlinked,
  alignWarn,
  errors: sysErrors,
  warnings: sysWarnings,
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  const line = (t) => console.log(t)
  line(
    `文章 ${articles.length} · 分类 ${cats.length} · 编号孔洞 ${holes.length} · 重复 ${sysErrors.filter((e) => e.code === 'dup-number').length}`,
  )
  for (const e of sysErrors) line(`✗ ${e.id ? `[${e.id}] ` : ''}${e.message}`)
  if (orphans.length) line(`! 孤儿批注：${orphans.join(' ')}（文章已不存在，数据仍保留）`)
  if (unlinked.length) {
    for (const u of unlinked) line(`! 失联批注：${u.id} ${u.count} 条（原文可能改写过）`)
  }
  if (alignWarn.length) {
    for (const a of alignWarn) line(`! 对齐偏低：${a.id} 仅 ${Math.round(a.ratio * 100)}% 的块有对照`)
  }
  if (holes.length) line(`· 空号：${holes.slice(0, 30).join(' ')}${holes.length > 30 ? ' …' : ''}`)
  for (const w of sysWarnings.slice(0, 20)) line(`· ${w.id ? `[${w.id}] ` : ''}${w.message}`)
  if (sysWarnings.length > 20) line(`· 其余 ${sysWarnings.length - 20} 条警告省略（用 --json 看全部）`)
  line(report.ok ? '✓ 没有阻断性问题' : `✗ ${sysErrors.length} 项必须修`)
}

process.exit(report.ok ? 0 : 1)
