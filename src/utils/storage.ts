import { isTauri } from './platform'
import { DEFAULT_CONFIG } from '@/types'
import type { AppConfig, IdRecord } from '@/types'

const LS_RECORDS = 'qrid.records.v1'
const LS_CONFIG = 'qrid.config.v1'
const LS_USED = 'qrid.used.v1'
const LS_DIR = 'qrid.dataDir.v1'

const FILE_RECORDS = 'records.json'
const FILE_CONFIG = 'config.json'
const FILE_USED = 'used-ids.json'

/** 历次改版前的应用标识，按新→旧顺序尝试，用于把历史数据搬到当前目录 */
const LEGACY_DIR_NAMES = [
  'com.xh.qrid.studio',
  'com.qrid.studio'
]
let legacyChecked = false

/**
 * 应用 identifier 变更后，若当前目录还没有数据，就从最近的旧目录把三个文件复制过来。
 * 只在桌面端、且用户未自定义目录时执行，避免覆盖已有数据。
 */
export async function migrateLegacyData(): Promise<boolean> {
  if (!isTauri() || legacyChecked) return false
  legacyChecked = true
  if (getCustomDir()) return false

  try {
    const { appDataDir, dirname, join } = await import('@tauri-apps/api/path')
    const { exists, mkdir, readTextFile, writeTextFile } = await import('@tauri-apps/plugin-fs')

    const current = await appDataDir()
    if (await exists(await join(current, FILE_RECORDS))) return false

    const parent = await dirname(current)
    let legacy = ''
    for (const name of LEGACY_DIR_NAMES) {
      const candidate = await join(parent, name)
      if (candidate !== current && await exists(candidate)) {
        legacy = candidate
        break
      }
    }
    if (!legacy) return false

    await mkdir(current, { recursive: true })
    let copied = 0
    for (const file of [FILE_RECORDS, FILE_CONFIG, FILE_USED]) {
      const source = await join(legacy, file)
      if (await exists(source)) {
        await writeTextFile(await join(current, file), await readTextFile(source))
        copied++
      }
    }
    return copied > 0
  } catch {
    return false
  }
}

/** 自定义数据目录（存在 localStorage，启动时优先读取） */
export function getCustomDir(): string {
  try {
    return localStorage.getItem(LS_DIR)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function setCustomDir(dir: string | null): void {
  if (dir && dir.trim()) localStorage.setItem(LS_DIR, dir.trim())
  else localStorage.removeItem(LS_DIR)
}

/** 当前生效的数据目录；桌面端默认是 appDataDir */
export async function resolveDataDir(): Promise<string> {
  const custom = getCustomDir()
  if (custom) return custom
  if (!isTauri()) return ''
  const { appDataDir } = await import('@tauri-apps/api/path')
  return await appDataDir()
}

async function dataPath(fileName: string): Promise<string> {
  const { join } = await import('@tauri-apps/api/path')
  return join(await resolveDataDir(), fileName)
}

export interface DataDirInfo {
  dir: string
  custom: boolean
  browser: boolean
}

export async function dataDirInfo(): Promise<DataDirInfo> {
  return {
    dir: await resolveDataDir(),
    custom: Boolean(getCustomDir()),
    browser: !isTauri()
  }
}

/** 目录是否可访问，用于提示「自定义目录被移动/删除」 */
export async function dirAccessible(dir: string): Promise<boolean> {
  if (!isTauri() || !dir) return true
  try {
    const { exists } = await import('@tauri-apps/plugin-fs')
    return await exists(dir)
  } catch {
    return false
  }
}

/** 数据文件位置（records.json 全路径） */
export async function storageLocation(): Promise<string> {
  if (!isTauri()) return '浏览器 localStorage（qrid.records.v1）'
  return dataPath(FILE_RECORDS)
}

async function readText(fileName: string, lsKey: string): Promise<string | null> {
  if (!isTauri()) return localStorage.getItem(lsKey)
  const { exists, readTextFile } = await import('@tauri-apps/plugin-fs')
  const path = await dataPath(fileName)
  return (await exists(path)) ? await readTextFile(path) : null
}

async function writeText(fileName: string, lsKey: string, content: string): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem(lsKey, content)
    return
  }
  const { mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs')
  await mkdir(await resolveDataDir(), { recursive: true }).catch(() => {})
  await writeTextFile(await dataPath(fileName), content)
}

export async function loadRecords(): Promise<IdRecord[]> {
  try {
    const raw = await readText(FILE_RECORDS, LS_RECORDS)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as IdRecord[]) : []
  } catch {
    return []
  }
}

export async function saveRecords(records: IdRecord[]): Promise<void> {
  await writeText(FILE_RECORDS, LS_RECORDS, JSON.stringify(records, null, 2))
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await readText(FILE_CONFIG, LS_CONFIG)
    if (!raw) return structuredClone(DEFAULT_CONFIG)
    const parsed = JSON.parse(raw) as Partial<AppConfig>
    return {
      id: { ...DEFAULT_CONFIG.id, ...(parsed.id ?? {}) },
      qr: {
        ...DEFAULT_CONFIG.qr,
        ...(parsed.qr ?? {}),
        logo: { ...DEFAULT_CONFIG.qr.logo, ...(parsed.qr?.logo ?? {}) }
      }
    }
  } catch {
    return structuredClone(DEFAULT_CONFIG)
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await writeText(FILE_CONFIG, LS_CONFIG, JSON.stringify(config, null, 2))
}

/** 「曾生成过的 ID」持久集合：即使删除记录也不允许复用，保证全局不重复 */
export async function loadUsedIds(): Promise<string[]> {
  try {
    const raw = await readText(FILE_USED, LS_USED)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as string[]
    }
  } catch { /* fall through */ }
  return []
}

export async function saveUsedIds(ids: string[]): Promise<void> {
  await writeText(FILE_USED, LS_USED, JSON.stringify(ids))
}

export interface SwitchResult { dir: string; migrated: number; removed: number }

async function copyDataFiles(from: string, to: string): Promise<number> {
  if (!from || !to || from === to) return 0
  const { readTextFile, writeTextFile, exists } = await import('@tauri-apps/plugin-fs')
  const { join } = await import('@tauri-apps/api/path')
  let copied = 0
  for (const file of [FILE_RECORDS, FILE_CONFIG, FILE_USED]) {
    const source = await join(from, file)
    if (await exists(source)) {
      await writeTextFile(await join(to, file), await readTextFile(source))
      copied++
    }
  }
  return copied
}

/** 只删除本应用自己的三个数据文件，不动目录里的其他内容 */
async function removeDataFiles(dir: string): Promise<number> {
  if (!dir) return 0
  const { remove, exists } = await import('@tauri-apps/plugin-fs')
  const { join } = await import('@tauri-apps/api/path')
  let removed = 0
  for (const file of [FILE_RECORDS, FILE_CONFIG, FILE_USED]) {
    try {
      const target = await join(dir, file)
      if (await exists(target)) {
        await remove(target)
        removed++
      }
    } catch { /* 单个失败不影响其他 */ }
  }
  return removed
}

/**
 * 切换数据目录：可选把现有 records / config / used-ids 复制到新目录；
 * 若同时要求删除源文件，只有复制确实成功时才执行，避免数据丢失。
 */
export async function switchDataDir(
  nextDir: string,
  migrate: boolean,
  deleteSource = false
): Promise<SwitchResult> {
  if (!isTauri()) throw new Error('浏览器预览模式不支持修改数据目录')
  const target = nextDir.trim()
  if (!target) throw new Error('目录不能为空')

  const { mkdir } = await import('@tauri-apps/plugin-fs')
  const previous = await resolveDataDir()
  await mkdir(target, { recursive: true })

  const migrated = migrate ? await copyDataFiles(previous, target) : 0
  const removed = deleteSource && migrated > 0 ? await removeDataFiles(previous) : 0

  setCustomDir(target)
  return { dir: target, migrated, removed }
}

/**
 * 恢复默认目录（appDataDir）：语义就是「把当前目录的数据搬回默认位置」，始终执行复制。
 * 若要求删除源文件，同样只在复制成功后执行。
 */
export async function restoreDefaultDir(deleteSource = false): Promise<SwitchResult> {
  if (!isTauri()) throw new Error('浏览器预览模式不支持修改数据目录')
  const { appDataDir } = await import('@tauri-apps/api/path')
  const { mkdir } = await import('@tauri-apps/plugin-fs')
  const target = await appDataDir()
  const previous = await resolveDataDir()

  await mkdir(target, { recursive: true })
  const migrated = await copyDataFiles(previous, target)
  const removed = deleteSource && migrated > 0 && previous !== target
    ? await removeDataFiles(previous)
    : 0

  setCustomDir(null)
  return { dir: target, migrated, removed }
}
