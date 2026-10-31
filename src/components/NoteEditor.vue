<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'

const props = defineProps<{
  x: number
  y: number
  initial: string
  label: string
  online: boolean
}>()

const emit = defineEmits<{
  (e: 'save', text: string): void
  (e: 'cancel'): void
}>()

const text = ref(props.initial)
const box = ref<HTMLTextAreaElement | null>(null)

const style = computed(() => {
  const w = 380
  const left = Math.max(12, Math.min(window.innerWidth - w - 12, props.x - 40))
  const top = Math.max(60, Math.min(window.innerHeight - 240, props.y + 16))
  return { left: `${left}px`, top: `${top}px`, width: `${w}px` }
})

onMounted(async () => {
  await nextTick()
  box.value?.focus()
  box.value?.setSelectionRange(text.value.length, text.value.length)
})

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('cancel')
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) emit('save', text.value)
}

defineExpose({ text })
</script>

<template>
  <div class="overlay overlay--bare" @click.self="emit('cancel')">
    <div class="editor" :style="style">
      <div class="editor__head">
        <span>{{ label }}</span>
        <button class="icon" @click="emit('cancel')" aria-label="关闭">✕</button>
      </div>
      <textarea ref="box" v-model="text" class="editor__area" rows="6" spellcheck="false" @keydown="onKey" />
      <div class="editor__foot">
        <button class="btn btn--ghost" @click="emit('save', '')">删除</button>
        <span class="muted">{{ online ? '⌘/Ctrl + Enter 保存' : '服务未启动，将存入草稿箱' }}</span>
        <button class="btn" @click="emit('save', text)">保存</button>
      </div>
    </div>
  </div>
</template>
