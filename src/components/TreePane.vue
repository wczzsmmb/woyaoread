<script setup lang="ts">
import type { CatNode } from '../lib/types'

const props = defineProps<{
  cats: CatNode[]
  active: string
  query: string
}>()

const emit = defineEmits<{
  (e: 'pick', name: string): void
  (e: 'update:query', v: string): void
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
    <nav class="tree__list">
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
