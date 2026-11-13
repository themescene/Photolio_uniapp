/**
 * uniapp 录音 composable —— 移植自网页端
 * 参考：annualreport/src/composables/useRecorder.ts
 *
 * Web 用 MediaRecorder + AudioContext；这里走 `uni.getRecorderManager()`：
 * - 5 分钟最大录音
 * - 静音检测阈值 15s（说话之后再连续 15s 静音才停）
 *   uniapp recorderManager 没有内置 volume 回调，但其 onFrameRecorded 可拿 PCM frame，
 *   据此算 RMS。微信小程序基础库≥1.7 支持。
 * - 自动释放麦克风
 *
 * 公共 API（与网页端一致）：
 *   { isRecording, recordingTime, recordingCompleted, formatRecordingTime,
 *     startRecording, stopRecording }
 */
import { ref, onUnmounted } from 'vue'
import { logger } from '@/utils/logger'
// #ifdef H5
import { useBrowserRecorder } from './useBrowserRecorder'
// #endif

/**
 * 把 mp-weixin recorder 抛出的英文技术错误翻译为中文人话。
 * 2026-07-16 小程序审核驳回：toast 里 "errType:1, err:error PCM record callback"
 * 类原生英文 errMsg 直接透出会被判"英文出错"。
 *
 * 返回 { message, silent }：silent=true 表示这是 spurious 内部错误（如 PCM 帧回调
 * 底层异常），录音本体没受影响，静默日志即可，不要 toast 惊扰用户。
 */
function _translateRecorderError(errMsg: string): { message: string; silent: boolean } {
  const raw = String(errMsg || '')
  // 判定条件放宽：只要出现 PCM 相关字样就静默；用户实测所有 errType:1 都伴随 PCM callback
  if (/pcm/i.test(raw)) {
    return { message: '', silent: true }
  }
  if (/auth|scope\.record|permission/i.test(raw)) {
    return { message: '未授权使用麦克风，请在系统设置中允许后重试', silent: false }
  }
  if (/duration/i.test(raw)) {
    return { message: '录音时长过短', silent: false }
  }
  if (/format|encode/i.test(raw)) {
    return { message: '录音格式不支持，请重试', silent: false }
  }
  if (/cancel/i.test(raw)) {
    return { message: '', silent: true }
  }
  // 兜底：任何还带英文冒号或 "fail" 的技术性 errMsg 都统一"录音失败"，
  // 绝不把 raw 塞给用户看到（合规红线）
  if (/[a-zA-Z]{4,}/.test(raw)) {
    return { message: '录音失败，请重试', silent: false }
  }
  return { message: raw || '录音失败', silent: false }
}

interface UseRecorderOptions {
  /** 录音文件就绪（tempFilePath、duration、format） */
  onAudioReady: (file: { tempFilePath: string; duration: number; format: string }) => void
  onError?: (msg: string) => void
}

// ─────────────────────────────────────────────────────────────────
// 模块级单例：uni.getRecorderManager() 返回全局唯一管理器，handlers 一旦绑定
// 不会自动卸载；每次 useRecorder() 都重绑会导致多套 onStart/onStop 同时触发
// （表现为：用户来回切换页面后，录音 auto-stop toast 反复弹出）。
//
// 方案：handlers 模块级只绑一次，转发到"当前 active 实例"的回调。
let _globalRecorder: UniApp.RecorderManager | null = null
let _activeOwner: object | null = null
let _handlersBound = false
let _activeOnStart: (() => void) | null = null
let _activeOnStop: ((res: { tempFilePath?: string; duration?: number }) => void) | null = null
let _activeOnError: ((err: { errMsg?: string }) => void) | null = null
let _activeOnFrame: ((buf: ArrayBuffer) => void) | null = null

function _ensureGlobalRecorder(): UniApp.RecorderManager {
  if (_globalRecorder) return _globalRecorder
  const manager = uni.getRecorderManager()
  if (!manager) throw new Error('当前平台不支持原生录音')
  _globalRecorder = manager
  if (!_handlersBound) {
    _handlersBound = true
    _globalRecorder.onStart(() => {
      logger.info('[recorder-global] onStart 触发')
      _activeOnStart?.()
    })
    _globalRecorder.onStop((res) => {
      // 关键日志：微信平台回调里 tempFilePath / duration 到底是什么？
      // 用户投诉"已录 0s"——从这里能直接看到 res.duration 是不是就 0
      const r = res as { tempFilePath?: string; duration?: number; fileSize?: number }
      logger.info('[recorder-global] onStop 触发', {
        tempFilePath: r?.tempFilePath || '(空)',
        duration_ms: r?.duration,
        fileSize: r?.fileSize,
        rawKeys: res ? Object.keys(res as object) : [],
      })
      _activeOnStop?.(r)
    })
    _globalRecorder.onError((err) => {
      logger.warn('[recorder-global] onError 触发', err)
      _activeOnError?.(err)
    })
    // #ifdef MP-WEIXIN
    try {
      ;(_globalRecorder as unknown as { onFrameRecorded?: (cb: (r: { frameBuffer: ArrayBuffer }) => void) => void })
        .onFrameRecorded?.((res) => {
          // 全局包一层 try/catch —— 用户投诉 toast 里出现 "error PCM record callback" 英文
          // 就是这个回调抛异常被 wx 客户端捕获后包成 err 反弹给 onError。宁可静默丢帧
          // （最多丢失一次静音检测），也不能让英文 tech 报错走到 UI。
          try {
            const buf = (res as { frameBuffer?: ArrayBuffer }).frameBuffer
            if (buf) _activeOnFrame?.(buf)
          } catch (e) {
            logger.warn('[recorder-global] frame handler swallowed', e)
          }
        })
    } catch { /* 老基础库忽略 */ }
    // #endif
  }
  return _globalRecorder
}

export function useRecorder(options: UseRecorderOptions) {
  // #ifdef H5
  return useBrowserRecorder(options)
  // #endif
  // #ifndef H5
  const { onAudioReady, onError } = options
  const instanceOwner = {}
  const isRecording = ref(false)
  const recordingTime = ref(0)
  const recordingCompleted = ref(false)

  const MAX_RECORDING_SECONDS = 300
  const SILENCE_THRESHOLD = 0.05
  // 静音自动停止阈值：用户实机反馈 15s 太短（说话间隙正常停顿就触发），
  // 提到 30s 后大多数自然语速都能撑过去；并且只有 hasSpoken=true 之后才计算
  const SILENCE_WARN_SECONDS = 30
  // 头部宽限：刚开始录音的前 3s 不做静音检测——给麦克风启动 + 用户准备语料时间
  const HEAD_GRACE_SECONDS = 3
  // 自动停止后内部短暂"冷却"，防止 onStop 回调里又被新的事件触发
  let autoStopFired = false

  let timer: ReturnType<typeof setInterval> | null = null
  let silenceSeconds = 0
  let hasSpoken = false

  let stoppedByUs = false
  let lastFormat = 'mp3'

  const formatRecordingTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  // 把全局 handlers 转发给本实例的 closure（每次 startRecording 都覆盖一次，
  // 保证只有"最后那次开启的"useRecorder 实例响应事件）
  const _bindAsActive = () => {
    _activeOwner = instanceOwner
    _activeOnStart = () => {
      isRecording.value = true
      recordingTime.value = 0
      silenceSeconds = 0
      hasSpoken = false
      stoppedByUs = false
      autoStopFired = false
      timer = setInterval(_onTick, 1000)
    }
    _activeOnStop = (res) => {
      _cleanupTimer()
      isRecording.value = false
      recordingCompleted.value = true
      const tempFilePath = res?.tempFilePath || ''
      // recordingTime.value 是我们本地计时器每秒 ++ 的秒数（准确度取决于计时器）
      // res.duration 是平台返回的毫秒时长（有时因 mp3 header 问题返回 0）
      // 用 || 兜底：平台给 0 时用本地计时；再不行才是 0
      const platformMs = res?.duration ?? 0
      const localMs = recordingTime.value * 1000
      const chosenMs = platformMs > 0 ? platformMs : localMs
      const duration = Math.round(chosenMs / 1000)
      logger.info('[recorder] onStop 计算 duration', {
        platformMs,
        localMs,
        chosenMs,
        finalDuration_s: duration,
        recordingTime_s: recordingTime.value,
        stoppedByUs,
        hasFile: !!tempFilePath,
      })
      if (tempFilePath) {
        onAudioReady({ tempFilePath, duration, format: lastFormat })
      } else if (!stoppedByUs) {
        logger.warn('[recorder] tempFilePath 为空且非用户主动 stop —— 触发 onError')
        onError?.('录音文件丢失')
      }
    }
    _activeOnError = (err) => {
      const raw = err?.errMsg || ''
      const { message, silent } = _translateRecorderError(raw)
      logger.warn('[recorder] error', { raw, translated: message, silent })
      // PCM 帧回调类 spurious 错误：录音本体没受影响，isRecording 仍然 true 就不要复位。
      // 只有非 spurious（真失败）才复位 UI + 走 onError。
      if (silent) return
      _cleanupTimer()
      isRecording.value = false
      onError?.(message)
    }
    _activeOnFrame = (buf) => {
      // 头部宽限期内：不读 RMS（让麦克风采样稳定，避免硬件启动噪声被当成 "说话过"）
      if (recordingTime.value < HEAD_GRACE_SECONDS) return
      // try/catch 兜底：某些机型 frameBuffer 长度异常会让 DataView 抛异常，
      // 抛出后 wx 客户端会把它包成 "error PCM record callback" 反弹给我们
      try {
        const v = _computeRmsFromPcm(buf)
        if (v > SILENCE_THRESHOLD) {
          hasSpoken = true
          silenceSeconds = 0
        }
      } catch (e) {
        logger.warn('[recorder] frame RMS compute failed (ignored)', e)
      }
    }
  }

  const _cleanupTimer = () => {
    if (timer) { clearInterval(timer); timer = null }
  }

  const _onTick = () => {
    recordingTime.value++
    // 静音检测：说话过 + 连续 SILENCE_WARN_SECONDS 静音 → 自动停
    // autoStopFired 防止本次录音内重复 fire（曾有用户反馈 toast 反复弹出）
    if (hasSpoken && !autoStopFired) {
      silenceSeconds++
      if (silenceSeconds >= SILENCE_WARN_SECONDS) {
        autoStopFired = true
        stopRecording()
        onError?.('已检测到长时间静音，录音自动停止')
        return
      }
    }
    if (recordingTime.value >= MAX_RECORDING_SECONDS && !autoStopFired) {
      autoStopFired = true
      stopRecording()
      onError?.('已达到 5 分钟上限，录音自动停止')
    }
  }

  const startRecording = async () => {
    logger.info('[recorder] startRecording 被调用')
    recordingCompleted.value = false
    // 重置闭包内状态——避免上一次会话残留的 hasSpoken/silenceSeconds 立刻触发静音停
    silenceSeconds = 0
    hasSpoken = false
    autoStopFired = false
    _cleanupTimer()

    // 先做权限预检：直接 r.start() 在某些机型 / 首次授权场景下会陷入"麦克风指示灯亮但
    // onStart 不触发"的状态，导致系统认为录音中、UI 却没进入 isRecording 状态。
    // uni.authorize 走完后，用户看到的系统弹窗 + 用户决定都正确联动。
    // #ifdef MP-WEIXIN
    try {
      const hasAuth = await _ensureRecordAuth()
      if (!hasAuth) {
        onError?.('未授权使用麦克风')
        return
      }
    } catch (e) {
      logger.warn('[recorder] authorize failed', e)
      onError?.('未授权使用麦克风')
      return
    }
    // #endif

    let r: UniApp.RecorderManager
    try { r = _ensureGlobalRecorder(); _bindAsActive() }
    catch (error) { logger.warn('[recorder] unavailable', error); onError?.('当前平台不支持原生录音'); return }
    // 兜底：如果之前有遗留录音状态没清完（极少见，但解释了用户实测的"麦克风一直亮"现象），
    // 在 start 之前先发一次 stop，让平台释放上一次的资源
    if (isRecording.value) {
      try { r.stop() } catch { /* ignore */ }
      isRecording.value = false
    }

    // 微信支持 mp3 / aac；H5 走 webm（uni 内部处理）
    // hotfix6：encodeBitRate 从 48000 提到 96000。
    // 用户投诉 "backend 说录音 0.0 秒" 根因：mp-weixin 用 48kbps mp3 编码时
    // Xing/Info 头写入不完整，服务端 `mutagen.mp3.MP3.info.length` 返回 0 →
    // audio_duration=0 → 后端 `<3` 校验 400。96kbps 是 mp3 兼容性下限
    const opts: UniApp.RecorderManagerStartOptions = {
      duration: MAX_RECORDING_SECONDS * 1000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 96000,
      format: 'mp3',
      frameSize: 50,    // 50KB 一帧 → 触发 onFrameRecorded
    }
    lastFormat = opts.format || 'mp3'
    logger.info('[recorder] 调用 r.start(opts)', opts)
    try {
      r.start(opts)
    } catch (e) {
      logger.error('[recorder] start exception', e)
      onError?.('启动录音失败')
    }
  }

  const stopRecording = () => {
    logger.info('[recorder] stopRecording 被调用', {
      isRecording: isRecording.value,
      recordingTime_s: recordingTime.value,
    })
    stoppedByUs = true
    try { _globalRecorder?.stop() } catch (e) { logger.warn('[recorder] stop() 抛异常', e) }
    _cleanupTimer()
  }

  // #ifdef MP-WEIXIN
  const _ensureRecordAuth = (): Promise<boolean> => {
    return new Promise((resolve) => {
      uni.getSetting({
        success: (s) => {
          const scope = (s.authSetting || {}) as unknown as Record<string, boolean | undefined>
          if (scope['scope.record'] === true) return resolve(true)
          // 用户曾经拒绝过 → 引导到 settings 重新授权
          if (scope['scope.record'] === false) {
            uni.showModal({
              title: '需要麦克风权限',
              content: '请在右上角...菜单 → 设置中允许使用麦克风，再回来录音',
              confirmText: '去设置',
              success: (r) => {
                if (r.confirm) {
                  uni.openSetting({
                    success: (o) => {
                      const set = (o.authSetting || {}) as unknown as Record<string, boolean | undefined>
                      resolve(!!set['scope.record'])
                    },
                    fail: () => resolve(false),
                  })
                } else resolve(false)
              },
            })
            return
          }
          // 从未问过 → 主动 authorize 弹一次
          uni.authorize({
            scope: 'scope.record',
            success: () => resolve(true),
            fail: () => resolve(false),
          })
        },
        fail: () => resolve(false),
      })
    })
  }
  // #endif

  onUnmounted(() => {
    if (_activeOwner === instanceOwner) {
      _activeOnStart = null; _activeOnStop = null; _activeOnError = null; _activeOnFrame = null; _activeOwner = null
      if (isRecording.value) { try { _globalRecorder?.stop() } catch { /* already stopped */ } }
    }
    _cleanupTimer()
  })

  return {
    isRecording,
    recordingTime,
    recordingCompleted,
    formatRecordingTime,
    startRecording,
    stopRecording,
  }
  // #endif
}

// 16-bit PCM little-endian RMS（≈uniapp frame buffer 格式）
function _computeRmsFromPcm(buf: ArrayBuffer): number {
  const view = new DataView(buf)
  const sampleCount = Math.floor(buf.byteLength / 2)
  if (sampleCount === 0) return 0
  let sum = 0
  // 抽样：每 4 个 sample 取 1 个，省 CPU
  const step = 4
  let count = 0
  for (let i = 0; i < sampleCount; i += step) {
    const s = view.getInt16(i * 2, true) / 32768
    sum += s * s
    count++
  }
  const rms = Math.sqrt(sum / count)
  return rms
}
