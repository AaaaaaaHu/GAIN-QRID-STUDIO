import type { IdRecord } from '@/types'

const CSV_HEADERS = ['ID', '关键词', '二维码内容', '序号', '生成时间', '备注'] as const

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`
}

/** 带 UTF-8 BOM，Excel 直接打开不乱码 */
export function toCsv(records: IdRecord[]): string {
  const lines = [CSV_HEADERS.map(csvCell).join(',')]
  for (const r of records) {
    lines.push([
      r.id, r.keyword, r.content, r.sequence, formatTimestamp(r.createdAt), r.note
    ].map(csvCell).join(','))
  }
  return '\uFEFF' + lines.join('\r\n')
}

export function toJson(records: IdRecord[]): string {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    total: records.length,
    records
  }, null, 2)
}

export function toPlainList(records: IdRecord[]): string {
  return records.map(r => r.id).join('\r\n')
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 文件名安全化 */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').slice(0, 80) || 'export'
}

export function stamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}
