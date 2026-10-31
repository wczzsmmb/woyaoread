<script setup lang="ts">
import type { Article, ResolvedAnn } from '../lib/types'

defineProps<{
  article: Article
  annotations: ResolvedAnn[]
  lost: { key: string; item: any }[]
  online: boolean
  drafts: number
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'jump', rowIndex: number): void
  (e: 'refresh'): void
}>()

const esc = (s: string) =>
  String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
</script>

<template>
  <div class="pane">
    <div class="pane__head">
      <span>批注</span>
      <span class="muted">{{ annotations.length }}</span>
    </div>

    <p v-if="!online" class="pane__hint">
      批注服务没启动（端口 43999）。现在只能读。<br />
      启动：<code>npm start</code>，然后刷新。
    </p>
    <p v-else-if="drafts" class="pane__hint">
      有 {{ drafts }} 条草稿待补写，正在尝试…<button class="link" @click="emit('refresh')">重试</button>
    </p>

    <div v-if="annotations.length" class="annolist">
      <button v-for="a in annotations" :key="a.key" class="annolist__item" @click="emit('jump', a.rowIndex)">
        <span class="annolist__loc">
          {{ String(a.rowIndex + 1).padStart(2, '0') }} · {{ a.layer === 'zh' ? '对照' : '正文' }}
          <em v-if="a.relinkedNow">已重定位</em>
        </span>
        <span class="annolist__text">{{ a.text }}</span>
      </button>
    </div>
    <p v-else-if="online" class="pane__hint">还没有批注。鼠标移到段落右侧，点 ✎。</p>

    <div v-if="lost.length" class="pane__lost">
      <div class="pane__head"><span>失联批注</span><span class="muted">{{ lost.length }}</span></div>
      <p class="pane__hint">原文可能改写过，位置丢了，内容还在。</p>
      <div v-for="l in lost" :key="l.key" class="lostitem">
        <span class="annolist__loc">{{ l.key }}</span>
        <div class="annolist__text">{{ l.item.text }}</div>
        <div v-if="l.item.quote" class="lostitem__quote">{{ l.item.quote }}</div>
      </div>
    </div>
  </div>
</template>
