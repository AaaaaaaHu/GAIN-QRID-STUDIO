<script setup lang="ts">
import { onMounted } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import GeneratorPanel from '@/components/GeneratorPanel.vue'
import PreviewCard from '@/components/PreviewCard.vue'
import ExportBar from '@/components/ExportBar.vue'
import RecordsTable from '@/components/RecordsTable.vue'
import SettingsModal from '@/components/SettingsModal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useStudio } from '@/composables/useStudio'

const { init, toast } = useStudio()

onMounted(() => { void init() })
</script>

<template>
  <div class="app">
    <AppHeader />

    <main class="layout">
      <GeneratorPanel />
      <div class="main-col">
        <PreviewCard />
        <ExportBar />
        <RecordsTable />
      </div>
    </main>

    <Transition name="toast">
      <div v-if="toast" class="toast" :class="toast.kind">{{ toast.text }}</div>
    </Transition>

    <SettingsModal />
    <ConfirmDialog />
  </div>
</template>

<style scoped lang="scss">
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(1200px 500px at 90% -10%, var(--bg-glow-1) 0%, transparent 60%),
    radial-gradient(900px 400px at -10% 110%, var(--bg-glow-2) 0%, transparent 55%),
    var(--bg);
}

.layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 344px minmax(0, 1fr);
  gap: 14px;
  padding: 14px 20px 18px;
}

.main-col {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toast {
  position: fixed;
  top: 68px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 90;
  max-width: min(560px, calc(100vw - 48px));
  padding: 10px 16px;
  border-radius: 10px;
  background: var(--toast-bg);
  color: var(--on-brand);
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
  box-shadow: var(--dialog-shadow);
  word-break: break-all;
  pointer-events: none;

  &.ok { background: var(--toast-ok); }
  &.warn { background: var(--toast-warn); }
  &.err { background: var(--toast-err); }
}

.toast-enter-active, .toast-leave-active { transition: opacity .2s ease, transform .2s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, -8px); }

@media (max-width: 1120px) {
  .layout { grid-template-columns: 310px minmax(0, 1fr); }
}
</style>
