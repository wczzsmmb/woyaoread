<script setup lang="ts">
import { layout, THEME_LABEL, type Theme } from '../../lib/layout'

/** 纸色：只换纸，不动版式（手机上的「亮度」这一格） */
const themes: { key: Theme; bg: string; fg: string; line: string }[] = [
  { key: 'light', bg: '#ffffff', fg: '#14171c', line: '#e6e7e9' },
  { key: 'sepia', bg: '#f8f4ea', fg: '#2b2620', line: '#e5dccc' },
  { key: 'green', bg: '#e6eddf', fg: '#1f2a1c', line: '#cfd9c7' },
  { key: 'dark', bg: '#1c1d20', fg: '#e8e7e3', line: '#2b2c2f' },
]
</script>

<template>
  <div class="themesheet">
    <button
      v-for="t in themes"
      :key="t.key"
      class="themeopt"
      :class="{ 'is-on': layout.theme === t.key }"
      @click="layout.theme = t.key"
    >
      <span class="themeopt__paper" :style="{ background: t.bg, color: t.fg, borderColor: t.line }">Aa</span>
      <span class="themeopt__name">{{ THEME_LABEL[t.key] }}</span>
    </button>
  </div>
</template>
