<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { progressOf } from '../lib/progress'
import type { ArticleMeta, CatNode } from '../lib/types'

/**
 * 目录 / 我的书架（桌面面板和手机抽屉共用一套）。
 * 两页：目录（本篇提纲 + 关键词）· 我的书架（搜索 + 分类 + 全部篇目）。
 * 桌面从 .panel 里打开、手机从底部抽屉里打开，所以这层只管排版，不加外边距。
 */
const props = withDefaults(
  defineProps<{
    toc: { h: string; text: string; depth: number }[]
    rows: { h: string }[]
    activeH: string
    pct: number
    title: string
    author?: string
    year?: number | null
    keywords?: string[]
    articles: ArticleMeta[]
    /** 书架里的总篇数（分类筛选时「全部」的计数不能跟着变） */
    total: number
    currentId: string
    query: string
    cats: CatNode[]
    catFilter: string
  }>(),
  { author: '', year: null, keywords: () => [] },
)

const emit = defineEmits<{
  (e: 'jump', h: string): void
  (e: 'open', id: string): void
  (e: 'update:query', v: string): void
  (e: 'pick-cat', name: string): void
}>()

const tab = ref<'toc' | 'shelf'>('toc')
const listEl = ref<HTMLElement | null>(null)

/** 注意：别叫 total —— 会把同名的 props.total（书架总篇数）遮住 */
const rowCount = computed(() => props.rows.length || 1)
const posOf = (h: string) => {
  const i = props.rows.findIndex((r) => r.h === h)
  return i < 0 ? 0 : i / Math.max(1, rowCount.value - 1)
}
const readOf = (id: string) => Math.round(progressOf(id) * 100)

watch(tab, async (v) => {
  if (v !== 'toc') return
  await nextTick()
  listEl.value?.querySelector('.trow.is-on')?.scrollIntoView({ block: 'center' })
})
</script>

<template>
  <div class="opane">
    <!-- 书目：标题 + 一排胶囊（作者 / 年份 / 已读） -->
    <header class="obook">
      <h2 class="obook__title">{{ title }}</h2>
      <div class="otags">
        <span v-if="author" class="otag otag--wide">{{ author }}</span>
        <span v-if="year" class="otag">{{ year }}</span>
        <span class="otag otag--blue">已读 {{ Math.round(pct * 100) }}%</span>
      </div>
    </header>

    <div class="tseg" role="tablist">
      <button role="tab" :aria-selected="tab === 'toc'" :class="{ 'is-on': tab === 'toc' }" @click="tab = 'toc'">
        目录
      </button>
      <button role="tab" :aria-selected="tab === 'shelf'" :class="{ 'is-on': tab === 'shelf' }" @click="tab = 'shelf'">
        我的书架
      </button>
    </div>

    <!-- 目录 -->
    <div v-if="tab === 'toc'" ref="listEl" class="tlist">
      <button
        v-for="t in toc"
        :key="t.h"
        class="trow"
        :class="[`lvl-${t.depth}`, { 'is-on': activeH === t.h }]"
        @click="emit('jump', t.h)"
      >
        <span class="trow__text">{{ t.text }}</span>
        <span v-if="activeH === t.h" class="trow__now">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">
            <path d="M12 6.4C10.6 5.2 8.6 4.6 6.6 4.6H4.4v12.9h2.2c2 0 4 .6 5.4 1.8 1.4-1.2 3.4-1.8 5.4-1.8h2.2V4.6h-2.2c-2 0-4 .6-5.4 1.8zM12 6.4v12.9" />
          </svg>
          当前读到
        </span>
        <span v-else class="trow__pos">{{ Math.round(posOf(t.h) * 100) }}%</span>
      </button>

      <p v-if="!toc.length" class="tsheet__empty">这一篇还没有分节标题。</p>

      <div v-if="keywords.length" class="okws">
        <div class="olabel">关键词</div>
        <div class="otags">
          <span v-for="k in keywords" :key="k" class="otag otag--kw">#{{ k }}</span>
        </div>
      </div>
    </div>

    <!-- 我的书架 -->
    <div v-else class="tlist">
      <label class="psearch">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6">
          <circle cx="9" cy="9" r="5.5" />
          <path d="m13.5 13.5 3 3" stroke-linecap="round" />
        </svg>
        <input
          type="search"
          :value="query"
          placeholder="搜标题 / 分类 / 关键词"
          spellcheck="false"
          @input="emit('update:query', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <div class="pchips">
        <button class="pchip" :class="{ 'is-on': !catFilter }" @click="emit('pick-cat', '')">
          全部
          <em>{{ total }}</em>
        </button>
        <button
          v-for="c in cats"
          :key="c.path.join('/')"
          class="pchip"
          :class="{ 'is-on': catFilter === c.name }"
          @click="emit('pick-cat', c.name)"
        >
          {{ c.name }}
          <em>{{ c.ids.length }}</em>
        </button>
      </div>

      <button
        v-for="a in articles"
        :key="a.id"
        class="prow"
        :class="{ 'is-on': a.id === currentId }"
        @click="emit('open', a.id)"
      >
        <span class="prow__main">
          <span class="prow__text">{{ a.title }}</span>
          <span v-if="a.keywords && a.keywords.length" class="prow__kws">
            {{ a.keywords.map((k) => '#' + k).join('  ') }}
          </span>
        </span>
        <span class="prow__pct">{{ readOf(a.id) }}%</span>
      </button>
      <p v-if="!articles.length" class="tsheet__empty">没有匹配的篇目。</p>
    </div>
  </div>
</template>
