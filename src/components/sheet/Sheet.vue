<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

/**
 * 手机端底部抽屉（照微信读书）：圆角顶、顶部把手、下拉关闭。
 * 抽屉开着的时候锁住正文的滚动，免得后面跟着滑。
 */
const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    /** 内容自带内边距时用（比如批注面板） */
    flush?: boolean
  }>(),
  { title: '', flush: false },
)

const emit = defineEmits<{ (e: 'close'): void }>()

const dragY = ref(0)
const dragging = ref(false)
let startY = 0

function onDown(e: TouchEvent) {
  startY = e.touches[0].clientY
  dragging.value = true
}

function onMove(e: TouchEvent) {
  if (!dragging.value) return
  dragY.value = Math.max(0, e.touches[0].clientY - startY)
}

function onUp() {
  if (!dragging.value) return
  dragging.value = false
  if (dragY.value > 92) emit('close')
  dragY.value = 0
}

watch(
  () => props.open,
  (v) => document.documentElement.classList.toggle('is-sheet-open', v),
)

onBeforeUnmount(() => document.documentElement.classList.remove('is-sheet-open'))
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="sheet-root">
        <div class="sheet-mask" @click="emit('close')" />
        <section class="sheet" :style="{ transform: dragY ? `translateY(${dragY}px)` : '' }">
          <div
            class="sheet__grip"
            @touchstart.passive="onDown"
            @touchmove.prevent="onMove"
            @touchend="onUp"
          >
            <i />
          </div>
          <div class="sheet__body" :class="{ 'is-flush': flush }">
            <slot />
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
