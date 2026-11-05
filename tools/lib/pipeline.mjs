/**
 * 构建期管线：扫目录 → 渲染 md → 写 public/data/**
 * 产物：
 *   public/data/index.json            站点 + 分类树 + 篇目元数据
 *   public/data/articles/<id>.json    单篇（块 html + 哈希 + 对齐）
 *   public/data/style-<id>.css        本篇样式（已加作用域）
 *   public/data/script-<id>.js        本篇脚本
 *   public/data/ext.css               站点级扩展样式
 *   public/data/ext/<name>.js         站点级扩展脚本
 *   public/media/<id>/**              图片
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import yaml from 'js-yaml'
import { displayId, rel, scan } from './scan.mjs'
import { align, rewriteMedia, scopeCss, toBlocks } from './render.mjs'

const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|svg|mp4|webm|mp3|m4a|pdf)$/i

/** 给 <img> 补上原始宽高：图片加载前后尺寸一致，分页不会因为图片decode完而整体重排 */
async function stampImageSize(html, dir) {
  const re = /<img\b[^>]*>/g
  const parts = []
  let last = 0
  for (const m of html.matchAll(re)) {
    const tag = m[0]
    parts.push(html.slice(last, m.index))
    last = m.index + tag.length
    if (/\bwidth=/.test(tag)) { parts.push(tag); continue }
    const src = /\bsrc="\.\/media\/[^"]*?\/([^"/]+)"/.exec(tag)
    if (!src) { parts.push(tag); continue }
    try {
      const buf = await fs.readFile(path.join(dir, 'img', decodeURIComponent(src[1])))
      let w = 0
      let h = 0
      if (buf.length > 24 && buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') {
        w = buf.readUInt32BE(16)
        h = buf.readUInt32BE(20)
      }
      parts.push(w && h ? tag.replace('<img', `<img width="${w}" height="${h}"`) : tag)
    } catch {
      parts.push(tag)
    }
  }
  parts.push(html.slice(last))
  return parts.join('')
}

async function readText(p, fallback = '') {
  try {
    return await fs.readFile(p, 'utf8')
  } catch {
    return fallback
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

async function loadPlugins(root) {
  const dir = path.join(root, 'ext', 'plugins')
  const out = []
  let entries = []
  try {
    entries = await fs.readdir(dir)
  } catch {
    return out
  }
  for (const f of entries.filter((f) => f.endsWith('.mjs')).sort()) {
    try {
      const mod = await import(path.join(dir, f))
      if (mod.default?.name) out.push(mod.default)
    } catch (err) {
      out.push({ name: f, error: String(err?.message || err) })
    }
  }
  return out
}

async function copyDirIfAny(src, dest) {
  if (!(await exists(src))) return
  await fs.cp(src, dest, { recursive: true })
}

/** 是否需要复制：img/ 目录，以及文章根目录里的零散图片 */
async function copyMedia(articleDir, mediaRoot, id) {
  await copyDirIfAny(path.join(articleDir, 'img'), path.join(mediaRoot, id, 'img'))
  await copyDirIfAny(path.join(articleDir, 'assets'), path.join(mediaRoot, id, 'assets'))
  let entries = []
  try {
    entries = await fs.readdir(articleDir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (!e.isFile() || !IMG_EXT.test(e.name)) continue
    await fs.mkdir(path.join(mediaRoot, id), { recursive: true })
    await fs.copyFile(path.join(articleDir, e.name), path.join(mediaRoot, id, e.name))
  }
}

function firstHeading(blocks) {
  const h = blocks.find((b) => b.type === 'heading' && b.depth === 1)
  return h ? h.text.trim() : ''
}

export async function buildAll(root = process.cwd(), opts = {}) {
  const started = Date.now()
  const papersRoot = path.join(root, 'papers')
  const dataRoot = path.join(root, 'public', 'data')
  const mediaRoot = path.join(root, 'public', 'media')

  const { articles: found, cats, errors, warnings } = await scan(root)

  let site = { title: '我要读书', subtitle: '' }
  const siteYml = await readText(path.join(root, 'site.yml'))
  if (siteYml) {
    const parsed = yaml.load(siteYml)
    if (parsed && typeof parsed === 'object') site = { ...site, ...parsed }
  }

  const plugins = await loadPlugins(root)
  const ctx = { root, site, articles: found }

  for (const p of plugins) {
    if (p.error) {
      errors.push({ code: 'plugin-load', message: `${p.name} 加载失败：${p.error}` })
      continue
    }
    try {
      await p.onScan?.(ctx)
    } catch (err) {
      errors.push({ code: 'plugin-hook', message: `${p.name}.onScan: ${err?.message || err}` })
    }
  }

  await fs.rm(dataRoot, { recursive: true, force: true })
  await fs.rm(mediaRoot, { recursive: true, force: true })
  await fs.mkdir(path.join(dataRoot, 'articles'), { recursive: true })
  await fs.mkdir(mediaRoot, { recursive: true })

  const index = []

  for (const a of ctx.articles) {
    const indexMd = await readText(path.join(a.dir, 'index.md'))
    const zhPath = path.join(a.dir, 'zh.md')
    const hasZh = await exists(zhPath)
    const zhMd = hasZh ? await readText(zhPath) : ''
    const meta = (yaml.load(await readText(path.join(a.dir, 'meta.yml'))) || {}) || {}

    const left = toBlocks(indexMd, 'index')
    for (const b of left) b.html = await stampImageSize(rewriteMedia(b.html, a.id), a.dir)
    const right = hasZh ? toBlocks(zhMd, 'zh') : []
    for (const b of right) b.html = await stampImageSize(rewriteMedia(b.html, a.id), a.dir)

    let rows = hasZh ? align(left, right) : left.map((b) => ({ ...b, rh: null, right: null }))

    const cjkCount = (indexMd.match(/[\u4e00-\u9fff]/g) || []).length
    const latinCount = (indexMd.match(/[A-Za-z]/g) || []).length
    const script = latinCount > cjkCount * 3 ? 'latin' : 'cjk'

    const article = {
      id: a.id,
      n: a.n,
      slug: a.slug,
      cats: a.cats,
      title: String(meta.title || firstHeading(left) || a.slug),
      meta: {
        author: meta.author || '',
        year: meta.year ?? null,
        source: meta.source || '',
        keywords: Array.isArray(meta.keywords) ? meta.keywords.map(String) : [],
      },
      hasZh,
      script,
      chars: indexMd.replace(/\s/g, '').length,
      alignRatio: hasZh && left.length ? rows.filter((r) => r.right).length / left.length : 0,
      blocks: rows.length,
      rows,
      toc: left
        .filter((b) => b.type === 'heading' && b.depth > 1 && b.depth <= 3)
        .map((b) => ({ h: b.h, text: b.text, depth: b.depth })),
      updated: new Date().toISOString(),
    }

    article.hasStyle = Boolean((await readText(path.join(a.dir, 'style.css'))).trim())
    article.hasScript = Boolean((await readText(path.join(a.dir, 'script.js'))).trim())

    for (const p of plugins) {
      try {
        await p.onArticle?.(article, ctx)
      } catch (err) {
        errors.push({ code: 'plugin-hook', message: `${p.name}.onArticle: ${err?.message || err}` })
      }
    }

    await fs.writeFile(path.join(dataRoot, 'articles', `${a.id}.json`), JSON.stringify(article))
    await copyMedia(a.dir, mediaRoot, a.id)

    // 每篇 CSS（作用域化）
    const css = await readText(path.join(a.dir, 'style.css'))
    if (css.trim()) {
      await fs.writeFile(path.join(dataRoot, `style-${a.id}.css`), scopeCss(css, `.a-${a.id}`))
    }
    // 每篇 JS
    const js = await readText(path.join(a.dir, 'script.js'))
    if (js.trim()) {
      await fs.writeFile(path.join(dataRoot, `script-${a.id}.js`), js)
    }

    index.push({
      id: a.id,
      n: a.n,
      slug: a.slug,
      title: article.title,
      authors: article.meta.author,
      cats: a.cats,
      hasZh,
      script,
      chars: article.chars,
      blocks: article.blocks,
      alignRatio: Number(article.alignRatio.toFixed(3)),
      keywords: article.meta.keywords,
      year: article.meta.year,
      updated: article.updated,
      hasStyle: Boolean(css.trim()),
      hasScript: Boolean(js.trim()),
    })
  }

  // 站点级扩展
  const extCssParts = []
  const extJs = []
  const extCssDir = path.join(root, 'ext', 'css')
  const extJsDir = path.join(root, 'ext', 'js')
  try {
    for (const f of (await fs.readdir(extCssDir)).filter((f) => f.endsWith('.css')).sort()) {
      extCssParts.push(`/* ${f} */\n${await readText(path.join(extCssDir, f))}`)
    }
  } catch {}
  try {
    for (const f of (await fs.readdir(extJsDir)).filter((f) => f.endsWith('.js')).sort()) {
      await fs.mkdir(path.join(dataRoot, 'ext'), { recursive: true })
      await fs.copyFile(path.join(extJsDir, f), path.join(dataRoot, 'ext', f))
      extJs.push(`./data/ext/${f}`)
    }
  } catch {}
  if (extCssParts.length) {
    await fs.writeFile(path.join(dataRoot, 'ext.css'), extCssParts.join('\n'))
  }

  const siteIndex = {
    site,
    cats,
    articles: index,
    ext: { css: extCssParts.length > 0, js: extJs },
    builtAt: new Date().toISOString(),
  }
  await fs.writeFile(path.join(dataRoot, 'index.json'), JSON.stringify(siteIndex))

  for (const p of plugins) {
    try {
      await p.onDone?.({ ...ctx, index: siteIndex })
    } catch (err) {
      errors.push({ code: 'plugin-hook', message: `${p.name}.onDone: ${err?.message || err}` })
    }
  }

  if (opts.log !== false) {
    const ms = Date.now() - started
    console.log(
      `[woyaoread] ${index.length} 篇 · ${cats.length} 分类 · ${ms}ms` +
        (warnings.length ? ` · 警告 ${warnings.length}` : ''),
    )
  }

  return { index: siteIndex, errors, warnings, ms: Date.now() - started }
}
