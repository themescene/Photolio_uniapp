/**
 * 媒体处理工具 —— 视频本地压缩 + PENDING storage TTL 守护。
 *
 * 用户痛点：视频上传 / 服务端转码慢得让人焦虑。mp-weixin 基础库 ≥ 2.11 起支持
 * `uni.compressVideo`（硬件加速 + on-device H.264），可以在用户侧先压一遍：
 *   - 减少上传字节数 → 弱网快得多
 *   - 减少服务端转码压力（很多视频已经是 H.264，压完直接当成品）
 *   - 不掉清晰度：1080p → 720p H.264 ~ 2 Mbps 看着无差
 *
 * 用法：
 *   const out = await compressVideoIfPossible(rawPath, { quality: 'medium' })
 *   await uploadShareVideo(out, ...)
 */

export interface CompressVideoOptions {
  /** 'low' | 'medium' | 'high'。medium 在体感和大小间最平衡 */
  quality?: 'low' | 'medium' | 'high'
  /** 1080 / 720 / 540 / 360 */
  resolution?: number
  /** kbps，默认让 mp-weixin 自己挑 */
  bitrate?: number
  /** 帧率 */
  fps?: number
}

interface UniCompressVideoApi {
  compressVideo?: (opts: {
    src: string
    quality?: string
    resolution?: number
    bitrate?: number
    fps?: number
    success?: (res: { tempFilePath?: string; size?: number }) => void
    fail?: (err: unknown) => void
  }) => void
}

/**
 * 尽量做本地压缩；不支持 / 出错时回退到原文件。返回最终上传用的 tempFilePath。
 *
 * 失败兜底原因：
 *   - mp-weixin 基础库 < 2.11 没有这个 API
 *   - H5 / app 端 uni 实现可能没接（直接 throw）
 *   - 视频编码异常时 mp-weixin 也可能 fail
 */
export function compressVideoIfPossible(
  src: string,
  opts: CompressVideoOptions = {},
): Promise<string> {
  return new Promise((resolve) => {
    try {
      const api = uni as unknown as UniCompressVideoApi
      if (typeof api.compressVideo !== 'function') {
        resolve(src)
        return
      }
      api.compressVideo({
        src,
        quality: opts.quality || 'medium',
        ...(opts.resolution ? { resolution: opts.resolution } : {}),
        ...(opts.bitrate ? { bitrate: opts.bitrate } : {}),
        ...(opts.fps ? { fps: opts.fps } : {}),
        success: (res) => resolve(res.tempFilePath || src),
        fail: () => resolve(src),
      })
    } catch {
      resolve(src)
    }
  })
}

// ============================================================
// PENDING storage 守护：避免「上次没消费完的 storage 在下次创作里乱串」
// ============================================================
// 痛点：
//   - 用户从 NFC tab 选了「图文」→ 写 PENDING_PRESET_ID → 切到上传 tab 中途返回 →
//     storage 里这条记录留着 → 用户下次正常新建画匣子被错误绑定到旧 NFC 卡
//   - 同理 PENDING_GROUP_ID
//
// 方案：写入时附带 ts；读出时若超 1 小时直接当过期，清掉再返回空

const PENDING_TTL_MS = 60 * 60 * 1000 // 60 分钟过期

interface PendingPayload<T> {
  v: T
  ts: number
}

export function setPending<T>(key: string, value: T) {
  try {
    const payload: PendingPayload<T> = { v: value, ts: Date.now() }
    uni.setStorageSync(key, payload)
  } catch { /* ignore */ }
}

export function readPending<T>(key: string): T | null {
  try {
    const raw = uni.getStorageSync(key) as unknown
    if (!raw) return null

    // 兼容老格式（直接存的 string）：当作有效（旧代码会在使用后清掉）
    if (typeof raw === 'string') return raw as unknown as T

    if (typeof raw === 'object' && raw !== null && 'v' in raw && 'ts' in raw) {
      const p = raw as PendingPayload<T>
      if (Date.now() - p.ts > PENDING_TTL_MS) {
        uni.removeStorageSync(key)
        return null
      }
      return p.v
    }
    return null
  } catch {
    return null
  }
}

export function clearPending(key: string) {
  try { uni.removeStorageSync(key) } catch { /* ignore */ }
}
