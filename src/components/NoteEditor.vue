<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'

const props = defineProps<{
  initial: string
  /** 卡片标题：写想法 / 修改想法 */
  label: string
  /** 正在批注的原文（照微信读书，先在卡里亮出那句话） */
  quote?: string
  online: boolean
  /** 编辑已有批注/划线时才能删 */
  canDelete?: boolean
  /** 指向的位置：选区的下沿中点（视口坐标） */
  x: number
  y: number
  /** 选区的高度（至少有行高，卡片翻到上方时要躲开它） */
  selH?: number
}>()

const emit = defineEmits<{
  (e: 'save', text: string): void
  (e: 'cancel'): void
  (e: 'remove'): void
}>()

const text = ref(props.initial)
const box = ref<HTMLTextAreaElement | null>(null)

const W = 440
/** 卡片高度不猜，量出来（正文越长越高） */
const cardH = ref(330)
const card = ref<HTMLElement | null>(null)

/** 卡片的定位：优先落在选区下方，空间不够就翻到上方，尾巴始终指着那句话 */
const pos = computed(() => {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = Math.min(W, vw - 24)
  const h = cardH.value
  const selTop = props.y - (props.selH || 26)
  const left = Math.max(12, Math.min(vw - w - 12, props.x - w / 2))
  const minTop = 66 // 别盖住顶栏
  const below = props.y + 12
  const flip = below + h > vh - 12 && selTop - h - 12 > minTop
  const top = flip ? selTop - h - 12 : Math.min(below, Math.max(minTop, vh - h - 12))
  const tail = Math.max(18, Math.min(w - 18, props.x - left))
  return {
    w,
    left,
    top: Math.max(minTop, top),
    tail,
    side: flip ? 'bottom' : 'top',
  }
})
const style = computed(() => ({
  left: `${pos.value.left}px`,
  top: `${pos.value.top}px`,
  width: `${pos.value.w}px`,
}))
const tailStyle = computed(() => ({
  left: `${pos.value.tail}px`,
}))

const canSave = computed(() => text.value.trim().length > 0 || Boolean(props.canDelete))

let ro: ResizeObserver | null = null
onMounted(async () => {
  await nextTick()
  if (card.value) {
    cardH.value = card.value.getBoundingClientRect().height
    ro = new ResizeObserver(() => {
      if (card.value) cardH.value = card.value.getBoundingClientRect().height
    })
    ro.observe(card.value)
  }
  box.value?.focus()
  box.value?.setSelectionRange(text.value.length, text.value.length)
})

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    // 只收卡片：事件别再冒到阅读面，否则 Esc 会顺手把旁边的抽屉一起关掉
    e.stopPropagation()
    emit('cancel')
  }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) emit('save', text.value)
}
</script>

<template>
  <div class="overlay overlay--editor" @click.self="emit('cancel')">
    <div
      ref="card"
      class="composer"
      :class="`composer--${pos.side}`"
      :style="style"
      role="dialog"
      aria-modal="false"
      :aria-label="label"
    >
      <span class="composer__tail" :class="`composer__tail--${pos.side}`" :style="tailStyle" aria-hidden="true" />

      <header class="composer__head">
        <span class="composer__label">{{ label }}</span>
        <button class="composer__close" aria-label="关闭" @click="emit('cancel')">✕</button>
      </header>

      <!-- 先亮出要批注的那句原文：不摆这一块，写完就不知道自己在说哪一句了 -->
      <blockquote v-if="quote" class="composer__quote">“{{ quote }}”</blockquote>

      <div class="composer__body">
        <svg class="composer__pen" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.6 3.9a1.6 1.6 0 0 1 2.3 0l1.2 1.2a1.6 1.6 0 0 1 0 2.3L7.8 15.7l-4 1 1-4z" />
          <path d="M11.2 5.3 14.7 8.8" />
        </svg>
        <textarea
          ref="box"
          v-model="text"
          class="composer__area"
          rows="7"
          spellcheck="false"
          placeholder="写下这一刻的想法…"
          @keydown="onKey"
        />
      </div>

      <footer class="composer__foot">
        <div class="composer__left">
          <button v-if="canDelete" class="composer__del" @click="emit('remove')">删除</button>
        </div>
        <div class="composer__right">
          <span v-if="!online" class="composer__hint">服务未启动，将存草稿</span>
          <button class="composer__submit" :disabled="!canSave" @click="emit('save', text)">
            {{ canDelete ? '保存' : '发表' }}
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>
