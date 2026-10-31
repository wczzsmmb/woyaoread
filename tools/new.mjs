/**
 * 新建一篇空文章（发号 + 骨架）。
 * node tools/new.mjs 短名 [--cat 分类/子分类]
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { displayId, nextNumber, rel, scan } from './lib/scan.mjs'

const root = process.cwd()
const argv = process.argv.slice(2)
const catIdx = argv.findIndex((a) => a === '--cat')
const cat = catIdx >= 0 ? String(argv[catIdx + 1] || '').trim() : ''
const skip = catIdx >= 0 ? catIdx + 1 : -1
const slug = argv.find((a, i) => !a.startsWith('--') && i !== skip)

if (!slug) {
  console.error('用法：npm run new -- 短名 [--cat 分类/子分类]')
  process.exit(2)
}

if (cat) {
  for (const seg of cat.split('/')) {
    if (/^\d{5,6}([-_ ]|$)/.test(seg)) {
      console.error(`✗ 分类名不能以 5–6 位数字开头：${seg}`)
      process.exit(1)
    }
  }
}

const { articles, errors } = await scan(root)
if (errors.length) {
  console.error('✗ 现有内容有编号问题，先跑 npm run doctor')
  process.exit(1)
}

const n = nextNumber(articles)
const id = displayId(n)
const parent = path.join(root, 'papers', ...(cat ? cat.split('/') : []))
const dir = path.join(parent, `${id}-${slug}`)

await fs.mkdir(path.join(dir, 'img'), { recursive: true })

const files = {
  'index.md': `# ${slug}\n\n第一段。空行分段，一个段落就是一块。\n\n行内公式 $E=mc^2$，显示公式：\n\n$$\n\\text{softmax}(z)_i=\\frac{e^{z_i}}{\\sum_j e^{z_j}}\n$$\n\n## 小节\n\n正文可以直接写 HTML：<span class="hl">高亮</span>。\n`,
  'zh.md': `# ${slug}\n\n左栏的对照内容放这里（译文 / 白话 / 注释都行）。\n\n块按内容哈希对齐，所以段落顺序不必严格一致。\n\n## 小节\n\n译文。\n`,
  'meta.yml': `title: ${slug}\nauthor: ""\nkeywords: []\n`,
}

for (const [name, body] of Object.entries(files)) {
  await fs.writeFile(path.join(dir, name), body, 'utf8')
}

console.log(`✓ 已创建 ${rel(root, dir)}（编号 ${id}）`)
console.log('  改完 index.md / zh.md 后：npm run dev')
