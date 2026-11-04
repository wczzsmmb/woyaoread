<script setup lang="ts">
import { computed, ref } from 'vue'
import { FONT_LABEL, layout, type FontKind, type Measure, type Mode } from '../../lib/layout'

/**
 * 字号 / 排版（照微信读书那个面板）：
 * A —— 滑块 —— A（数值在白色圆钮里）、边距与行距两条胶囊、下面一排选项。
 */
const props = defineProps<{ hasZh: boolean }>()

const fonts = Object.keys(FONT_LABEL) as FontKind[]
const lhSteps = [1.65, 1.85, 2.05]
const more = ref<'' | 'font' | 'mode'>('')

const fsPct = computed(() => ((layout.fontSize - 14) / 12) * 100)

const lhIndex = computed(() => {
  let best = 0
  let dist = 9
  lhSteps.forEach((v, i) => {
    const d = Math.abs(v - layout.lineHeight)
    if (d < dist) {
      dist = d
      best = i
    }
  })
  return best
})

const measureOf = (m: Measure) => layout.measure === m
const setMode = (m: Mode) => (layout.mode = m)
const isCompare = computed(() => layout.mode === 'compare')
void props
</script>

<template>
  <div class="typesheet">
    <div class="fsrow">
      <span class="fsrow__a">A</span>
      <div class="fsrow__track">
        <input v-model.number="layout.fontSize" type="range" min="14" max="26" step="1" aria-label="字号" />
        <span class="fsrow__thumb" :style="{ left: `clamp(23px, ${fsPct}%, calc(100% - 23px))` }">
          {{ layout.fontSize }}
        </span>
      </div>
      <span class="fsrow__a fsrow__a--big">A</span>
    </div>

    <div class="pgap">
      <div class="pseg">
        <button :class="{ 'is-on': measureOf('narrow') }" @click="layout.measure = 'narrow'">小</button>
        <button :class="{ 'is-on': measureOf('normal') }" @click="layout.measure = 'normal'">边距</button>
        <button :class="{ 'is-on': measureOf('wide') }" @click="layout.measure = 'wide'">大</button>
      </div>
      <div class="pseg">
        <button :class="{ 'is-on': lhIndex === 0 }" @click="layout.lineHeight = lhSteps[0]">紧</button>
        <button :class="{ 'is-on': lhIndex === 1 }" @click="layout.lineHeight = lhSteps[1]">行距</button>
        <button :class="{ 'is-on': lhIndex === 2 }" @click="layout.lineHeight = lhSteps[2]">松</button>
      </div>
    </div>

    <div class="pills">
      <button class="pill" :class="{ 'is-on': more === 'font' }" @click="more = more === 'font' ? '' : 'font'">
        字体样式
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <path d="m8 5 5 5-5 5" />
        </svg>
      </button>
      <button class="pill" :class="{ 'is-on': layout.indent }" @click="layout.indent = !layout.indent">
        首行缩进
        <em>{{ layout.indent ? '开' : '关' }}</em>
      </button>
      <button
        v-if="hasZh"
        class="pill"
        :class="{ 'is-on': more === 'mode' }"
        @click="more = more === 'mode' ? '' : 'mode'"
      >
        版式
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <path d="m8 5 5 5-5 5" />
        </svg>
      </button>
    </div>

    <div v-if="more === 'font'" class="pseg pseg--wide">
      <button
        v-for="f in fonts"
        :key="f"
        :class="{ 'is-on': layout.font === f }"
        :style="{ fontFamily: f === 'kai' ? 'var(--font-ref)' : f === 'hei' ? 'var(--font-ui)' : 'var(--font-doc)' }"
        @click="layout.font = f"
      >
        {{ FONT_LABEL[f] }}
      </button>
    </div>

    <div v-if="more === 'mode'" class="pseg pseg--wide">
      <button :class="{ 'is-on': !isCompare }" @click="setMode('single')">单栏</button>
      <button :class="{ 'is-on': isCompare }" @click="setMode('compare')">中英对照</button>
    </div>
  </div>
</template>
