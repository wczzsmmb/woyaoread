<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import DocRows from '../components/DocRows.vue'
import TreePane from '../components/TreePane.vue'
import NotesPane from '../components/NotesPane.vue'
import NavPane from '../components/NavPane.vue'
import SettingsPanel from '../components/SettingsPanel.vue'
import NoteEditor from '../components/NoteEditor.vue'
import { fetchArticle, fetchIndex } from '../lib/api'
import { ann, detect, loadAnnotations, resolve, saveAnnotation } from '../lib/annotations'
import { layout, normalizeC3, RATIOS } from '../lib/layout'
import { goShelf } from '../lib/router'
import { progressOf, setProgress, touchRecent } from '../lib/progress'
import type { Article, SiteIndex } from '../lib/types'

const props = defineProps<{ id: string }>()

const index = ref<SiteIndex | null>(null)
const article = ref<Article | null>(null)
const loading = ref(true)
const error = ref('')
const query = ref('')
const catFilter = ref('')
const showSettings = ref(false)
const drawer = ref(false)
const paneOpen = ref(false)
const pct = ref(0)
const toast = ref('')
const activeH = ref('')
const zoom = ref<string | null>(null)
let tocIO: IntersectionObserver | null = null

const editor = reactive({
  open: false,
  x: 0,
  y: 0,
  layer: 'index' as 'index' | 'zh',
  key: '',
  quote: '',
  initial: '',
})

let indexCache: SiteIndex | null = null
let styleEl: HTMLLinkElement | null = null
let extCssEl: HTMLLinkElement | null = null
let toastTimer: number | undefined

const cats = computed(() =>
  (index.value?.cats || [])
    .map((c) => ({ ...c, depth: Math.max(0, c.path.length - 1) }))
    .sort((a, b) => a.path.join('/').localeCompare(b.path.join('/'), 'zh')),
)

/** 第三栏已经是「导航」时，第一栏就不再重复列一遍小节 */
const treeToc = computed(() =>
  layout.c3 && layout.c3Mode === 'nav' ? [] : article.value?.toc || [],
)

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

const paired = computed(
  () => Boolean(article.value?.hasZh) && layout.c3 && layout.c3Mode === 'compare',
)

const cols = computed(() => {
  const parts: string[] = []
  if (layout.c1) parts.push('var(--c1-w)')
  parts.push('minmax(0,1fr)')
  if (layout.c3 && layout.c3Mode !== 'compare') parts.push('minmax(250px, 340px)')
  return parts.join(' ')
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

const resolved = computed(() =>
  article.value ? resolve(article.value, ann.items) : { map: {}, lost: [] as { key: string; item: any }[] },
)
const annList = computed(() =>
  Object.values(resolved.value.map).sort((a, b) => a.rowIndex - b.rowIndex),
)

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
  try {
    if (!indexCache) indexCache = await fetchIndex()
    index.value = indexCache
    const a = await fetchArticle(id)
    article.value = a
    normalizeC3(a.hasZh)
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

function openEditor(payload: { row: any; layer: 'index' | 'zh'; index: number; x: number; y: number }) {
  const h = payload.layer === 'index' ? payload.row.h : payload.row.rh
  if (!h) return
  const key = `${payload.layer}::${h}`
  editor.open = true
  editor.layer = payload.layer
  editor.key = key
  editor.quote = payload.row.text || ''
  editor.initial = ann.items[key]?.text || ''
  editor.x = payload.x
  editor.y = payload.y
}

async function onSave(text: string) {
  if (!article.value || !editor.key) return
  const ok = await saveAnnotation(article.value.id, {
    key: editor.key,
    layer: editor.layer,
    quote: editor.quote.slice(0, 2000),
    text: text.trim(),
  })
  editor.open = false
  showToast(ok ? '已保存' : '服务没启动，已存入草稿箱')
}

function closeDrawers() {
  drawer.value = false
  paneOpen.value = false
}

function onScrim() {
  if (paneOpen.value) closePane()
  drawer.value = false
}

/** 关底部抽屉；批注/导航关掉时顺带把第三栏关掉，免得留个看不见的栏 */
function closePane() {
  paneOpen.value = false
  if (layout.c3Mode !== 'compare') layout.c3 = false
}

function openDrawer() {
  drawer.value = true
  paneOpen.value = false
}

function openPane(mode: 'annotations' | 'nav') {
  layout.c3 = true
  layout.c3Mode = mode
  paneOpen.value = true
  drawer.value = false
}

function toggleCompare() {
  if (!article.value?.hasZh) {
    showToast('这篇没有对照层（没有 zh.md）')
    return
  }
  paneOpen.value = false
  drawer.value = false
  layout.c3Mode = 'compare'
  layout.c3 = !layout.c3
}

function jumpTo(h: string) {
  closeDrawers()
  setTimeout(() => jump(h), 60)
}

function openArticleIn(id: string) {
  location.hash = `#/p/${id}`
  drawer.value = false
}

function jump(h: string) {
  document.getElementById(`b-${h}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function jumpRow(i: number) {
  const row = article.value?.rows[i]
  if (row) jump(row.h)
}

const cycleMode = () => {
  const order: Array<'compare' | 'annotations' | 'nav'> = article.value?.hasZh
    ? ['compare', 'annotations', 'nav']
    : ['nav', 'annotations']
  const i = order.indexOf(layout.c3Mode)
  layout.c3Mode = order[(i + 1) % order.length]
  layout.c3 = true
}

const onScroll = () => {
  const h = document.documentElement.scrollHeight - window.innerHeight
  pct.value = h > 0 ? Math.min(1, window.scrollY / h) : 0
  if (article.value) setProgress(article.value.id, pct.value)
}

function setupTocObserver() {
  tocIO?.disconnect()
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

const onKey = (e: KeyboardEvent) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  if (e.key === '1') layout.c1 = !layout.c1
  if (e.key === '2') layout.c2 = !layout.c2
  if (e.key === '3') layout.c3 = !layout.c3
  if (e.key === '[') cycleMode()
}

watch(
  () => props.id,
  (id) => {
    closeDrawers()
    load(id)
  },
  { immediate: false },
)

onMounted(() => {
  load(props.id).then(() => {
    setupTocObserver()
    const saved = progressOf(props.id)
    if (saved > 0.04 && saved < 0.96) {
      const h = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo({ top: saved * h })
    }
  })
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('keydown', onKey)
  onScroll()
})

onBeforeUnmount(() => {
  tocIO?.disconnect()
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('keydown', onKey)
  styleEl?.remove()
})
</script>

<template>
  <div class="reader" :class="{ 'is-immersive': layout.immersive }">
    <div class="progress"><i :style="{ width: pct * 100 + '%' }" /></div>
    <div class="topzone" />

    <header class="bar">
      <div class="bar__left">
        <button class="icon" title="回书架" aria-label="回书架" @click="goShelf">←</button>
        <div class="bar__title">
          <span class="bar__name">{{ article?.title || '载入中…' }}</span>
          <span v-if="article" class="bar__meta">
            {{ article.cats.join(' / ') }}
            <template v-if="article.meta.author"> · {{ article.meta.author }}</template>
            <template v-if="article.meta.year"> · {{ article.meta.year }}</template>
          </span>
        </div>
      </div>
    </header>

    <div v-if="drawer || paneOpen" class="scrim" @click="onScrim" />

    <div class="reader__body" :style="{ gridTemplateColumns: cols }">
      <aside v-if="layout.c1" class="tree-pane" :class="{ 'is-open': drawer }">
        <button class="pane__close" aria-label="关闭" @click="drawer = false">✕</button>
        <TreePane
          :cats="cats"
          :active="catFilter"
          :query="query"
          :toc="treeToc"
          :active-h="activeH"
          :keywords="article?.meta.keywords || []"
          @pick="catFilter = $event"
          @update:query="query = $event"
          @jump="jumpTo"
        />
        <div class="tree-pane__list">
          <button
            v-for="a in filtered"
            :key="a.id"
            class="item item--sm"
            :class="{ 'is-on': a.id === article?.id }"
            @click="openArticleIn(a.id)"
          >
            <span class="item__title">{{ a.title }}</span>
            <span class="item__meta">
              <span class="tag">{{ a.cats.at(-1) || '未分类' }}</span>
              <span v-if="a.hasZh">{{ Math.round(a.alignRatio * 100) }}%</span>
            </span>
          </button>
          <p v-if="!filtered.length" class="muted pad">没有匹配的篇目。</p>
        </div>
      </aside>

      <main v-if="layout.c2" class="doc" :style="{ '--row-cols': rowCols }">
        <p v-if="loading" class="state">载入中…</p>
        <p v-else-if="error" class="state">
          读不到这篇：{{ error }}<br />先 <code>npm run build</code>。
        </p>
        <template v-else-if="article">
          <div class="doc__head">
            <h1>{{ article.title }}</h1>
            <div class="doc__meta">
              <span v-if="article.meta.author">{{ article.meta.author }}</span>
              <span v-if="article.meta.year">{{ article.meta.year }}</span>
              <span>{{ article.blocks }} 块</span>
              <span>{{ Math.round(article.chars / 1000) }} 千字</span>
              <span v-if="article.hasZh">对照 {{ Math.round(article.alignRatio * 100) }}%</span>
            </div>
          </div>
          <DocRows
            :rows="visibleRows"
            :paired="paired"
            :annotations="resolved.map"
            :can-annotate="true"
            :script="article.script"
            @edit="openEditor"
          />
        </template>
      </main>

      <aside
        v-if="layout.c3 && layout.c3Mode !== 'compare' && article"
        class="side-pane"
        :class="{ 'is-open': paneOpen }"
      >
        <button class="pane__close" aria-label="关闭" @click="closePane">✕</button>
        <NavPane v-if="layout.c3Mode === 'nav'" :article="article" :active-h="activeH" @jump="jumpTo" />
        <NotesPane
          v-else
          :article="article"
          :annotations="annList"
          :lost="resolved.lost"
          :online="ann.online"
          :drafts="ann.drafts"
          :loading="ann.loading"
          @jump="jumpRow"
          @refresh="loadAnnotations(article.id)"
        />
      </aside>
    </div>

    <nav class="dock">
      <button class="dock__item" :class="{ 'is-on': drawer }" @click="openDrawer">
        <svg class="dock__glyph" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M3 5.5h14M3 10h14M3 14.5h9" />
        </svg>
        <span>目录</span>
      </button>
      <button class="dock__item" :class="{ 'is-on': layout.c3 && layout.c3Mode === 'compare' }" @click="toggleCompare">
        <svg class="dock__glyph" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
          <path d="M10 3.5v13" />
        </svg>
        <span>对照</span>
      </button>
      <button class="dock__item" :class="{ 'is-on': paneOpen && layout.c3Mode === 'annotations' }" @click="openPane('annotations')">
        <svg class="dock__glyph" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 4.5h12v8H9l-3.2 2.6V12.5H4z" />
        </svg>
        <span>批注</span>
      </button>
      <button class="dock__item" @click="showSettings = true">
        <svg class="dock__glyph" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M3 6.5h14M3 13.5h14" />
          <circle cx="7.5" cy="6.5" r="1.9" fill="#fff" />
          <circle cx="13" cy="13.5" r="1.9" fill="#fff" />
        </svg>
        <span>设置</span>
      </button>
    </nav>

    <div v-if="zoom" class="lightbox" @click="zoom = null">
      <img :src="zoom" alt="" />
    </div>

    <SettingsPanel v-if="showSettings" :has-zh="Boolean(article?.hasZh)" @close="showSettings = false" />
    <NoteEditor
      v-if="editor.open"
      :x="editor.x"
      :y="editor.y"
      :initial="editor.initial"
      :label="editor.layer === 'zh' ? '批注 · 对照' : '批注 · 正文'"
      :online="ann.online"
      @save="onSave"
      @cancel="editor.open = false"
    />
    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>
