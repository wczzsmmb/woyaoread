<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchIndex } from '../lib/api'
import { openArticle } from '../lib/router'
import type { ArticleMeta, SiteIndex } from '../lib/types'

const index = ref<SiteIndex | null>(null)
const error = ref('')
const query = ref('')
const activeCat = ref<string>('')

onMounted(async () => {
  try {
    index.value = await fetchIndex()
    document.title = index.value.site.title || '对页'
  } catch (e) {
    error.value = String((e as Error).message || e)
  }
})

const cats = computed(() => {
  const list = index.value?.cats || []
  return list
    .map((c) => ({ ...c, depth: Math.max(0, c.path.length - 1) }))
    .sort((a, b) => a.path.join('/').localeCompare(b.path.join('/'), 'zh'))
})

const articles = computed(() => {
  const all = index.value?.articles || []
  const q = query.value.trim().toLowerCase()
  return all.filter((a) => {
    if (activeCat.value && !a.cats.includes(activeCat.value)) {
      if (!a.cats.join('/').startsWith(activeCat.value)) return false
    }
    if (!q) return true
    const hay = [a.title, a.slug, ...a.cats, ...(a.keywords || [])].join(' ').toLowerCase()
    return hay.includes(q)
  })
})

const pick = (name: string) => {
  activeCat.value = activeCat.value === name ? '' : name
}

const fmt = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1)} 万字` : `${Math.max(1, Math.round(n / 1000))} 千字`)
const ratioText = (r: number) => (r > 0 ? `${Math.round(r * 100)}% 对照` : '单栏')
void (null as unknown as ArticleMeta)
</script>

<template>
  <div class="shelf">
    <header class="shelf__head">
      <div class="brand">
        <h1 class="brand__name">{{ index?.site.title || '对页' }}</h1>
        <span class="brand__sub">{{ index?.site.subtitle || '左选 · 中读 · 右对照' }}</span>
      </div>
      <div class="shelf__tools">
        <input v-model="query" class="input" type="search" placeholder="搜标题 / 分类 / 关键词" spellcheck="false" />
        <span class="muted">{{ articles.length }} / {{ index?.articles.length || 0 }}</span>
      </div>
    </header>

    <p v-if="error" class="state">读不到 data/index.json：{{ error }}<br />先跑 <code>npm run build</code> 或 <code>npm run dev</code>。</p>

    <div v-else class="shelf__body">
      <aside class="shelf__cats">
        <button class="cat" :class="{ 'is-on': !activeCat }" @click="activeCat = ''">
          <span>全部</span><em>{{ index?.articles.length || 0 }}</em>
        </button>
        <button
          v-for="c in cats"
          :key="c.path.join('/')"
          class="cat"
          :class="{ 'is-on': activeCat === c.name, [`d${c.depth}`]: true }"
          @click="pick(c.name)"
        >
          <span>{{ c.name }}</span><em>{{ c.ids.length }}</em>
        </button>
        <p v-if="!cats.length" class="muted pad">还没有分类。目录名就是分类。</p>
      </aside>

      <main class="shelf__list">
        <button v-for="a in articles" :key="a.id" class="item" @click="openArticle(a.id)">
          <span class="item__title">{{ a.title }}</span>
          <span class="item__meta">
            <span class="tag">{{ a.cats.join(' / ') || '未分类' }}</span>
            <span>{{ a.blocks }} 块</span>
            <span>{{ fmt(a.chars) }}</span>
            <span :class="{ dim: !a.hasZh }">{{ ratioText(a.alignRatio) }}</span>
            <span v-for="k in a.keywords.slice(0, 3)" :key="k" class="kw">#{{ k }}</span>
          </span>
        </button>
        <p v-if="!articles.length" class="state pad">没有匹配的篇目。</p>
      </main>
    </div>
  </div>
</template>
