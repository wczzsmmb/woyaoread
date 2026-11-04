<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { ArticleMeta, CatNode } from '../../lib/types'

/**
 * 手机端的目录抽屉：两页——本篇目录 / 换一篇。
 * 目录里当前小节标蓝并写「当前读到」，右边给个大概百分比（手机是滚动阅读，没有页码）。
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
    articles: ArticleMeta[]
    currentId: string
    query: string
    cats: CatNode[]
    catFilter: string
  }>(),
  { author: '', year: null },
)

const emit = defineEmits<{
  (e: 'jump', h: string): void
  (e: 'open', id: string): void
  (e: 'update:query', v: string): void
  (e: 'pick-cat', name: string): void
}>()

const tab = ref<'toc' | 'list'>('toc')
const listEl = ref<HTMLElement | null>(null)

const total = computed(() => props.rows.length || 1)
const posOf = (h: string) => {
  const i = props.rows.findIndex((r) => r.h === h)
  return i < 0 ? 0 : i / Math.max(1, total.value - 1)
}

onMounted(async () => {
  await nextTick()
  listEl.value?.querySelector('.trow.is-on')?.scrollIntoView({ block: 'center' })
})
</script>

<template>
  <div class="tsheet">
    <div class="tseg">
      <button :class="{ 'is-on': tab === 'toc' }" @click="tab = 'toc'">目录</button>
      <button :class="{ 'is-on': tab === 'list' }" @click="tab = 'list'">换一篇</button>
    </div>

    <div v-if="tab === 'toc'" ref="listEl" class="tlist">
      <div class="tbook">
        <div class="tbook__meta">
          <template v-if="author">{{ author }} · </template>
          <template v-if="year">{{ year }} · </template>
          本篇 {{ toc.length }} 节 · 已读 {{ Math.round(pct * 100) }}%
        </div>
      </div>

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
    </div>

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
        <button class="pchip" :class="{ 'is-on': !catFilter }" @click="emit('pick-cat', '')">全部</button>
        <button
          v-for="c in cats"
          :key="c.path.join('/')"
          class="pchip"
          :class="{ 'is-on': catFilter === c.name }"
          @click="emit('pick-cat', c.name)"
        >
          {{ c.name }}
        </button>
      </div>

      <button
        v-for="a in articles"
        :key="a.id"
        class="prow"
        :class="{ 'is-on': a.id === currentId }"
        @click="emit('open', a.id)"
      >
        <span class="prow__text">{{ a.title }}</span>
        <span class="prow__meta">
          {{ a.cats.at(-1) || '未分类' }}
          <template v-if="a.hasZh"> · 对照</template>
        </span>
      </button>
      <p v-if="!articles.length" class="tsheet__empty">没有匹配的篇目。</p>
    </div>
  </div>
</template>
