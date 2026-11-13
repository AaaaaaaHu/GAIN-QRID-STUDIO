<script setup lang="ts" generic="T extends string | number">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: T
  options: Array<{ value: T; label: string }>
  disabled?: boolean
  placeholder?: string
  /** 透传到触发按钮，便于外部定位 */
  id?: string
  /** sm = 28px 高，用于工具栏；md = 34px，用于表单 */
  size?: 'sm' | 'md'
}>()

const emit = defineEmits<{ 'update:modelValue': [T] }>()

const open = ref(false)
const triggerEl = ref<HTMLButtonElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const activeIndex = ref(-1)
const panelStyle = ref<Record<string, string>>({})

const currentLabel = computed(
  () => props.options.find(o => o.value === props.modelValue)?.label ?? props.placeholder ?? '请选择'
)

function measure() {
  const el = triggerEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const estimated = Math.min(228, props.options.length * 33 + 10)
  const below = window.innerHeight - r.bottom
  const dropUp = below < estimated + 12 && r.top > below

  panelStyle.value = {
    left: `${Math.round(r.left)}px`,
    top: `${dropUp ? Math.round(r.top - estimated - 6) : Math.round(r.bottom + 6)}px`,
    minWidth: `${Math.round(r.width)}px`,
    maxWidth: '320px'
  }
}

function bind() {
  document.addEventListener('mousedown', onDocDown)
  window.addEventListener('scroll', close, true)
  window.addEventListener('resize', close)
}

function unbind() {
  document.removeEventListener('mousedown', onDocDown)
  window.removeEventListener('scroll', close, true)
  window.removeEventListener('resize', close)
}

function toggle() {
  if (props.disabled) return
  if (open.value) { close(); return }
  open.value = true
  activeIndex.value = props.options.findIndex(o => o.value === props.modelValue)
  measure()
  bind()
  nextTick(() => {
    listEl.value?.querySelector(".dropdown-option.selected")?.scrollIntoView({ block: 'nearest' })
  })
}

function close() {
  if (!open.value) return
  open.value = false
  unbind()
}

function onDocDown(e: MouseEvent) {
  const target = e.target as Node
  if (triggerEl.value?.contains(target)) return
  if (listEl.value?.contains(target)) return
  close()
}

function pick(option: { value: T; label: string }) {
  emit('update:modelValue', option.value)
  close()
  triggerEl.value?.focus()
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      toggle()
    }
    return
  }
  if (e.key === 'Escape') { e.preventDefault(); close() }
  else if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(props.options.length - 1, activeIndex.value + 1)
    scrollActive()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(0, activeIndex.value - 1)
    scrollActive()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const option = props.options[activeIndex.value]
    if (option) pick(option)
  }
}

function scrollActive() {
  nextTick(() => {
    const node = listEl.value?.querySelectorAll(".dropdown-option")[activeIndex.value] as HTMLElement | undefined
    node?.scrollIntoView({ block: 'nearest' })
  })
}

watch(() => props.disabled, value => { if (value) close() })
onBeforeUnmount(close)
</script>

<template>
  <div class="app-select" :class="[{ open, disabled }, size === 'sm' ? 'is-sm' : '']">
    <button
      :id="id"
      ref="triggerEl"
      type="button"
      class="trigger"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span class="value">{{ currentLabel }}</span>
      <svg class="chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <Teleport to="body">
      <Transition name="pop">
        <div v-if="open" class="dropdown-panel" :style="panelStyle">
          <ul ref="listEl" class="list" role="listbox">
            <li
              v-for="(option, index) in options"
              :key="option.value"
              class="dropdown-option"
              :class="{ selected: option.value === modelValue, active: index === activeIndex }"
              role="option"
              :aria-selected="option.value === modelValue"
              @click="pick(option)"
              @mouseenter="activeIndex = index"
            >
              <span class="text">{{ option.label }}</span>
              <svg v-if="option.value === modelValue" class="tick" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </li>
          </ul>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.app-select {
  position: relative;
  min-width: 0;
}

.trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font-size: 12px;
  text-align: left;
  transition: border-color .15s, box-shadow .15s, background .15s;

  &:hover:not(:disabled) { border-color: #c3cbe4; }

  .app-select.open & {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(79, 70, 229, .1);
  }

  &:disabled {
    background: var(--surface-soft);
    color: var(--ink-3);
    cursor: not-allowed;
  }
}

.value {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.is-sm .trigger {
  height: 28px;
  padding: 0 8px;
  border-radius: 7px;
  font-size: 11.5px;
}

.is-sm .chevron { width: 11px; height: 11px; }

.chevron {
  flex: 0 0 auto;
  color: var(--ink-3);
  transition: transform .18s ease;
}

.app-select.open .chevron {
  transform: rotate(180deg);
  color: var(--brand);
}

.dropdown-panel {
  position: fixed;
  z-index: 80;
  padding: 4px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 14px 34px rgba(27, 37, 89, .16), 0 2px 6px rgba(27, 37, 89, .06);
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 228px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.dropdown-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  border-radius: 7px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ink-2);
  cursor: pointer;
  white-space: nowrap;

  &.active { background: var(--surface-soft); }

  &.selected {
    color: var(--brand);
    font-weight: 600;
    background: var(--brand-soft);
  }

  &.selected.active { background: var(--brand-soft); }
}

.text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tick { flex: 0 0 auto; }

.pop-enter-active, .pop-leave-active { transition: opacity .14s ease, transform .14s ease; }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(-4px) scale(.98); }
</style>
