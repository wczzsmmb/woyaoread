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

const hue = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
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
      <div class="searchbar">
        <svg class="searchbar__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6">
          <circle cx="9" cy="9" r="5.5" />
          <path d="m13.5 13.5 3 3" stroke-linecap="round" />
        </svg>
        <input v-model="query" class="searchbar__input" type="search" placeholder="搜标题 / 分类 / 关键词" spellcheck="false" />
      </div>
    </header>

    <p v-if="error" class="state">
      读不到 data/index.json：{{ error }}<br />先跑 <code>npm run build</code> 或 <code>npm run dev</code>。
    </p>

    <template v-else>
      <div class="chips">
        <button class="chip" :class="{ 'is-on': !activeCat }" @click="activeCat = ''">
          全部 <em>{{ index?.articles.length || 0 }}</em>
        </button>
        <button
          v-for="c in cats"
          :key="c.path.join('/')"
          class="chip"
          :class="{ 'is-on': activeCat === c.name }"
          @click="pick(c.name)"
        >
          {{ c.name }} <em>{{ c.ids.length }}</em>
        </button>
      </div>

      <section class="rack">
        <div class="rack__head">
          <h2>{{ activeCat || '我的书架' }}</h2>
          <span class="rack__count">{{ articles.length }} 篇</span>
        </div>
        <div class="books">
          <button
            v-for="a in articles"
            :key="a.id"
            class="book"
            :style="{ '--hu': hue(a.slug) }"
            @click="openArticle(a.id)"
          >
            <span class="book__cover">
              <span class="book__cat">{{ a.cats.at(-1) || '未分类' }}</span>
              <span class="book__title">{{ a.title }}</span>
              <span class="book__rule"></span>
              <span class="book__year">{{ a.year || '' }}</span>
            </span>
            <span class="book__meta">{{ a.blocks }} 块 · {{ ratioText(a.alignRatio) }}</span>
          </button>
        </div>
        <p v-if="!articles.length" class="state pad">没有匹配的篇目。</p>
      </section>
    </template>
  </div>
</template>
