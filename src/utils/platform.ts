/** 判断是否运行在 Tauri WebView 中；浏览器降级为 localStorage + 下载 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
}

export interface SaveFilter { name: string; extensions: string[] }

/** 统一保存：桌面端走原生保存对话框，浏览器端走 Blob 下载 */
export async function saveFile(
  defaultName: string,
  bytes: Uint8Array,
  filters: SaveFilter[],
  mime = 'application/octet-stream'
): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const target = await save({ defaultPath: defaultName, filters })
    if (!target) return null
    await writeFile(target, bytes)
    return target
  }

  const buffer = bytes.slice().buffer as ArrayBuffer
  const blob = new Blob([buffer], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = defaultName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 3000)
  return defaultName
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}
