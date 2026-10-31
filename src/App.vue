<script setup lang="ts">
import { ref, watch } from 'vue'
import ShelfView from './views/ShelfView.vue'
import ReaderView from './views/ReaderView.vue'
import { route } from './lib/router'

const loading = ref(false)
watch(
  () => route.value,
  () => {
    window.scrollTo(0, 0)
  },
)
void loading
</script>

<template>
  <ShelfView v-if="route.name === 'shelf'" />
  <ReaderView v-else :id="route.id" />
</template>
