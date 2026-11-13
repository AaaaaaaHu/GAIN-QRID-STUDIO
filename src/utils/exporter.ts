import JSZip from 'jszip'
import { saveFile, utf8, type SaveFilter } from './platform'
import { dataUrlToBytes, makeQrDataUrl } from './qrcode'
import { formatTimestamp, safeFileName, stamp, toCsv, toJson, toPlainList } from './format'
import type { IdRecord, QrRule } from '@/types'

const FILTERS: Record<string, SaveFilter[]> = {
  csv: [{ name: 'CSV 表格', extensions: ['csv'] }],
  json: [{ name: 'JSON 数据', extensions: ['json'] }],
  txt: [{ name: '文本文件', extensions: ['txt'] }],
  png: [{ name: 'PNG 图片', extensions: ['png'] }],
  zip: [{ name: 'ZIP 压缩包', extensions: ['zip'] }]
}

const MIMES: Record<string, string> = {
  csv: 'text/csv;charset=utf-8',
  json: 'application/json;charset=utf-8',
  txt: 'text/plain;charset=utf-8',
  png: 'image/png',
  zip: 'application/zip'
}

export async function exportText(
  kind: 'csv' | 'json' | 'txt',
  records: IdRecord[]
): Promise<string | null> {
  const text = kind === 'csv' ? toCsv(records) : kind === 'json' ? toJson(records) : toPlainList(records)
  return saveFile(`GIAN-ID清单_${stamp()}.${kind}`, utf8(text), FILTERS[kind], MIMES[kind])
}

export async function exportPng(dataUrl: string, name: string): Promise<string | null> {
  return saveFile(`GIAN-${safeFileName(name)}.png`, dataUrlToBytes(dataUrl), FILTERS.png, MIMES.png)
}

export interface BundleProgress { done: number; total: number }

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => {
    switch (ch) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&#39;'
    }
  })
}

/** 图文对照表：一行一条记录，二维码按同一顺序内嵌，可直接打印或核对 */
function buildIndexHtml(rows: Array<{ rec: IdRecord; url: string }>): string {
  const body = rows.map(({ rec, url }) => `
      <tr>
        <td class="num">${rec.sequence}</td>
        <td class="id">${escapeHtml(rec.id)}</td>
        <td>${escapeHtml(rec.keyword || '—')}</td>
        <td class="qr"><img src="${url}" alt="${escapeHtml(rec.id)}" /></td>
        <td class="content">${escapeHtml(rec.content)}</td>
        <td class="time">${escapeHtml(formatTimestamp(rec.createdAt))}</td>
      </tr>`).join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>GIAN-ID 与二维码对照表</title>
<style>
  body { margin: 24px; font: 13px/1.6 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #1b2559; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #8792ac; font-size: 12px; margin-bottom: 18px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #dfe4f0; padding: 8px 10px; text-align: left; vertical-align: middle; }
  th { background: #f4f6fc; font-size: 12px; color: #4a5578; }
  td.num { width: 56px; color: #8792ac; }
  td.id { font-family: Consolas, Menlo, monospace; font-size: 12px; font-weight: 600; }
  td.qr { width: 132px; text-align: center; }
  td.qr img { width: 112px; height: 112px; display: block; margin: 0 auto; image-rendering: pixelated; }
  td.content { font-family: Consolas, Menlo, monospace; font-size: 11px; color: #4a5578; word-break: break-all; }
  td.time { width: 150px; color: #8792ac; font-size: 11.5px; }
  tr { page-break-inside: avoid; }
  @media print { body { margin: 8mm; } th { background: #fff; } }
</style>
</head>
<body>
  <h1>GIAN-ID 与二维码对照表</h1>
  <div class="meta">共 ${rows.length} 条 · 导出时间 ${escapeHtml(new Date().toLocaleString('zh-CN'))} · 二维码文件位于「GIAN-二维码」文件夹，文件名即 ID</div>
  <table>
    <thead>
      <tr><th>序号</th><th>ID</th><th>关键词</th><th>二维码</th><th>二维码内容</th><th>生成时间</th></tr>
    </thead>
    <tbody>${body}
    </tbody>
  </table>
</body>
</html>`
}

/**
 * 一键导出：ID 清单(CSV/JSON/TXT) + 每条记录对应的二维码 PNG，打包为一个 ZIP。
 */
export async function exportBundle(
  records: IdRecord[],
  qrRule: QrRule,
  onProgress?: (p: BundleProgress) => void
): Promise<{ path: string; qrCount: number } | null> {
  if (records.length === 0) return null

  const zip = new JSZip()
  zip.file('GIAN-ID清单.csv', toCsv(records))
  zip.file('GIAN-ID数据.json', toJson(records))
  zip.file('GIAN-ID纯列表.txt', toPlainList(records))
  zip.file('GIAN-说明.txt', [
    'GIAN-QRID-STUDIO · 批量导出',
    `导出时间：${new Date().toLocaleString('zh-CN')}`,
    `共 ${records.length} 条记录`,
    '',
    'GIAN-ID清单.csv   —— 含关键词、二维码内容、序号、生成时间',
    'GIAN-ID数据.json  —— 结构化数据，便于二次导入/对接',
    'GIAN-ID纯列表.txt —— 每行一个 ID',
    'GIAN-二维码对照表.html —— 表格内直接显示二维码，一行一个 ID，可打印核对',
    'GIAN-二维码/      —— 每条记录一张 PNG，文件名即 ID',
    '',
    '二维码内容以对应记录的「二维码内容」字段为准。'
  ].join('\r\n'))

  const folder = zip.folder('GIAN-二维码')!
  const rows: Array<{ rec: IdRecord; url: string }> = []
  let qrCount = 0
  for (let i = 0; i < records.length; i++) {
    const rec = records[i]
    try {
      const url = await makeQrDataUrl(rec.content, qrRule)
      folder.file(`${safeFileName(rec.id)}.png`, dataUrlToBytes(url))
      rows.push({ rec, url })
      qrCount++
    } catch {
      // 单条失败不影响整包导出
    }
    onProgress?.({ done: i + 1, total: records.length })
  }

  zip.file('GIAN-二维码对照表.html', buildIndexHtml(rows))

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  const path = await saveFile(`GIAN-ID与二维码_${stamp()}_${records.length}条.zip`, bytes, FILTERS.zip, MIMES.zip)
  return path ? { path, qrCount } : null
}
