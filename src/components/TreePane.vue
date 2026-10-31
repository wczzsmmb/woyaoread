<script setup lang="ts">
import type { CatNode } from '../lib/types'

const props = withDefaults(
  defineProps<{
    cats: CatNode[]
    active: string
    query: string
    toc?: { h: string; text: string; depth: number }[]
    keywords?: string[]
  }>(),
  { toc: () => [], keywords: () => [] },
)

const emit = defineEmits<{
  (e: 'pick', name: string): void
  (e: 'update:query', v: string): void
  (e: 'jump', h: string): void
}>()

const depthOf = (c: CatNode) => Math.max(0, c.path.length - 1)
void props
</script>

<template>
  <div class="tree">
    <input
      class="input"
      type="search"
      :value="query"
      placeholder="搜标题 / 分类 / 关键词"
      spellcheck="false"
      @input="emit('update:query', ($event.target as HTMLInputElement).value)"
    />

    <div v-if="toc.length || keywords.length" class="tree__sect">
      <div class="tree__label">本篇</div>
      <button
        v-for="t in toc"
        :key="t.h"
        class="tree__toc"
        :class="`lvl-${t.depth}`"
        @click="emit('jump', t.h)"
      >
        {{ t.text }}
      </button>
      <div v-if="keywords.length" class="tree__kws">
        <span v-for="k in keywords" :key="k" class="kw">#{{ k }}</span>
      </div>
    </div>

    <nav class="tree__list">
      <div class="tree__label">分类</div>
      <button class="cat" :class="{ 'is-on': !active }" @click="emit('pick', '')">
        <span>全部</span>
      </button>
      <button
        v-for="c in cats"
        :key="c.path.join('/')"
        class="cat"
        :class="{ 'is-on': active === c.name, [`d${depthOf(c)}`]: true }"
        @click="emit('pick', c.name)"
      >
        <span>{{ c.name }}</span><em>{{ c.ids.length }}</em>
      </button>
    </nav>
  </div>
</template>
