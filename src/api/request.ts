/**
 * 全仓**唯一**直接调 `uni.request` 的地方。
 *
 * - 自动注入 baseURL 和 `Authorization: Bearer <token>`
 * - 自动序列化 JSON / FormData
 * - 后端约定的 `{ status: 'success' | 'error', data, message }` 包装统一拆包
 * - 失败统一抛 `ApiError`（含 httpCode + bizCode + message），上层只 try/catch 即可
 * - 开发模式自动打日志（method / url / 耗时 / 错误）
 *
 * 其它任何 api 文件（`src/api/auth.ts` 等）只调本文件的 `request<T>()`，
 * **不要**直接 `uni.request`。
 */
import { API_BASE, IS_DEV, STORAGE_KEYS } from '@/config/env'
import { logger } from '@/utils/logger'

/** uniapp `uni.request` 仅支持这些方法；不写 PATCH（小程序后端用 POST + body.op 也能等价） */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface RequestOptions<TBody = unknown> {
  method?: HttpMethod
  /** 路径，开头不带斜杠也可，例如 `auth/login` 或 `/auth/login` */
  path: string
  /** query 参数，自动 URL 编码 */
  query?: Record<string, string | number | boolean | undefined | null>
  /** JSON body；如果传 FormData 则改走 multipart */
  body?: TBody
  /** 是否需要登录 token；默认 true。无 token 时若 requireAuth=true 会抛 ApiError(401) */
  requireAuth?: boolean
  /** 自定义 baseURL（如视频走 VIDEO_UPLOAD_BASE） */
  baseURL?: string
  /** 超时（ms），默认 60s */
  timeout?: number
  /** 额外 header */
  headers?: Record<string, string>
}

/** 后端统一响应包装 */
interface BackendEnvelope<T> {
  status: 'success' | 'error'
  data?: T
  message?: string
  /** 部分接口直接把数据放顶层（旧版习惯），需要兼容 */
  [key: string]: unknown
}

export class ApiError extends Error {
  httpCode: number
  bizCode?: string | number
  raw?: unknown

  constructor(message: string, httpCode: number, bizCode?: string | number, raw?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.httpCode = httpCode
    this.bizCode = bizCode
    this.raw = raw
  }
}

function buildUrl(baseURL: string, path: string, query?: RequestOptions['query']): string {
  const trimmedBase = baseURL.replace(/\/+$/, '')
  const trimmedPath = path.replace(/^\/+/, '')
  let url = `${trimmedBase}/${trimmedPath}`
  if (query && Object.keys(query).length > 0) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    if (qs) url += (url.includes('?') ? '&' : '?') + qs
  }
  return url
}

function getToken(): string | null {
  try {
    return uni.getStorageSync(STORAGE_KEYS.TOKEN) || null
  } catch {
    return null
  }
}

// 全局 401 防抖：多个并发请求同时拿到 401 时，只清一次 token + 弹一次重登提示
let _sessionExpiredHandled = false
function handleSessionExpired() {
  if (_sessionExpiredHandled) return
  _sessionExpiredHandled = true
  try {
    uni.removeStorageSync(STORAGE_KEYS.TOKEN)
    uni.removeStorageSync(STORAGE_KEYS.USER)
  } catch { /* ignore */ }
  uni.showToast({ title: '登录已过期，请重新登录', icon: 'none', duration: 2500 })
  setTimeout(() => {
    uni.reLaunch({ url: '/pages/auth/login' })
    setTimeout(() => { _sessionExpiredHandled = false }, 2000)
  }, 700)
}

/**
 * 主入口。泛型 T 是 *业务数据* 的类型（envelope.data），不是整个 envelope。
 */
export async function request<T = unknown>(opts: RequestOptions): Promise<T> {
  const {
    method = 'GET',
    path,
    query,
    body,
    requireAuth = true,
    baseURL = API_BASE,
    timeout = 60_000,
    headers: extraHeaders = {},
  } = opts

  const url = buildUrl(baseURL, path, query)
  const token = getToken()

  if (requireAuth && !token) {
    throw new ApiError('未登录', 401, 'NO_TOKEN')
  }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  }

  const startedAt = Date.now()
  if (IS_DEV) logger.debug(`[req] ${method} ${url}`)

  return new Promise<T>((resolve, reject) => {
    uni.request({
      url,
      method,
      header: headers,
      data: body as AnyJson | undefined,
      timeout,
      success: (res) => {
        const ms = Date.now() - startedAt
        const httpCode = res.statusCode
        if (IS_DEV) logger.debug(`[res] ${method} ${url} ${httpCode} (${ms}ms)`)

        // HTTP 层错误
        if (httpCode < 200 || httpCode >= 300) {
          // 2026-08-11：只有 401（session 真过期）触发重登。403 是"业务层禁止"（无权删别人的合集章节等），
          //   之前一起触发 handleSessionExpired → 清 token → 用户被强制退出登录（Bug 4 根因）。
          //   403 现在按普通业务错走 ApiError，让上层 UI 自行 toast/modal。
          if (httpCode === 401 && requireAuth) {
            handleSessionExpired()
          }
          const msg = extractMessage(res.data) || `HTTP ${httpCode}`
          return reject(new ApiError(msg, httpCode, undefined, res.data))
        }

        // 业务层错误（后端 envelope.status === 'error'）
        const env = res.data as BackendEnvelope<T> | T
        if (isEnvelope(env)) {
          if (env.status === 'error') {
            return reject(new ApiError(env.message || '业务失败', httpCode, undefined, env))
          }
          return resolve((env.data as T) ?? (env as unknown as T))
        }
        // 没用 envelope 的旧接口直接返回
        resolve(env as T)
      },
      fail: (err) => {
        const ms = Date.now() - startedAt
        logger.error(`[req-fail] ${method} ${url} (${ms}ms)`, err)
        reject(new ApiError(err.errMsg || '网络异常', 0, 'NETWORK', err))
      },
    })
  })
}

function isEnvelope<T>(v: unknown): v is BackendEnvelope<T> {
  return typeof v === 'object' && v !== null && 'status' in v && (v as { status: unknown }).status !== undefined
}

function extractMessage(v: unknown): string | null {
  if (typeof v === 'object' && v !== null) {
    const m = (v as { message?: unknown }).message
    if (typeof m === 'string') return m
  }
  return null
}

/** 内部用 — `uni.request` 的 data 可以是 string / object / ArrayBuffer */
type AnyJson = string | object | ArrayBuffer

// ============================================================
// uploadFile：multipart 上传（uni.request 不支持文件，必须走 uni.uploadFile）
// ============================================================

export interface UploadOptions {
  /** 路径，例如 `/analyze-image` */
  path: string
  /** 本地文件 tempFilePath（来自 uni.chooseMedia 等） */
  filePath: string
  /** form 字段名，后端读取用，例如 'image' */
  name: string
  /** 附加 form 字段 */
  formData?: Record<string, string | number | boolean | undefined | null>
  /** 是否要 token；默认 true */
  requireAuth?: boolean
  /** baseURL；默认 API_BASE */
  baseURL?: string
  /** 超时 ms，默认 120s（AI 分析可能慢） */
  timeout?: number
  /** 上传进度回调 0..100 */
  onProgress?: (percent: number) => void
  /** 2026-08-10：禁用自动重试（默认 false=启用）。
   *  用于外层已有 race/timeout/fallback 逻辑的场景，避免 3 次重试放大总耗时。 */
  noRetry?: boolean
}

/** 2026-08-10：判断 upload 失败是否值得重试。
 *  只重试瞬时网络类错误（RST / timeout / 5xx）；
 *  4xx / 401 / abort / filePath is null / 域名未白名单 等业务/永久错误一律不重试。 */
/** 上传超时（区别于 RST / 5xx）：说明**带宽不够**，不是瞬时抖动 */
export function isUploadTimeout(e: ApiError): boolean {
  return /timeout/i.test(e.message || '')
}

function _isRetryableUploadError(e: ApiError): boolean {
  const isNetwork = e.bizCode === 'NETWORK' || e.httpCode === 0
  const isServer5xx = e.httpCode >= 500 && e.httpCode < 600
  if (!isNetwork && !isServer5xx) return false
  const msg = (e.message || '').toLowerCase()
  // 这些是永久失败，重试无意义
  if (/abort|cancel|filepath is null|domain list|not in domain|url\s+not/i.test(msg)) return false
  return true
}

function _sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

/** uni.uploadFile 的统一封装，行为对齐 request<T>()：自动 token、ApiError、envelope 拆包 + 网络错误重试 */
export async function uploadFile<T = unknown>(opts: UploadOptions): Promise<T> {
  const {
    path,
    filePath,
    name,
    formData = {},
    requireAuth = true,
    baseURL = API_BASE,
    timeout,
    onProgress,
    noRetry = false,
  } = opts

  const trimmedBase = baseURL.replace(/\/+$/, '')
  const trimmedPath = path.replace(/^\/+/, '')
  const url = `${trimmedBase}/${trimmedPath}`
  const token = getToken()

  if (requireAuth && !token) {
    throw new ApiError('未登录', 401, 'NO_TOKEN')
  }

  // formData 值必须是字符串
  const formDataStringified: Record<string, string> = {}
  for (const [k, v] of Object.entries(formData)) {
    if (v === undefined || v === null) continue
    formDataStringified[k] = String(v)
  }

  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
  if (IS_DEV) logger.debug(`[upload] POST ${url} (file=${filePath})`)

  /**
   * 2026-09-14：超时改成**按文件体积给预算**，不再一律 120s。
   *
   * 固定 120s 的问题：一张 6.7MB 原图在 126KB/s 的上行下需要 55s（勉强够），
   * 但并发 3 时每条只分到约 42KB/s → 需要 160s → 必然超时。
   * 超时后的重试同样会超时，于是 10 次重试把 2 分钟变成 20 分钟。
   *
   * 预算按一个很保守的下限速率 30KB/s 算，下限 120s、上限 10 分钟。
   * 拿不到体积（H5 blob 需要异步 fetch）时回落 120s，跟老行为一致。
   */
  const MIN_BYTES_PER_SEC = 30 * 1024
  async function _resolveTimeout(): Promise<number> {
    if (timeout) return timeout
    let bytes = 0
    try {
      // #ifdef H5
      if (/^blob:/i.test(filePath)) {
        const b = await fetch(filePath).then((r) => r.blob())
        bytes = b.size
      }
      // #endif
    } catch { /* 拿不到就用默认 */ }
    if (!bytes) return 120_000
    const budget = Math.ceil(bytes / MIN_BYTES_PER_SEC) * 1000
    const finalMs = Math.min(600_000, Math.max(120_000, budget))
    logger.info('[upload] 按体积给超时预算', {
      sizeMB: (bytes / 1024 / 1024).toFixed(1), timeoutSec: Math.round(finalMs / 1000),
    })
    return finalMs
  }

  // 参考：annualreport/src/composables/useRecorder.ts 用带扩展名的 File 上传。
  // H5 blob URL 本身没有文件名；必须保留真实 MIME，避免后端收到无扩展名音频。
  let browserAudioFile: File | undefined
  // #ifdef H5
  if (name === 'audio' && /^blob:/i.test(filePath)) {
    const blob = await fetch(filePath).then(response => response.blob())
    const mime = blob.type.split(';')[0].toLowerCase()
    const extension = ({ 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mpeg': 'mp3' } as Record<string, string>)[mime]
    if (!extension) throw new ApiError('录音格式不支持，请重新录制', 0, 'AUDIO_FORMAT')
    browserAudioFile = new File([blob], `recording.${extension}`, { type: blob.type })
    logger.info('[asr-trace] upload', { mime, bytes: blob.size, filename: browserAudioFile.name })
  }
  // #endif

  // 单次尝试的实现：返回 Promise<T>，失败抛 ApiError
  function _attempt(resolvedTimeout: number): Promise<T> {
    const startedAt = Date.now()
    return new Promise<T>((resolve, reject) => {
      const task = uni.uploadFile({
        url,
        filePath,
        // #ifdef H5
        ...(browserAudioFile ? { file: browserAudioFile } : {}),
        // #endif
        name,
        formData: formDataStringified,
        header: headers,
        timeout: resolvedTimeout,
        success: (res) => {
          const ms = Date.now() - startedAt
          const httpCode = res.statusCode
          if (IS_DEV) logger.debug(`[upload-res] POST ${url} ${httpCode} (${ms}ms)`)

          // uni.uploadFile 把响应体作为 string 返回，需要手动 JSON.parse
          // 之前 4xx / 5xx 分支直接 throw "HTTP {code}" 不解 body —— 用户投诉的「录音提示 HTTP 400」
          // 就是这里丢掉了后端真实原因（例如 "音频时长少于3秒: 2.5秒"）。这次先解 body 再判 http code
          let body: unknown = null
          try {
            body = res.data ? JSON.parse(res.data) : null
          } catch {
            if (httpCode < 200 || httpCode >= 300) {
              return reject(new ApiError(`HTTP ${httpCode}`, httpCode, undefined, res.data))
            }
            return reject(new ApiError('响应不是合法 JSON', httpCode, 'BAD_JSON', res.data))
          }

          if (httpCode < 200 || httpCode >= 300) {
            // 2026-08-11：uploadFile 也同步 request 的 401 → session 过期语义（403 不触发）
            if (httpCode === 401 && requireAuth) handleSessionExpired()
            const msg = extractMessage(body) || `HTTP ${httpCode}`
            return reject(new ApiError(msg, httpCode, undefined, body ?? res.data))
          }

          if (isEnvelope<T>(body)) {
            if (body.status === 'error') {
              return reject(new ApiError(body.message || '业务失败', httpCode, undefined, body))
            }
            return resolve((body.data as T) ?? (body as unknown as T))
          }
          resolve(body as T)
        },
        fail: (err) => {
          const ms = Date.now() - startedAt
          logger.error(`[upload-fail] POST ${url} (${ms}ms)`, err)
          reject(new ApiError(err.errMsg || '上传失败', 0, 'NETWORK', err))
        },
      })

      if (onProgress) {
        task.onProgressUpdate((res) => onProgress(res.progress))
      }
    })
  }

  // 2026-08-10：网络类失败自动重试 —— 弱网 / 蜂窝抖动 / 跨区 TCP RST 场景下，
  // uni.uploadFile 遇到一次瞬时错误就永久失败；用户看到"失败"红盖，卡在"整理中"。
  // 加 2 次重试 + 指数退避（500ms → 1500ms），转成对用户无感的自愈。
  // 只对瞬时错误重试；4xx / 认证 / filePath 类不重试（见 _isRetryableUploadError）
  // 2026-08-11：MAX_ATTEMPTS 3 → 10（用户实测图片上传偶发失败，backend DashScope 冷 socket 加内层
  //   5 次重试已覆盖大部分；这里再叠一层前端 10 次覆盖 TCP/CF/nginx 层瞬时错，给用户"零感知"体验）
  // 2026-09-14：超时类错误单独限次。
  //
  // 实测根因（用户上海 → 杭州 ECS，浏览器侧实测上行只有 126 KB/s）：
  //   5 张 6.7MB 原图、前端并发 3 → 每条分到约 42KB/s → 单张需要约 160s
  //   > 固定 120s 超时 → **必然全部超时** → 再各重试 10 次，每次又跑满 120s。
  //   nginx access.log 佐证：一连串 `POST /api/upload-image 499`（客户端主动断开）,
  //   后端 Flask 几乎没收到请求 —— 卡在客户端→nginx 的上行，不是后端慢。
  //
  // 带宽不够时重试 10 次毫无意义，只是把 2 分钟放大成 20 分钟。
  const MAX_ATTEMPTS = noRetry ? 1 : 10
  const MAX_TIMEOUT_ATTEMPTS = 2
  let lastErr: ApiError | null = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await _attempt(await _resolveTimeout())
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(String((e as Error)?.message ?? e), 0, 'UNKNOWN', e)
      lastErr = err
      if (attempt >= MAX_ATTEMPTS || !_isRetryableUploadError(err)) throw err
      // 超时 = 带宽不够，重试同样会超时。试 2 次就放弃，把时间还给用户。
      if (isUploadTimeout(err) && attempt >= MAX_TIMEOUT_ATTEMPTS) {
        logger.warn(`[upload-retry] ${url} 连续超时 ${attempt} 次，判定为上行带宽不足，停止重试`)
        throw err
      }
      // 2026-08-11：backoff 指数退避 500 / 1000 / 2000 / 3000 / 4000ms，5 次后固定 5000ms
      //   MAX_ATTEMPTS=10 时最坏累计退避 ≈ 500+1000+2000+3000+4000+5000×5 = 35.5s
      //   加上每次请求本身耗时，用户端总等待可能到 60-90s；对图片上传是可接受的（比彻底失败强）
      const backoff = Math.min(5000, 500 * Math.pow(2, Math.min(attempt - 1, 3)))
      logger.warn(`[upload-retry] POST ${url} attempt=${attempt}/${MAX_ATTEMPTS} 后退 ${backoff}ms`, {
        httpCode: err.httpCode, bizCode: err.bizCode, msg: err.message,
      })
      await _sleep(backoff)
    }
  }
  // 理论上不会到这里；for 循环里要么 return 要么 throw
  throw lastErr ?? new ApiError('上传失败', 0, 'UNKNOWN')
}
