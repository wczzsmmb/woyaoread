<script setup lang="ts">
import { computed } from 'vue'
import type { Article, ResolvedAnn, Row } from '../lib/types'

const props = defineProps<{
  article: Article
  /** 实际渲染的行（正文 H1 已被去掉），章节归类要用这一套 */
  rows: Row[]
  annotations: ResolvedAnn[]
  lost: { key: string; item: any }[]
  online: boolean
  drafts: number
  loading: boolean
  pct: number
  /** 只有划线、没写想法的条数（不占榜，只报个数字） */
  marks?: number
}>()

const emit = defineEmits<{
  (e: 'jump', rowIndex: number): void
  (e: 'refresh'): void
  (e: 'copied'): void
  (e: 'remove', key: string): void
  (e: 'edit', key: string): void
}>()

const MARK_LABEL: Record<string, string> = {
  highlight: '马克笔',
  'hl-green': '绿马克笔',
  'hl-blue': '蓝马克笔',
  'hl-purple': '紫马克笔',
  'hl-pink': '粉马克笔',
  wave: '蓝波浪线',
  'wave-green': '绿波浪线',
  'wave-pink': '粉波浪线',
  'wave-purple': '紫波浪线',
  wave2: '橙波浪线',
  line: '直线',
  dash: '虚线',
}

const esc = (s: string) =>
  String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 按章节归类：每条批注归到它前面最近的一、二级标题下 */
const groups = computed(() => {
  const rows = props.rows
  const marks: { i: number; title: string }[] = [{ i: -1, title: '开篇' }]
  rows.forEach((r, i) => {
    if (r.type === 'heading' && (r.depth ?? 9) <= 2 && (r.depth ?? 9) > 1) marks.push({ i, title: r.text })
  })
  const out: { key: string; title: string; items: ResolvedAnn[] }[] = []
  for (const a of props.annotations) {
    let title = '开篇'
    let key = 'top'
    for (const m of marks) {
      if (m.i <= a.rowIndex) {
        title = m.title
        key = `${m.i}`
      }
    }
    const g = out.find((x) => x.key === key)
    if (g) g.items.push(a)
    else out.push({ key, title, items: [a] })
  }
  return out
})

const words = computed(() => props.annotations.reduce((n, a) => n + (a.text?.length || 0), 0))

async function copyAll() {
  const text = groups.value
    .map((g) => {
      const items = g.items
        .map((a) => `${a.quote}${a.text ? `\n　　${a.text}` : ''}`)
        .join('\n\n')
      return `【${g.title}】\n${items}`
    })
    .join('\n\n')
  try {
    await navigator.clipboard.writeText(text)
    emit('copied')
  } catch {}
}
</script>

<template>
  <div class="pane notes">
    <div class="notes__head">
      <div class="notes__name">{{ article.title }}</div>
      <div class="otags notes__stats">
        <span class="otag otag--blue">已读 {{ Math.round(pct * 100) }}%</span>
        <span class="otag">{{ annotations.length }} 条想法</span>
        <span v-if="marks" class="otag">{{ marks }} 条划线</span>
        <span v-if="lost.length" class="otag otag--warn">{{ lost.length }} 条待定位</span>
      </div>
    </div>

    <p v-if="!online" class="pane__hint">
      批注服务没启动（端口 43999）。现在只能读。<br />
      启动：<code>npm start</code>，然后刷新。
    </p>
    <p v-else-if="drafts" class="pane__hint">
      有 {{ drafts }} 条草稿待补写，正在尝试…<button class="link" @click="emit('refresh')">重试</button>
    </p>

    <p v-if="loading" class="pane__hint">载入批注…</p>

    <template v-for="g in groups" :key="g.key">
      <h4 class="notes__chapter">{{ g.title }}</h4>
      <div v-for="a in g.items" :key="a.key" class="notecard" :data-row="a.rowIndex" :data-key="a.key">
        <button class="notecard__main" @click="emit('jump', a.rowIndex)">
          <span class="notecard__quote">{{ a.quote || '（原文已改动）' }}</span>
          <span v-if="a.text" class="notecard__body" v-html="esc(a.text).replace(/\n/g, '<br>')"></span>
          <span class="notecard__foot">
            {{ a.layer === 'zh' ? '对照' : '正文' }}
            <em v-if="a.mark">{{ MARK_LABEL[a.mark] || '划线' }}</em>
            <em v-if="a.relinkedNow">· 已重新定位</em>
          </span>
        </button>
        <button class="notecard__del" title="修改这条" @click.stop="emit('edit', a.key)">✎</button>
        <button class="notecard__del" title="删除这条" @click.stop="emit('remove', a.key)">✕</button>
      </div>
    </template>

    <p v-if="!annotations.length && !loading" class="pane__hint">
      还没有想法。选中正文里的句子，点「写想法」；只划线不算想法。
    </p>

    <div v-if="lost.length" class="pane__lost">
      <div class="pane__head"><span>找不到位置</span><span class="muted">{{ lost.length }}</span></div>
      <div v-for="l in lost" :key="l.key" class="lostitem">
        <div class="lostitem__quote">{{ l.item.quote || l.item.text }}</div>
      </div>
    </div>

    <div v-if="annotations.length" class="notes__foot">
      <span class="notes__sum">{{ annotations.length }} 条 · {{ words }} 字</span>
      <button class="notes__copy" @click="copyAll">复制全部笔记</button>
    </div>
  </div>
</template>
