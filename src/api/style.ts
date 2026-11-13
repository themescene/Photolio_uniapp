/**
 * 文风滤镜 API（SSE 流式）。
 *
 * 对齐网页端 [annualreport/src/views/UploadView.vue:1001] applyStyleFilter() 的 fetch 实现，
 * 用 sseRequest 替换 EventSource / fetch ReadableStream。
 *
 * 后端：POST /api/apply-style
 *   body: { text, style, context, is_incremental, lang }
 *   resp: SSE chunks data: {type, text|message}
 */
import { sseRequest } from './sse'
import type { StyleKey } from '@/types'

export interface ApplyStyleOptions {
  text: string
  style: StyleKey
  /** 已转换好的前文（增量模式时给 LLM 作为上下文） */
  context?: string
  is_incremental?: boolean
  lang?: 'zh' | 'en'
  /** 每收到一段 token 文本 */
  onToken: (text: string) => void
  /** 流结束（自然 done 或 error） */
  onDone: (err?: Error) => void
}

/**
 * 触发 apply-style 流式。返回 abort 函数。
 *
 * 用法：
 *   const stop = applyStyle({ text, style, onToken, onDone })
 *   // 组件销毁时
 *   onUnmounted(() => stop())
 */
export function applyStyle(opts: ApplyStyleOptions): () => void {
  const { text, style, context = '', is_incremental = false, lang = 'zh', onToken, onDone } = opts
  return sseRequest({
    path: '/apply-style',
    body: { text, style, context, is_incremental, lang },
    requireAuth: false,
    onChunk: (c) => {
      if (c.type === 'token' && typeof c.text === 'string') onToken(c.text)
    },
    onDone,
  })
}
