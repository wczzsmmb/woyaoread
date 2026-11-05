<script setup lang="ts">
import { computed } from 'vue'
import {
  DEFAULTS,
  FONT_LABEL,
  FONT_STACK,
  layout,
  RATIOS,
  THEME_LABEL,
  type FontKind,
  type Measure,
  type Mode,
  type Ratio,
  type Theme,
} from '../lib/layout'

/**
 * 排版面板（照简历编辑器那套表单）：
 * 分组小标题 → 卡片式控件；字体是一格一格的字体卡（名字用自己那套字 + 一行说明），
 * 开关是整行可点的浅色卡，底下放两条「恢复默认 / 清除缓存」。
 */
const props = defineProps<{ hasZh: boolean }>()

const ratios = Object.keys(RATIOS) as Ratio[]
const modes: { key: Mode; name: string }[] = [
  { key: 'spread', name: '对开' },
  { key: 'compare', name: '对照' },
  { key: 'single', name: '单栏' },
]
const measures: Measure[] = ['narrow', 'normal', 'wide']
const fonts = Object.keys(FONT_LABEL) as FontKind[]
/** 字体卡下面那行小字 */
const FONT_DESC: Record<FontKind, string> = {
  hei: '清爽现代',
  song: '经典书卷',
  kai: '温润手写',
  fangsong: '公文秀丽',
  fzss: '方正排印',
  ali: '屏显友好',
}
const themes: { key: Theme; bg: string; line: string }[] = [
  { key: 'light', bg: '#ffffff', line: '#e6e7e9' },
  { key: 'sepia', bg: '#f8f4ea', line: '#e5dccc' },
  { key: 'green', bg: '#e6eddf', line: '#cfd9c7' },
  { key: 'dark', bg: '#1c1d20', line: '#2b2c2f' },
]
const compareOk = computed(() => props.hasZh)

const FS_MIN = 18
const FS_MAX = 40
const fsPct = computed(() => ((layout.fontSize - FS_MIN) / (FS_MAX - FS_MIN)) * 100)

const LH_STEPS = [1.65, 1.9, 2.15]
const lhIndex = computed(() => {
  let best = 0
  let dist = 9
  LH_STEPS.forEach((v, i) => {
    const d = Math.abs(v - layout.lineHeight)
    if (d < dist) {
      dist = d
      best = i
    }
  })
  return best
})

function resetLayout() {
  Object.assign(layout, DEFAULTS)
}

/** 本地那些存过的（排版 / 进度 / 镜像）一起清掉再刷新 */
function clearCache() {
  if (!confirm('清掉本机存的排版、进度和批注镜像，然后刷新？\n（批注主存储 _woyaoread/annotations 不受影响）')) return
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('woyaoread:')) localStorage.removeItem(k)
  } catch {}
  location.reload()
}
</script>

<template>
  <div class="settings">
    <div class="sgroup">
      <div class="slabel">字号</div>
      <div class="scard">
        <div class="fsrow">
          <span class="fsrow__a">A</span>
          <div class="fsrow__track">
            <input v-model.number="layout.fontSize" type="range" :min="FS_MIN" :max="FS_MAX" step="1" aria-label="字号" />
            <span class="fsrow__thumb" :style="{ left: `clamp(23px, ${fsPct}%, calc(100% - 23px))` }">
              {{ layout.fontSize }}
            </span>
          </div>
          <span class="fsrow__a fsrow__a--big">A</span>
        </div>
      </div>
    </div>

    <div class="sgroup">
      <div class="slabel">边距 / 行距</div>
      <div class="pgap">
        <div class="pseg">
          <button :class="{ 'is-on': layout.measure === 'narrow' }" @click="layout.measure = 'narrow'">小</button>
          <button :class="{ 'is-on': layout.measure === 'normal' }" @click="layout.measure = 'normal'">边距</button>
          <button :class="{ 'is-on': layout.measure === 'wide' }" @click="layout.measure = 'wide'">大</button>
        </div>
        <div class="pseg">
          <button :class="{ 'is-on': lhIndex === 0 }" @click="layout.lineHeight = LH_STEPS[0]">紧</button>
          <button :class="{ 'is-on': lhIndex === 1 }" @click="layout.lineHeight = LH_STEPS[1]">行距</button>
          <button :class="{ 'is-on': lhIndex === 2 }" @click="layout.lineHeight = LH_STEPS[2]">松</button>
        </div>
      </div>
    </div>

    <div class="sgroup">
      <div class="slabel">版式</div>
      <div class="pgap">
        <div class="pseg">
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
      </div>
      <div v-if="compareOk" class="pgap">
        <div class="pseg pseg--wide">
          <button v-for="r in ratios" :key="r" :class="{ 'is-on': layout.ratio === r }" @click="layout.ratio = r">
            {{ r }}
          </button>
        </div>
      </div>
    </div>

    <div class="sgroup">
      <div class="slabel">字体</div>
      <div class="fontgrid">
        <button
          v-for="f in fonts"
          :key="f"
          class="fontcard"
          :class="{ 'is-on': layout.font === f }"
          :style="{ fontFamily: FONT_STACK[f] }"
          @click="layout.font = f"
        >
          <span class="fontcard__name">{{ FONT_LABEL[f] }}</span>
          <span class="fontcard__desc">{{ FONT_DESC[f] }}</span>
        </button>
      </div>
    </div>

    <div class="sgroup">
      <div class="slabel">纸色</div>
      <div class="swatches swatches--row">
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
    </div>

    <div class="sgroup">
      <label class="switchcard">
        <span class="switchcard__main">
          <span class="switchcard__name">首行缩进</span>
          <span class="switchcard__desc">每段开头空两字，中文排版的老习惯</span>
        </span>
        <input v-model="layout.indent" class="switch" type="checkbox" />
      </label>
      <label class="switchcard">
        <span class="switchcard__main">
          <span class="switchcard__name">沉浸模式</span>
          <span class="switchcard__desc">藏起顶栏，鼠标贴到顶上才出来</span>
        </span>
        <input v-model="layout.immersive" class="switch" type="checkbox" />
      </label>
    </div>

    <div class="sreset">
      <button class="resetbtn" @click="resetLayout">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 6.5h16M9 6.5V4.5h6v2M6.5 6.5 7.6 20h8.8l1.1-13.5" />
        </svg>
        恢复默认排版
      </button>
      <button class="resetbtn resetbtn--danger" @click="clearCache">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
          <circle cx="12" cy="12" r="8.4" />
          <path d="M12 7.6v5M12 16.2v.2" />
        </svg>
        清除缓存并重置
      </button>
    </div>

    <div class="keys">
      <span class="key"><kbd>W</kbd><kbd>A</kbd>上</span>
      <span class="key"><kbd>S</kbd><kbd>D</kbd>下</span>
      <span class="key"><kbd>←</kbd><kbd>→</kbd>翻页</span>
      <span class="key"><kbd>M</kbd>版式</span>
      <span class="key"><kbd>T</kbd>目录</span>
      <span class="key"><kbd>N</kbd>批注</span>
      <span class="key"><kbd>Esc</kbd>收起</span>
    </div>
  </div>
</template>
