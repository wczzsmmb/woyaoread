<script setup lang="ts">
/**
 * 对页 · 标记「⑤ 抽象双页符号」
 * 左页实心、右页空心，两者同宽同高，暗示"摊开的两页"。
 * 已选定为字标方案，但**当前不显示**（用户觉得摆在顶栏不好看）。
 * 要启用：在 ShelfView / ReaderView 里 <Mark class="…" />，别写字标文本。
 */
</script>

<template>
  <svg class="mark" viewBox="0 0 18 17" fill="none" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="7" height="15" rx="1.2" fill="currentColor" />
    <rect x="10" y="1" width="7" height="15" rx="1.2" stroke="currentColor" stroke-width="1.4" />
  </svg>
</template>
