/**
 * 把 AI（或你）写的草稿装进 papers/。
 * node tools/ingest.mjs <草稿目录> [--cat 分类/子分类] [--dry] [--json]
 *
 * 流程：校验 → 不合格就报错退出（草稿原样留着）→ 合格才发号 + 移动 → 自检
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { displayId, nextNumber, rel, scan } from './lib/scan.mjs'
import { validateDraft } from './lib/validate.mjs'

const root = process.cwd()
const argv = process.argv.slice(2)
const json = argv.includes('--json')
const dry = argv.includes('--dry')
const catIdx = argv.findIndex((a) => a === '--cat')
const cat = catIdx >= 0 ? String(argv[catIdx + 1] || '').trim() : ''
const skip = catIdx >= 0 ? catIdx + 1 : -1
const dirArg = argv.find((a, i) => !a.startsWith('--') && i !== skip)

const out = (o) => {
  if (json) console.log(JSON.stringify(o, null, 2))
  return o
}

if (!dirArg) {
  console.error('用法：npm run ingest -- <草稿目录> [--cat 分类/子分类] [--dry] [--json]')
  process.exit(2)
}

const draftDir = path.resolve(root, dirArg)
const v = await validateDraft(draftDir, { cat })

if (!v.ok) {
  const payload = {
    ok: false,
    stage: 'validate',
    errors: v.errors,
    warnings: v.warnings,
    message: `校验未通过（${v.errors.length} 项），草稿保持在 ${dirArg}，未改动 papers/`,
  }
  if (json) out(payload)
  else {
    console.error(`✗ ingest 失败（${v.errors.length} 项）`)
    v.errors.forEach((e, i) => console.error(`  ${i + 1}. [${e.code}] ${e.message}`))
    if (v.warnings.length) {
      console.error('  警告：')
      v.warnings.forEach((w) => console.error(`     ! [${w.code}] ${w.message}`))
    }
    console.error(`草稿保持在 ${dirArg}，未改动 papers/`)
  }
  process.exit(1)
}

const { articles } = await scan(root)
const n = nextNumber(articles)
const id = displayId(n)

const rawSlug =
  v.stats.meta?.slug ||
  path
    .basename(draftDir)
    .replace(/^\d{5,6}[-_ ]?/, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim() ||
  'article'

const parent = path.join(root, 'papers', ...(cat ? cat.split('/') : []))
const dest = path.join(parent, `${id}-${rawSlug}`)

if (await fs.access(dest).then(() => true, () => false)) {
  console.error(`✗ 目标已存在：${rel(root, dest)}`)
  process.exit(1)
}

const result = {
  ok: true,
  stage: dry ? 'dry-run' : 'installed',
  id,
  n,
  dest: rel(root, dest),
  warnings: v.warnings,
  stats: v.stats,
}

if (dry) {
  if (json) out(result)
  else console.log(`[dry-run] 会给草稿发号 ${id}，装到 ${rel(root, dest)}（未改动磁盘）`)
  process.exit(0)
}

await fs.mkdir(parent, { recursive: true })
try {
  await fs.rename(draftDir, dest)
} catch {
  await fs.cp(draftDir, dest, { recursive: true })
  await fs.rm(draftDir, { recursive: true, force: true })
}

if (json) out(result)
else {
  console.log(`✓ 已入库：${rel(root, dest)}（编号 ${id}）`)
  for (const w of v.warnings) console.log(`  ! [${w.code}] ${w.message}`)
  console.log('  下一步：npm run doctor 看全库；npm run dev 预览')
}
