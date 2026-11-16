import { pinyin } from 'pinyin-pro'
import { REGION_TUPLES, type RegionLevel } from '@/data/regions'

export interface RegionNode {
  /** GB/T 2260 六位行政区划代码 */
  code: string
  name: string
  /** 1 = 省 / 直辖市 / 自治区，2 = 地级市，3 = 区县 */
  level: RegionLevel
  /** 上级代码，省级为空串 */
  parent: string
}

/** 下拉选项：value 为行政区划代码，depth 用于缩进，keywords 供拼音 / 代码搜索 */
export interface RegionOption {
  value: string
  label: string
  hint: string
  depth: number
  keywords: string
  /** 搜索排序权重，越小越靠前 */
  hot: number
  /** 所属省市，搜索结果里用于区分同名区县 */
  note: string
  /** 上级代码，分栏联动时用于逐级展开；省级为空串 */
  parent: string
}

/** 全国省 / 市 / 区县三级行政区划（共 3350 条） */
export const REGIONS: RegionNode[] = REGION_TUPLES.map(([code, name, level, parent]) => ({
  code,
  name,
  level,
  parent
}))

const REGION_MAP = new Map(REGIONS.map(item => [item.code, item]))

/** 城市编码规范化：只保留字母 / 数字 / 下划线 / 短横线，最长 8 位 */
export function normalizeCityCode(value: string): string {
  return (value ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 8)
}

/** 根据编码取行政区名称（任意层级），未收录返回空串 */
export function cityNameOf(code: string): string {
  return REGION_MAP.get(normalizeCityCode(code))?.name ?? ''
}

/** 层级路径，如「北京市 / 市辖区 / 东城区」；市辖区、县等占位层级不参与展示 */
export function regionPath(code: string, separator = ' / '): string {
  const node = REGION_MAP.get(normalizeCityCode(code))
  if (!node) return ''

  const names: string[] = [node.name]
  let parent = node.parent
  while (parent) {
    const item = REGION_MAP.get(parent)
    if (!item) break
    names.unshift(item.name)
    parent = item.parent
  }

  return names.filter(name => name !== '市辖区' && name !== '县').join(separator)
}

let optionCache: RegionOption[] | null = null

/**
 * 常用城市优先级（数值越小越靠前）。
 * 用于搜索结果同分排序，避免输入 sz 时苏州排在深圳前面；区县沿用所属城市的优先级。
 */
const HOT_CITY_ORDER = [
  '110000', '310000', '440300', '440100', '330100', '510100', '500000', '420100',
  '610100', '320100', '320500', '120000', '430100', '410100', '441900', '440600',
  '330200', '370200', '340100', '350200',
  '130100', '130200', '130600', '140100', '150100', '150200',
  '210100', '210200', '220100', '230100',
  '320200', '320600', '330300', '330400', '330600',
  '350100', '350500', '360100',
  '370100', '370600',
  '410300', '420500',
  '440400', '442000', '450100', '460100',
  '520100', '530100', '540100',
  '620100', '630100', '640100', '650100',
  '710000', '810000', '820000'
]

const HOT_RANK = new Map(HOT_CITY_ORDER.map((code, index) => [code, index + 1]))

/**
 * 常用城市权重：沿上级链路上溯，命中常用城市则继承其排名；
 * 层级越深权重越大，保证「南京」排在「南山区」前、「杭州」排在「海珠区」前。
 */
function hotRankOf(node: RegionNode): number {
  const levelPenalty = (node.level - 1) * 100
  let code: string = node.code
  while (code) {
    const rank = HOT_RANK.get(code)
    if (rank) return rank + levelPenalty
    const parent: string | undefined = REGION_MAP.get(code)?.parent
    if (!parent) break
    code = parent
  }
  return 999 + levelPenalty
}

/** 所属省市名称，跳过「市辖区 / 县」这类占位层级 */
function noteOf(node: RegionNode): string {
  if (node.level === 1) return ''
  const parent = REGION_MAP.get(node.parent)
  if (!parent) return ''
  if (parent.name === '市辖区' || parent.name === '县') {
    return REGION_MAP.get(parent.parent)?.name ?? ''
  }
  return parent.name
}

/**
 * 不指向真实地点的中间层：北京 / 天津 / 上海 / 重庆 的「市辖区」「县」，
 * 以及河南 / 湖北 / 海南 / 新疆的「省直辖县级行政区划」。
 * 分栏联动时直接跳过，否则悬停「北京市」只会看到一条「市辖区」。
 */
const PLACEHOLDER_NAMES = new Set([
  '市辖区',
  '县',
  '省直辖县级行政区划',
  '自治区直辖县级行政区划'
])

/** 分栏用的上级代码：沿真实层级上溯，跳过占位层级；省级为空串 */
function cascadeParentOf(node: RegionNode): string {
  let code = node.parent
  let guard = 0
  while (code && guard < 8) {
    const parent = REGION_MAP.get(code)
    if (!parent) return ''
    if (!PLACEHOLDER_NAMES.has(parent.name)) return parent.code
    code = parent.parent
    guard += 1
  }
  return ''
}

/** 跳过占位层级后的层级：0 = 省级，1 = 地级，2 = 区县 */
function cascadeDepthOf(node: RegionNode): number {
  let depth = 0
  let code = cascadeParentOf(node)
  let guard = 0
  while (code && guard < 8) {
    depth += 1
    const parent = REGION_MAP.get(code)
    if (!parent) break
    code = cascadeParentOf(parent)
    guard += 1
  }
  return depth
}

/**
 * 三级区划下拉选项。首次调用时批量生成拼音索引（约 30ms），之后复用。
 * keywords 同时包含全拼与首字母，因此「hangzhou」「hz」「杭州」「330100」都能命中。
 * parent 指向跳过占位层级后的真实上级，供下拉分栏逐级展开。
 */
export function regionOptions(): RegionOption[] {
  if (optionCache) return optionCache

  optionCache = REGIONS
    .filter(node => !PLACEHOLDER_NAMES.has(node.name))
    .map(node => {
      const full = pinyin(node.name, { toneType: 'none', type: 'array' }).join('').toLowerCase()
      const initials = pinyin(node.name, { pattern: 'first', toneType: 'none', type: 'array' })
        .join('')
        .toLowerCase()
      return {
        value: node.code,
        label: node.name,
        hint: node.code,
        depth: cascadeDepthOf(node),
        keywords: `${full} ${initials}`,
        hot: hotRankOf(node),
        note: noteOf(node),
        parent: cascadeParentOf(node),
        group: node.level === 1
      }
    })

  return optionCache
}
