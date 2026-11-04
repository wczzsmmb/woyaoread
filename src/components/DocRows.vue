<script setup lang="ts">
/**
 * 正文渲染行。批注的画法在 annotator.ts（CSS Custom Highlight API），
 * 这里不再往正文里注入任何标记节点 —— 结构对批注系统完全透明。
 */
import { ref } from 'vue'
import type { Row } from '../lib/types'

const active = ref<string | null>(null)

function activate(row: Row, e: MouseEvent) {
  const t = e.target as HTMLElement
  if (t.closest('a, .pen')) return
  active.value = active.value === row.h ? null : row.h
}

defineProps<{
  rows: Row[]
  paired: boolean
  canAnnotate: boolean
  script?: 'cjk' | 'latin'
}>()

const emit = defineEmits<{
  (e: 'edit', payload: {
    row: Row
    layer: 'index' | 'zh'
    index: number
    x: number
    y: number
    /** 点 ✎ 时如果这一段里正好有选中文字，就只标那一句，别退回整段 */
    quote?: string
  }): void
}>()

/** 这一段里当前选中的文字（不在这一段就返回空） */
function quoteIn(cell: HTMLElement | null) {
  const s = window.getSelection()
  if (!s || s.isCollapsed || !s.rangeCount) return ''
  const node = s.getRangeAt(0).commonAncestorContainer
  const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement)
  if (!cell || !el || !cell.contains(el)) return ''
  return s.toString().trim()
}

function penEdit(row: Row, layer: 'index' | 'zh', index: number, e: MouseEvent) {
  const cell = (e.currentTarget as HTMLElement | null)?.parentElement ?? null
  emit('edit', {
    row,
    layer,
    index,
    x: e.clientX,
    y: e.clientY,
    quote: quoteIn(cell) || undefined,
  })
}
</script>

<template>
  <div class="rows" :class="{ 'rows--paired': paired }">
    <div
      v-for="(row, i) in rows"
      :key="row.h"
      class="row"
      :class="[
        `row--${row.type}`,
        {
          'row--noref': paired && !row.right,
        },
      ]"
      :id="'b-' + row.h"
      :data-bh="row.h"
      :data-depth="row.depth ?? undefined"
    >
      <div class="cell cell--doc" :class="{ 'is-active': active === row.h }" @click="activate(row, $event)">
        <div class="md" :class="{ 'md--latin': script === 'latin' }" v-html="row.html"></div>
        <button
          v-if="canAnnotate"
          class="pen"
          type="button"
          title="写想法（选中了文字就只标那一句）"
          aria-label="写想法"
          @mousedown.prevent
          @click="penEdit(row, 'index', i, $event)"
        >
          ✎
        </button>
      </div>

      <div v-if="paired" class="cell cell--ref">
        <div v-if="row.right" class="md" :class="{ 'md--latin': script === 'latin' }" v-html="row.right"></div>
        <span v-else class="noref">这段没有对照</span>
        <button
          v-if="canAnnotate && row.rh"
          class="pen"
          type="button"
          title="写想法（选中了文字就只标那一句）"
          @mousedown.prevent
          @click="penEdit(row, 'zh', i, $event)"
        >
          ✎
        </button>
      </div>
    </div>
  </div>
</template>
