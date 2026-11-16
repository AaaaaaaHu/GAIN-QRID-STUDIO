import { computed, ref, watch } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'
export type AccentKey = 'indigo' | 'ocean' | 'forest' | 'amber' | 'rose' | 'graphite'
export type MotionPref = 'full' | 'reduced'

export interface Appearance {
  mode: ThemeMode
  accent: AccentKey
  motion: MotionPref
}

export interface Option<T extends string> {
  key: T
  label: string
  desc: string
}

export const THEME_MODES: Option<ThemeMode>[] = [
  { key: 'light', label: '浅色', desc: '明亮清爽' },
  { key: 'dark', label: '深色', desc: '低光环境' },
  { key: 'system', label: '跟随系统', desc: '自动切换' }
]

export const ACCENTS: (Option<AccentKey> & { color: string })[] = [
  { key: 'indigo', label: '靛蓝', desc: '默认', color: '#5b52f0' },
  { key: 'ocean', label: '海蓝', desc: '清透', color: '#0ea5e9' },
  { key: 'forest', label: '青绿', desc: '沉稳', color: '#10b981' },
  { key: 'amber', label: '琥珀', desc: '暖调', color: '#f59e0b' },
  { key: 'rose', label: '玫红', desc: '鲜活', color: '#fb7185' },
  { key: 'graphite', label: '石墨', desc: '克制', color: '#7c8aa3' }
]

const STORAGE_KEY = 'qrid.appearance.v1'

export const DEFAULT_APPEARANCE: Appearance = {
  mode: 'light',
  accent: 'indigo',
  motion: 'full'
}

const MODE_KEYS: ThemeMode[] = ['light', 'dark', 'system']
const ACCENT_KEYS: AccentKey[] = ACCENTS.map(item => item.key)
const MOTION_KEYS: MotionPref[] = ['full', 'reduced']

const appearance = ref<Appearance>({ ...DEFAULT_APPEARANCE })
const systemDark = ref(false)

let mediaQuery: MediaQueryList | null = null
let initialized = false

type StoredAppearance = Partial<Record<keyof Appearance, unknown>>

/** 校验本地存储值，避免旧版本/手改数据把界面搞坏 */
function sanitize(raw: StoredAppearance): Appearance {
  return {
    mode: MODE_KEYS.includes(raw.mode as ThemeMode) ? raw.mode as ThemeMode : DEFAULT_APPEARANCE.mode,
    accent: ACCENT_KEYS.includes(raw.accent as AccentKey) ? raw.accent as AccentKey : DEFAULT_APPEARANCE.accent,
    motion: MOTION_KEYS.includes(raw.motion as MotionPref) ? raw.motion as MotionPref : DEFAULT_APPEARANCE.motion
  }
}

function read(): Appearance {
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    if (!text) return { ...DEFAULT_APPEARANCE }
    return sanitize(JSON.parse(text) as StoredAppearance)
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance.value)) } catch { /* 隐私模式下忽略 */ }
}

const resolvedTheme = computed<'light' | 'dark'>(() => {
  if (appearance.value.mode === 'system') return systemDark.value ? 'dark' : 'light'
  return appearance.value.mode
})

/** 把状态写到 <html> 上，样式全部由 CSS 变量接管 */
function apply() {
  const root = document.documentElement
  root.dataset.theme = resolvedTheme.value
  root.dataset.accent = appearance.value.accent
  root.dataset.motion = appearance.value.motion
}

function onSystemChange(event: MediaQueryListEvent) {
  systemDark.value = event.matches
  apply()
}

/** 在挂载应用前调用一次，避免首屏闪白 */
export function initAppearance() {
  if (initialized) return
  initialized = true
  appearance.value = read()
  mediaQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null
  systemDark.value = mediaQuery?.matches ?? false
  apply()
  mediaQuery?.addEventListener?.('change', onSystemChange)
  watch(appearance, () => { persist(); apply() }, { deep: true })
}

function patch(part: Partial<Appearance>) {
  appearance.value = { ...appearance.value, ...part }
}

export function useAppearance() {
  return {
    appearance,
    resolvedTheme,
    systemDark,
    setMode: (mode: ThemeMode) => patch({ mode }),
    setAccent: (accent: AccentKey) => patch({ accent }),
    setMotion: (motion: MotionPref) => patch({ motion }),
    resetAppearance: () => { appearance.value = { ...DEFAULT_APPEARANCE } }
  }
}
