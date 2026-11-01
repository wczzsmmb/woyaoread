<script setup lang="ts">
import { layout, RATIOS, type Ratio } from '../lib/layout'

defineProps<{ hasZh: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const ratios = Object.keys(RATIOS) as Ratio[]
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <aside class="panel">
      <div class="panel__head">
        <span>阅读设置</span>
        <button class="icon" @click="emit('close')" aria-label="关闭">✕</button>
      </div>

      <section class="field">
        <div class="field__label">栏位</div>
        <div class="checks">
          <label><input v-model="layout.c1" type="checkbox" /><span>第一栏（选篇）</span></label>
          <label><input v-model="layout.c2" type="checkbox" /><span>第二栏（正文）</span></label>
          <label><input v-model="layout.c3" type="checkbox" /><span>第三栏（对照/批注/导航）</span></label>
        </div>
        <p class="hint">三栏都关 = 沉浸阅读（鼠标移到顶部边缘唤出工具条）。</p>
      </section>

      <section class="field">
        <div class="field__label">第三栏显示</div>
        <div class="seg">
          <button :class="{ 'is-on': layout.c3Mode === 'compare' }" :disabled="!hasZh" @click="layout.c3Mode = 'compare'">
            对照
          </button>
          <button :class="{ 'is-on': layout.c3Mode === 'annotations' }" @click="layout.c3Mode = 'annotations'">
            批注
          </button>
          <button :class="{ 'is-on': layout.c3Mode === 'nav' }" @click="layout.c3Mode = 'nav'">导航</button>
        </div>
      </section>

      <section class="field">
        <div class="field__label">正文 / 对照 宽度</div>
        <div class="seg seg--wrap">
          <button
            v-for="r in ratios"
            :key="r"
            :class="{ 'is-on': layout.ratio === r }"
            :disabled="!hasZh"
            @click="layout.ratio = r"
          >
            {{ r }}
          </button>
        </div>
      </section>

      <section class="field">
        <div class="field__label">第一栏宽度</div>
        <div class="seg">
          <button
            v-for="w in [200, 240, 280, 320]"
            :key="w"
            :class="{ 'is-on': layout.sidebar === w }"
            @click="layout.sidebar = w as 200 | 240 | 280 | 320"
          >
            {{ w }}
          </button>
        </div>
      </section>

      <section class="field">
        <div class="field__label">字号 <em>{{ layout.fontSize }}px</em></div>
        <input v-model.number="layout.fontSize" class="range" type="range" min="14" max="24" step="1" />
      </section>

      <section class="field">
        <div class="field__label">行高 <em>{{ layout.lineHeight.toFixed(1) }}</em></div>
        <input v-model.number="layout.lineHeight" class="range" type="range" min="1.5" max="2.4" step="0.1" />
      </section>

      <section class="field">
        <label class="checks"><input v-model="layout.immersive" type="checkbox" /><span>沉浸模式（隐藏顶栏，鼠标贴顶唤出）</span></label>
      </section>
    </aside>
  </div>
</template>
