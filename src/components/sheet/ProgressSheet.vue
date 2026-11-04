<script setup lang="ts">
import { ref } from 'vue'

/**
 * 阅读进度（手机上的「进度」那一格）：
 * 三个数（进度 / 时长 / 笔记）+ 一条拖动的进度条 + 两个微调按钮。
 */
const props = defineProps<{ pct: number; minutes: number; notes: number; marks: number }>()

const emit = defineEmits<{
  (e: 'seek', p: number): void
  (e: 'step', d: number): void
  (e: 'top'): void
}>()

const track = ref<HTMLElement | null>(null)
let dragging = false

const ratioAt = (x: number) => {
  const r = track.value?.getBoundingClientRect()
  if (!r || !r.width) return 0
  return Math.max(0, Math.min(1, (x - r.left) / r.width))
}

function down(e: PointerEvent) {
  dragging = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  emit('seek', ratioAt(e.clientX))
}

function move(e: PointerEvent) {
  if (dragging) emit('seek', ratioAt(e.clientX))
}

const up = () => (dragging = false)

void props
</script>

<template>
  <div class="progsheet">
    <div class="stats">
      <div class="stats__cell">
        <b>{{ Math.round(pct * 100) }}<em>%</em></b>
        <span>阅读进度</span>
      </div>
      <div class="stats__cell">
        <b>{{ minutes }}<em>分钟</em></b>
        <span>阅读时长</span>
      </div>
      <div class="stats__cell">
        <b>{{ notes }}<em>条</em></b>
        <span>笔记</span>
      </div>
    </div>

    <div class="pslider">
      <button class="pslider__step" aria-label="上一屏" @click="emit('step', -1)">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <path d="M12 5.5 7.5 10l4.5 4.5" />
        </svg>
      </button>
      <div
        ref="track"
        class="pslider__track"
        role="slider"
        :aria-valuenow="Math.round(pct * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="阅读进度"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="up"
      >
        <span class="pslider__fill" :style="{ width: pct * 100 + '%' }" />
        <span class="pslider__thumb" :style="{ left: `clamp(23px, ${pct * 100}%, calc(100% - 23px))` }" />
        <span v-if="marks" class="pslider__marks">另有 {{ marks }} 条划线</span>
      </div>
      <button class="pslider__step" aria-label="下一屏" @click="emit('step', 1)">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <path d="M8 5.5 12.5 10 8 14.5" />
        </svg>
      </button>
    </div>

    <div class="pbtns">
      <button class="pill" @click="emit('top')">回到开头</button>
      <button class="pill" @click="emit('seek', 1)">跳到结尾</button>
    </div>
  </div>
</template>
