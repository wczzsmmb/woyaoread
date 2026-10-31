<script setup lang="ts">
import type { Article } from '../lib/types'

defineProps<{ article: Article }>()
const emit = defineEmits<{ (e: 'jump', h: string): void }>()
</script>

<template>
  <div class="pane">
    <div class="pane__head">
      <span>导航</span>
      <span class="muted">{{ article.toc.length }} 节</span>
    </div>
    <nav class="navlist">
      <button
        v-for="t in article.toc"
        :key="t.h"
        class="navlist__item"
        :class="`lvl-${t.depth}`"
        @click="emit('jump', t.h)"
      >
        {{ t.text }}
      </button>
      <p v-if="!article.toc.length" class="pane__hint">这篇没有小标题。</p>
    </nav>

    <div v-if="article.meta.keywords.length" class="pane__sect">
      <div class="pane__head"><span>关键词</span></div>
      <div class="kws">
        <span v-for="k in article.meta.keywords" :key="k" class="kw">#{{ k }}</span>
      </div>
    </div>

    <div class="pane__sect">
      <div class="pane__head"><span>信息</span></div>
      <dl class="meta">
        <template v-if="article.meta.author"><dt>作者</dt><dd>{{ article.meta.author }}</dd></template>
        <template v-if="article.meta.year"><dt>年份</dt><dd>{{ article.meta.year }}</dd></template>
        <dt>分类</dt><dd>{{ article.cats.join(' / ') || '未分类' }}</dd>
        <dt>块数</dt><dd>{{ article.blocks }}</dd>
        <dt>对照率</dt><dd>{{ article.hasZh ? Math.round(article.alignRatio * 100) + '%' : '单栏' }}</dd>
        <template v-if="article.meta.source"><dt>来源</dt>
          <dd><a :href="article.meta.source" target="_blank" rel="noreferrer">链接</a></dd>
        </template>
      </dl>
    </div>
  </div>
</template>
