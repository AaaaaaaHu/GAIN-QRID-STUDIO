import { pinyin } from 'pinyin-pro'
import type { Charset, DateFormat, IdRule } from '@/types'

const CHARSETS: Record<Charset, string> = {
  digits: '0123456789',
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghijkmnpqrstuvwxyz',
  alnum: '0123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz',
  hex: '0123456789ABCDEF'
}

/** 无偏随机字符，使用 Web Crypto，避免 Math.random 的可预测性 */
export function randomString(length: number, charset: Charset): string {
  const pool = CHARSETS[charset] ?? CHARSETS.upper
  const buf = new Uint32Array(length)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < length; i++) out += pool[buf[i] % pool.length]
  return out
}

export function formatDate(date: Date, fmt: DateFormat): string {
  const y = String(date.getFullYear())
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  switch (fmt) {
    case 'YYMMDD': return `${y.slice(2)}${m}${d}`
    case 'YYYY': return y
    case 'YYYYMM': return `${y}${m}`
    default: return `${y}${m}${d}`
  }
}

/** 关键词清洗：中文可转全拼 / 首字母 / 保留原文；非法字符剔除 */
export function keywordSlug(keyword: string, rule: IdRule): string {
  const clean = keyword.trim().replace(/\s+/g, '')
  if (rule.keywordMode === 'none') return ''
  // 关键词留空 = 不要关键词段，不占用占位符
  if (!clean) return ''

  let text = ''
  if (rule.keywordMode === 'raw') {
    text = clean
  } else {
    const syllables = pinyin(clean, { toneType: 'none', type: 'array' })
    text = rule.keywordMode === 'initials'
      ? syllables.map(s => (s || '')[0] || '').join('')
      : syllables.join('')
  }

  const slug = rule.keywordMode === 'raw'
    ? text.replace(/[^\p{L}\p{N}]/gu, '')
    : text.replace(/[^A-Za-z0-9]/g, '')
  // 关键词有内容但无法转码（纯符号 / emoji）时保留 GEN 作为标记
  const safe = (slug || 'GEN').slice(0, Math.max(1, rule.keywordMaxLength))
  return rule.keywordUppercase ? safe.toUpperCase() : safe.toLowerCase()
}

function sanitizeSegment(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_-]/g, '')
}

function checksumOf(value: string): string {
  let sum = 7
  for (let i = 0; i < value.length; i++) sum = (sum * 31 + value.charCodeAt(i)) % 36
  return sum.toString(36).toUpperCase()
}

/** 按规则拼装一个 ID（不含去重） */
export function buildId(rule: IdRule, slug: string, sequence: number, date = new Date()): string {
  const sep = rule.separator
  const parts: string[] = []

  if (sanitizeSegment(rule.prefix)) parts.push(sanitizeSegment(rule.prefix))
  if (sanitizeSegment(rule.cityCode || '')) parts.push(sanitizeSegment(rule.cityCode || ''))
  if (slug) parts.push(slug)
  if (rule.includeDate) parts.push(formatDate(date, rule.dateFormat))
  if (rule.sequenceLength > 0) parts.push(String(sequence).padStart(rule.sequenceLength, '0'))
  if (rule.randomLength > 0) parts.push(randomString(rule.randomLength, rule.charset))
  // 既无序号也无随机位时，补一段时间熵，保证可批量生成
  if (rule.sequenceLength === 0 && rule.randomLength === 0) {
    parts.push(String(date.getTime()).slice(-6))
  }
  if (sanitizeSegment(rule.suffix)) parts.push(sanitizeSegment(rule.suffix))

  let body = parts.filter(Boolean).join(sep)
  if (rule.checksum) body += `${sep}${checksumOf(body)}`
  return body
}

export interface UniqueIdResult { id: string; sequence: number }

/**
 * 生成全局唯一 ID：先与本地历史集合比对，冲突则递增序号 / 重摇随机位重试，
 * 极端情况下追加碰撞后缀，确保永不重复。
 */
export function generateUniqueId(
  rule: IdRule,
  slug: string,
  startSequence: number,
  existing: Set<string>,
  date = new Date()
): UniqueIdResult {
  for (let attempt = 0; attempt < 200; attempt++) {
    const seq = startSequence + attempt
    const id = buildId(rule, slug, seq, date)
    if (!existing.has(id)) return { id, sequence: seq }
  }
  let n = startSequence + 200
  let id = ''
  do {
    id = `${buildId(rule, slug, n, date)}${rule.separator || ''}X${n}`
    n++
  } while (existing.has(id))
  return { id, sequence: n }
}

/** 解析用户输入的关键词：换行 / 逗号 / 顿号 / 分号分隔，去重保序 */
export function parseKeywords(input: string): string[] {
  const list = input.split(/[\n\r,，、;；\t]+/).map(s => s.trim()).filter(Boolean)
  return [...new Set(list)]
}

/** 渲染二维码内容模板：{id} {keyword} {slug} {city} {date} {time} {sequence} {prefix} */
export function renderQrContent(
  template: string,
  ctx: {
    id: string
    keyword: string
    slug: string
    /** 城市编码，可省略 */
    city?: string
    sequence: number
    date: Date
    prefix: string
  }
): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const d = ctx.date
  const map: Record<string, string> = {
    id: ctx.id,
    keyword: ctx.keyword,
    slug: ctx.slug,
    city: ctx.city ?? '',
    sequence: String(ctx.sequence),
    prefix: ctx.prefix,
    date: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`,
    time: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
    datetime: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  }
  return (template || '{id}').replace(/\{(\w+)\}/g, (_, key: string) => map[key.toLowerCase()] ?? `{${key}}`)
}

/** 预览 ID 样例（不写入历史） */
export function previewId(rule: IdRule, slug: string, sequence: number): string {
  return buildId(rule, slug, sequence)
}
