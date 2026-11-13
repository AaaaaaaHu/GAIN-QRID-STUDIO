import QRCode from 'qrcode'
import type { LogoConfig, LogoPosition, QrRule } from '@/types'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('logo 图片加载失败'))
    img.src = src
  })
}

/** 位置中心点（按边长归一化），四个角已避开定位角 */
function positionCenter(position: LogoPosition): { x: number; y: number } {
  switch (position) {
    case 'top': return { x: 0.5, y: 0.22 }
    case 'bottom': return { x: 0.5, y: 0.78 }
    case 'left': return { x: 0.22, y: 0.5 }
    case 'right': return { x: 0.78, y: 0.5 }
    default: return { x: 0.5, y: 0.5 }
  }
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

async function drawLogo(canvas: HTMLCanvasElement, logo: LogoConfig, background: string) {
  if (!logo.dataUrl) return
  const image = await loadImage(logo.dataUrl)
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const W = canvas.width
  const box = W * (clamp(logo.sizePercent, 6, 30) / 100)
  const center = positionCenter(logo.position)
  const cx = W * center.x
  const cy = W * center.y
  const pad = logo.padding ? Math.max(3, W * 0.014) : 0
  const outer = box + pad * 2

  if (logo.padding) {
    ctx.save()
    ctx.fillStyle = background || '#FFFFFF'
    if (logo.circular) {
      ctx.beginPath()
      ctx.arc(cx, cy, outer / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      roundRectPath(ctx, cx - outer / 2, cy - outer / 2, outer, outer, outer * 0.22)
      ctx.fill()
    }
    ctx.restore()
  }

  ctx.save()
  if (logo.circular) {
    ctx.beginPath()
    ctx.arc(cx, cy, box / 2, 0, Math.PI * 2)
  } else {
    roundRectPath(ctx, cx - box / 2, cy - box / 2, box, box, box * 0.16)
  }
  ctx.clip()

  const scale = Math.max(box / image.width, box / image.height)
  const dw = image.width * scale
  const dh = image.height * scale
  ctx.drawImage(image, cx - dw / 2, cy - dh / 2, dw, dh)
  ctx.restore()
}

/** 生成二维码图片；启用 logo 时用 canvas 合成 */
export async function makeQrDataUrl(content: string, rule: QrRule): Promise<string> {
  const size = clamp(rule.size, 128, 2048)
  const canvas = document.createElement('canvas')

  await QRCode.toCanvas(canvas, content || ' ', {
    errorCorrectionLevel: rule.errorCorrectionLevel,
    width: size,
    margin: clamp(rule.margin, 0, 10),
    color: { dark: rule.foreground || '#000000', light: rule.background || '#FFFFFF' }
  })

  if (rule.logo?.enabled && rule.logo.dataUrl) {
    await drawLogo(canvas, rule.logo, rule.background)
  }

  return canvas.toDataURL('image/png')
}

/** 读取用户选择的图片，等比缩到 256px 内再转 dataURL，避免配置文件膨胀 */
export async function normalizeLogo(file: Blob): Promise<string> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })

  const image = await loadImage(original)
  const max = 256
  const scale = Math.min(1, max / Math.max(image.width, image.height))
  const w = Math.max(1, Math.round(image.width * scale))
  const h = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return original
  ctx.drawImage(image, 0, 0, w, h)
  return canvas.toDataURL('image/png')
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? ''
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}
