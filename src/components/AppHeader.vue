<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useStudio } from '@/composables/useStudio'
import { isTauri } from '@/utils/platform'

const { records, openSettings } = useStudio()
const fullscreen = ref(false)

async function syncFullscreen() {
  if (isTauri()) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      fullscreen.value = await getCurrentWindow().isFullscreen()
    } catch { /* 忽略 */ }
  } else {
    fullscreen.value = Boolean(document.fullscreenElement)
  }
}

async function toggleFullscreen() {
  try {
    if (isTauri()) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      const next = !(await win.isFullscreen())
      await win.setFullscreen(next)
      fullscreen.value = next
    } else if (document.fullscreenElement) {
      await document.exitFullscreen()
      fullscreen.value = false
    } else {
      await document.documentElement.requestFullscreen()
      fullscreen.value = true
    }
  } catch { /* 用户拒绝或环境不支持时保持原状 */ }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'F11') {
    e.preventDefault()
    void toggleFullscreen()
  }
}

onMounted(() => {
  void syncFullscreen()
  document.addEventListener('fullscreenchange', syncFullscreen)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <div class="logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <rect x="3" y="3" width="7" height="7" rx="1.6" stroke="#fff" stroke-width="1.8" />
          <rect x="14" y="3" width="7" height="7" rx="1.6" stroke="#fff" stroke-width="1.8" />
          <rect x="3" y="14" width="7" height="7" rx="1.6" stroke="#fff" stroke-width="1.8" />
          <path d="M14 14h3v3h-3zM18 18h3v3h-3z" fill="#fff" />
        </svg>
      </div>
      <div class="titles">
        <h1>GIAN-QRID-STUDIO</h1>
        <p>关键词生成唯一 ID · 实时二维码 · 本地留档</p>
      </div>
    </div>

    <div class="meta">
      <span class="pill"><i class="dot" />本地已存 <b>{{ records.length }}</b> 条</span>
      <button
        class="btn btn-sm settings-btn"
        :title="fullscreen ? '退出全屏（F11）' : '全屏（F11）'"
        @click="toggleFullscreen"
      >
        <svg v-if="!fullscreen" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M16 3h3a2 2 0 0 1 2 2v3" />
          <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 8h3a2 2 0 0 0 2-2V3" />
          <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
          <path d="M3 16h3a2 2 0 0 1 2 2v3" />
          <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
        </svg>
        {{ fullscreen ? '退出全屏' : '全屏' }}
      </button>

      <button class="btn btn-sm settings-btn" title="设置" @click="openSettings">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10.6 3V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        设置
      </button>
    </div>
  </header>
</template>

<style scoped lang="scss">
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(10px);
}

.brand { display: flex; align-items: center; gap: 11px; min-width: 0; }

.logo {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--brand-gradient);
  box-shadow: 0 5px 14px var(--brand-shadow);
}

.titles {
  h1 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: .2px; }
  p { margin: 1px 0 0; font-size: 11px; color: var(--ink-3); }
}

.meta { display: flex; align-items: center; gap: 10px; }

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border-radius: 20px;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  font-size: 11px;
  color: var(--ink-2);

  b { color: var(--brand); font-weight: 700; }
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
  box-shadow: 0 0 0 3px var(--ok-ring);
}

.settings-btn { gap: 5px; }
</style>
