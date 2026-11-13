/**
 * 文风滤镜流式 composable。
 *
 * 包装 api/style.applyStyle，提供：
 *   - styling 状态
 *   - streamedText 累积文本（实时跟随）
 *   - apply(text, style) 启动
 *   - abort() 中断
 *
 * 参考网页端 [annualreport/src/views/UploadView.vue:1001-1055] 的状态机。
 */
import { ref, onUnmounted } from 'vue'
import { applyStyle } from '@/api/style'
import { logger } from '@/utils/logger'
import type { StyleKey } from '@/types'

// 2026-08-11：DashScope LLM 流式接口首次连接偶发 RemoteDisconnected（冷启动 / 连接池冷 socket）
//   backend `apply_style_streaming` 直接把异常 yield 成 `[ERROR] Connection aborted...`。
//   用户实测：第一次点文风必弹「文风切换失败」，重点一次就好 —— 典型的可重试瞬时错误。
//   frontend 层加一次静默重试即可，不改后端。
function _isTransientStreamError(err: Error | undefined): boolean {
  if (!err) return false
  const msg = (err.message || '').toLowerCase()
  return /remotedisconnected|connection\s*aborted|connection\s*reset|timeout|closed\s*connection/i.test(msg)
}

export function useStyleStream() {
  const styling = ref(false)
  const streamedText = ref('')
  const errorMsg = ref('')

  let abort: (() => void) | null = null

  // 单次尝试；不做状态管理，纯粹一次流式调用
  function _attemptOnce(text: string, style: StyleKey, lang: 'zh' | 'en'): Promise<string> {
    return new Promise((resolve, reject) => {
      streamedText.value = ''  // 重置累积文本
      abort = applyStyle({
        text, style, lang,
        onToken: (chunk) => { streamedText.value += chunk },
        onDone: (err) => {
          abort = null
          if (err) reject(err)
          else resolve(streamedText.value)
        },
      })
    })
  }

  async function apply(text: string, style: StyleKey, lang: 'zh' | 'en' = 'zh'): Promise<string> {
    if (styling.value) abort?.()
    styling.value = true
    errorMsg.value = ''
    try {
      try {
        return await _attemptOnce(text, style, lang)
      } catch (err) {
        // 瞬时错误静默重试一次（500ms 退避让上游 socket 复位）
        if (_isTransientStreamError(err as Error)) {
          logger.warn('[useStyleStream] 首次流式失败，500ms 后静默重试', { err: (err as Error).message })
          await new Promise((r) => setTimeout(r, 500))
          return await _attemptOnce(text, style, lang)
        }
        throw err
      }
    } catch (err) {
      errorMsg.value = (err as Error).message || '文风生成失败'
      throw err
    } finally {
      styling.value = false
    }
  }

  function abortStream() {
    if (abort) { abort(); abort = null }
    styling.value = false
  }

  onUnmounted(() => abortStream())

  return { styling, streamedText, errorMsg, apply, abort: abortStream }
}
