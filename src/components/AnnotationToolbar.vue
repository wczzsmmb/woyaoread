<script setup lang="ts">
import type { MarkKind } from '../lib/types'
import { isHl, TINTS } from '../lib/types'

defineProps<{
  /** 视口坐标（尾巴指这里） */
  x: number
  y: number
  /** 'new'：对准选中文字新建；'edit'：操作某条已有划线 */
  mode: 'new' | 'edit'
  /** 当前颜色（new 模式的落笔色 / edit 模式的换色预选） */
  tint: MarkKind
  /** 选区上方空间不够，工具条翻到文字下方 */
  below?: boolean
  /** edit 模式下那条划线现在的样式，用于打蓝点 */
  cur?: MarkKind
}>()

const emit = defineEmits<{
  (e: 'pick-tint', k: MarkKind): void
  (e: 'copy'): void
  (e: 'marker'): void
  (e: 'wave'): void
  (e: 'line'): void
  (e: 'dash'): void
  (e: 'del'): void
  (e: 'idea'): void
}>()
</script>

<template>
  <div class="selbar" :class="{ 'is-below': below }" :style="{ left: x + 'px', top: y + 'px' }">
    <!-- 颜色栏：独立的深灰胶囊（图一：粉 紫 蓝 ✓ 绿 黄） -->
    <div class="selbar__dots" @mousedown.prevent>
      <button
        v-for="t in TINTS"
        :key="t.k"
        type="button"
        class="selbar__dot"
        :class="{ 'is-pick': tint === t.k }"
        aria-label="选马克笔的颜色"
        @click="emit('pick-tint', t.k)"
      >
        <i :style="{ background: t.c }" />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5.5 12.5 10 17l8.5-10" />
        </svg>
      </button>
    </div>
    <!-- 动作条：独立的深灰圆角面板，尾巴只挂在它上面 -->
    <div class="selbar__acts" @mousedown.prevent>
      <button type="button" @click="emit('copy')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
          <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
          <path d="M15.5 5.5a2 2 0 0 0-2-2H6.5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2" />
        </svg>
        <span>复制</span>
      </button>
      <button type="button" :class="{ 'is-cur': mode === 'edit' && !!cur && isHl(cur) }" @click="emit('marker')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4.5" fill="rgba(255,255,255,.16)" stroke="none" />
          <path d="M8 16.5 12 7.2l4 9.3M9.9 13.6h4.2" />
        </svg>
        <span>马克笔</span>
      </button>
      <button type="button" :class="{ 'is-cur': mode === 'edit' && (!!cur && String(cur).startsWith('wave')) }" @click="emit('wave')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8.7 13.2 12 6.6l3.3 6.6M9.9 11h4.2" />
          <path d="M4.5 18.8c1.5-2.1 2.7-2.1 4.2 0s2.7 2.1 4.2 0 2.7-2.1 4.2 0" stroke="#80AAF8" />
        </svg>
        <span>波浪线</span>
      </button>
      <button
        type="button"
        :class="{ 'is-cur': mode === 'edit' && (cur === 'line') }"
        @click="emit('line')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8.7 13.2 12 6.6l3.3 6.6M9.9 11h4.2" />
          <path d="M5 18.8h14" stroke="#FE4D4A" />
        </svg>
        <span>直线</span>
      </button>
      <button type="button" :class="{ 'is-cur': mode === 'edit' && cur === 'dash' }" @click="emit('dash')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8.7 13.2 12 6.6l3.3 6.6M9.9 11h4.2" />
          <path d="M5 18.8h2.2M9 18.8h2.2M13 18.8h2.2M17 18.8h2" stroke="#E2685F" />
        </svg>
        <span>虚线</span>
      </button>
      <button type="button" @click="emit('del')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8.7 13.6 12 7.2l3.3 6.4M9.8 11.2h4.4" />
          <path d="M6 19.5 18 5.5" />
        </svg>
        <span>删除划线</span>
      </button>
      <button type="button" @click="emit('idea')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
          <path d="M4 5.5h16v9.5h-8.5L7 18.5V15H4z" />
        </svg>
        <span>写想法</span>
      </button>
    </div>
  </div>
</template>
