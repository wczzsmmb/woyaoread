<script setup lang="ts">
import type { Article, ResolvedAnn } from '../lib/types'

defineProps<{
  article: Article
  annotations: ResolvedAnn[]
  lost: { key: string; item: any }[]
  online: boolean
  drafts: number
  loading: boolean
  pct: number
  /** 只有划线、没写想法的条数（不占榜，只报个数字） */
  marks?: number
}>()

const emit = defineEmits<{
  (e: 'jump', rowIndex: number): void
  (e: 'refresh'): void
  (e: 'remove', key: string): void
  (e: 'edit', key: string): void
}>()

const esc = (s: string) =>
  String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
</script>

<template>
  <div class="pane notes">
    <div class="notes__head">
      <div class="notes__name">{{ article.title }}</div>
      <div class="otags notes__stats">
        <span class="otag otag--blue">已读 {{ Math.round(pct * 100) }}%</span>
        <span class="otag">{{ annotations.length }} 条想法</span>
        <span v-if="marks" class="otag">{{ marks }} 条划线</span>
        <span v-if="lost.length" class="otag otag--warn">{{ lost.length }} 条待定位</span>
      </div>
    </div>

    <p v-if="!online" class="pane__hint">
      批注服务没启动（端口 43999）。现在只能读。<br />
      启动：<code>npm start</code>，然后刷新。
    </p>
    <p v-else-if="drafts" class="pane__hint">
      有 {{ drafts }} 条草稿待补写，正在尝试…<button class="link" @click="emit('refresh')">重试</button>
    </p>

    <p v-if="loading" class="pane__hint">载入批注…</p>

    <div v-for="a in annotations" :key="a.key" class="notecard" :data-row="a.rowIndex" :data-key="a.key">
      <button class="notecard__main" @click="emit('jump', a.rowIndex)">
        <span class="notecard__quote">{{ a.quote || '（原文已改动）' }}</span>
        <span v-if="a.text" class="notecard__body" v-html="esc(a.text).replace(/\n/g, '<br>')"></span>
      </button>
      <button class="notecard__del" title="修改这条" @click.stop="emit('edit', a.key)">✎</button>
      <button class="notecard__del" title="删除这条" @click.stop="emit('remove', a.key)">✕</button>
    </div>

    <p v-if="!annotations.length && !loading" class="pane__hint">
      还没有想法。选中正文里的句子，点「写想法」；只划线不算想法。
    </p>

    <div v-if="lost.length" class="pane__lost">
      <div class="pane__head"><span>找不到位置</span><span class="muted">{{ lost.length }}</span></div>
      <div v-for="l in lost" :key="l.key" class="lostitem">
        <div class="lostitem__quote">{{ l.item.quote || l.item.text }}</div>
      </div>
    </div>
  </div>
</template>
