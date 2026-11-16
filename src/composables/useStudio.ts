import { computed, ref, watch } from 'vue'
import { DEFAULT_CONFIG } from '@/types'
import type { AppConfig, IdRecord } from '@/types'
import {
  generateUniqueId, keywordSlug, parseKeywords, renderQrContent
} from '@/utils/id'
import { exportBundle, exportPng, exportText, type BundleProgress } from '@/utils/exporter'
import { makeQrDataUrl } from '@/utils/qrcode'
import { safeFileName } from '@/utils/format'
import {
  dataDirInfo, dirAccessible, loadConfig, loadRecords, loadUsedIds, migrateLegacyData,
  restoreDefaultDir as restoreDefaultDirectory,
  saveConfig, saveRecords, saveUsedIds, storageLocation, switchDataDir
} from '@/utils/storage'
import { isTauri } from '@/utils/platform'
import { askConfirm } from './useConfirm'

export type ExportScope = 'all' | 'selected' | 'current'
export type CountMode = 'total' | 'per'

export interface GeneratePlanItem { keyword: string; count: number }

/** 按创建数量拆成「关键词 → 条数」计划；总计模式在关键词间尽量均分 */
export function buildGeneratePlan(keywords: string[], mode: CountMode, count: number): GeneratePlanItem[] {
  const safe = Math.max(1, Math.floor(count) || 1)
  if (keywords.length === 0) return [{ keyword: '', count: safe }]
  if (mode === 'per') return keywords.map(keyword => ({ keyword, count: safe }))

  const base = Math.floor(safe / keywords.length)
  const rest = safe % keywords.length
  return keywords
    .map((keyword, index) => ({ keyword, count: base + (index < rest ? 1 : 0) }))
    .filter(item => item.count > 0)
}

const config = ref<AppConfig>(structuredClone(DEFAULT_CONFIG))
const records = ref<IdRecord[]>([])
const usedSet = new Set<string>()
const activeId = ref('')
const selectedIds = ref<string[]>([])
const search = ref('')
const exportScope = ref<ExportScope>('all')
const storagePath = ref('')
const dataDir = ref('')
const dataDirCustom = ref(false)
const isBrowserMode = ref(false)
const appVersion = ref('1.1.1')
const appIdentifier = ref('')
const usedCount = ref(0)
const dataDirOk = ref(true)
const settingsOpen = ref(false)
const qrDataUrl = ref('')
const busy = ref(false)
const progress = ref<BundleProgress | null>(null)
const toast = ref<{ text: string; kind: 'ok' | 'warn' | 'err' } | null>(null)
let ready = false
let saveTimer: number | undefined
let toastTimer: number | undefined

const activeRecord = computed(() => records.value.find(r => r.id === activeId.value) ?? null)
const nextSequence = computed(() =>
  records.value.reduce((max, r) => Math.max(max, r.sequence), 0) + 1
)
const filteredRecords = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return records.value
  return records.value.filter(r =>
    [r.id, r.keyword, r.content, r.note].some(v => v.toLowerCase().includes(q))
  )
})
const exportRecords = computed<IdRecord[]>(() => {
  if (exportScope.value === 'selected') {
    return records.value.filter(r => selectedIds.value.includes(r.id))
  }
  if (exportScope.value === 'current') return activeRecord.value ? [activeRecord.value] : []
  return records.value
})

function notify(text: string, kind: 'ok' | 'warn' | 'err' = 'ok') {
  toast.value = { text, kind }
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.value = null }, 3200)
}

async function refreshQr() {
  const rec = activeRecord.value
  if (!rec) { qrDataUrl.value = ''; return }
  try {
    qrDataUrl.value = await makeQrDataUrl(rec.content, config.value.qr)
  } catch {
    qrDataUrl.value = ''
    notify('二维码生成失败：内容过长或颜色值无效', 'err')
  }
}

watch(
  () => [activeRecord.value?.id, activeRecord.value?.content, JSON.stringify(config.value.qr)].join('|'),
  () => { void refreshQr() }
)

watch(config, value => {
  if (!ready) return
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => { void saveConfig(value) }, 400)
}, { deep: true })

async function reload() {
  const [cfg, recs, used, info, path] = await Promise.all([
    loadConfig(), loadRecords(), loadUsedIds(), dataDirInfo(), storageLocation()
  ])
  config.value = cfg
  records.value = recs
  usedSet.clear()
  used.forEach(id => usedSet.add(id))
  recs.forEach(r => usedSet.add(r.id))
  dataDir.value = info.dir
  dataDirCustom.value = info.custom
  isBrowserMode.value = info.browser
  usedCount.value = usedSet.size
  dataDirOk.value = await dirAccessible(info.dir)
  storagePath.value = path
  if (!recs.some(r => r.id === activeId.value)) activeId.value = recs[0]?.id ?? ''
  await refreshQr()
}

async function readVersion(): Promise<string> {
  if (isTauri()) {
    try {
      const { getVersion, getIdentifier } = await import('@tauri-apps/api/app')
      appIdentifier.value = await getIdentifier()
      return await getVersion()
    } catch { /* fall back to build-time version */ }
  }
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.1.1'
}

async function init() {
  const migrated = await migrateLegacyData()
  await reload()
  appVersion.value = await readVersion()
  ready = true
  if (migrated) notify('已从旧版本目录迁移历史数据')
}

/** 切换数据目录，成功后重新加载全部数据 */
async function applyDataDir(dir: string, migrate: boolean, deleteSource = false): Promise<boolean> {
  busy.value = true
  try {
    const result = await switchDataDir(dir, migrate, deleteSource)
    await reload()
    const parts = [`数据目录已切换`]
    if (result.migrated) parts.push(`迁移 ${result.migrated} 个文件`)
    if (result.removed) parts.push(`已删除原目录 ${result.removed} 个文件`)
    notify(parts.join('，'))
    return true
  } catch (e) {
    notify(`切换失败：${String(e)}`, 'err')
    return false
  } finally {
    busy.value = false
  }
}

/** 恢复默认目录：把当前目录数据搬回默认位置 */
async function useDefaultDataDir(deleteSource = false): Promise<boolean> {
  busy.value = true
  try {
    const result = await restoreDefaultDirectory(deleteSource)
    await reload()
    const parts = [`已恢复默认目录`]
    if (result.migrated) parts.push(`迁移 ${result.migrated} 个文件`)
    if (result.removed) parts.push(`已删除原目录 ${result.removed} 个文件`)
    notify(parts.join('，'))
    return true
  } catch (e) {
    notify(`恢复失败：${String(e)}`, 'err')
    return false
  } finally {
    busy.value = false
  }
}

async function generate(
  keywordsText: string,
  mode: CountMode,
  count: number,
  note: string
): Promise<number> {
  const keywords = parseKeywords(keywordsText)
  const plan = buildGeneratePlan(keywords, mode, count)
  const now = new Date()
  let seq = nextSequence.value
  const created: IdRecord[] = []

  for (const item of plan) {
    const slug = keywordSlug(item.keyword, config.value.id)
    for (let i = 0; i < item.count; i++) {
      const result = generateUniqueId(config.value.id, slug, seq, usedSet, now)
      seq = result.sequence + 1
      usedSet.add(result.id)
      const content = renderQrContent(config.value.qr.contentTemplate, {
        id: result.id,
        keyword: item.keyword,
        slug,
        city: config.value.id.cityCode,
        sequence: result.sequence,
        date: now,
        prefix: config.value.id.prefix
      })
      created.push({
        id: result.id,
        keyword: item.keyword,
        keywordSlug: slug,
        content,
        sequence: result.sequence,
        createdAt: now.toISOString(),
        note
      })
    }
  }

  records.value = [...created, ...records.value]
  activeId.value = created[0]?.id ?? activeId.value
  await Promise.all([saveRecords(records.value), saveUsedIds([...usedSet])])
  usedCount.value = usedSet.size
  notify(`已生成 ${created.length} 个唯一 ID 并保存到本地`)
  return created.length
}

async function removeRecord(id: string) {
  const target = records.value.find(r => r.id === id)
  const ok = await askConfirm({
    title: '删除这条记录',
    message: '该 ID 会继续保留在去重库中，不会被再次生成。',
    detail: target?.id ?? id,
    okText: '删除',
    danger: true
  })
  if (!ok) return
  records.value = records.value.filter(r => r.id !== id)
  selectedIds.value = selectedIds.value.filter(s => s !== id)
  if (activeId.value === id) activeId.value = records.value[0]?.id ?? ''
  await saveRecords(records.value)
  notify('记录已删除（该 ID 仍保留在去重库中，不会被再次生成）')
}

async function clearRecords() {
  if (records.value.length === 0) {
    notify('当前没有记录可清空', 'warn')
    return
  }
  const ok = await askConfirm({
    title: '清空全部记录',
    message: `将移除 ${records.value.length} 条记录，去重库保持不变，已用过的 ID 不会被复用。`,
    okText: '清空',
    danger: true
  })
  if (!ok) return
  records.value = []
  selectedIds.value = []
  activeId.value = ''
  await saveRecords(records.value)
  notify('历史记录已清空，去重库保持不变')
}

async function resetConfig() {
  config.value = structuredClone(DEFAULT_CONFIG)
  await saveConfig(config.value)
  notify('已恢复默认规则')
}

function toggleSelect(id: string) {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter(s => s !== id)
    : [...selectedIds.value, id]
}

function selectAllFiltered() {
  const ids = filteredRecords.value.map(r => r.id)
  selectedIds.value = [...new Set([...selectedIds.value, ...ids])]
}

function clearSelection() { selectedIds.value = [] }

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    notify('已复制到剪贴板')
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    el.remove()
    notify('已复制到剪贴板')
  }
}

async function doExportText(kind: 'csv' | 'json' | 'txt') {
  if (exportRecords.value.length === 0) { notify('没有可导出的记录', 'warn'); return }
  busy.value = true
  try {
    const path = await exportText(kind, exportRecords.value)
    if (path) notify(`已导出 ${exportRecords.value.length} 条 ID → ${path}`)
  } catch (e) {
    notify(`导出失败：${String(e)}`, 'err')
  } finally { busy.value = false }
}

async function doExportPng() {
  if (!qrDataUrl.value || !activeRecord.value) { notify('请先生成一条记录', 'warn'); return }
  const path = await exportPng(qrDataUrl.value, activeRecord.value.id)
  if (path) notify(`二维码已导出 → ${path}`)
}

async function doExportBundle() {
  if (exportRecords.value.length === 0) { notify('没有可导出的记录', 'warn'); return }
  busy.value = true
  progress.value = { done: 0, total: exportRecords.value.length }
  try {
    const result = await exportBundle(exportRecords.value, config.value.qr, p => { progress.value = p })
    if (result) notify(`已打包 ${result.qrCount} 张二维码 + ID 清单 → ${result.path}`)
  } catch (e) {
    notify(`批量导出失败：${String(e)}`, 'err')
  } finally {
    busy.value = false
    progress.value = null
  }
}

async function openDataFolder(dir?: string) {
  if (isBrowserMode.value) {
    notify('浏览器预览模式使用 localStorage，无本地文件夹')
    return
  }
  const target = dir?.trim() || dataDir.value || storagePath.value
  if (!target) { notify('数据目录尚未初始化', 'warn'); return }
  try {
    const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
    await revealItemInDir(target)
  } catch {
    notify(`数据目录：${target}`)
  }
}

function openSettings() { settingsOpen.value = true }
function closeSettings() { settingsOpen.value = false }

export function useStudio() {
  return {
    config, records, activeId, activeRecord, selectedIds, search, exportScope,
    storagePath, dataDir, dataDirCustom, dataDirOk, isBrowserMode, appVersion, appIdentifier, usedCount,
    settingsOpen, openSettings, closeSettings,
    qrDataUrl, busy, progress, toast, nextSequence,
    filteredRecords, exportRecords,
    init, generate, removeRecord, clearRecords, resetConfig,
    toggleSelect, selectAllFiltered, clearSelection, copy,
    doExportText, doExportPng, doExportBundle, openDataFolder, notify,
    applyDataDir, useDefaultDataDir,
    safeFileName
  }
}
