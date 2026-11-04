/**
 * 批注引擎：锚定 → Range → CSS Custom Highlight API 绘制。
 *
 * - 不往正文里插包裹 span（正文 DOM 只读；有想法的「注」上标也不再用）
 * - 不用字符数估长、不用绝对定位长线：Wavy/直线/底色全部由
 *   `::highlight(mk-*)` 伪元素对着 Range 画，长度天然等于文字宽度
 * - 锚定可序列化：块哈希（主键里）+ 精选短语（quote）+ 前后文（ac）+ 第 n 处（n），
 *   正文改动后仍能重新定位（director resolve() 兜底 + 本文件逐条尝试）
 */
import type { AnnItem, MarkKind, Row } from './types'

/* ------------------------------ 能力检测 ------------------------------ */

export const highlightOK =
  typeof window !== 'undefined' &&
  typeof (window as any).Highlight !== 'undefined' &&
  typeof CSS !== 'undefined' &&
  !!CSS.highlights &&
  typeof CSS.highlights.set === 'function' &&
  typeof CSS.highlights.delete === 'function'

/* ------------------------------ 小工具 ------------------------------ */

/** 中文没有空格：归一化只去空白，别的都不动 */
const norm = (t: string) => String(t || '').replace(/\s+/g, '')

/** 在标点处收短（老数据、正文改过时的兜底用，不再用来决定画多长） */
function snipAt(q: string, max: number) {
  if (q.length <= max) return q
  const m = new RegExp(`^[\\s\\S]{6,${max}}?[。；，、！？.,!?:：》」』）)]`).exec(q)
  return (m ? m[0] : q.slice(0, max)) || q
}

/**
 * 一段引文的候选，由长到短：先用整句去认，认不出再逐步收短。
 * 划多长由用户选多大决定（以前一律砍到 22 字，选一大段只画得出一个短语）。
 */
export function quoteCandidates(quote: string): string[] {
  const q = norm(quote)
  if (!q) return []
  const out = [q]
  for (const max of [120, 60, 30, 16]) {
    const s = snipAt(q, max)
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

/** 兼容旧调用：最短的那个候选 */
export function trimMark(quote: string) {
  const c = quoteCandidates(quote)
  return c.length ? c[c.length - 1] : ''
}

/** 把样式名变成合法的 Custom Highlight 名（mk-<kind>） */
export function hlNameOf(mark: MarkKind): string {
  switch (mark) {
    case 'wave':
    case 'wave-green':
    case 'wave-pink':
    case 'wave-purple':
      return `mk-${mark}`
    case 'wave2':
      return 'mk-wave' // 旧数据：橙波浪按蓝波画
    case 'dash':
      return 'mk-dash' // 虚线（也是「有想法」的记号）
    default:
      return `mk-${mark}`
  }
}

/* ------------------------------ 文字拍平 ------------------------------ */

interface Flat {
  text: string
  /** 第 i 个字符落在哪个 Text 的第几偏移 */
  pos: { node: Text; off: number }[]
}

/** 把一个容器的可见文字拍平（跨多个 text node 也无所谓） */
function flatten(el: Element): Flat {
  const out: string[] = []
  const pos: { node: Text; off: number }[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const data = node.data
    for (let i = 0; i < data.length; i++) {
      const ch = data[i]
      if (/\s/.test(ch)) continue // 换行/缩进不参与匹配
      out.push(ch)
      pos.push({ node, off: i })
    }
  }
  return { text: out.join(''), pos }
}

/* ------------------------------ 锚定 ------------------------------ */

/**
 * 在拍平文字里找 quote：
 * - 先按「前文 ac.b + 第 n 处」挑候选
 * - 快速路径：唯一出现且无歧义时直接用
 * 返回 [起, 止) 的字符下标（拍平后的）。
 */
function locate(flat: { text: string }, q: string, b: string, a: string, n: number): [number, number] | null {
  if (q.length < 1) return null
  const hits: number[] = []
  let from = 0
  for (;;) {
    const i = flat.text.indexOf(q, from)
    if (i < 0) break
    hits.push(i)
    from = i + 1
    if (hits.length > 99) break
  }
  if (!hits.length) return null
  if (hits.length === 1) return [hits[0], hits[0] + q.length]
  // 有重复：先用前后文圈定
  if (b || a) {
    const ctx = hits.filter((i) => {
      const before = flat.text.slice(Math.max(0, i - b.length), i)
      const after = flat.text.slice(i + q.length, i + q.length + a.length)
      return (!b || before.endsWith(b)) && (!a || after.startsWith(a))
    })
    if (ctx.length) {
      const pick = ctx[Math.min(n, ctx.length - 1)]
      return [pick, pick + q.length]
    }
  }
  return [hits[Math.min(n, hits.length - 1)], hits[Math.min(n, hits.length - 1)] + q.length]
}

/** 把批注在块里定位到字符区间（拍平后的 [起, 止)）；找不到返回 null */
export function locatedIn(
  rowEl: HTMLElement | null,
  layer: 'index' | 'zh',
  ann: { quote?: string; n?: number; ac?: { b?: string; a?: string } },
): { flat: Flat; start: number; end: number } | null {
  if (!rowEl) return null
  const md = rowEl.querySelector(layer === 'zh' ? '.cell--ref .md' : '.cell--doc .md')
  if (!md) return null
  const flat = flatten(md)
  if (!flat.text) return null
  const b = ann.ac?.b || ''
  const a = ann.ac?.a || ''
  const full = norm(ann.quote || '')
  for (const cand of quoteCandidates(ann.quote || '')) {
    // 收短过的候选只剩「前文」还对得上，后文肯定接不上
    const after = cand === full ? a : ''
    const s = locate(flat, cand, b, after, ann.n || 0)
    if (s) return { flat, start: s[0], end: s[1] }
  }
  return null
}

/** 拍平区间 → 真的 Range */
function rangeOfFlat(flat: Flat, start: number, end: number): Range | null {
  if (!flat.pos[start] || !flat.pos[end - 1]) return null
  const range = document.createRange()
  const a1 = flat.pos[start]
  const b1 = flat.pos[end - 1]
  try {
    range.setStart(a1.node, a1.off)
    range.setEnd(b1.node, b1.off + 1)
  } catch {
    return null
  }
  return range.collapsed ? null : range
}

/** 逐条把批注换回一个 live Range（找不到返回 null，调用方跳过并按 lost 记账） */
export function rangeForRow(
  rowEl: HTMLElement | null,
  layer: 'index' | 'zh',
  ann: { quote?: string; n?: number; ac?: { b?: string; a?: string } },
): Range | null {
  const hit = locatedIn(rowEl, layer, ann)
  return hit ? rangeOfFlat(hit.flat, hit.start, hit.end) : null
}

/** 这条批注在块里的字符区间（用来判「是不是同一条」/ 看重叠） */
export function charRangeOf(
  rowEl: HTMLElement | null,
  layer: 'index' | 'zh',
  ann: { quote?: string; n?: number; ac?: { b?: string; a?: string } },
): [number, number] | null {
  const hit = locatedIn(rowEl, layer, ann)
  return hit ? [hit.start, hit.end] : null
}

/* ------------------------------ 绘制 ------------------------------ */

/** 一条批注要画的东西 */
export interface PaintRec {
  key: string
  rowIndex: number
  layer: 'index' | 'zh'
  mark?: MarkKind
  quote?: string
  n?: number
  ac?: { b?: string; a?: string }
  /** 有想法（text 非空）→ 额外画一条虚线，一眼看得出哪句写过东西 */
  text?: string
}

/**
 * 全量重画：按样式分组，一种样式一个 Highlight（可含多个 Range）。
 * - 记号（marker / wave / line / dash）按 `mark` 上色
 * - 有想法的句子另外加一条虚线（和 mark 共存，两个 Highlight 组叠着画）
 * 返回成功画上的条数。
 */
export function paint(root: HTMLElement | null, records: PaintRec[], rows: Row[]): number {
  if (!highlightOK) return 0
  const registry = CSS.highlights as Map<string, any>
  // 旧的组全部撤掉重建，避免残留死 Range
  for (const name of Array.from(registry.keys())) if (name.startsWith('mk-')) registry.delete(name)
  const byKind = new Map<string, any[]>()
  const push = (name: string, range: Range) => {
    const list = byKind.get(name) || []
    list.push(range)
    byKind.set(name, list)
  }
  let painted = 0
  for (const rec of records) {
    const rowEl = root?.querySelectorAll<HTMLElement>('.row')[rec.rowIndex] ?? null
    const range = rangeForRow(rowEl, rec.layer, rec)
    if (!range) continue
    const hasNote = (rec.text || '').trim().length > 0
    const markName = rec.mark ? hlNameOf(rec.mark) : ''
    if (hasNote) {
      // 写过想法：句子下面一定有线。
      // text-decoration 一个元素只能有一套，所以：
      //   马克笔 + 线 → 底色 + 虚线（属性不冲突，叠着好看）
      //   波浪 → 留波浪（用户自己选的，比虚线好认）
      //   直线 / 虚线 / 没记号 → 统一画虚线（旧数据的纯想法存的就是 line）
      if (markName.startsWith('mk-wave')) push(markName, range)
      else {
        if (markName.startsWith('mk-hl') || markName === 'mk-highlight') push(markName, range)
        push('mk-dash', range)
      }
    } else if (markName) {
      push(markName, range)
    }
    painted++
  }
  for (const [name, ranges] of byKind) {
    try {
      const hl = new (window as any).Highlight(...ranges)
      CSS.highlights.set(name, hl)
    } catch {
      /* 单组失败不影响其它组 */
    }
  }
  void rows // 行序校验交给调用方；此处仅签名对齐
  return painted
}

/** 全部撤掉（换文档/组件卸载时用） */
export function unpaint() {
  if (!highlightOK) return
  const registry = CSS.highlights as Map<string, any>
  for (const name of Array.from(registry.keys())) if (name.startsWith('mk-')) registry.delete(name)
}

/* ------------------------------ 选区 → 锚点 ------------------------------ */

export interface SelAnchor {
  layer: 'index' | 'zh'
  index: number
  rowEl: HTMLElement
  range: Range
  rect: DOMRect
  /** 选中的原文（复制 / 写想法的引文用） */
  raw: string
  /** 存进数据的引文：就是用户选的那一整句，不再砍短 */
  quote: string
  /** 选区在这块拍平串里的 [起, 止)（-1 = 算不出来） */
  start: number
  end: number
  /** 锚定：前文 / 后文 / 第 n 处 */
  b: string
  a: string
  n: number
}

/**
 * 从当前 Selection 读出一个可落笔的锚点。
 * 不在正文内的选区返回 null。
 */
export function selectionAnchor(root: HTMLElement | null): SelAnchor | null {
  const s = typeof window !== 'undefined' ? window.getSelection() : null
  if (!s || s.isCollapsed || s.rangeCount === 0) return null
  return selectionAnchorFromRange(root, s.getRangeAt(0))
}

/** 和 selectionAnchor 同一套锚定，但范围由调用方给（自定义拖选 / 预览） */
export function selectionAnchorFromRange(root: HTMLElement | null, range: Range): SelAnchor | null {
  if (!range || range.collapsed) return null
  const raw = range.toString().replace(/\s+/g, ' ').trim()
  if (!raw) return null
  const node = range.startContainer
  const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement)
  const rowEl = el?.closest('.row') as HTMLElement | null
  if (!rowEl || !root?.contains(rowEl)) return null
  const cellZh = el?.closest('.cell--ref')
  const layer: 'index' | 'zh' = cellZh ? 'zh' : 'index'
  const md = rowEl.querySelector(layer === 'zh' ? '.cell--ref .md' : '.cell--doc .md')
  if (!md || !md.contains(el!)) return null
  const endNode = range.endContainer
  const endEl = endNode.nodeType === 3 ? endNode.parentElement : (endNode as HTMLElement)
  if (!endEl || endEl.closest('.row') !== rowEl || !md.contains(endEl)) return null
  const rows = Array.from(root.querySelectorAll('.row'))
  const index = rows.indexOf(rowEl)
  if (index < 0) return null

  const flat = flatten(md)
  // 前后文：从选区两端对应的拍平下标往外取
  let b = ''
  let a = ''
  let n = 0
  let start = -1
  let end = -1
  {
    const q0 = norm(raw)
    // 选区起点在拍平串里的下标
    const startOff = countFlatOffset(flat, range.startContainer, range.startOffset)
    const endOff = countFlatOffset(flat, range.endContainer, range.endOffset)
    if (startOff >= 0 && endOff > startOff) {
      start = startOff
      end = endOff
      b = flat.text.slice(Math.max(0, startOff - 12), startOff)
      a = flat.text.slice(endOff, endOff + 12)
      // 第几处：整句在这一块里此前出现过几次
      let from = 0
      let c = 0
      for (;;) {
        const i = flat.text.indexOf(q0, from)
        if (i < 0 || i >= startOff) break
        from = i + 1
        c++
      }
      n = c
    }
  }
  const quote = raw
  const rects = range.getClientRects()
  let rect: DOMRect = range.getBoundingClientRect()
  if ((!rect.width && !rect.height) && rects.length) rect = rects[0] as DOMRect
  return { layer, index, rowEl, range, rect, raw, quote, start, end, b, a, n }
}

/** 选区落在哪一栏（对照模式下左右两栏不能串） */
function colKind(node: Node | null): 'index' | 'zh' | null {
  if (!node) return null
  const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement)
  if (!el) return null
  if (el.closest('.cell--ref')) return 'zh'
  if (el.closest('.cell--doc')) return 'index'
  return null
}

/**
 * 一个选区 → 每个块一个锚点。
 * 一段一块，所以拖选跨段时得拆成多条（每条只管自己那一块）。
 */
export function selectionSegments(root: HTMLElement | null, range: Range): SelAnchor[] {
  if (!root || !range || range.collapsed) return []
  const kindStart = colKind(range.startContainer)
  const kindEnd = colKind(range.endContainer)
  if (!kindStart || kindStart !== kindEnd) return []

  const rows = Array.from(root.querySelectorAll('.row')) as HTMLElement[]
  const out: SelAnchor[] = []
  for (const rowEl of rows) {
    const md = rowEl.querySelector(kindStart === 'zh' ? '.cell--ref .md' : '.cell--doc .md')
    if (!md || !range.intersectsNode(md)) continue
    // 选区和这一块的 .md 求交，得到一个落在这块里的子选区
    const s = later({ c: range.startContainer, o: range.startOffset }, { c: md, o: 0 })
    const e = earlier({ c: range.endContainer, o: range.endOffset }, { c: md, o: md.childNodes.length })
    const sub = document.createRange()
    try {
      sub.setStart(s.c, s.o)
      sub.setEnd(e.c, e.o)
    } catch {
      continue
    }
    if (sub.collapsed || !sub.toString().trim()) continue
    const anchor = selectionAnchorFromRange(root, sub)
    if (anchor) out.push(anchor)
  }
  return out
}

/** 两个边界点里靠后的那个 */
function later(x: { c: Node; o: number }, y: { c: Node; o: number }) {
  const r1 = document.createRange()
  const r2 = document.createRange()
  try {
    r1.setStart(x.c, x.o)
    r1.collapse(true)
    r2.setStart(y.c, y.o)
    r2.collapse(true)
    return r1.compareBoundaryPoints(Range.START_TO_START, r2) >= 0 ? x : y
  } catch {
    return x
  }
}

/** 两个边界点里靠前的那个 */
function earlier(x: { c: Node; o: number }, y: { c: Node; o: number }) {
  const r1 = document.createRange()
  const r2 = document.createRange()
  try {
    r1.setStart(x.c, x.o)
    r1.collapse(true)
    r2.setStart(y.c, y.o)
    r2.collapse(true)
    return r1.compareBoundaryPoints(Range.START_TO_START, r2) <= 0 ? x : y
  } catch {
    return x
  }
}

/** 某个 (node, offset) 边界落在拍平串里的第几字；不在这块里返回 -1 */
function countFlatOffset(flat: Flat, node: Node, off: number): number {
  // pos 按文档序排列：第一个「属于该 node 且字符偏移 ≥ off」的下标，
  // 恰好就是该边界前累计的拍平字符数
  let last = -1
  for (let i = 0; i < flat.pos.length; i++) {
    const p = flat.pos[i]
    if (p.node !== node) continue
    last = i
    if (p.off >= off) return i
  }
  // 边界在该节点末尾之后：回到最后一个字符的下一个位置
  return last >= 0 ? last + 1 : -1
}

/* ------------------------------ 点划线命中 ------------------------------ */

/**
 * 点正文时判断有没有点到划线：拿每条批注的 Range 的矩形做命中测试
 * （x 贴左右各 2px，y 往下多让 14px，虚线/波浪线画在基线下）。
 * 几条叠在一起时，挑**范围最小**的那条（用户指的就是那一小句）；
 * 一样小就比谁后画。
 */
export function hitTest(root: HTMLElement | null, records: PaintRec[], x: number, y: number): string | null {
  if (!root) return null
  const rowEls = root.querySelectorAll('.row')
  let best: { key: string; w: number; i: number } | null = null
  records.forEach((rec, i) => {
    const rowEl = rowEls[rec.rowIndex] as HTMLElement | undefined
    const range = rangeForRow(rowEl, rec.layer, rec)
    if (!range) return
    for (const r of range.getClientRects()) {
      if (!(x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 14)) continue
      if (!best || r.width < best.w - 0.5 || (Math.abs(r.width - best.w) <= 0.5 && i > best.i)) {
        best = { key: rec.key, w: r.width, i }
      }
    }
  })
  return best ? (best as { key: string }).key : null
}
