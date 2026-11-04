<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import DocRows from '../components/DocRows.vue'
import OutlinePane from '../components/OutlinePane.vue'
import NotesPane from '../components/NotesPane.vue'
import SettingsPanel from '../components/SettingsPanel.vue'
import NoteEditor from '../components/NoteEditor.vue'
import Sheet from '../components/sheet/Sheet.vue'
import TypeSheet from '../components/sheet/TypeSheet.vue'
import ThemeSheet from '../components/sheet/ThemeSheet.vue'
import ProgressSheet from '../components/sheet/ProgressSheet.vue'
import AnnotationToolbar from '../components/AnnotationToolbar.vue'
import { isHl, waveOf, TINTS } from '../lib/types'
import {
  charRangeOf,
  highlightOK,
  hitTest,
  paint,
  rangeForRow,
  selectionSegments,
  unpaint,
  type SelAnchor,
} from '../lib/annotator'
import { fetchArticle, fetchIndex } from '../lib/api'
import { ann, detect, loadAnnotations, resolve, saveAnnotation } from '../lib/annotations'
import { layout, normalizeMode, RATIOS, type Mode } from '../lib/layout'
import { goShelf } from '../lib/router'
import { isStarred, progressOf, setProgress, toggleStar, touchRecent } from '../lib/progress'
import { minutesOf, startClock, stopClock } from '../lib/reading-time'
import type { Article, MarkKind, SiteIndex } from '../lib/types'
const props = defineProps<{ id: string }>()

type Panel = '' | 'tree' | 'notes' | 'settings' | 'progress' | 'theme' | 'type' | 'more'

const index = ref<SiteIndex | null>(null)
const article = ref<Article | null>(null)
const loading = ref(true)
const error = ref('')
const query = ref('')
const catFilter = ref('')
const panel = ref<Panel>('')
const pct = ref(0)
const page = ref(0)
const pages = ref(1)
const vw = ref(window.innerWidth)
const toast = ref('')
const activeH = ref('')
const zoom = ref<string | null>(null)
const pageBody = ref<HTMLElement | null>(null)
/** 选中区 / 已有划线上方的那条小工具条（两行：色点 + 动作） */
const bar = ref<null | {
  x: number
  y: number
  mode: 'new' | 'edit'
  key?: string
  layer?: 'index' | 'zh'
  index?: number
  h?: string
  /** 选区上方放不下时，工具条落到文字下方，尾巴朝上 */
  below?: boolean
}>(null)
const idle = ref(false)
const starred = ref(false)
/** 手机上顶栏和底栏是一体的：点正文收起，再点出来 */
const chromeOn = ref(true)
let tocIO: IntersectionObserver | null = null

const editor = reactive({
  open: false,
  x: 0,
  y: 0,
  layer: 'index' as 'index' | 'zh',
  key: '',
  quote: '',
  initial: '',
  selH: 26,
})

let indexCache: SiteIndex | null = null
let styleEl: HTMLLinkElement | null = null
let extCssEl: HTMLLinkElement | null = null
let toastTimer: number | undefined
let measureRaf = 0
let panelTimer: number | undefined
let idleTimer: number | undefined

const cats = computed(() =>
  (index.value?.cats || [])
    .map((c) => ({ ...c, depth: Math.max(0, c.path.length - 1) }))
    .sort((a, b) => a.path.join('/').localeCompare(b.path.join('/'), 'zh')),
)

/** 阅读面排法：窄屏一律单栏；没有 zh.md 时不能停在对照上 */
const narrow = computed(() => vw.value < 1024)
/** 手机（< 700px）走自己那一套：浮层顶栏 + 五个图标的底栏 + 底部抽屉 */
const isPhone = computed(() => vw.value < 700)
const mode = computed<Mode>(() => {
  if (layout.mode === 'compare' && article.value?.hasZh) return 'compare'
  if (layout.mode === 'spread' && !narrow.value) return 'spread'
  return 'single'
})
const spread = computed(() => mode.value === 'spread')
const paired = computed(() => mode.value === 'compare')
/** 按页翻：对开是两栏一页，手机是一栏一页（都是同一套 translateX） */
const paged = computed(() => spread.value || isPhone.value)
/** 一页里几栏 */
const perPage = computed(() => (spread.value ? 2 : 1))

const filtered = computed(() => {
  const all = index.value?.articles || []
  const q = query.value.trim().toLowerCase()
  return all.filter((a) => {
    if (catFilter.value && !(a.cats.includes(catFilter.value) || a.cats.join('/').startsWith(catFilter.value)))
      return false
    if (!q) return true
    return [a.title, a.slug, ...a.cats, ...(a.keywords || [])].join(' ').toLowerCase().includes(q)
  })
})

const rowCols = computed(() => {
  if (!paired.value) return 'minmax(0,1fr)'
  const [a, b] = RATIOS[layout.ratio]
  return `minmax(0,${a}fr) minmax(0,${b}fr)`
})

const visibleRows = computed(() => {
  const rows = article.value?.rows || []
  // 正文自带的 H1 与页头标题重复，去掉第一个
  const i = rows.findIndex((r) => r.type === 'heading' && r.depth === 1)
  return i === 0 ? rows.slice(1) : rows
})

const resolved = computed(() => {
  const a = article.value
  if (!a) return { map: {}, lost: [] as { key: string; item: any }[] }
  // 用 visibleRows 算：正文那个 H1 被去掉了，行号必须和 DocRows 用的一套
  return resolve({ ...a, rows: visibleRows.value }, ann.items)
})
const seqOfKey = (key: string) => {
  const m = /#(\d+)$/.exec(key)
  return m ? Number(m[1]) : 1
}

const allAnns = computed(() =>
  Object.values(resolved.value.map).sort(
    (a, b) => a.rowIndex - b.rowIndex || seqOfKey(a.key) - seqOfKey(b.key),
  ),
)
/** 面板里只列「批注」（有想法）；纯划线不上榜 */
const annList = computed(() => allAnns.value.filter((a) => (a.text || '').trim()))
const markOnlyCount = computed(() => allAnns.value.length - annList.value.length)

/** 这本书读了多久（分钟） */
const minutes = computed(() => minutesOf(props.id))

/** 页眉：当前小节（没有小节时退回分类） */
const sectionText = computed(() => {
  const t = article.value?.toc.find((x) => x.h === activeH.value)?.text
  return t || article.value?.cats.join(' / ') || ''
})

/* ------------------------------ 读数 ------------------------------ */

const totalPages = computed(() => Math.max(1, pages.value * 2))
const leftPage = computed(() => page.value * 2 + 1)
const rightPage = computed(() => Math.min(page.value * 2 + 2, totalPages.value))

/* ------------------------------ 分页（对开） ------------------------------ */

const rowsEl = () => pageBody.value?.querySelector<HTMLElement>('.rows') || null
const gapOf = (el: HTMLElement) => parseFloat(getComputedStyle(el).columnGap || '0') || 0

/** 整块平移两栏，等于翻一页。偏移量 = 页宽 + 栏间距 */
function applyShift(p: number) {
  const el = rowsEl()
  if (!el) return
  const dx = p * (el.clientWidth + gapOf(el))
  el.style.transform = dx > 0 ? `translateX(${-dx}px)` : ''
}

function colOf(row: HTMLElement, el: HTMLElement) {
  const gap = gapOf(el)
  const per = perPage.value
  const colW = Math.max(1, (el.clientWidth - gap * (per - 1)) / per)
  const dx = row.getBoundingClientRect().left - el.getBoundingClientRect().left
  return Math.round(dx / (colW + gap))
}

function measure() {
  const el = rowsEl()
  if (!el) return
  // 抽屉贴在纸的右边缘：记下纸到视口右边的距离（单栏滚动时也要对得上）
  const pageEl = pageBody.value?.closest('.page') as HTMLElement | null
  if (pageEl) {
    const right = Math.max(0, window.innerWidth - pageEl.getBoundingClientRect().right)
    pageEl.style.setProperty('--page-right', `${right}px`)
  }
  if (!paged.value) {
    pages.value = 1
    page.value = 0
    el.style.transform = ''
    return
  }
  // 比一栏还高的块（长表、长代码）只能允许跨栏断开，否则会被裁掉
  const limit = el.clientHeight - 6
  el.querySelectorAll<HTMLElement>('.row').forEach((r) => {
    r.classList.toggle('row--tall', r.offsetHeight > limit)
  })
  const gap = gapOf(el)
  const cols = Math.max(1, Math.round((el.scrollWidth + gap) / (el.clientWidth + gap)))
  const total = Math.max(1, Math.ceil(cols / perPage.value))
  pages.value = total
  page.value = Math.min(page.value, total - 1)
  applyShift(page.value)
  activeH.value = headingAtPage(page.value) || activeH.value
  syncPct()
}

function scheduleMeasure() {
  cancelAnimationFrame(measureRaf)
  measureRaf = requestAnimationFrame(measure)
}

function headingAtPage(p: number) {
  const el = rowsEl()
  if (!el) return ''
  let best = ''
  el.querySelectorAll<HTMLElement>('.row--heading').forEach((r) => {
    if (Math.floor(colOf(r, el) / perPage.value) <= p) best = r.dataset.bh || best
  })
  return best
}

function syncPct() {
  if (paged.value) pct.value = pages.value > 1 ? (page.value + 1) / pages.value : 1
  if (article.value) setProgress(article.value.id, pct.value)
}

function turn(d: number) {
  if (!paged.value) {
    window.scrollBy({ top: d * window.innerHeight * 0.82, behavior: 'smooth' })
    return
  }
  const p = Math.max(0, Math.min(pages.value - 1, page.value + d))
  if (p === page.value) return
  page.value = p
  applyShift(p)
  syncPct()
  activeH.value = headingAtPage(p) || activeH.value
  bar.value = null
  selInfo.value = null
  clearPreview()
}

function turnTo(p: number) {
  page.value = Math.max(0, Math.min(pages.value - 1, p))
  applyShift(page.value)
  syncPct()
}

function jump(h: string) {
  if (isPhone.value && panel.value === 'tree') panel.value = ''
  if (paged.value) {
    const el = rowsEl()
    const row = document.getElementById(`b-${h}`)
    if (el && row) {
      turnTo(Math.floor(colOf(row, el) / perPage.value))
      activeH.value = h
      return
    }
  }
  document.getElementById(`b-${h}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/* ------------------------------ 数据 ------------------------------ */

function showToast(msg: string) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = ''), 2200)
}

async function applyAssets(a: Article, idx: SiteIndex) {
  styleEl?.remove()
  styleEl = null
  if (a.hasStyle) {
    const l = document.createElement('link')
    l.rel = 'stylesheet'
    l.href = `./data/style-${a.id}.css`
    document.head.appendChild(l)
    styleEl = l
  }
  if (!extCssEl && idx.ext?.css) {
    const l = document.createElement('link')
    l.rel = 'stylesheet'
    l.href = './data/ext.css'
    document.head.appendChild(l)
    extCssEl = l
  }
  const load = async (url: string) => {
    try {
      await import(/* @vite-ignore */ url)
    } catch (e) {
      console.warn('[duiye] 扩展脚本加载失败', url, e)
    }
  }
  for (const rel of idx.ext?.js || []) {
    await load(new URL(rel, location.href).href)
  }
  if (a.hasScript) {
    await load(new URL(`./data/script-${a.id}.js`, location.href).href)
  }
  ;(window as any).__duiye = { article: a, layout, annotations: ann, open: (id: string) => (location.hash = `#/p/${id}`) }
}

async function load(id: string) {
  loading.value = true
  error.value = ''
  page.value = 0
  try {
    if (!indexCache) indexCache = await fetchIndex()
    index.value = indexCache
    const a = await fetchArticle(id)
    article.value = a
    starred.value = isStarred(a.id)
    normalizeMode(a.hasZh)
    touchRecent(a.id)
    document.title = `${a.title} · ${index.value.site.title}`
    await applyAssets(a, indexCache)
    ann.checked = false
    const online = await detect()
    if (online) await loadAnnotations(id)
  } catch (e) {
    error.value = String((e as Error).message || e)
  } finally {
    loading.value = false
  }
}

function bindImages() {
  pageBody.value?.querySelectorAll('img').forEach((img) => {
    if ((img as any).__bound) return
    ;(img as any).__bound = true
    img.addEventListener('load', scheduleMeasure)
  })
}

/** 排版重算之后，把进度找回来（saved 由调用方在 measure() 之前先记下） */
function restoreProgress(saved = progressOf(props.id)) {
  if (paged.value) {
    if (pages.value > 1 && saved > 0) turnTo(Math.round(saved * pages.value) - 1)
    else syncPct()
    return
  }
  if (saved > 0.04 && saved < 0.96) {
    const h = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: saved * h })
  }
}

async function afterLoad() {
  await nextTick()
  bindImages()
  // 先记下存着的进度：measure() 里的 syncPct() 会按当前页重写它，
  // 以前先 measure 再 restore，等于把进度清零了（刷新后总是回到第一页）
  const saved = progressOf(props.id)
  measure()
  restoreProgress(saved)
  setupTocObserver()
  document.fonts?.ready.then(scheduleMeasure)
  paintAll()
  if (!highlightOK) showToast('此浏览器不支持批注高亮 API，划线功能不可用')
}

/* ------------------------------ 批注 ------------------------------ */

/** 整段批注只圈一句：句号内截断，最长 80 字，避免整块都被划线 */
function excerpt(text: string) {
  const t = String(text || '').trim().replace(/\s+/g, ' ')
  const m = /^.{4,80}?[。！？.!?]/.exec(t)
  return (m ? m[0] : t.slice(0, 60)).trim()
}

function openEditor(payload: {
  row: any
  layer: 'index' | 'zh'
  index: number
  x: number
  y: number
  key?: string
  quote?: string
  selH?: number
}) {
  const h = payload.layer === 'index' ? payload.row.h : payload.row.rh
  if (!h) return
  // 没有指定 key = 新建一条；同一块的第 2、3 条带 #2 #3 后缀，互不覆盖
  const key = payload.key || nextKey(payload.layer, h)
  editor.open = true
  editor.layer = payload.layer
  editor.key = key
  editor.quote = payload.quote || ann.items[key]?.quote || excerpt(payload.row.text) || ''
  editor.initial = ann.items[key]?.text || ''
  editor.x = payload.x
  editor.y = payload.y
  editor.selH = payload.selH || 26
}

/** 主键：第一条不带后缀，第二条起 `#2` `#3` */
function keyOf(layer: 'index' | 'zh', h: string, n: number) {
  return `${layer}::${h}${n > 1 ? `#${n}` : ''}`
}

function nextKey(layer: 'index' | 'zh', h: string) {
  let n = 1
  while (ann.items[keyOf(layer, h, n)]) n++
  return keyOf(layer, h, n)
}

async function onSave(text: string) {
  if (!article.value || !editor.key) return
  const prev = ann.items[editor.key]
  const body = text.trim()
  // 本来只是划线、又没写东西 = 删掉这条划线；有想法时清空 = 只删想法、留下划线
  const drop = !body && !(prev?.text || '').trim()
  const ok = await saveAnnotation(article.value.id, {
    key: editor.key,
    layer: editor.layer,
    quote: drop ? '' : editor.quote.slice(0, 2000),
    text: body,
    mark: drop ? undefined : prev?.mark,
  })
  editor.open = false
  showToast(ok ? (drop ? '已取消划线' : '已保存') : '服务没启动，已存入草稿箱')
}

/** 点正文里的划线：由 onDocDown 的命中测试接手（editMarkAt），不再由 DocRows 发事件 */

/** 从批注面板里改某一条的正文 */
function editNote(key: string) {
  const item = ann.items[key]
  const rows = visibleRows.value
  const layer = key.startsWith('zh') ? 'zh' : 'index'
  const h = key.split('::')[1]?.split('#')[0] || ''
  const row = rows.find((r) => (layer === 'index' ? r.h : r.rh) === h)
  if (!row) return
  if (isPhone.value) panel.value = ''
  openEditor({
    row,
    layer,
    index: rows.indexOf(row),
    x: window.innerWidth / 2,
    y: window.innerHeight / 3,
    key,
    quote: item?.quote || '',
  })
}

/** 编辑器标题：没写过就是「写想法」，已有内容就是「修改想法」 */
const editorLabel = computed(() => {
  const item = ann.items[editor.key]
  const base = editor.layer === 'zh' ? '想法 · 对照' : '想法'
  return item?.text ? base.replace('想法', '修改想法') : base.replace('想法', '写想法')
})
/** 卡里那块原文引用：太长就收短（只影响显示，存的是全的） */
const editorQuote = computed(() => {
  const q = String(editor.quote || '').replace(/\s+/g, ' ').trim()
  return q.length > 180 ? `${q.slice(0, 180)}…` : q
})
const editorHasSomething = computed(() => {
  const item = ann.items[editor.key]
  return Boolean(item && (item.text || item.mark))
})

async function removeCurrent() {
  if (!editor.key) return
  await removeNote(editor.key)
  editor.open = false
}

async function removeNote(key: string) {
  if (!article.value) return
  await removeKeys([key, ...duplicatesOf(key)], true)
  showToast('已删除这条批注')
}

/* ------------------------------ 批注引擎（Custom Highlight API） ------------------------------ */

/**
 * 画法全在 annotator.ts 里：按条锚点（块哈希 + 短语 + 前后文 + 第 n 处）
 * 换成 live Range，注册进 CSS.highlights，由 ::highlight(mk-*) 上色。
 * 正文 DOM 不再插入任何标记节点。
 */

/** 工具条半宽（左右夹在纸面的可用区间里） */
const barHalf = () => (vw.value < 520 ? 152 : 176)

/** 当前选中的锚点（第一块；工具条位置 / 复制用） */
const selInfo = ref<SelAnchor | null>(null)
/** 这次选区涉及的每一块（拖选跨段时会有多条；一段一条） */
let selSegs: SelAnchor[] = []

/** 全量重画（rows / 批注 / 版式一变就跑） */
function paintAll() {
  const list = Object.values(resolved.value.map).map((r) => ({
    key: r.key,
    rowIndex: r.rowIndex,
    layer: r.layer,
    mark: r.mark,
    quote: r.quote,
    n: r.n,
    ac: r.ac,
    text: r.text,
  }))
  paint(pageBody.value, list, visibleRows.value)
}
watch(
  [visibleRows, resolved, paired, spread, vw],
  () => nextTick(paintAll),
)

/** 选中变化：读锚点，出工具条（只由左键松开 / 触屏松手 / 键盘选区触发） */
function onSelection() {
  const s = window.getSelection()
  if (!s || s.isCollapsed || s.rangeCount === 0) {
    selInfo.value = null
    selSegs = []
    if (bar.value?.mode === 'new') bar.value = null
    return
  }
  const range = s.getRangeAt(0)
  if (!highlightOK) return
  showNewBar(range)
}

/** 选区（可能跨段）→ 出工具条。跨段拆成每块一段，动作对每段各落一条。 */
function showNewBar(range: Range) {
  const segs = selectionSegments(pageBody.value, range)
  if (!segs.length) {
    selInfo.value = null
    selSegs = []
    if (bar.value?.mode === 'new') bar.value = null
    return
  }
  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0)
  if (!rects.length) return
  selSegs = segs
  selInfo.value = segs[0]
  placeBar(rects, 'new')
}

/**
 * 多行选区用 getClientRects()：横向取所有行的最外缘，纵向用第一行 / 最后一行。
 * 工具条在视口里 fixed，坐标不加 scrollY。上方放不下就翻到文字下方。
 */
function placeBar(
  input: DOMRect | DOMRect[],
  mode: 'new' | 'edit',
  /** edit 模式：这条划线是谁，后续换色 / 删除 / 写想法都要用 */
  rec?: { key: string; layer: 'index' | 'zh'; index: number; h: string },
) {
  const rects = (Array.isArray(input) ? input : [input]).filter((r) => r.width > 0 && r.height > 0)
  if (!rects.length) return

  const first = rects[0]
  const last = rects[rects.length - 1]
  const minX = Math.min(...rects.map((r) => r.left))
  const maxX = Math.max(...rects.map((r) => r.right))
  const half = barHalf()
  const left = narrow.value ? 12 : 20
  const right = vw.value - (narrow.value ? 12 : 118)
  const x = Math.min(Math.max((minX + maxX) / 2, left + half), right - half)

  const below = first.top < (mode === 'edit' ? 150 : 130)
  const y = below
    ? last.bottom + 12
    : mode === 'edit'
      ? Math.max(96, first.top - 10)
      : Math.max(8, first.top - 6)

  bar.value = { x, y, mode, below, ...(rec || {}) }
}

/** 右键、中键不参与任何批注入口 */
/* ------------------------------ 自定义左键拖选 ------------------------------ */
/* 软件会接管系统的“划词 / 右键”菜单。这里不再把浏览器原生 selection 留给它：
   左键拖选时阻止原生选择，用 caretRangeFromPoint 自己算 Range，
   再用 ::highlight(sel-preview) 画出来。右键完全不参与。 */

const PREVIEW = 'sel-preview'
let customStart: Range | null = null
let customRange: Range | null = null
let customDragging = false
let customMoved = false
let suppressMouseUp = false

function caretRangeAt(x: number, y: number): Range | null {
  const d = document as any
  try {
    if (typeof d.caretRangeFromPoint === 'function') {
      const r = d.caretRangeFromPoint(x, y)
      if (r instanceof Range) return r
    }
    if (typeof d.caretPositionFromPoint === 'function') {
      const pos = d.caretPositionFromPoint(x, y)
      if (pos?.offsetNode) {
        const r = document.createRange()
        r.setStart(pos.offsetNode, pos.offset)
        r.collapse(true)
        return r
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function mdOf(node: Node | null): Element | null {
  if (!node) return null
  const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement)
  return el?.closest('.md') || null
}

function rangeBetween(a: Range, b: Range): Range | null {
  try {
    const r = document.createRange()
    if (a.compareBoundaryPoints(Range.START_TO_START, b) <= 0) {
      r.setStart(a.startContainer, a.startOffset)
      r.setEnd(b.startContainer, b.startOffset)
    } else {
      r.setStart(b.startContainer, b.startOffset)
      r.setEnd(a.startContainer, a.startOffset)
    }
    return r.collapsed ? null : r
  } catch {
    return null
  }
}

function paintPreview(range: Range | null) {
  if (!highlightOK) return
  if (!range || range.collapsed) {
    CSS.highlights.delete(PREVIEW)
    customRange = null
    return
  }
  const h = new Highlight()
  h.add(range)
  CSS.highlights.set(PREVIEW, h)
  customRange = range
}

function clearPreview() {
  if (highlightOK) CSS.highlights.delete(PREVIEW)
  customRange = null
}

function onTextPointerDown(e: PointerEvent) {
  if (e.button !== 0 || e.pointerType !== 'mouse') return
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  // 双击 / 三击交给浏览器原生选词（选词、选整段），我们只接管单击拖选
  if (e.detail > 1) return
  const t = e.target as HTMLElement
  if (t.closest('.selbar') || t.closest('.pen')) return
  if (t.closest('a, img, button, input, textarea')) return
  if (!t.closest('.md') || !pageBody.value?.contains(t)) return

  customStart = caretRangeAt(e.clientX, e.clientY)
  if (!customStart) return

  // 阻止原生 selection，第三方划词/右键软件就看不到“已选中的文字”
  e.preventDefault()
  e.stopPropagation()
  customDragging = true
  customMoved = false
  bar.value = null
  selInfo.value = null
  selSegs = []
  paintPreview(null)
  window.getSelection()?.removeAllRanges()
}

function onTextPointerMove(e: PointerEvent) {
  if (!customDragging || !customStart || e.pointerType !== 'mouse') return
  const caret = caretRangeAt(e.clientX, e.clientY)
  if (!caret || !mdOf(caret.startContainer)) return
  const r = rangeBetween(customStart, caret)
  if (!r) return
  // 同一栏里可以拖出去（跨段就分段画）；拖到另一栏 / 工具条上时保留上一次有效范围
  const sKind = colKindOf(r.startContainer)
  const eKind = colKindOf(r.endContainer)
  if (!sKind || sKind !== eKind) return
  customMoved = true
  paintPreview(r)
}

/** 落点在哪一栏（对照模式左右两栏不串） */
function colKindOf(node: Node | null): 'index' | 'zh' | null {
  if (!node) return null
  const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement)
  if (!el) return null
  if (el.closest('.cell--ref')) return 'zh'
  if (el.closest('.cell--doc')) return 'index'
  return null
}

function onTextPointerUp(e: PointerEvent) {
  if (!customDragging) return
  customDragging = false
  suppressMouseUp = true
  window.setTimeout(() => {
    suppressMouseUp = false
  }, 0)

  customStart = null
  if (customMoved && customRange) {
    showNewBar(customRange)
    if (!selSegs.length) clearPreview()
    return
  }

  clearPreview()
  if (e.button === 0) {
    const key = hitTestAt(e.clientX, e.clientY)
    if (key) editMarkAt(key, e.clientX, e.clientY)
  }
}

function onMouseUp(e: MouseEvent) {
  if (suppressMouseUp) return
  if (e.button !== 0) return
  const t = e.target as HTMLElement
  // 点工具条本身不能把工具条收掉（自定义选区没有原生 selection，不能被 onSelection 判空）
  if (t.closest?.('.selbar') || t.closest?.('.pen')) return
  onSelection()
}

/** 双击选词 / 三击选整块：拦了原生拖选，这两个就得自己补 */
const WORD_CHAR = /[0-9A-Za-z\u00C0-\u024F'’\-_.]/
const CJK_CHAR = /[\u3400-\u9FFF\u3040-\u30FF]/

function wordRangeAt(caret: Range): Range | null {
  const node = caret.startContainer
  if (node.nodeType !== 3) return null
  const text = node.nodeValue || ''
  let i = Math.min(caret.startOffset, text.length - 1)
  if (i < 0) return null
  // 双击落在空格/标点上时，往两边找最近的“词”字（和浏览器行为一致）
  let test = CJK_CHAR.test(text[i] || '') ? CJK_CHAR : WORD_CHAR
  if (!test.test(text[i] || '')) {
    for (let d = 1; d < 24; d++) {
      const cand = text[i + d] ?? text[i - d] ?? ''
      const t = CJK_CHAR.test(cand) ? CJK_CHAR : WORD_CHAR
      if (cand && t.test(cand)) {
        i = text[i + d] ? i + d : i - d
        test = t
        break
      }
    }
  }
  if (!test.test(text[i] || '')) return null
  let s = i
  let e = i + 1
  while (s > 0 && test.test(text[s - 1])) s--
  while (e < text.length && test.test(text[e])) e++
  const r = document.createRange()
  r.setStart(node, s)
  r.setEnd(node, e)
  return r
}

function selectAtPoint(x: number, y: number, unit: 'word' | 'block'): Range | null {
  const caret = caretRangeAt(x, y)
  if (!caret) return null
  const md = mdOf(caret.startContainer)
  if (!md) return null
  if (unit === 'block') {
    const r = document.createRange()
    r.selectNodeContents(md)
    return r
  }
  return wordRangeAt(caret)
}

function pickNative(range: Range) {
  const sel = window.getSelection()
  if (!sel) return
  sel.removeAllRanges()
  sel.addRange(range)
  showNewBar(range)
}

function onTextDblClick(e: MouseEvent) {
  const t = e.target as HTMLElement
  if (!t.closest('.md') || t.closest('.selbar')) return
  if (t.closest('a, img')) return
  const range = selectAtPoint(e.clientX, e.clientY, 'word')
  if (!range) return
  e.preventDefault()
  pickNative(range)
}

function onTextClick(e: MouseEvent) {
  if (e.detail < 3) return
  const t = e.target as HTMLElement
  if (!t.closest('.md') || t.closest('.selbar')) return
  const range = selectAtPoint(e.clientX, e.clientY, 'block')
  if (!range) return
  pickNative(range)
}

let touchTimer: number | undefined
function onPointerUp(e: PointerEvent) {
  if (e.pointerType === 'mouse' || e.button !== 0) return
  clearTimeout(touchTimer)
  touchTimer = window.setTimeout(onSelection, 80)
}

/** selectionchange 只负责收起；触屏选区变化时补一次出条 */
function onSelectionChange() {
  const s = window.getSelection()
  if (!s || s.isCollapsed) {
    if (bar.value?.mode === 'new') {
      bar.value = null
      selInfo.value = null
    }
    return
  }
  if (lastPointerType === 'mouse') return
  clearTimeout(touchTimer)
  touchTimer = window.setTimeout(() => {
    if (lastPointerType !== 'mouse') onSelection()
  }, 60)
}

function onKeyUp(e: KeyboardEvent) {
  const keys = ['Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
  if (!keys.includes(e.key)) return
  const t = e.target as HTMLElement | null
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable) return
  onSelection()
}
/** 马克笔颜色：记住上次用的，默认蓝色；编辑已有划线时点色点直接换色 */
const tint = ref<MarkKind>(((v) => (isHl(v) ? v : 'hl-blue'))(localStorage.getItem('mark-tint') as string | null || ''))

const rememberTint = (k: MarkKind) => {
  tint.value = k
  try {
    localStorage.setItem('mark-tint', k)
  } catch {
    /* 隐身窗口存不了就算了 */
  }
}

/** 工具条上该打勾的色号：编辑已有划线时跟着那条划线的颜色，不跟“上次用的” */
const activeTint = computed<MarkKind>(() => {
  const b = bar.value
  const cur = b?.key ? ann.items[b.key]?.mark : undefined
  if (b?.mode === 'edit' && isHl(cur)) return cur
  return tint.value
})

function pickTint(k: MarkKind) {
  const b = bar.value
  rememberTint(k)
  const cur = b?.key ? ann.items[b.key]?.mark : undefined
  if (b?.mode === 'edit' && b.key && cur) {
    // 已经有记号：只换颜色，形状不动（波浪→同色号波浪，直线/虚线不换色）
    if (String(cur).startsWith('wave')) return void markExisting(waveOf(k))
    if (isHl(cur)) return void markExisting(k)
    return
  }
  // 新选区：点颜色就是直接上马克笔（不用先点「马克笔」再选色）
  if (selSegs.length) void applyMark(k)
}

const editKind = computed<MarkKind>(() => (bar.value?.key ? ann.items[bar.value.key]?.mark || 'line' : 'line'))

function clearSelection() {
  bar.value = null
  selInfo.value = null
  selSegs = []
  clearPreview()
  window.getSelection()?.removeAllRanges()
}

/** 工具条动作入口（AnnotationToolbar 的事件都汇到这里） */
function onTool(kind: 'copy' | 'marker' | 'wave' | 'line' | 'dash' | 'del' | 'idea') {
  const kindToMark: Record<string, MarkKind> = {
    marker: tint.value,
    wave: waveOf(tint.value),
    line: 'line',
    dash: 'dash',
  }
  if (kind === 'copy') {
    copySelection()
    clearPreview()
    return
  }
  if (kind === 'del') {
    clearPreview()
    return delFromBar()
  }
  if (kind === 'idea') {
    clearPreview()
    return bar.value?.key ? ideaFromBar() : annotateSelection()
  }
  const mark = kindToMark[kind]
  if (!mark) return
  if (bar.value?.mode === 'edit') markExisting(mark)
  else applyMark(mark)
}

/** 当前这次选区要作用的块（拖选跨段时会有多块） */
const actionSegs = () => (selSegs.length ? selSegs : selInfo.value ? [selInfo.value] : [])

/** 已有批注里，和这个锚点「范围一样」的那条（自己同块同层） */
function sameRangeKey(a: SelAnchor): string | null {
  if (a.start < 0 || a.end <= a.start) return null
  const rowEls = pageBody.value?.querySelectorAll<HTMLElement>('.row')
  for (const rec of Object.values(resolved.value.map)) {
    if (rec.rowIndex !== a.index || rec.layer !== a.layer) continue
    const cr = charRangeOf(rowEls?.[rec.rowIndex] || null, rec.layer, rec)
    if (!cr) continue
    if (Math.abs(cr[0] - a.start) <= 1 && Math.abs(cr[1] - a.end) <= 1) return rec.key
  }
  return null
}

/** 一条锚点落一个记号：同范围的旧记录就改它（不叠出 #2 #3） */
async function markSegment(a: SelAnchor, mark: MarkKind): Promise<string | null> {
  if (!article.value) return null
  const row = visibleRows.value[a.index]
  const h = a.layer === 'index' ? row?.h : row?.rh
  if (!h) return null
  const same = sameRangeKey(a)
  const key = same || nextKey(a.layer, h)
  const prev = ann.items[key]
  const ok = await saveAnnotation(article.value.id, {
    key,
    layer: a.layer,
    quote: a.quote,
    text: prev?.text || '',
    mark,
    n: a.n,
    ac: { b: a.b, a: a.a },
  })
  return ok ? key : null
}

/**
 * 下笔：选多大就画多大（跨段就一段一条）。
 * 画完把工具条切成“编辑这条”的状态，接着点颜色/换形状都是在改同一条。
 */
async function applyMark(mark: MarkKind) {
  const segs = actionSegs()
  if (!article.value || !segs.length) {
    clearSelection()
    return
  }
  const keys: string[] = []
  for (const a of segs) {
    const key = await markSegment(a, mark)
    if (key) keys.push(key)
  }
  if (!keys.length) {
    clearSelection()
    showToast('服务没启动，已存入本机草稿')
    return
  }
  // 已经画上去了：预览层 / 原生选中一起撤掉，别和划线的颜色叠在一起看不准
  if (keys.length === 1) {
    clearPreview()
    window.getSelection()?.removeAllRanges()
  }
  // 单块选区：工具条留在原地变成编辑态，本次选区算“有主”了
  const b = bar.value
  const a = segs[0]
  if (b && keys.length === 1 && a) {
    bar.value = { ...b, mode: 'edit', key: keys[0], layer: a.layer, index: a.index, h: (a.layer === 'index' ? visibleRows.value[a.index]?.h : visibleRows.value[a.index]?.rh) || '' }
  }
  selInfo.value = a || null
  showToast(mark === 'dash' ? '已加虚线' : '已划线')
}

async function annotateSelection() {
  const segs = actionSegs()
  const a = segs[0]
  if (!a) return
  const row = visibleRows.value[a.index]
  if (!row) return
  // 跨段写想法：第一段承载想法，其余段先补上同色划线，整段都看得见
  for (const s of segs.slice(1)) await markSegment(s, tint.value)
  const rect = a.rect
  const key = sameRangeKey(a) || undefined
  clearSelection()
  openEditor({
    row,
    layer: a.layer,
    index: a.index,
    x: rect.left + rect.width / 2,
    y: rect.bottom,
    key,
    quote: a.raw.slice(0, 2000),
    selH: rect.height,
  })
}

/** 给已有划线换样式：主键不变，quote / 原想法 / 锚点原样保留 */
async function markExisting(mark: MarkKind) {
  const b = bar.value
  if (!b?.key || !article.value) return
  const prev = ann.items[b.key]
  const ok = await saveAnnotation(article.value.id, {
    key: b.key,
    layer: b.layer || 'index',
    quote: prev?.quote || '',
    text: prev?.text || '',
    mark,
  })
  // 工具条不关：换完还能接着换颜色 / 换形状
  showToast(ok ? '已换样式' : '服务没启动，没存上')
}

/** 删除过的快照，⌘Z 整个恢复（一次可能删好几条） */
let undoNotes: { id: string; payload: any }[] = []

function deletionOf(key: string) {
  const item = ann.items[key]
  return item
    ? { key, layer: item.layer, quote: item.quote, text: item.text || '', mark: item.mark, n: item.n, ac: item.ac }
    : null
}

/** 删一批：每条都记快照，⌘Z 一起还原 */
async function removeKeys(keys: string[], quiet = false) {
  if (!article.value || !keys.length) return 0
  const snaps = keys.map(deletionOf).filter(Boolean) as any[]
  let n = 0
  for (const key of keys) {
    const ok = await saveAnnotation(article.value.id, { key, layer: key.startsWith('zh') ? 'zh' : 'index', quote: '', text: '' })
    if (ok) n++
  }
  if (n && snaps.length) undoNotes = snaps.map((payload) => ({ id: article.value!.id, payload }))
  if (!quiet) showToast(n ? `已删除 ${n} 条划线 · ⌘Z 撤销` : '服务没启动，没删掉')
  return n
}

async function removeKey(key: string, layer: 'index' | 'zh', quiet = false) {
  void layer
  return (await removeKeys([key], quiet)) > 0
}

async function removeBarMark() {
  const b = bar.value
  if (!b?.key || !article.value) return
  bar.value = null
  await removeKeys([b.key])
}

/**
 * 工具条上的「删除划线」：
 * - 编辑态：删这一条（连同同范围的重复份）
 * - 选中态：选区上沾边的全删（按字符区间判重叠，不再靠引文互相包含去猜）
 */
async function delFromBar() {
  const b = bar.value
  if (!b || !article.value) return
  if (b.mode === 'edit' && b.key) {
    bar.value = null
    await removeKeys([b.key, ...duplicatesOf(b.key)])
    return
  }
  const segs = actionSegs()
  bar.value = null
  if (!segs.length) return
  const victims = new Set<string>()
  const rowEls = pageBody.value?.querySelectorAll<HTMLElement>('.row')
  for (const a of segs) {
    for (const rec of Object.values(resolved.value.map)) {
      if (rec.rowIndex !== a.index || rec.layer !== a.layer) continue
      const cr = charRangeOf(rowEls?.[rec.rowIndex] || null, rec.layer, rec)
      if (!cr) continue
      if (cr[0] < a.end && cr[1] > a.start) victims.add(rec.key)
    }
  }
  clearSelection()
  if (!victims.size) {
    showToast('选区里没有划线')
    return
  }
  await removeKeys([...victims])
}

/** 同一块、同一区间里重复存的几条（旧版本每点一次颜色就多存一份） */
function duplicatesOf(key: string): string[] {
  const self = ann.items[key]
  const rec = resolved.value.map[key]
  if (!self || !rec) return []
  const rowEls = pageBody.value?.querySelectorAll<HTMLElement>('.row')
  const mine = charRangeOf(rowEls?.[rec.rowIndex] || null, rec.layer, rec)
  if (!mine) return []
  const out: string[] = []
  for (const other of Object.values(resolved.value.map)) {
    if (other.key === key) continue
    if (other.rowIndex !== rec.rowIndex || other.layer !== rec.layer) continue
    const cr = charRangeOf(rowEls?.[other.rowIndex] || null, other.layer, other)
    if (!cr) continue
    if (Math.abs(cr[0] - mine[0]) <= 1 && Math.abs(cr[1] - mine[1]) <= 1) out.push(other.key)
  }
  return out
}

/** ⌘Z 撤销上一次删除（可能一次删了几条，整批还原） */
async function undoDelete() {
  if (!undoNotes.length || !article.value) return false
  const batch = undoNotes
  undoNotes = []
  for (const u of batch) await saveAnnotation(u.id, u.payload)
  showToast('已撤销删除')
  return true
}

/** 工具条上的「想法」：进编辑卡（锚点位置借用工具条的） */
function ideaFromBar() {
  const b = bar.value
  if (!b?.key) return
  const rows = visibleRows.value
  const row = rows[b.index ?? -1] || rows.find((r) => (b.layer === 'index' ? r.h : r.rh) === b.h)
  if (!row) {
    bar.value = null
    return
  }
  const { x, y, layer, key } = { x: b.x, y: b.y + 12, layer: b.layer || 'index', key: b.key }
  bar.value = null
  openEditor({
    row,
    layer,
    index: rows.indexOf(row),
    x,
    y,
    key,
    quote: ann.items[key]?.quote,
  })
}

/** 点别处收工具条；正文里没有选区时点到划线 = 换目标，弹出那条的编辑条 */
let lastPointerType = 'mouse'

function hitTestAt(x: number, y: number) {
  if (!pageBody.value) return null
  const list = Object.values(resolved.value.map).map((r) => ({
    key: r.key,
    rowIndex: r.rowIndex,
    layer: r.layer,
    mark: r.mark,
    quote: r.quote,
    n: r.n,
    ac: r.ac,
  }))
  return hitTest(pageBody.value, list, x, y)
}

function onDocDown(e: PointerEvent) {
  lastPointerType = e.pointerType || 'mouse'
  if (e.button !== 0) return
  const t = e.target as HTMLElement
  if (t.closest('.selbar')) return
  if (t.closest('.pen')) return
  if (pageBody.value?.contains(t)) {
    const s = window.getSelection()
    const noSel = !s || s.isCollapsed || s.rangeCount === 0
    // 鼠标在 .md 上的点按/拖选由自定义选择处理；这里只兜住触屏和非正文区域
    if (noSel && (lastPointerType !== 'mouse' || !t.closest('.md'))) {
      const key = hitTestAt(e.clientX, e.clientY)
      if (key) return void editMarkAt(key, e.clientX, e.clientY)
    }
  }
  if (!bar.value) {
    clearPreview()
    return
  }
  bar.value = null
  selInfo.value = null
  clearPreview()
}

/** 点中一条划线：收掉文字选区，按那条划线的实际矩形弹出编辑条 */
function editMarkAt(key: string, x: number, y: number) {
  const rows = visibleRows.value
  const layer = key.startsWith('zh') ? 'zh' : 'index'
  const h = key.split('::')[1]?.split('#')[0] || ''
  const index = rows.findIndex((r) => (layer === 'index' ? r.h : r.rh) === h)
  if (index < 0) return
  window.getSelection()?.removeAllRanges()
  selInfo.value = null
  // 工具条的位置用那条划线自己的矩形：比点击点稳，翻页/滚动后也跟着走
  const rec = resolved.value.map[key]
  const rowEl = rec ? (pageBody.value?.querySelectorAll('.row')[rec.rowIndex] as HTMLElement | undefined) : undefined
  const range = rec && rowEl ? rangeForRow(rowEl, rec.layer, rec) : null
  const rects = range ? Array.from(range.getClientRects()) : []
  placeBar(rects.length ? rects : new DOMRect(x, y, 1, 1), 'edit', {
    key,
    layer,
    index,
    h: (layer === 'index' ? rows[index].h : rows[index].rh) || h,
  })
}

async function copySelection() {
  const s = window.getSelection()
  const segs = actionSegs()
  bar.value = null
  clearPreview()
  const text = (segs.length ? segs.map((a) => a.raw).join('\n') : selInfo.value?.raw || s?.toString() || '')
    .replace(/[ \t]+/g, ' ')
    .trim()
  try {
    await navigator.clipboard.writeText(text)
    showToast('已复制')
  } catch {
    showToast('复制失败')
  }
  clearSelection()
}

/* ------------------------------ 界面 ------------------------------ */

function togglePanel(p: Panel) {
  panel.value = panel.value === p ? '' : p
}

/** 手机：点正文收起/唤出上下栏（选中文字、点到链接或图片时不动） */
function onStageTap(e: MouseEvent) {
  if (!isPhone.value || panel.value || editor.open) return
  const t = e.target as HTMLElement
  if (t.closest('a, img, button, .pen, .selbar')) return
  if (window.getSelection()?.toString().trim()) return
  const w = window.innerWidth
  // 左右两头点一下翻一页（跟微信读书一样），中间点一下收 / 放上下栏
  if (paged.value) {
    if (e.clientX <= w * 0.3) return turn(-1)
    if (e.clientX >= w * 0.7) return turn(1)
  }
  if (chromeOn.value) {
    chromeOn.value = false
    clearTimeout(idleTimer)
  } else {
    wake()
  }
}

/** 进度条拖到哪儿就读到哪儿 */
function seek(p: number) {
  const v = Math.max(0, Math.min(1, p))
  if (paged.value) {
    turnTo(Math.round(v * pages.value) - 1)
    return
  }
  const h = document.documentElement.scrollHeight - window.innerHeight
  window.scrollTo({ top: Math.max(0, v * h) })
  pct.value = v
  if (article.value) setProgress(article.value.id, v)
}

function toTop() {
  if (paged.value) return turnTo(0)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function toggleCompare() {
  layout.mode = paired.value ? 'single' : 'compare'
  panel.value = ''
}

function starFromSheet() {
  onStar()
  panel.value = ''
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.href)
    showToast('已复制链接')
  } catch {
    showToast('复制失败')
  }
  panel.value = ''
}

const PANEL_TITLE: Record<string, string> = {
  tree: '目录',
  notes: '批注',
  settings: '排版',
  type: '字号',
  theme: '纸色',
  progress: '进度',
  more: '更多',
}
const panelTitle = computed(() => (panel.value ? PANEL_TITLE[panel.value] : ''))
const siteTitle = computed(() => index.value?.site.title || '我要读书')
/** 顶栏用灰版图标；彩色 app 图标留给书架和 manifest */
const logoUrl = './logo-gray.svg'

function onStar() {
  if (!article.value) return
  starred.value = toggleStar(article.value.id)
  showToast(starred.value ? '已收藏' : '已取消收藏')
}

const MODES: Mode[] = ['spread', 'compare', 'single']

function cycleMode() {
  if (!article.value?.hasZh) {
    layout.mode = layout.mode === 'spread' ? 'single' : 'spread'
    return
  }
  layout.mode = MODES[(MODES.indexOf(layout.mode) + 1) % MODES.length]
}

const isDark = computed(() => layout.theme === 'dark')

/**
 * 深色 / 浅色一键切：用 View Transitions 从点击的那个点圆着铺满全屏。
 * 不支持 startViewTransition 的浏览器直接切，不挡路。
 */
function toggleDark(e?: MouseEvent) {
  const next = isDark.value ? 'light' : 'dark'
  const x = e?.clientX ?? window.innerWidth / 2
  const y = e?.clientY ?? window.innerHeight / 2
  const doc = document as any
  const apply = () => (layout.theme = next)
  if (typeof doc.startViewTransition !== 'function') return apply()
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  try {
    const vt = doc.startViewTransition(apply)
    vt.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          {
            duration: 520,
            easing: 'cubic-bezier(.35,.12,.2,1)',
            pseudoElement: '::view-transition-new(root)',
          },
        )
      })
      .catch(() => {})
  } catch {
    apply()
  }
}

function cycleTheme() {
  const order: ('light' | 'sepia' | 'green' | 'dark')[] = ['light', 'sepia', 'green', 'dark']
  layout.theme = order[(order.indexOf(layout.theme) + 1) % order.length]
}

function openArticleIn(id: string) {
  // 桌面上不关面板（接着显示新篇的提纲）；手机上换篇就是去读，抽屉收起
  if (isPhone.value) panel.value = ''
  location.hash = `#/p/${id}`
}

function jumpRow(i: number) {
  const row = visibleRows.value[i]
  if (row) jump(row.h)
}

/** 滚动时工具条跟着选区/那条划线走，不挡住被选的字 */
function followScroll() {
  const b = bar.value
  if (!b) return
  if (b.mode === 'new') {
    const s = window.getSelection()
    const a = selInfo.value
    if (!s || s.isCollapsed || s.rangeCount === 0 || !a) {
      bar.value = null
      selInfo.value = null
      return
    }
    placeBar(Array.from(a.range.getClientRects()), 'new')
    return
  }
  const rec = b.key ? resolved.value.map[b.key] : null
  if (!rec) {
    bar.value = null
    return
  }
  const rowEl = pageBody.value?.querySelectorAll('.row')[rec.rowIndex] as HTMLElement | undefined
  const range = rangeForRow(rowEl as HTMLElement, rec.layer, rec)
  if (!range) return
  placeBar(Array.from(range.getClientRects()), 'edit')
}

const onScroll = () => {
  followScroll()
  if (paged.value) return
  const h = document.documentElement.scrollHeight - window.innerHeight
  pct.value = h > 0 ? Math.min(1, window.scrollY / h) : 0
  if (article.value) setProgress(article.value.id, pct.value)
}

const onResize = () => {
  vw.value = window.innerWidth
  scheduleMeasure()
  followScroll()
}

/** 手机上滑页也会发 pointermove，不能拿它唤出上下栏 */
const onPointMove = () => {
  if (!isPhone.value) wake()
}

const onPageClick = (e: MouseEvent) => {
  const t = e.target as HTMLElement
  if (t.tagName === 'IMG') zoom.value = (t as HTMLImageElement).src
}

function setupTocObserver() {
  tocIO?.disconnect()
  if (paged.value) return
  tocIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) activeH.value = (e.target as HTMLElement).dataset.bh || ''
      }
    },
    { rootMargin: '-56px 0px -72% 0px' },
  )
  document.querySelectorAll('.row--heading').forEach((el) => tocIO?.observe(el))
  if (!activeH.value) activeH.value = article.value?.toc[0]?.h || ''
}

/** 闲着别挡字：4 秒淡出（手机上连上下栏一起收起来） */
function wake() {
  chromeOn.value = true
  idle.value = false
  clearTimeout(idleTimer)
  idleTimer = window.setTimeout(() => {
    idle.value = true
    if (isPhone.value && !panel.value && !editor.open) chromeOn.value = false
  }, 4000)
}

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (zoom.value) return void (zoom.value = null)
    // 写想法卡开着时只收卡片：不能顺手把旁边的批注抽屉也关掉
    if (editor.open) return void (editor.open = false)
    if (panel.value) return void (panel.value = '')
    clearPreview()
    if (bar.value) {
      bar.value = null
      selInfo.value = null
    }
    return
  }
  if (editor.open) return
  // 撤销上一次删除划线（只在刚删过时接管 ⌘Z，平时不影响输入框的撤销）
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && undoNotes.length) {
    e.preventDefault()
    undoDelete()
    return
  }
  const t = e.target as HTMLElement
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable) return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
    e.preventDefault()
    turn(1)
  } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    e.preventDefault()
    turn(-1)
  } else if (e.key === 'm') {
    cycleMode()
  } else if (e.key === 't') {
    togglePanel('tree')
  } else if (e.key === 'n') {
    togglePanel('notes')
  } else if (e.key === 'd') {
    cycleTheme()
  } else if (e.key === 's') {
    togglePanel('settings')
  }
}

watch(
  () => props.id,
  async (id) => {
    window.scrollTo(0, 0)
    startClock(id)
    await load(id)
    await afterLoad()
  },
)

watch(
  () => [layout.mode, layout.fontSize, layout.lineHeight, layout.font, layout.measure, vw.value],
  () => nextTick(scheduleMeasure),
)

// 面板开合会改纸宽（宽度有 260ms 过渡），过渡结束再量一次，否则页数还是旧宽度算的
watch(panel, (v) => {
  nextTick(scheduleMeasure)
  clearTimeout(panelTimer)
  panelTimer = window.setTimeout(scheduleMeasure, 320)
  // 手机：抽屉开着的时候，上下栏不许自己躲起来
  if (isPhone.value) {
    if (v) {
      chromeOn.value = true
      clearTimeout(idleTimer)
    } else {
      wake()
    }
  }
})

watch([spread, isPhone], () =>
  nextTick(() => {
    scheduleMeasure()
    setupTocObserver()
  }),
)

// 宽度跨过手机界线时，面板的几套东西对不上，直接收起来（跟着重新量一遍）
watch(isPhone, () => {
  panel.value = ''
  chromeOn.value = true
  nextTick(scheduleMeasure)
})

onMounted(async () => {
  await load(props.id)
  await afterLoad()
  startClock(props.id)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)
  window.addEventListener('pointermove', onPointMove, { passive: true })
  pageBody.value?.addEventListener('pointerdown', onTextPointerDown, true)
  window.addEventListener('pointermove', onTextPointerMove, { passive: true })
  window.addEventListener('pointerup', onTextPointerUp)
  document.addEventListener('mouseup', onMouseUp)
  pageBody.value?.addEventListener('dblclick', onTextDblClick)
  pageBody.value?.addEventListener('click', onTextClick)
  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('selectionchange', onSelectionChange)
  document.addEventListener('keyup', onKeyUp)
  document.addEventListener('pointerdown', onDocDown)
  wake()
  onScroll()
})

onBeforeUnmount(() => {
  tocIO?.disconnect()
  cancelAnimationFrame(measureRaf)
  clearTimeout(idleTimer)
  clearTimeout(panelTimer)
  stopClock()
  unpaint()
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('pointermove', onPointMove)
  clearTimeout(touchTimer)
  pageBody.value?.removeEventListener('pointerdown', onTextPointerDown, true)
  window.removeEventListener('pointermove', onTextPointerMove)
  window.removeEventListener('pointerup', onTextPointerUp)
  clearPreview()
  document.removeEventListener('mouseup', onMouseUp)
  pageBody.value?.removeEventListener('dblclick', onTextDblClick)
  pageBody.value?.removeEventListener('click', onTextClick)
  document.removeEventListener('pointerup', onPointerUp)
  document.removeEventListener('selectionchange', onSelectionChange)
  document.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('pointerdown', onDocDown)
  styleEl?.remove()
})
</script>

<template>
  <div
    class="reader"
    :class="{
      'is-immersive': layout.immersive,
      'is-spread': spread,
      'is-phone': isPhone,
      'is-chrome': chromeOn,
    }"
  >
    <div class="progress"><i :style="{ width: pct * 100 + '%' }" /></div>
    <div class="topzone" />

    <!-- 手机：压在正文上的顶栏，点一下正文就收起 -->
    <header v-if="isPhone" class="pbar" :class="{ 'is-hidden': !chromeOn || !!panel }">
      <button class="pbar__btn" aria-label="回书架" @click="goShelf">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.5 5.5 8 12l6.5 6.5" />
        </svg>
      </button>
      <span class="pbar__title">{{ article?.title || '' }}</span>
      <button class="pbar__btn" :class="{ 'is-star': starred }" aria-label="收藏" @click="onStar">
        <svg
          viewBox="0 0 24 24"
          :fill="starred ? 'currentColor' : 'none'"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linejoin="round"
        >
          <path d="M12 4.2l2.35 4.9 5.25.72-3.84 3.68.94 5.3L12 16.3l-4.7 2.5.94-5.3L4.4 9.82l5.25-.72z" />
        </svg>
      </button>
      <button class="pbar__btn" aria-label="更多" @click="panel = 'more'">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5.6" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="18.4" r="1.5" />
        </svg>
      </button>
    </header>

    <header v-else class="bar">
      <div class="bar__inner">
        <div class="bar__left">
          <button class="bar__brand" title="回书架" aria-label="回书架" @click="goShelf">
            <img class="bar__logo" :src="logoUrl" alt="" width="22" height="22" />
            <span class="bar__brand-name">{{ siteTitle }}</span>
          </button>
          <span class="bar__div" />
          <span class="bar__name" :title="article?.title || ''">{{ article?.title || '' }}</span>
          <button class="bar__star" :class="{ 'is-on': starred }" @click="onStar">
            <svg viewBox="0 0 24 24" :fill="starred ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
              <path d="M12 4.2l2.35 4.9 5.25.72-3.84 3.68.94 5.3L12 16.3l-4.7 2.5.94-5.3L4.4 9.82l5.25-.72z" />
            </svg>
            {{ starred ? '已收藏' : '收藏' }}
          </button>
        </div>
        <div class="bar__right">
          <button class="bar__link" @click="goShelf">首页</button>
          <span class="bar__div" />
          <button class="bar__link" @click="goShelf">我的书架</button>
        </div>
      </div>
      <span class="bar__space" aria-hidden="true" />
    </header>

    <!-- 阅读面和面板是并排的两个表面：面板从不压在正文上，纸也不被蒙层盖住 -->
    <div class="bench">
      <main class="stage" @click="onStageTap">
      <article
        class="page"
        :class="{ 'page--spread': spread, 'page--paged': paged && !spread, 'page--narrow-pad': narrow, 'is-panel': panel }"
      >
        <div ref="pageBody" class="page__body" :style="{ '--row-cols': rowCols }" @click="onPageClick">
          <p v-if="loading" class="state">载入中…</p>
          <p v-else-if="error" class="state">
            读不到这篇：{{ error }}<br />先 <code>npm run build</code>。
          </p>
          <template v-else-if="article">
            <div v-if="!spread && !isPhone" class="doc__head">
              <h1>{{ article.title }}</h1>
              <div class="doc__meta">
                <span v-if="article.meta.author" class="otag otag--wide">{{ article.meta.author }}</span>
                <span v-if="article.meta.year" class="otag">{{ article.meta.year }}</span>
                <span class="otag otag--blue">已读 {{ Math.round(pct * 100) }}%</span>
                <span class="otag">{{ article.blocks }} 块</span>
                <span class="otag">{{ Math.round(article.chars / 1000) }} 千字</span>
                <span v-if="article.hasZh" class="otag">对照 {{ Math.round(article.alignRatio * 100) }}%</span>
              </div>
            </div>
            <DocRows :rows="visibleRows" :paired="paired" :can-annotate="true" :script="article.script" @edit="openEditor" />
          </template>
        </div>

        <footer v-if="spread && article && !loading && pages > 1" class="pager">
          <button type="button" class="pager__btn" :disabled="page <= 0" @click="turn(-1)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            上一页
          </button>
          <span class="page__stat">
            {{ sectionText || '正文' }}（第 {{ leftPage }}–{{ rightPage }} / {{ totalPages }} 页）
          </span>
          <button type="button" class="pager__btn" :disabled="page >= pages - 1" @click="turn(1)">
            下一页
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </footer>
        <aside v-if="!isPhone" class="panel-col" :class="{ 'is-open': panel }" :inert="!panel">
          <section class="panel" role="dialog" :aria-label="panelTitle || '面板'">
            <header class="panel__top">
              <span class="panel__title">{{ panelTitle }}</span>
              <button class="panel__close" aria-label="关闭面板" @click="panel = ''">✕</button>
            </header>
            <div class="panel__body">
              <div v-if="article && panel === 'tree'" class="panel__pad">
                <OutlinePane
                  :toc="article.toc"
                  :rows="visibleRows"
                  :active-h="activeH"
                  :pct="pct"
                  :title="article.title"
                  :author="article.meta.author"
                  :year="article.meta.year"
                  :keywords="article.meta.keywords || []"
                  :articles="filtered"
                  :current-id="article.id"
                  :query="query"
                  :cats="cats"
                  :cat-filter="catFilter"
                  @jump="jump"
                  @open="openArticleIn"
                  @update:query="query = $event"
                  @pick-cat="catFilter = $event"
                />
              </div>
              <NotesPane
                v-else-if="article && panel === 'notes'"
                :article="article"
                :rows="visibleRows"
                :annotations="annList"
                :lost="resolved.lost"
                :online="ann.online"
                :drafts="ann.drafts"
                :loading="ann.loading"
                :pct="pct"
                :marks="markOnlyCount"
                @jump="jumpRow"
                @refresh="loadAnnotations(article.id)"
                @remove="removeNote"
                @edit="editNote"
                @copied="showToast('已复制全部批注')"
              />
              <SettingsPanel v-else-if="panel === 'settings'" :has-zh="Boolean(article?.hasZh)" />
            </div>
          </section>
        </aside>
      </article>
      </main>

      <nav v-if="!isPhone" class="dock" :class="{ 'is-idle': idle && !panel }" aria-label="阅读工具">
        <button
          class="dock__item"
          :class="{ 'is-on': panel === 'tree' }"
          title="目录 · 选篇（T）"
          aria-label="目录"
          :aria-pressed="panel === 'tree'"
          @click="togglePanel('tree')"
        >
          <svg class="dock__glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <path d="M4 6.5h16M4 12h11M4 17.5h16" />
          </svg>
          <span>目录</span>
        </button>
        <button
          class="dock__item"
          :class="{ 'is-on': panel === 'notes' }"
          title="批注（N）"
          aria-label="批注"
          :aria-pressed="panel === 'notes'"
          @click="togglePanel('notes')"
        >
          <svg class="dock__glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
            <path d="M4 5.5h16v10h-8l-4 3.4v-3.4H4z" />
          </svg>
          <span>批注</span>
        </button>
        <button
          class="dock__item"
          :class="{ 'is-on': panel === 'settings' }"
          title="排版 · 版式 / 字号 / 纸色（S）"
          aria-label="排版"
          :aria-pressed="panel === 'settings'"
          @click="togglePanel('settings')"
        >
          <span class="dock__aa">Aa</span>
          <span>排版</span>
        </button>
        <button class="dock__item" :title="isDark ? '切到浅色（D）' : '切到深色（D）'" aria-label="切换深浅" @click="toggleDark">
          <svg v-if="isDark" class="dock__glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <circle cx="12" cy="12" r="4.1" />
            <path d="M12 3.4v2.1M12 18.5v2.1M3.4 12h2.1M18.5 12h2.1M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18" />
          </svg>
          <svg v-else class="dock__glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 14.4A8.2 8.2 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4z" />
          </svg>
          <span>深浅</span>
        </button>
      </nav>

      <!-- 手机工具条：五个图标，选中的变蓝（跟微信读书一致） -->
      <nav v-if="isPhone" class="ptools" :class="{ 'is-hidden': !chromeOn }" aria-label="阅读工具">
        <button
          class="ptool"
          :class="{ 'is-on': panel === 'tree' }"
          aria-label="目录"
          :aria-pressed="panel === 'tree'"
          @click="togglePanel('tree')"
        >
          <svg class="ptool__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M4 7h16M4 12h11M4 17h16" />
          </svg>
        </button>
        <button
          class="ptool"
          :class="{ 'is-on': panel === 'notes' }"
          aria-label="批注"
          :aria-pressed="panel === 'notes'"
          @click="togglePanel('notes')"
        >
          <svg class="ptool__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
            <path d="M4.6 19.4 6 14.2 15.6 4.6a2.2 2.2 0 0 1 3.1 3.1L9.1 17.3l-4.5 2.1z" />
            <path d="M14.2 6l3.8 3.8" />
          </svg>
        </button>
        <button
          class="ptool"
          :class="{ 'is-on': panel === 'progress' }"
          aria-label="阅读进度"
          :aria-pressed="panel === 'progress'"
          @click="togglePanel('progress')"
        >
          <svg class="ptool__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
            <circle cx="11.5" cy="12" r="7.2" />
            <path d="M13 12h4.6" />
          </svg>
        </button>
        <button
          class="ptool"
          :class="{ 'is-on': panel === 'theme' }"
          aria-label="纸色"
          :aria-pressed="panel === 'theme'"
          @click="togglePanel('theme')"
        >
          <svg class="ptool__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
            <circle cx="12" cy="12" r="3.8" />
            <path d="M12 3.3v2.1M12 18.6v2.1M3.3 12h2.1M18.6 12h2.1M5.9 5.9l1.5 1.5M16.6 16.6l1.5 1.5M18.1 5.9l-1.5 1.5M7.4 16.6l-1.5 1.5" />
          </svg>
        </button>
        <button
          class="ptool"
          :class="{ 'is-on': panel === 'type' }"
          aria-label="字号"
          :aria-pressed="panel === 'type'"
          @click="togglePanel('type')"
        >
          <span class="ptool__a">A</span>
        </button>
      </nav>

    </div>

    <AnnotationToolbar
      v-if="bar"
      :x="bar.x"
      :y="bar.y"
      :mode="bar.mode"
      :below="bar.below"
      :tint="activeTint"
      :cur="editKind"
      @pick-tint="pickTint"
      @copy="onTool('copy')"
      @marker="onTool('marker')"
      @wave="onTool('wave')"
      @line="onTool('line')"
      @dash="onTool('dash')"
      @del="onTool('del')"
      @idea="onTool('idea')"
    />

    <div v-if="zoom" class="lightbox" @click="zoom = null">
      <img :src="zoom" alt="" />
    </div>

    <!-- 手机：四个底部抽屉（目录 / 批注 / 进度 / 字号 / 纸色 / 更多） -->
    <template v-if="isPhone">
      <Sheet :open="panel === 'tree'" @close="panel = ''">
        <template #head><span class="sheet__title">目录</span></template>
        <OutlinePane
          v-if="article"
          :toc="article.toc"
          :rows="visibleRows"
          :active-h="activeH"
          :pct="pct"
          :title="article.title"
          :author="article.meta.author"
          :year="article.meta.year"
          :keywords="article.meta.keywords || []"
          :articles="filtered"
          :current-id="article.id"
          :query="query"
          :cats="cats"
          :cat-filter="catFilter"
          @jump="jump"
          @open="openArticleIn"
          @update:query="query = $event"
          @pick-cat="catFilter = $event"
        />
      </Sheet>

      <Sheet :open="panel === 'notes'" flush @close="panel = ''">
        <template #head><span class="sheet__title">批注</span></template>
        <NotesPane
          v-if="article"
          :article="article"
          :rows="visibleRows"
          :annotations="annList"
          :lost="resolved.lost"
          :online="ann.online"
          :drafts="ann.drafts"
          :loading="ann.loading"
          :pct="pct"
          :marks="markOnlyCount"
          @jump="jumpRow"
          @refresh="loadAnnotations(article.id)"
          @remove="removeNote"
          @edit="editNote"
          @copied="showToast('已复制全部批注')"
        />
      </Sheet>

      <Sheet :open="panel === 'progress'" @close="panel = ''">
        <template #head><span class="sheet__title">阅读进度</span></template>
        <ProgressSheet
          :pct="pct"
          :minutes="minutes"
          :notes="annList.length"
          :marks="markOnlyCount"
          @seek="seek"
          @step="turn"
          @top="toTop"
        />
      </Sheet>

      <Sheet :open="panel === 'type'" @close="panel = ''">
        <template #head><span class="sheet__title">字号</span></template>
        <TypeSheet :has-zh="Boolean(article?.hasZh)" />
      </Sheet>

      <Sheet :open="panel === 'theme'" @close="panel = ''">
        <template #head><span class="sheet__title">纸色</span></template>
        <ThemeSheet />
      </Sheet>

      <Sheet :open="panel === 'more'" @close="panel = ''">
        <template #head><span class="sheet__title">更多</span></template>
        <div class="morelist">
          <button class="morerow" @click="starFromSheet">
            <svg viewBox="0 0 24 24" :fill="starred ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
              <path d="M12 4.2l2.35 4.9 5.25.72-3.84 3.68.94 5.3L12 16.3l-4.7 2.5.94-5.3L4.4 9.82l5.25-.72z" />
            </svg>
            <span>{{ starred ? '移出书架' : '加入书架' }}</span>
          </button>
          <button v-if="article?.hasZh" class="morerow" @click="toggleCompare">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
              <rect x="3.6" y="5" width="7.2" height="14" rx="1.6" />
              <rect x="13.2" y="5" width="7.2" height="14" rx="1.6" />
            </svg>
            <span>{{ paired ? '只看原文' : '中英对照' }}</span>
          </button>
          <button class="morerow" @click="toggleDark">
            <svg v-if="isDark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 3.4v2.1M12 18.5v2.1M3.4 12h2.1M18.5 12h2.1M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 14.4A8.2 8.2 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4z" />
            </svg>
            <span>{{ isDark ? '切到浅色' : '切到深色' }}</span>
          </button>
          <button class="morerow" @click="copyLink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M10 13.8a3.6 3.6 0 0 0 5.1 0l2.4-2.4a3.6 3.6 0 0 0-5.1-5.1l-1.2 1.2" />
              <path d="M14 10.2a3.6 3.6 0 0 0-5.1 0l-2.4 2.4a3.6 3.6 0 0 0 5.1 5.1l1.2-1.2" />
            </svg>
            <span>复制本篇链接</span>
          </button>
          <button class="morerow" @click="goShelf">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M4.5 6.5h15M4.5 12h10M4.5 17.5h15" />
            </svg>
            <span>回书架</span>
          </button>
        </div>
      </Sheet>
    </template>

    <NoteEditor
      v-if="editor.open"
      :x="editor.x"
      :y="editor.y"
      :sel-h="editor.selH"
      :initial="editor.initial"
      :label="editorLabel"
      :quote="editorQuote"
      :online="ann.online"
      :can-delete="editorHasSomething"
      @save="onSave"
      @cancel="editor.open = false"
      @remove="removeCurrent"
    />
    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>
