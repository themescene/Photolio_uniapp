/**
 * 扩容包印刷物料导出（H5 only）
 *
 * 契约（用户 2026-09-24 定稿）：
 *  - 每张卡片只画「容量文字 + 二维码」两层。禁画日期 / URL / label
 *  - 两种导出档：
 *      · exportAsPdf: A4 210×297mm，3 列 × 4 行 = 12/页，n*12 张排 ⌈n⌉ 页
 *      · exportAsZip: 每张一个 PNG，命名 boost_<cap>_<code>.png，打包 zip
 *  - QR 图从 backend `/api/qr` 拉，CORS *，可 crossOrigin='anonymous' 进 canvas
 */
import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import type { StorageBoost } from '@/types'
import { qrImageUrl } from '@/config/env'

/** 从 backend 拉 QR PNG → HTMLImageElement（进 canvas 需 crossOrigin） */
function loadQrImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`QR image load failed: ${url}`))
    img.src = url
  })
}

function fmtCap(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(0)}GB`
  return `${(bytes / 1024 ** 2).toFixed(0)}MB`
}

function shareUrl(code: string): string {
  return `https://hxiazi.com/s/${code}`
}

/**
 * 单张卡片渲染到 canvas
 *  - 尺寸：cardWpx × cardHpx（调用方按用途选 PDF mm→px 或 PNG 原生 px）
 *  - 布局：上 15% 容量文字；下 85% 二维码居中（正方形，边距 8%）
 */
async function drawBoostCard(
  boost: StorageBoost,
  cardWpx: number,
  cardHpx: number,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = cardWpx
  canvas.height = cardHpx
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, cardWpx, cardHpx)

  // 顶部容量文字
  const capText = `${fmtCap(boost.capacity_bytes)} 扩容包`
  const textAreaH = cardHpx * 0.18
  const fontSize = Math.round(cardHpx * 0.08)
  ctx.fillStyle = '#2C2218'
  ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(capText, cardWpx / 2, textAreaH / 2)

  // 底部二维码正方形居中
  const qrAreaTop = textAreaH
  const qrAreaH = cardHpx - textAreaH
  const qrSide = Math.min(cardWpx, qrAreaH) * 0.88
  const qrX = (cardWpx - qrSide) / 2
  const qrY = qrAreaTop + (qrAreaH - qrSide) / 2

  const qrImg = await loadQrImage(qrImageUrl(shareUrl(boost.code), 600))
  ctx.drawImage(qrImg, qrX, qrY, qrSide, qrSide)

  return canvas
}

/** canvas → Blob (PNG) */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas toBlob null'))),
      'image/png',
    )
  })
}

/** 触发浏览器下载 */
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 导出为单张 PNG 打包 zip
 * 用于「批量塞进 Word 各处随意排版」场景
 */
export async function exportAsZip(
  boosts: StorageBoost[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const zip = new JSZip()
  const cardPx = 900 // 单张 900×900 png，够印刷
  for (let i = 0; i < boosts.length; i++) {
    const b = boosts[i]
    const canvas = await drawBoostCard(b, cardPx, cardPx)
    const blob = await canvasToBlob(canvas)
    const cap = fmtCap(b.capacity_bytes)
    zip.file(`boost_${cap}_${b.code}.png`, blob)
    onProgress?.(i + 1, boosts.length)
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  triggerDownload(zipBlob, `photolio-boosts-${stamp}-${boosts.length}张.zip`)
}

/**
 * 导出为 A4 12 宫格 PDF（3 列 × 4 行）
 *  - 页面尺寸 210×297mm，四周 10mm 边距
 *  - 每格 (210-20)/3 × (297-20)/4 ≈ 63.3 × 69.25 mm
 *  - n 张自动排 ⌈n/12⌉ 页
 */
export async function exportAsPdf(
  boosts: StorageBoost[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = 210
  const pageH = 297
  const marginX = 10
  const marginY = 10
  const cols = 3
  const rows = 4
  const perPage = cols * rows
  const cellW = (pageW - marginX * 2) / cols
  const cellH = (pageH - marginY * 2) / rows
  // canvas 内部按 4×放大出图，PDF 端再缩到 cellW×cellH mm → 印刷清晰
  const cardWpx = Math.round(cellW * 8)
  const cardHpx = Math.round(cellH * 8)

  for (let i = 0; i < boosts.length; i++) {
    const b = boosts[i]
    if (i > 0 && i % perPage === 0) pdf.addPage()
    const pageIdx = i % perPage
    const col = pageIdx % cols
    const row = Math.floor(pageIdx / cols)
    const x = marginX + col * cellW
    const y = marginY + row * cellH

    const canvas = await drawBoostCard(b, cardWpx, cardHpx)
    const dataUrl = canvas.toDataURL('image/png')
    pdf.addImage(dataUrl, 'PNG', x, y, cellW, cellH)
    onProgress?.(i + 1, boosts.length)
  }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  pdf.save(`photolio-boosts-${stamp}-${boosts.length}张.pdf`)
}
