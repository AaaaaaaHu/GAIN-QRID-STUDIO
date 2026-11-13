<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useConfirmState } from '@/composables/useConfirm'

const { state, resolveConfirm } = useConfirmState()

const okButton = ref<HTMLButtonElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)

const okText = computed(() => state.value.okText ?? '确认')
const cancelText = computed(() => state.value.cancelText ?? '取消')

watch(() => state.value.open, async open => {
  if (!open) {
    document.removeEventListener('keydown', onKeydown)
    return
  }
  document.addEventListener('keydown', onKeydown)
  await nextTick()
  // 危险操作默认聚焦取消，避免误按回车
  if (state.value.danger) cancelButton.value?.focus()
  else okButton.value?.focus()
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    resolveConfirm(false)
  }
}

function close(ok: boolean) {
  resolveConfirm(ok)
}

function onMaskClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close(false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm">
      <div v-if="state.open" class="mask" @click="onMaskClick">
        <div class="dialog" role="alertdialog" aria-modal="true" :aria-label="state.title">
          <div class="head">
            <span class="icon" :class="{ danger: state.danger }" aria-hidden="true">
              <svg v-if="state.danger" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M12 9v5" />
                <path d="M12 17.5h.01" />
                <path d="M10.3 3.9 2.6 17.2a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              </svg>
              <svg v-else viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4.5" />
                <path d="M12 16h.01" />
              </svg>
            </span>
            <h3>{{ state.title }}</h3>
          </div>

          <p class="message">{{ state.message }}</p>
          <pre v-if="state.detail" class="detail">{{ state.detail }}</pre>

          <div class="actions">
            <button ref="cancelButton" class="btn btn-sm" @click="close(false)">{{ cancelText }}</button>
            <button
              ref="okButton"
              class="btn btn-sm confirm-btn"
              :class="state.danger ? 'btn-danger-solid' : 'btn-primary'"
              @click="close(true)"
            >{{ okText }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.mask {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(17, 24, 45, .48);
  backdrop-filter: blur(2px);
}

.dialog {
  width: 424px;
  max-width: 100%;
  padding: 18px 20px 16px;
  background: var(--surface);
  border-radius: 14px;
  box-shadow: 0 22px 60px rgba(17, 24, 45, .32);
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 10px;

  h3 {
    margin: 0;
    padding-top: 1px;
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
    line-height: 1.35;
  }
}

.icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--brand-soft);
  color: var(--brand);

  &.danger {
    background: #fdecec;
    color: var(--err);
  }
}

.message {
  margin: 10px 0 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--ink-2);
}

.detail {
  margin: 9px 0 0;
  padding: 8px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface-soft);
  font-family: Consolas, Menlo, monospace;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--ink-2);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow: auto;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.confirm-btn { min-width: 74px; }

:deep(.btn-danger-solid) {
  background: var(--err);
  border-color: var(--err);
  color: #fff;

  &:hover { filter: brightness(1.07); }
}

.confirm-enter-active, .confirm-leave-active { transition: opacity .16s ease; }
.confirm-enter-active .dialog, .confirm-leave-active .dialog { transition: transform .16s ease; }
.confirm-enter-from, .confirm-leave-to { opacity: 0; }
.confirm-enter-from .dialog, .confirm-leave-to .dialog { transform: translateY(8px) scale(.97); }
</style>
