<script setup lang="ts">
import { ref } from 'vue'
import type { ResolvedAnn, Row } from '../lib/types'

const active = ref<string | null>(null)

function activate(row: Row, e: MouseEvent) {
  const t = e.target as HTMLElement
  if (t.closest('a, .anno, .pen')) return
  active.value = active.value === row.h ? null : row.h
}

const props = defineProps<{
  rows: Row[]
  paired: boolean
  annotations: Record<string, ResolvedAnn>
  canAnnotate: boolean
  script?: 'cjk' | 'latin'
}>()

const emit = defineEmits<{
  (e: 'edit', payload: { row: Row; layer: 'index' | 'zh'; index: number; x: number; y: number }): void
}>()

const esc = (s: string) =>
  String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const hashOf = (row: Row, layer: 'index' | 'zh') => (layer === 'index' ? row.h : row.rh)

const noteOf = (row: Row, layer: 'index' | 'zh'): ResolvedAnn | null => {
  const h = hashOf(row, layer)
  if (!h) return null
  return props.annotations[`${layer}::${h}`] || null
}
</script>

<template>
  <div class="rows" :class="{ 'rows--paired': paired }">
    <div
      v-for="(row, i) in rows"
      :key="row.h"
      class="row"
      :class="[`row--${row.type}`, { 'row--noref': paired && !row.right }]"
      :id="'b-' + row.h"
    >
      <div class="cell cell--doc" :class="{ 'is-active': active === row.h }" @click="activate(row, $event)">
        <div class="md" :class="{ 'md--latin': script === 'latin' }" v-html="row.html"></div>
        <button
          v-if="canAnnotate"
          class="pen"
          type="button"
          title="给这一段写批注"
          aria-label="写批注"
          @click="emit('edit', { row, layer: 'index', index: i, x: $event.clientX, y: $event.clientY })"
        >
          ✎
        </button>
        <div
          v-if="noteOf(row, 'index')"
          class="anno"
          role="button"
          tabindex="0"
          @click="emit('edit', { row, layer: 'index', index: i, x: $event.clientX, y: $event.clientY })"
        >
          <span class="anno__tag">
            {{ noteOf(row, 'index')!.relinkedNow ? '批注 · 已重新定位' : '批注' }}
          </span>
          <div class="anno__body" v-html="esc(noteOf(row, 'index')!.text).replace(/\n/g, '<br>')"></div>
        </div>
      </div>

      <div v-if="paired" class="cell cell--ref">
        <div v-if="row.right" class="md" :class="{ 'md--latin': script === 'latin' }" v-html="row.right"></div>
        <span v-else class="noref">这段没有对照</span>
        <button
          v-if="canAnnotate && row.rh"
          class="pen"
          type="button"
          title="给对照写批注"
          @click="emit('edit', { row, layer: 'zh', index: i, x: $event.clientX, y: $event.clientY })"
        >
          ✎
        </button>
        <div
          v-if="noteOf(row, 'zh')"
          class="anno"
          role="button"
          tabindex="0"
          @click="emit('edit', { row, layer: 'zh', index: i, x: $event.clientX, y: $event.clientY })"
        >
          <span class="anno__tag">批注</span>
          <div class="anno__body" v-html="esc(noteOf(row, 'zh')!.text).replace(/\n/g, '<br>')"></div>
        </div>
      </div>
    </div>
  </div>
</template>
