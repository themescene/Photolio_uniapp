/**
 * SSE 流式读取助手。
 *
 * 微信小程序不支持 EventSource，但 uni.request 有 enableChunked + onChunkReceived
 * 可以收增量 chunk。本模块封装为 AsyncIterable，调用方用 for-await-of 即可。
 *
 * 参考网页端 [annualreport/src/utils/sse.ts]（Web 用 fetch + ReadableStream）。
 *
 * 后端约定（report_controller.py:177）：
 *   每条消息以 "data: " 开头，后面是 JSON，整体以 "\n\n" 分隔
 *   data: {"type": "token", "text": "..."}
 *   data: {"type": "done"}
 *   data: {"type": "error", "message": "..."}
 */
import { API_BASE, IS_DEV, STORAGE_KEYS } from '@/config/env'
import { logger } from '@/utils/logger'
import { ApiError } from './request'

export interface SseChunk {
  type: 'token' | 'done' | 'error' | string
  text?: string
  message?: string
  [key: string]: unknown
}

export interface SseRequestOptions {
  path: string
  body: Record<string, unknown>
  requireAuth?: boolean
  baseURL?: string
  timeout?: number
  /** 每收到一条 JSON chunk 时回调。返回 true 可主动中断 */
  onChunk: (c: SseChunk) => void | boolean | Promise<void | boolean>
  /** 整条流结束（done / error / 网络断）时回调 */
  onDone?: (err?: Error) => void
}

/**
 * 发起一次 SSE POST 请求并按 chunk 解析。
 *
 * 返回一个 abort 函数，调用方可在 onUnmounted 里用来中断。
 */
export function sseRequest(opts: SseRequestOptions): () => void {
  const {
    path,
    body,
    requireAuth = true,
    baseURL = API_BASE,
    timeout = 120_000,
    onChunk,
    onDone,
  } = opts

  const trimmedBase = baseURL.replace(/\/+$/, '')
  const trimmedPath = path.replace(/^\/+/, '')
  const url = `${trimmedBase}/${trimmedPath}`

  let token: string | null = null
  try { token = uni.getStorageSync(STORAGE_KEYS.TOKEN) || null } catch { /* ignore */ }
  if (requireAuth && !token) {
    queueMicrotask(() => onDone?.(new ApiError('未登录', 401, 'NO_TOKEN')))
    return () => {}
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  let aborted = false
  let buffer = ''

  if (IS_DEV) logger.debug(`[sse] POST ${url}`)

  const task = uni.request({
    url,
    method: 'POST',
    header: headers,
    data: body,
    timeout,
    enableChunked: true,
    responseType: 'text',
    success: () => {
      // success 在小程序里会在 chunked 模式下也触发，作为收尾标记
      if (!aborted) onDone?.()
    },
    fail: (err) => {
      if (aborted) return
      logger.warn('[sse] fail', err)
      onDone?.(new ApiError(err.errMsg || '流式请求失败', 0, 'NETWORK', err))
    },
  })

  // 接收增量 chunk
  // task.onChunkReceived 的回调参数：{ data: ArrayBuffer }
  // 转 utf-8 文本，按 \n 切行，提取 "data: " 行后的 JSON
  const onChunkReceived = (res: { data: ArrayBuffer }) => {
    if (aborted) return
    try {
      const chunkText = arrayBufferToString(res.data)
      buffer += chunkText
      const lines = buffer.split(/\r?\n/)
      // 最后一行可能是不完整 chunk → 保留进 buffer
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload) continue
        let parsed: SseChunk
        try {
          parsed = JSON.parse(payload) as SseChunk
        } catch {
          logger.debug('[sse] non-json chunk skipped', payload)
          continue
        }
        const ret = onChunk(parsed)
        if (ret === true) {
          aborted = true
          try { (task as { abort?: () => void }).abort?.() } catch { /* ignore */ }
          onDone?.()
          return
        }
        if (parsed.type === 'done' || parsed.type === 'error') {
          // 让 success 兜底，但提前通知调用方
          if (parsed.type === 'error') {
            onDone?.(new ApiError(parsed.message || '生成失败', 0, 'SSE_ERROR'))
            aborted = true
            try { (task as { abort?: () => void }).abort?.() } catch { /* ignore */ }
          }
        }
      }
    } catch (e) {
      logger.error('[sse] chunk parse fail', e)
    }
  }
  ;(task as { onChunkReceived?: (cb: typeof onChunkReceived) => void }).onChunkReceived?.(onChunkReceived)

  return () => {
    aborted = true
    try { (task as { abort?: () => void }).abort?.() } catch { /* ignore */ }
  }
}

// ArrayBuffer → utf-8 string。小程序里 TextDecoder 不一定有，做个降级。
function arrayBufferToString(buf: ArrayBuffer): string {
  const TD = (globalThis as { TextDecoder?: new (encoding?: string) => { decode(b: ArrayBuffer): string } }).TextDecoder
  if (typeof TD !== 'undefined') {
    try { return new TD('utf-8').decode(buf) } catch { /* fallthrough */ }
  }
  // 兜底：逐字节拼 string（仅 ASCII 安全；中文会乱码）
  const view = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < view.length; i++) s += String.fromCharCode(view[i])
  try { return decodeURIComponent(escape(s)) } catch { return s }
}
