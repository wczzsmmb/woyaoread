/**
 * node tools/validate.mjs <草稿目录> [--cat 分类] [--json]
 * 只校验，不写入。
 */
import path from 'node:path'
import { validateDraft } from './lib/validate.mjs'

const args = process.argv.slice(2)
const json = args.includes('--json')
const catIdx = args.findIndex((a) => a === '--cat')
const cat = catIdx >= 0 ? String(args[catIdx + 1] || '') : ''
const skip = catIdx >= 0 ? catIdx + 1 : -1
const dir = args.find((a, i) => !a.startsWith('--') && i !== skip)

if (!dir) {
  console.error('用法：npm run validate -- <草稿目录> [--cat 分类] [--json]')
  process.exit(2)
}

const r = await validateDraft(path.resolve(dir), { cat })

if (json) {
  console.log(JSON.stringify(r, null, 2))
} else {
  console.log(`校验 ${dir}`)
  for (const e of r.errors) console.log(`  ✗ [${e.code}] ${e.message}`)
  for (const w of r.warnings) console.log(`  ! [${w.code}] ${w.message}`)
  console.log(r.ok ? '  ✓ 通过' : `  ✗ ${r.errors.length} 项不合格`)
}

process.exit(r.ok ? 0 : 1)
