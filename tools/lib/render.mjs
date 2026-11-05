/**
 * md → 块；块的持久身份是「层名::内容哈希」，不是顺序号。
 * 公式在构建期用 KaTeX 渲染成纯 HTML，前端零公式 JS。
 */
import crypto from 'node:crypto'
import { marked, Marked } from 'marked'
import katex from 'katex'

marked.setOptions({ gfm: true, breaks: false })
const inner = new Marked({ gfm: true, breaks: false })

const renderMath = (src, displayMode) => {
  const body = src.replace(/\\label\{[^}]+\}/g, '').replace(/\\tag\*?\{[^}]*\}/g, '')
  return katex.renderToString(body, {
    displayMode,
    throwOnError: false,
    output: 'html',
    strict: false,
  })
}

const extensions = [
  {
    name: 'eqBlock',
    level: 'block',
    tokenizer(src) {
      const m = /^\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/.exec(src)
      if (m) return { type: 'eqBlock', raw: m[0], text: m[1] }
    },
    renderer: (t) => renderMath(t.text, true),
  },
  {
    name: 'eqInline',
    level: 'inline',
    start(src) {
      const i = src.indexOf('$')
      return i < 0 ? undefined : i
    },
    tokenizer(src) {
      const m = /^\$(?!\s)([^$\n]{1,300}?)(?<!\s)\$/.exec(src)
      if (m) return { type: 'eqInline', raw: m[0], text: m[1] }
    },
    renderer: (t) => renderMath(t.text, false),
  },
  {
    // ::: theorem / proof …… 可选容器，编号由插件或作者自己控制
    name: 'box',
    level: 'block',
    tokenizer(src) {
      if (!src.startsWith(':::')) return
      const m = /^:::[ \t]*([a-zA-Z]+)[ \t]*([^\n]*)\n([\s\S]*?)^:::[ \t]*(?:\n|$)/m.exec(src)
      if (!m) return
      return { type: 'box', raw: m[0], name: m[1].toLowerCase(), title: m[2].trim(), tokens: inner.lexer(m[3]) }
    },
    renderer(t) {
      const title = t.title ? `<span class="box__title">${t.title}</span>` : ''
      return `<div class="box box--${t.name}"><div class="box__head">${t.name}${title}</div><div class="box__body">${inner.parser(t.tokens)}</div></div>`
    },
  },
]

marked.use({ extensions })
inner.use({ extensions })

const HASH_OF = new WeakMap()

function normalize(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[*_`>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function hashOf(layer, text) {
  return crypto.createHash('sha1').update(`${layer}\u0000${normalize(text)}`).digest('hex').slice(0, 8)
}

function visibleText(token, html) {
  // 优先用 token.text；公式/代码用渲染前的源
  if (token.type === 'eqBlock') return token.text
  if (token.type === 'code') return token.text
  if (token.type === 'box') return normalize(html).slice(0, 400)
  return token.text || normalize(html)
}

/**
 * md → blocks
 * @returns {{ type:string, html:string, text:string, depth:number|null, h:string }[]}
 */
/**
 * 中文里的区间写成 `2007~2018`，两个落单的波浪号会被 GFM 配成删除线（<del>）。
 * 先把落单的 `~` 转义掉；代码块、行内代码里的不动。
 */
const CODE_SPLIT = /(```[\s\S]*?```|`[^`\n]*`)/
function escapeTilde(md) {
  if (!md || !md.includes('~')) return md
  return md
    .split(CODE_SPLIT)
    .map((seg, i) => (i % 2 === 1 ? seg : seg.replace(/(^|[^~\\])~(?!~)/g, '$1\\~')))
    .join('')
}

export function toBlocks(md, layer) {
  const tokens = marked.lexer(escapeTilde(md) || '')
  const blocks = []
  const seen = new Map()
  for (const tk of tokens) {
    if (tk.type === 'space') continue
    const html = marked.parser([tk])
    const text = visibleText(tk, html)
    const base = hashOf(layer, text)
    const n = (seen.get(base) || 0) + 1
    seen.set(base, n)
    blocks.push({
      type: tk.type === 'eqBlock' ? 'math' : tk.type,
      depth: tk.depth ?? null,
      html,
      text: text.slice(0, 2000),
      h: n > 1 ? `${base}#${n}` : base,
    })
  }
  return blocks
}

/**
 * 双栏对齐：先按哈希精确配对，剩余按「同类型 + 就近」顺序补配。
 * 配不上的右侧留空（前端画虚线）。
 */
export function align(left, right) {
  const byHash = new Map()
  right.forEach((b, i) => {
    if (!byHash.has(b.h)) byHash.set(b.h, i)
  })
  const used = new Set()
  const rows = []
  let cursor = 0

  for (const lb of left) {
    const hit = byHash.get(lb.h)
    if (hit !== undefined && !used.has(hit)) {
      used.add(hit)
      rows.push({ ...lb, rh: right[hit].h, right: right[hit].html })
      continue
    }
    // 就近找同类型未使用的块
    let found = -1
    for (let j = Math.max(cursor, 0); j < right.length; j++) {
      if (!used.has(j) && right[j].type === lb.type) {
        found = j
        break
      }
    }
    if (found >= 0) {
      used.add(found)
      cursor = found + 1
      rows.push({ ...lb, rh: right[found].h, right: right[found].html })
    } else {
      rows.push({ ...lb, rh: null, right: null })
    }
  }
  return rows
}

/** 简易 CSS 作用域：把选择器都挂到 scope 下，@media 递归处理 */
export function scopeCss(css, scope) {
  const prefixSel = (sel) =>
    sel
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s.startsWith(scope) ? s : `${scope} ${s}`))
      .join(', ')

  const walk = (src) => {
    const out = []
    let i = 0
    while (i < src.length) {
      const brace = src.indexOf('{', i)
      if (brace === -1) {
        out.push(src.slice(i))
        break
      }
      const prelude = src.slice(i, brace).trim()
      let depth = 1
      let j = brace + 1
      while (j < src.length && depth > 0) {
        if (src[j] === '{') depth++
        else if (src[j] === '}') depth--
        j++
      }
      const body = src.slice(brace + 1, j - 1)
      if (!prelude) {
        out.push(body)
      } else if (prelude.startsWith('@')) {
        if (/^@(media|supports|layer|container)/i.test(prelude)) {
          out.push(`${prelude}{${walk(body)}}`)
        } else {
          out.push(`${prelude}{${body}}`)
        }
      } else {
        out.push(`${prefixSel(prelude)}{${body}}`)
      }
      i = j
    }
    return out.join('\n')
  }
  return walk(css)
}

/** 术语 / 图片路径重写：img/a.png → ./media/<id>/a.png */
export function rewriteMedia(html, id) {
  return (
    html
      .replace(
        /(<(?:img|source|video|audio)\b[^>]*?\b(?:src|poster)=")(?!https?:|data:|\/|\.\/media|#)([^"]+)"/g,
        (_m, head, src) => `${head}./media/${id}/${src.replace(/^\.\//, '')}"`,
      )
      // 图片异步解码：翻页时别把大图解码塞在主线程上。
      // 不设 loading="lazy"——列布局里未加载的图宽高算成 0，分页会把它当空块，翻到了也看不见。
      .replace(/<img\b(?![^>]*\bdecoding=)/g, '<img decoding="async"')
  )
}

export { normalize }
