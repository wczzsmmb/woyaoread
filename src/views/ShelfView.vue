<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchIndex } from '../lib/api'
import { openArticle } from '../lib/router'
import { isStarred, progressOf, recentIds } from '../lib/progress'
import { layout } from '../lib/layout'
import type { ArticleMeta, SiteIndex } from '../lib/types'

const index = ref<SiteIndex | null>(null)
const error = ref('')
const query = ref('')
const activeCat = ref<string>('')
const onlyStar = ref(false)
const logoUrl = './logo.svg'

onMounted(async () => {
  try {
    index.value = await fetchIndex()
    document.title = index.value.site.title || '我要读书'
  } catch (e) {
    error.value = String((e as Error).message || e)
  }
})

const continueList = computed(() => {
  const all = index.value?.articles || []
  return recentIds()
    .map((id) => all.find((a) => a.id === id))
    .filter(Boolean)
    .slice(0, 8) as typeof all
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
    if (onlyStar.value && !isStarred(a.id)) return false
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
    <header class="hero">
      <h1 class="hero__name">
        <img class="hero__logo" :src="logoUrl" alt="" width="30" height="30" />
        <span>{{ index?.site.title || '我要读书' }}</span>
      </h1>


      <label class="hero__search">
        <svg class="hero__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6">
          <circle cx="9" cy="9" r="5.5" />
          <path d="m13.5 13.5 3 3" stroke-linecap="round" />
        </svg>
        <input v-model="query" type="search" placeholder="搜标题 / 分类 / 关键词" spellcheck="false" />
      </label>

      <div class="chips">
        <button class="chip chip--star" :class="{ 'is-on': onlyStar }" @click="onlyStar = !onlyStar">
          收藏<em>{{ index?.articles.filter((a) => isStarred(a.id)).length || 0 }}</em>
        </button>
        <button class="chip" :class="{ 'is-on': !activeCat && !onlyStar }" @click="(activeCat = ''), (onlyStar = false)">
          全部<em>{{ index?.articles.length || 0 }}</em>
        </button>
        <button
          v-for="c in cats"
          :key="c.path.join('/')"
          class="chip"
          :class="{ 'is-on': activeCat === c.name }"
          @click="pick(c.name)"
        >
          {{ c.name }}<em>{{ c.ids.length }}</em>
        </button>
      </div>
    </header>

    <p v-if="error" class="state">
      读不到 data/index.json：{{ error }}<br />先跑 <code>npm run build</code> 或 <code>npm run dev</code>。
    </p>

    <template v-else>
      <section v-if="continueList.length && !activeCat && !query" class="rack rack--continue">
        <div class="rack__head">
          <h2>继续阅读</h2>
          <span class="rack__more">{{ continueList.length }} 篇</span>
        </div>
        <div class="rail">
          <button
            v-for="a in continueList"
            :key="a.id"
            class="continue"
            :style="{ '--hu': hue(a.slug) }"
            @click="openArticle(a.id)"
          >
            <span class="continue__cover">{{ a.title.trim().slice(0, 1) }}</span>
            <span class="continue__body">
              <span class="continue__name">{{ a.title }}</span>
              <span class="continue__bar"><i :style="{ width: Math.round(progressOf(a.id) * 100) + '%' }"></i></span>
              <span class="continue__meta">{{ Math.round(progressOf(a.id) * 100) }}% · {{ a.blocks }} 块</span>
            </span>
          </button>
        </div>
      </section>

      <section class="rack">
        <div class="rack__head">
          <h2>{{ activeCat || '全部篇目' }}</h2>
          <div class="rack__side">
            <button
              class="chip chip--cover"
              :class="{ 'is-on': layout.covers }"
              :aria-pressed="layout.covers"
              :title="layout.covers ? '隐藏封面' : '显示封面'"
              @click="layout.covers = !layout.covers"
            >
              封面
            </button>
            <a class="rack__more">{{ articles.length }} 篇</a>
          </div>
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
              <span class="book__glyph">{{ a.title.trim().slice(0, 1) }}</span>
              <span class="book__year">{{ a.year || '' }}</span>
            </span>
            <span class="book__name">{{ a.title }}</span>
            <span class="book__author">{{ a.authors || a.cats[0] || '未分类' }}</span>
            <span class="book__meta">
              <span v-if="isStarred(a.id)" class="book__star">★</span>
              {{ a.blocks }} 块 · {{ ratioText(a.alignRatio) }}
            </span>
          </button>
        </div>
        <p v-if="!articles.length" class="state pad">没有匹配的篇目。</p>
      </section>
    </template>
  </div>
</template>
