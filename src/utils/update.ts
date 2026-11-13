/**
 * 更新检查：把 UPDATE_ENDPOINT 指向一个返回如下 JSON 的地址即可启用
 *   { "version": "1.1.0", "url": "https://...", "notes": "更新说明" }
 * 留空则视为未配置更新通道。
 */
const UPDATE_ENDPOINT = ''

export interface UpdateInfo {
  version: string
  url?: string
  notes?: string
}

export const updateChannelConfigured = Boolean(UPDATE_ENDPOINT)

export async function fetchUpdateInfo(): Promise<UpdateInfo | null> {
  if (!UPDATE_ENDPOINT) return null
  const res = await fetch(UPDATE_ENDPOINT, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as Partial<UpdateInfo>
  if (!data.version) throw new Error('返回内容缺少 version 字段')
  return { version: String(data.version), url: data.url, notes: data.notes }
}

/** 语义化版本比较：a > b 返回 1，相等 0，小于 -1 */
export function compareVersion(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/i, '').split(/[.\-+]/).map(p => Number.parseInt(p, 10) || 0)
  const left = parse(a)
  const right = parse(b)
  const len = Math.max(left.length, right.length)
  for (let i = 0; i < len; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}
