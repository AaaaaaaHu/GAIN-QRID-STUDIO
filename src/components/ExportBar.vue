<script setup lang="ts">
import { computed } from 'vue'
import { useStudio, type ExportScope } from '@/composables/useStudio'
import AppSelect from '@/components/AppSelect.vue'

const {
  exportScope, exportRecords, records, selectedIds, qrDataUrl,
  doExportText, doExportPng, doExportBundle, busy, progress
} = useStudio()

const scopeOptions: Array<{ value: ExportScope; label: string }> = [
  { value: 'all', label: '全部记录' },
  { value: 'selected', label: '仅选中的记录' },
  { value: 'current', label: '仅当前预览' }
]

const scopeHint = computed(() => {
  if (exportScope.value === 'selected') return selectedIds.value.length === 0 ? '未选择记录' : `已选 ${selectedIds.value.length} 条`
  if (exportScope.value === 'current') return '仅当前预览'
  return `全部 ${records.value.length} 条`
})

const percent = computed(() => {
  if (!progress.value || progress.value.total === 0) return 0
  return Math.round((progress.value.done / progress.value.total) * 100)
})
</script>

<template>
  <section class="export card">
    <div class="left">
      <span class="label">导出范围</span>
      <AppSelect v-model="exportScope" :options="scopeOptions" class="scope" size="sm" />
      <span class="count">{{ scopeHint }}</span>
    </div>

    <div class="right">
      <button class="btn btn-sm" :disabled="busy || !exportRecords.length" @click="doExportText('csv')">CSV</button>
      <button class="btn btn-sm" :disabled="busy || !exportRecords.length" @click="doExportText('json')">JSON</button>
      <button class="btn btn-sm" :disabled="busy || !exportRecords.length" @click="doExportText('txt')">TXT</button>
      <button class="btn btn-sm" :disabled="busy || !qrDataUrl" @click="doExportPng">当前 PNG</button>
      <button class="btn btn-primary btn-sm bundle" :disabled="busy || !exportRecords.length" @click="doExportBundle">
        {{ busy && progress ? `打包中 ${percent}%` : '一键导出 ID + 二维码' }}
      </button>
    </div>

    <div v-if="progress" class="progress">
      <div class="bar" :style="{ width: `${percent}%` }" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.export {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 16px;
  overflow: hidden;
}

.left { display: flex; align-items: center; gap: 8px; }
.label { font-size: 11px; font-weight: 600; color: var(--ink-2); }
.scope { width: auto; min-width: 132px; }
.count { font-size: 11px; color: var(--ink-3); }

.right { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.bundle { min-height: 28px; padding: 0 14px; }

.progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: var(--brand-soft);
}

.bar {
  height: 100%;
  background: linear-gradient(90deg, #5b52f0, #2f6bff);
  transition: width .18s ease;
}
</style>
