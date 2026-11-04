<script setup lang="ts">
import { computed } from 'vue'
import {
  FONT_LABEL,
  layout,
  MEASURE_LABEL,
  RATIOS,
  THEME_LABEL,
  type FontKind,
  type Measure,
  type Mode,
  type Ratio,
  type Theme,
} from '../lib/layout'

const props = defineProps<{ hasZh: boolean }>()

const ratios = Object.keys(RATIOS) as Ratio[]
const modes: { key: Mode; name: string }[] = [
  { key: 'spread', name: '对开' },
  { key: 'compare', name: '对照' },
  { key: 'single', name: '单栏' },
]
const measures = Object.keys(MEASURE_LABEL) as Measure[]
const fonts = Object.keys(FONT_LABEL) as FontKind[]
const themes: { key: Theme; bg: string; line: string }[] = [
  { key: 'light', bg: '#ffffff', line: '#e6e7e9' },
  { key: 'sepia', bg: '#f8f4ea', line: '#e5dccc' },
  { key: 'green', bg: '#e6eddf', line: '#cfd9c7' },
  { key: 'dark', bg: '#1c1d20', line: '#2b2c2f' },
]
const compareOk = computed(() => props.hasZh)
</script>

<template>
  <div class="settings">
    <section class="field">
      <div class="field__label">版式</div>
      <div class="seg">
        <button
          v-for="m in modes"
          :key="m.key"
          :class="{ 'is-on': layout.mode === m.key }"
          :disabled="m.key === 'compare' && !compareOk"
          @click="layout.mode = m.key"
        >
          {{ m.name }}
        </button>
      </div>
    </section>

    <section class="field">
      <div class="field__label">字号 <em>{{ layout.fontSize }}px</em></div>
      <div class="aaslider">
        <span>A</span>
        <input v-model.number="layout.fontSize" class="range" type="range" min="18" max="40" step="1" />
        <span class="aaslider__max">A</span>
      </div>
    </section>

    <section class="field">
      <div class="field__label">行距 <em>{{ layout.lineHeight.toFixed(2) }}</em></div>
      <input v-model.number="layout.lineHeight" class="range" type="range" min="1.4" max="2.2" step="0.05" />
    </section>

    <section class="field">
      <div class="field__label">页边距</div>
      <div class="seg">
        <button
          v-for="m in measures"
          :key="m"
          :class="{ 'is-on': layout.measure === m }"
          @click="layout.measure = m"
        >
          {{ MEASURE_LABEL[m] }}
        </button>
      </div>
    </section>

    <section class="field">
      <div class="field__label">字体</div>
      <div class="seg">
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
    </section>

    <section class="field">
      <div class="field__label">纸色</div>
      <div class="swatches">
        <button
          v-for="t in themes"
          :key="t.key"
          :class="{ 'is-on': layout.theme === t.key }"
          @click="layout.theme = t.key"
        >
          <i :style="{ background: t.bg, borderColor: t.line }"></i>
          <span>{{ THEME_LABEL[t.key] }}</span>
        </button>
      </div>
    </section>

    <section v-if="compareOk" class="field">
      <div class="field__label">对照宽度 <em>{{ layout.ratio }}</em></div>
      <div class="seg seg--wrap">
        <button
          v-for="r in ratios"
          :key="r"
          :class="{ 'is-on': layout.ratio === r }"
          @click="layout.ratio = r"
        >
          {{ r }}
        </button>
      </div>
    </section>

    <section class="field">
      <div class="switchlist">
        <label class="switchrow">
          <span class="switchrow__name">首行缩进</span>
          <em class="switchrow__hint">每段开头空两字</em>
          <input v-model="layout.indent" class="switch" type="checkbox" />
        </label>
        <label class="switchrow">
          <span class="switchrow__name">沉浸模式</span>
          <em class="switchrow__hint">藏起顶栏，鼠标贴顶唤出</em>
          <input v-model="layout.immersive" class="switch" type="checkbox" />
        </label>
      </div>
    </section>

    <div class="keys">
      <span class="key"><kbd>←</kbd><kbd>→</kbd>翻页</span>
      <span class="key"><kbd>M</kbd>版式</span>
      <span class="key"><kbd>T</kbd>目录</span>
      <span class="key"><kbd>N</kbd>批注</span>
      <span class="key"><kbd>S</kbd>排版</span>
      <span class="key"><kbd>D</kbd>纸色</span>
      <span class="key"><kbd>Esc</kbd>收起</span>
    </div>
  </div>
</template>
