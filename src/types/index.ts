export type KeywordMode = 'pinyin' | 'initials' | 'raw' | 'none'
export type Charset = 'digits' | 'upper' | 'lower' | 'alnum' | 'hex'
export type DateFormat = 'YYYYMMDD' | 'YYMMDD' | 'YYYY' | 'YYYYMM'
export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'
/** Logo 可放置的位置：已排除三个定位角与右下对齐图案区域 */
export type LogoPosition = 'center' | 'top' | 'bottom' | 'left' | 'right'

export interface LogoConfig {
  enabled: boolean
  /** base64 dataURL，缩小后内嵌，避免配置文件过大 */
  dataUrl: string
  /** 占二维码边长百分比 */
  sizePercent: number
  position: LogoPosition
  /** 圆形裁切 */
  circular: boolean
  /** 白色衬垫，避免图案与码点粘连 */
  padding: boolean
}

export const DEFAULT_LOGO: LogoConfig = {
  enabled: false,
  dataUrl: '',
  sizePercent: 16,
  position: 'center',
  circular: false,
  padding: true
}

/** ID 组成规则，全部可持久化 */
export interface IdRule {
  prefix: string
  keywordMode: KeywordMode
  keywordMaxLength: number
  keywordUppercase: boolean
  includeDate: boolean
  dateFormat: DateFormat
  separator: string
  sequenceLength: number
  randomLength: number
  charset: Charset
  checksum: boolean
  suffix: string
}

/** 二维码样式规则 */
export interface QrRule {
  contentTemplate: string
  errorCorrectionLevel: ErrorCorrectionLevel
  size: number
  margin: number
  foreground: string
  background: string
  logo: LogoConfig
}

export interface AppConfig {
  id: IdRule
  qr: QrRule
}

/** 一条已生成的记录，追加写、永不覆盖 */
export interface IdRecord {
  id: string
  keyword: string
  keywordSlug: string
  content: string
  sequence: number
  createdAt: string
  note: string
}

export const DEFAULT_CONFIG: AppConfig = {
  id: {
    prefix: 'ID',
    keywordMode: 'initials',
    keywordMaxLength: 8,
    keywordUppercase: true,
    includeDate: true,
    dateFormat: 'YYYYMMDD',
    separator: '-',
    sequenceLength: 4,
    randomLength: 4,
    charset: 'upper',
    checksum: true,
    suffix: ''
  },
  qr: {
    contentTemplate: '{id}',
    errorCorrectionLevel: 'M',
    size: 640,
    margin: 2,
    foreground: '#1B2559',
    background: '#FFFFFF',
    logo: { ...DEFAULT_LOGO }
  }
}
