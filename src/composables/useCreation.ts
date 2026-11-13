/**
 * 创作流程状态机 —— Phase 3 非阻塞重构。
 *
 * 参考：annualreport/src/views/UploadView.vue 的 HOME / UPLOAD / COMPOSE 三态机
 *      + 后台静默上传/分析（_uploadAdditionalMedia + imageAnalysis）
 *
 * 关键变化：
 *   - 用户选完图，立刻进入 COMPOSE 步骤；图片上传 + 分析在后台并行偷跑
 *   - 用户编辑文字 / 录音时不阻塞
 *   - 点击「生成」时，若上传/分析未完成 → 显示"分析中…"，等待完成
 *   - 分析失败时让用户决定是否继续（用图片 URL 但 visual_tags 留空）
 *
 * 公共 API：
 *   - phase: 'idle' | 'uploading' (在后台) | 'analyzing' | 'generating' | 'saving' | 'done' | 'error'
 *   - analyzeReady: 计算所有图片上传 + 第一张分析完成
 *   - prepareImages(localPaths)：开始后台上传（立即返回）
 *   - generate(opts)：触发 generate + save（等 analyze 完）
 *   - clear()：清空所有
 */
import { ref, computed } from 'vue'
import * as roundApi from '@/api/round'
// 2026-08-11 二次修：mp-weixin 极端场景下 `shareApi.uploadShareVideo` 在 async 函数里
// 读取时 shareApi 是 undefined（app-service.js:10800 di.attached e.split 之后模块引用错乱）。
// 用 named-import + module-top 局部常量捕获函数引用，切断 async 内对 shareApi.xxx 的访问路径。
import { uploadShareVideo as _uploadShareVideoImport, pollVideoStatus as _pollVideoStatusImport } from '@/api/share'
const _uploadShareVideoRef = _uploadShareVideoImport
const _pollVideoStatusRef = _pollVideoStatusImport
import { ApiError } from '@/api/request'
import { logger } from '@/utils/logger'
// 2026-07-14：mp-weixin **不支持动态 import()**（返回同步值，`.then` 报错），
// 必须用静态 import。前一轮引入本地缓存时用了 `import("@/utils/mediaCache").then(...)`，
// 直接把整个相册模式的上传流程弄挂 —— 用户实测「_runOnePrepare 失败」
import * as mediaCache from '@/utils/mediaCache'
import { compressVideoIfPossible } from '@/utils/media'
import { STORAGE_KEYS } from '@/config/env'

/** 判断当前是否有 token——不引入 pinia 依赖，避免 composable 反向耦合 */
function _hasToken(): boolean {
  try { return !!uni.getStorageSync(STORAGE_KEYS.TOKEN) } catch { return false }
}
import type {
  AnalyzeImageResult,
  AnnualReport,
  ReportRequestRound,
  SavedShare,
  StyleKey,
  TemplateType,
} from '@/types'

export type CreationPhase =
  | 'idle'
  | 'uploading'
  | 'analyzing'
  | 'generating'
  | 'saving'
  | 'done'
  | 'error'

interface PreparedImage {
  localPath: string
  imageUrl: string          // 后端返回 URL（上传完成后填）
  thumbnailUrl: string
  visualTags: string[]
  ocrText: string
  // 2026-07-13：相册模式列表视图展示所需元信息（backend upload-image 返回）
  originalFilename?: string
  sizeBytes?: number
  takenAt?: string
  hasGps?: boolean
  cameraModel?: string
  // 2026-07-15：来自 MediaPicker 的真名（chooseMessageFile 才有）；上传时透传给 backend
  originalFilenameOverride?: string
  // 上传 / 分析进度
  uploadDone: boolean
  analyzeDone: boolean
  failed?: boolean
  errorMsg?: string
}

export interface GenerateOptions {
  text: string                  // 用户输入文字 / ASR 转写
  /** 2026-08-08 hotfix14：用户在新建流程填的【标题】（选填），落到 episodes[0].copywriting.h1
   *  留空则 generate 里用当天日期 "YYYY-MM-DD" 兜底。
   *  合集名称由 backend group_service fallback 到"第一个章节的 h1"（现有逻辑），此改动无需动 backend。 */
  title?: string
  audioUrl?: string             // 录音上传后的 URL（process-round 已写入）
  audioDuration?: number
  style?: StyleKey | null    // null = 原文（不加文风修饰），等价于网页端 selectedStyle=null
  preferredTemplate?: TemplateType
  groupId?: string | null
  autoPlayAudio?: boolean
  personalPinned?: boolean
  originalQuality?: boolean
  authorDisplayName?: string
  /** 2026-07-13：'memory' 或 'album' 相册模式；相册模式跳过 generate-report 直接存 media */
  shareType?: 'memory' | 'album'
  /** 2026-07-13：visibility 0-3 */
  visibility?: 0 | 1 | 2 | 3
  /** 2026-07-13：access_level 0-2 */
  accessLevel?: 0 | 1 | 2
}

/** 视频条目（在 generate 之后注入到 episode.images） */
export interface PreparedVideo {
  localPath: string
  /** wx.chooseMedia 提供的本地视频封面帧（thumbTempFilePath）。
   *  当后端转码没能产出 thumbnail_url（ffmpeg 失败 / 未装）时，前端 fallback
   *  上传这张本地封面作为缩略图 —— 保证「仅视频回忆」也一定有封面
   *  重要：这张图**只用作 cover + AI 识别输入**，不会作为独立 image 塞进 episode.images
   *  或编辑页 media pool，避免出现"一个视频显示两次"或者被误当成图片浏览的历史 bug。 */
  localThumbPath?: string
  videoUrl: string
  thumbnailUrl?: string
  uploadDone: boolean
  uploadProgress: number      // 0..100
  transcoding: boolean        // 上传完进入转码轮询
  failed?: boolean
  errorMsg?: string
  jobId?: string
  // 对齐网页端：转码完成后异步调 /analyze-image-url 拿缩略图的视觉分析
  // 喂给 generate-report 当 round.images 项，让 AI 真的"看"到视频
  analyzing?: boolean
  analyzeDone?: boolean
  visualTags: string[]
  ocrText: string
  // 2026-07-13：相册模式 list 视图元信息
  originalFilename?: string
  sizeBytes?: number
  takenAt?: string
}

export function useCreation() {
  const phase = ref<CreationPhase>('idle')
  const errorMessage = ref('')
  const stageMessage = ref('')
  const savedShare = ref<SavedShare | null>(null)
  const sessionId = ref('')

  const prepared = ref<PreparedImage[]>([])
  const videos = ref<PreparedVideo[]>([])

  // —— 派生状态 ——
  const uploadProgress = computed(() => {
    if (!prepared.value.length) return 0
    const done = prepared.value.filter((p) => p.uploadDone).length
    return Math.round((done / prepared.value.length) * 100)
  })
  // 2026-08-09：failed 也算"终态"，否则一张图上传失败就永远卡在"整理中"，
  // 用户只能手动删掉那张才能保存。现在允许带着成功那些走完整流程。
  const allUploaded = computed(() => prepared.value.length > 0 && prepared.value.every((p) => p.uploadDone || p.failed))
  const firstAnalyzed = computed(() => !!(prepared.value[0]?.analyzeDone || prepared.value[0]?.failed))
  const analyzeReady = computed(() => allUploaded.value && firstAnalyzed.value)
  const hasError = computed(() => prepared.value.some((p) => p.failed))

  function clear() {
    phase.value = 'idle'
    errorMessage.value = ''
    stageMessage.value = ''
    savedShare.value = null
    sessionId.value = ''
    prepared.value = []
    videos.value = []
  }

  /** 仅清掉 error 态 + 错误信息，保留用户已选 images / videos / text / audio
   *  用户实测痛点：error 弹窗点「取消」连内容一起清掉。dismiss = "我先关掉这个弹窗，
   *  内容留着" 的语义。 */
  function dismissError() {
    if (phase.value === 'error') {
      phase.value = 'idle'
      errorMessage.value = ''
      stageMessage.value = ''
    }
  }

  /** 在 COMPOSE 阶段追加一张图片（背景上传 + 分析；不影响 UI） */
  function addImage(localPath: string) {
    if (!sessionId.value) sessionId.value = roundApi.newSessionId()
    const item: PreparedImage = {
      localPath,
      imageUrl: '',
      thumbnailUrl: '',
      visualTags: [],
      ocrText: '',
      uploadDone: false,
      analyzeDone: false,
    }
    prepared.value.push(item)
    const idx = prepared.value.length - 1
    if (!_hasToken()) {
      // 未登录就先不发起网络——保留本地选图，登录后再 resume
      // 否则后端 401 + toast 刷屏，每张图都显示「失败」，体验崩溃
      logger.info('[useCreation] addImage 未登录跳过上传，仅本地缓存', { idx, localPath })
      return
    }
    logger.info('[useCreation] addImage 开始上传 + 分析', { idx, localPath })
    // 关键：从 ref 数组里再读一次拿到 reactive proxy；直接用本地 raw item 改属性
    // 不会触发模板更新，UI 会卡在「上传中」永远不动
    _runOnePrepare(prepared.value[idx], idx)
  }

  /** 在 COMPOSE 阶段移除一张图片（仅本地状态，不通知后端） */
  function removeImage(idx: number) {
    if (idx < 0 || idx >= prepared.value.length) return
    prepared.value.splice(idx, 1)
  }

  /**
   * 追加视频 —— 本地压缩 → 上传 → 转码轮询。
   * 全程后台跑，不阻塞 UI；generate() 时会等所有视频转完。
   */
  // 原图模式作为模块级状态，addVideo 时读一次即锁定；后续 _runOneVideo 都按这个 flag 走
  // （在 CreationFlow 里由 settings panel 的 originalQuality 决定，通过 setOriginalQuality 注入）
  let _originalQuality = false
  function setOriginalQuality(v: boolean) { _originalQuality = v }

  function addVideo(localPath: string, localThumbPath?: string) {
    if (!sessionId.value) sessionId.value = roundApi.newSessionId()
    const v: PreparedVideo = {
      localPath,
      localThumbPath,
      videoUrl: '',
      uploadDone: false,
      uploadProgress: 0,
      transcoding: false,
      visualTags: [],
      ocrText: '',
    }
    videos.value.push(v)
    if (!_hasToken()) {
      logger.info('[useCreation] addVideo 未登录跳过上传，仅本地缓存', { localPath })
      return
    }
    logger.info('[useCreation] addVideo 开始压缩 + 上传 + 转码', {
      localPath, originalQuality: _originalQuality,
    })
    // 用 ref 数组的 reactive proxy 而不是原生 raw 对象——后者 set 不会触发模板更新
    // 之前用户实机看到的「上传 0%」永远不动就是这个 bug
    _runOneVideo(videos.value[videos.value.length - 1])
  }

  function removeVideo(idx: number) {
    if (idx < 0 || idx >= videos.value.length) return
    videos.value.splice(idx, 1)
  }

  async function _runOneVideo(item: PreparedVideo) {
    // 0️⃣ 立刻把本地封面帧（wx.chooseMedia 的 thumbTempFilePath）异步上传
    //    独立于视频转码链路 —— 无论后端 ffmpeg 是否成功都能拿到 cover
    //    这是"仅视频匣子无预览图" 5 遍修不好 bug 的终极兜底
    let localThumbUploadedUrl = ''
    let localThumbPromise: Promise<void> | null = null
    if (item.localThumbPath) {
      localThumbPromise = roundApi.uploadImage(item.localThumbPath, sessionId.value)
        .then((r) => {
          localThumbUploadedUrl = r.image_url || ''
          if (!item.thumbnailUrl && localThumbUploadedUrl) {
            item.thumbnailUrl = localThumbUploadedUrl
          }
        })
        .catch((e) => { logger.warn('[useCreation] local thumb upload failed', e) })
    }
    try {
      // 1️⃣ 本地压（mp-weixin 硬件 H.264）
      //    - 原图模式：完全跳过客户端压缩（backend 若 h264/mp4 直接 rename；h264/其它容器 -c copy remux）
      //    - 非原图模式：high 档 + 1080p + 6Mbps（对齐 YouTube 1080p30 常见 4-6M / Netflix 5M 参考）
      //      backend 的 `_should_skip_transcode` 阈值 8Mbps，6M 客户端产物会直接 skip transcoding
      const compressed = _originalQuality
        ? item.localPath
        : await compressVideoIfPossible(item.localPath, {
            quality: 'high',
            resolution: 1080,
            bitrate: 6000,
            fps: 30,
          })
      // 2️⃣ 上传到 VIDEO_UPLOAD_BASE；原图模式带 original_quality 标记让后端跳过重编码
      // 2026-08-11 二次修：走 module-top 捕获的函数引用（_uploadShareVideoRef），
      //   避免 async 函数运行时读取 shareApi.xxx 时因 mp-weixin 内部模块引用错乱得到 undefined
      if (typeof _uploadShareVideoRef !== 'function') {
        throw new Error('上传模块初始化异常，请重启微信开发者工具')
      }
      const up = await _uploadShareVideoRef(
        compressed,
        sessionId.value,
        (p) => { item.uploadProgress = p },
        _originalQuality,
      )
      item.uploadDone = true
      item.transcoding = true
      item.jobId = up.job_id
      // 3️⃣ 退避轮询转码（10 分钟封顶，连续 5 次网络失败放弃）
      let delay = 3000
      const MAX_DELAY = 8000
      let consecutiveFail = 0
      const deadline = Date.now() + 10 * 60 * 1000
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, delay))
        try {
          const s = await _pollVideoStatusRef(up.job_id)
          consecutiveFail = 0
          if (s.status === 'done' && s.video_url) {
            item.videoUrl = s.video_url
            // 2026-07-13：相册模式 list 视图元信息
            item.originalFilename = s.original_filename
            item.sizeBytes = s.size_bytes
            item.takenAt = s.taken_at || undefined
            // 2026-07-13：本地缓存 —— 视频文件本身可能很大，saveFile 是否成功交给 uni.saveFile 自己判定
            void mediaCache.saveAfterUpload(s.video_url as string, item.localPath)
            // 后端 ffmpeg 提帧成功 → 优先用（画质通常更好，主视频区中间时刻）
            // 失败 → 等本地帧上传结束再兜底
            if (s.thumbnail_url) {
              item.thumbnailUrl = s.thumbnail_url
            } else {
              if (localThumbPromise) await localThumbPromise.catch(() => { /* ignore */ })
              if (!item.thumbnailUrl && localThumbUploadedUrl) {
                item.thumbnailUrl = localThumbUploadedUrl
              }
            }
            item.transcoding = false
            // 对齐网页端 MediaAiPanel：转码完成立刻发 /analyze-image-url 分析缩略图
            // 拿到 visual_tags 喂 generate-report；失败静默（视频本身能用就行）
            if (item.thumbnailUrl) {
              item.analyzing = true
              roundApi.analyzeImageUrl(item.thumbnailUrl)
                .then((r) => {
                  item.visualTags = r.visual_tags || []
                  item.ocrText = r.ocr_text || ''
                  item.analyzeDone = true
                })
                .catch((e) => {
                  logger.warn('[useCreation] analyze video thumbnail failed', e)
                  item.analyzeDone = true   // 失败也算"完成"，避免 generate 永远等
                })
                .finally(() => { item.analyzing = false })
            } else {
              item.analyzeDone = true       // 没有缩略图就跳过
            }
            return
          }
          if (s.status === 'error') {
            throw new Error(s.message || '转码失败')
          }
        } catch (e) {
          if (e instanceof Error && e.message.includes('转码失败')) throw e
          consecutiveFail++
          if (consecutiveFail >= 5) throw new Error('网络持续失败')
        }
        delay = Math.min(MAX_DELAY, Math.round(delay * 1.5))
      }
      throw new Error('转码超时')
    } catch (e) {
      item.failed = true
      item.transcoding = false
      const raw = e instanceof Error ? e.message : '视频处理失败'
      // 「url not in domain」是微信域名白名单未配置的标准信号，给一个可操作的提示
      if (/not in domain/i.test(raw)) {
        item.errorMsg = '视频上传域名未加白名单'
        logger.warn('[useCreation] video upload domain not whitelisted', e)
        uni.showModal({
          title: '视频上传域名未加白名单',
          content: '开发期：开发者工具 → 详情 → 本地设置 → 勾选「不校验合法域名」。正式版：小程序后台 → 开发管理 → 服务器域名 → uploadFile 合法域名加 upload.hxiazi.com',
          showCancel: false,
        })
      } else {
        item.errorMsg = raw
        logger.warn('[useCreation] video prepare failed', e)
        // 2026-07-25 hotfix12h：视频内容违规 backend 直接把"您上传的视频含违规信息"塞进 message
        const isViolation = /违规|安全/i.test(raw)
        uni.showToast({
          title: isViolation ? raw : `视频失败：${raw}`,
          icon: 'none', duration: 3500,
        })
      }
    }
  }

  // 衍生：所有视频是否都上传 + 转码 OK（缩略图分析失败不阻塞，generate 也能继续）
  const allVideosReady = computed(() =>
    videos.value.every((v) => v.uploadDone && !v.transcoding && !v.failed)
  )
  // 缩略图分析是 generate 时的「加分项」；如果还没分析完，可短暂等一下，但不强制
  const allVideosAnalyzed = computed(() =>
    videos.value.every((v) => v.failed || v.analyzeDone)
  )

  /**
   * 进入 COMPOSE 阶段同时：在后台并行启动每张图片的上传 / 分析。
   * 不阻塞 UI；用户可继续写文字 / 录音。
   */
  /**
   * 开启后台上传。
   * @param localPaths 从 MediaPicker 拿到的 tempFilePath 列表
   * @param nameMap 可选：tempFilePath → 用户可读真名（chooseMessageFile 场景），
   *   会在 upload-image 时作为 formData.original_filename 传给后端，
   *   最终写进 episode.images[i].original_filename 供 album 列表视图展示
   */
  function prepareImages(localPaths: string[], nameMap?: Record<string, string>) {
    if (!localPaths.length) return
    sessionId.value = roundApi.newSessionId()
    prepared.value = localPaths.map((p) => ({
      localPath: p,
      imageUrl: '',
      thumbnailUrl: '',
      visualTags: [],
      ocrText: '',
      // 2026-07-15：透传 chooseMessageFile 拿到的真名
      originalFilenameOverride: nameMap?.[p] || undefined,
      uploadDone: false,
      analyzeDone: false,
    }))
    if (!_hasToken()) {
      // 未登录态先不发起 analyze / upload —— 用户可以继续看图、写文字、录音
      // 登录后由 resumePending() 一次性把没传的传完
      logger.info('[useCreation] prepareImages 未登录，仅本地缓存', {
        count: localPaths.length,
        sessionId: sessionId.value,
      })
      return
    }
    logger.info('[useCreation] prepareImages 开始上传（并发上限 3）', {
      count: localPaths.length,
      sessionId: sessionId.value,
    })
    phase.value = 'uploading'

    // 2026-07-15 用户实测：14 张原图并发全部 fire → 服务器 ECONNRESET 一半、剩下的每张 5-7 分钟
    // 根因：mp-weixin uploadFile 并发写 + 每张 5MB body 一起塞爆 backend gunicorn worker 池
    // 修：并发上限 3，其它排队；每次一个 worker done 立刻拉下一个 —— 端到端稳，backend 也扛得住
    // 2026-09-14 用户契约变更：**默认不识图**。
    //
    // 证据（用户实测日志）：memory 模式选 1 张图，
    //   `_runOnePrepare#0 开始 { mode: "analyze-image" }`
    //   → `analyzeImage 超时 12000ms → 兜底 upload-image`
    //   → `_runOnePrepare#0 完成 { elapsedMs: 117704 }`
    // 白等 12s 超时之后还要重传一次原图，端到端快 2 分钟，而 visual_tags 最终还是没拿到。
    //
    // 用户原话：「相册模式应该不用识图啊。另外修改一下，画匣子模式也默认不识图，
    //            也不 AI 给回忆起名，除非用户切换了文风才识图」。
    // 所以这里一律 skipAnalyze —— 真要识图由 analyzeFirstImage() 在用户选文风时按需触发。
    // 2026-09-14：**原图模式并发降到 1**。
    //
    // 并发只在带宽充裕时有用。实测用户上行只有 126KB/s，5 张 6.7MB 原图并发 3 →
    // 每条分到约 42KB/s → 单张需要 160s → 全部超时 → 再各重试 10 次 → 卡 20 分钟。
    // 串行反而更快：每条独享全部带宽，55s 一张，5 张约 4.5 分钟且**每张都会成功**，
    // 而且用户能看到一张张变绿，不是 5 张一起卡死。
    // 非原图模式图已压到几百 KB，并发 3 仍然划算。
    const concurrency = _originalQuality ? 1 : 3
    logger.info('[useCreation] prepareImages 并发策略', {
      count: prepared.value.length, concurrency, originalQuality: _originalQuality,
    })
    void _runQueue(
      prepared.value.map((_, i) => i), concurrency,
      (i) => _runOnePrepare(prepared.value[i], i, /* skipAnalyze */ true),
    )
  }

  /**
   * 用户切换了文风时按需补一次首图识图（2026-09-14 新增）。
   *
   * 契约：默认不识图；只有用户主动选了文风，AI 才需要图片的视觉标签来写文案。
   * 非阻塞 —— 失败或超时都只是少了 visual_tags，不影响保存。
   * 已经分析过就不重复跑。
   */
  async function analyzeFirstImage(): Promise<void> {
    const item = prepared.value[0]
    if (!item || item.analyzeDone || item.failed) return
    // 走 /analyze-image-url 分析**已上传的 URL**，而不是重跑 _runOnePrepare ——
    // 后者会把原图再传一遍（原图模式下可能是 20MB），白白多一轮上传。
    if (!item.imageUrl) {
      logger.info('[useCreation] 按需识图：图还没传完，跳过（保存不依赖它）')
      return
    }
    logger.info('[useCreation] 用户选了文风 → 对已上传 URL 按需识图', { url: item.imageUrl })
    try {
      const r = await roundApi.analyzeImageUrl(item.imageUrl)
      const proxy = prepared.value[0]
      if (proxy) {
        proxy.visualTags = r?.visual_tags || proxy.visualTags
        proxy.ocrText = r?.ocr_text || proxy.ocrText
        proxy.analyzeDone = true
      }
      logger.info('[useCreation] 按需识图完成', { tags: r?.visual_tags?.length || 0 })
    } catch (e) {
      logger.warn('[useCreation] 按需识图失败（不阻塞保存）', e)
    }
  }

  /** 通用并发队列：max 个 worker 同时跑；worker 领任务 idx → 执行 fn(idx) → 领下一个 */
  async function _runQueue<T>(tasks: T[], concurrency: number, fn: (t: T) => Promise<void>) {
    const queue = [...tasks]
    const workers = new Array(Math.min(concurrency, queue.length)).fill(0).map(async () => {
      while (queue.length > 0) {
        const t = queue.shift()
        if (t === undefined) break
        try { await fn(t) } catch { /* fn 内部已 log；不阻塞其它 worker */ }
      }
    })
    await Promise.all(workers)
  }

  /** 用户登录后调用：把所有还没传 / 还没分析的 item 后台开跑。
   *  和 prepareImages 不同——此场景跳过 analyze-image（不识图），只走 upload-image。
   *  原因：用户已经在 COMPOSE 步骤等过一次（未登录被拦），再花 5-15s 做 AI 视觉分析
   *  体验差；直接上传拿 URL 给 generate-report 即可，AI 仅基于文字 + URL 编故事。
   *  用户原话：「不登陆就纯传图片传文字音频，直接不识图」。 */
  function resumePending() {
    if (!_hasToken()) {
      logger.warn('[useCreation] resumePending 调用时 token 仍为空，跳过')
      return
    }
    const pendingImages = prepared.value.filter((p) => !p.uploadDone && !p.failed).length
    const pendingVideos = videos.value.filter((v) => !v.uploadDone && !v.failed && !v.transcoding).length
    logger.info('[useCreation] resumePending 启动', {
      sessionId: sessionId.value,
      pendingImages,
      pendingVideos,
      totalImages: prepared.value.length,
      totalVideos: videos.value.length,
    })
    let started = false
    // 2026-07-15：resumePending 也走并发上限 3；不然登录回来后一次 14 张同样炸服务器
    const pendingIdxs: number[] = []
    prepared.value.forEach((item, idx) => {
      if (!item.uploadDone && !item.failed) {
        pendingIdxs.push(idx)
        if (!sessionId.value) sessionId.value = roundApi.newSessionId()
        if (!started) { phase.value = 'uploading'; started = true }
      }
    })
    if (pendingIdxs.length) {
      void _runQueue(
        pendingIdxs, _originalQuality ? 1 : 3,
        (i) => _runOnePrepare(prepared.value[i], i, /* skipAnalyze */ true),
      )
    }
    videos.value.forEach((v, idx) => {
      if (!v.uploadDone && !v.failed && !v.transcoding) {
        if (!sessionId.value) sessionId.value = roundApi.newSessionId()
        _runOneVideo(videos.value[idx])
      }
    })
  }

  async function _runOnePrepare(item: PreparedImage, idx: number, skipAnalyze = false) {
    const t0 = Date.now()
    const mode = idx === 0 && !skipAnalyze ? 'analyze-image' : 'upload-image'
    logger.info(`[useCreation] _runOnePrepare#${idx} 开始`, { mode, localPath: item.localPath })
    try {
      // 关键加速：先 uni.compressImage 压到 ~500KB 再上传
      // 对齐网页端 compressImageForUpload 的做法，让 AI 分析后端处理时间从 ~15s 降到 ~5s
      // 2026-07-13：原图模式（含相册模式）跳过前端压缩，让 EXIF / 分辨率原样保留
      const compressedPath = _originalQuality
        ? item.localPath
        : /\.gif(?:[?#]|$)/i.test(item.originalFilenameOverride || item.localPath) ? item.localPath : await _compressIfPossible(item.localPath)
      if (idx === 0 && !skipAnalyze) {
        // 首图理想路径：analyze-image 一次拿到 url + visual_tags + ocr_text
        // 2026-08-10：analyze 走 Vision LLM 会慢（偶发 10-20s 甚至更长）。
        //   现在给它 12s race timeout —— 超时立刻改走 upload-image 兜底，只丢 visual_tags/ocr_text，
        //   不阻塞用户保存流程。noRetry=true 避免 3 次重试把总耗时放大到 36s+。
        logger.info('[useCreation] analyzeImage 开始（12s 超时兜底 upload-image）', {
          idx, originalQuality: _originalQuality,
          localPath: item.localPath,
          compressedPath,
          usingRaw: _originalQuality,
        })
        const ANALYZE_TIMEOUT_MS = 12_000
        let analyzeResult: AnalyzeImageResult | null = null
        try {
          analyzeResult = await Promise.race([
            _uploadWithFallback(
              (p) => roundApi.analyzeImage(
                p, sessionId.value, undefined, _originalQuality,
                item.originalFilenameOverride,
                /* noRetry */ true,
              ),
              compressedPath, item.localPath,
            ),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('ANALYZE_TIMEOUT')), ANALYZE_TIMEOUT_MS),
            ),
          ])
        } catch (e) {
          const isTimeout = e instanceof Error && e.message === 'ANALYZE_TIMEOUT'
          if (!isTimeout) throw e
          logger.warn(`[useCreation] analyzeImage 超时 ${ANALYZE_TIMEOUT_MS}ms → 兜底 upload-image`)
        }
        if (analyzeResult) {
          item.imageUrl = analyzeResult.image_url
          item.thumbnailUrl = analyzeResult.thumbnail_url || analyzeResult.image_url
          item.visualTags = analyzeResult.visual_tags || []
          item.ocrText = analyzeResult.ocr_text || ''
          item.originalFilename = analyzeResult.original_filename
          item.sizeBytes = analyzeResult.size_bytes
          item.takenAt = analyzeResult.taken_at
          item.hasGps = analyzeResult.has_gps
          item.cameraModel = analyzeResult.camera_model
        } else {
          // 兜底路径：普通 upload-image，无 visual_tags / ocr_text（generate-report 依然工作）
          const uploadResult = await _uploadWithFallback(
            (p) => roundApi.uploadImage(
              p, sessionId.value, undefined, _originalQuality,
              item.originalFilenameOverride,
            ),
            compressedPath, item.localPath,
          )
          item.imageUrl = uploadResult.image_url
          item.thumbnailUrl = uploadResult.thumbnail_url || uploadResult.image_url
          item.visualTags = []
          item.ocrText = ''
          item.originalFilename = uploadResult.original_filename
          item.sizeBytes = uploadResult.size_bytes
          item.takenAt = uploadResult.taken_at
          item.hasGps = uploadResult.has_gps
          item.cameraModel = uploadResult.camera_model
        }
        item.uploadDone = true
        item.analyzeDone = true
        void mediaCache.saveAfterUpload(item.imageUrl, item.localPath)
      } else {
        // 原图模式带 originalQuality=true → uploadImage 拼上 ?original=true
        logger.info('[useCreation] uploadImage', {
          idx, originalQuality: _originalQuality,
          localPath: item.localPath,
          compressedPath,
          usingRaw: _originalQuality,
        })
        const r = await _uploadWithFallback(
          (p) => roundApi.uploadImage(
            p, sessionId.value, undefined, _originalQuality,
            item.originalFilenameOverride,
          ),
          compressedPath, item.localPath,
        )
        item.imageUrl = r.image_url
        item.thumbnailUrl = r.thumbnail_url || r.image_url
        // 2026-07-13：相册模式列表视图用的元信息（backend upload-image 返回）
        item.originalFilename = r.original_filename
        item.sizeBytes = r.size_bytes
        item.takenAt = r.taken_at
        item.hasGps = r.has_gps
        item.cameraModel = r.camera_model
        item.uploadDone = true
        item.analyzeDone = true
        // 2026-07-13：把本地 tempFilePath 存进 uni.saveFile，下次查看相册直接用本地路径
        // 用户明确要求：本机上传过的图片/视频不再走 CDN 下载
        // 用 item.localPath（原始 tempFilePath）而非 compressedPath —— 用户看的是原图，不是压缩过的
        void mediaCache.saveAfterUpload(item.imageUrl, item.localPath)
      }
      logger.info(`[useCreation] _runOnePrepare#${idx} 完成`, {
        mode,
        elapsedMs: Date.now() - t0,
        imageUrl: item.imageUrl,
      })
    } catch (e) {
      item.failed = true
      item.errorMsg = e instanceof ApiError ? e.message : (e instanceof Error ? e.message : '上传失败')
      logger.warn(`[useCreation] _runOnePrepare#${idx} 失败`, {
        mode,
        elapsedMs: Date.now() - t0,
        err: item.errorMsg,
      })
      // 2026-07-25 hotfix12h：内容违规错误消息已经是完整中文（backend 返 "您上传的图片含违规信息..."），
      // 不再叠加"第 N 张图上传失败：" 前缀避免超长；其它类型错误保持原格式
      const isViolation = /违规|安全/i.test(item.errorMsg || '')
      // 2026-09-14：超时要给**能行动的**中文提示，不能只甩 "uploadFile:fail timeout"（违反 R8）。
      // 实测这类失败的真实原因是上行带宽不够（用户侧实测 126KB/s，一张 6.7MB 原图要 55s），
      // 告诉用户关掉原图 / 少选几张，比让他干等重试有用得多。
      const isTimeout = /timeout|超时/i.test(item.errorMsg || '')
      const toastTitle = isViolation
        ? item.errorMsg
        : isTimeout
          ? `第 ${idx + 1} 张图上传超时：当前网络上行较慢。可在「设置」里关掉原图模式，或减少一次选的张数`
          : `第 ${idx + 1} 张图上传失败：${item.errorMsg}`
      uni.showToast({ title: toastTitle, icon: 'none', duration: isTimeout ? 5000 : 3500 })
    } finally {
      // 若有任一未完成 → 仍处于 uploading；全完成进入 ready (phase 回 idle 让 UI 显示就绪)
      if (allUploaded.value && phase.value === 'uploading') {
        phase.value = 'idle'
        logger.info('[useCreation] 所有图片上传完成，phase → idle')
      }
    }
  }

  // 用 uni.compressImage 压缩到 quality=70（约 300-500KB），失败/不支持时回退用原图
  function _compressIfPossible(filePath: string): Promise<string> {
    return new Promise((resolve) => {
      try {
        uni.compressImage({
          src: filePath,
          quality: 70,
          success: (res) => resolve(res.tempFilePath || filePath),
          fail: () => resolve(filePath),
        })
      } catch {
        resolve(filePath)
      }
    })
  }

  // mp-weixin `uni.compressImage` 并发调用时偶发 race：压缩产物 tempFilePath
  // 在 uploadFile 拿到之前被 wx 回收，upload 立刻报 `filePath is null` / errno 600005。
  // 这里侦测这一类错误，用原图（item.localPath，来自 chooseMedia，wx 保证生命周期）重试一次。
  async function _uploadWithFallback<T>(
    fn: (path: string) => Promise<T>,
    compressedPath: string,
    originalPath: string,
  ): Promise<T> {
    try {
      return await fn(compressedPath)
    } catch (e) {
      if (compressedPath === originalPath) throw e
      const msg = (e instanceof Error ? e.message : String(e)) || ''
      const rawErrno = (e as { raw?: { errno?: number } })?.raw?.errno
      const looksMissing = /filePath is null|does not exist|no such file|not found/i.test(msg)
        || rawErrno === 600005
      if (!looksMissing) throw e
      logger.warn('[useCreation] 压缩产物失效，用原图重试', {
        compressedPath, originalPath, errMsg: msg, errno: rawErrno,
      })
      return await fn(originalPath)
    }
  }

  /**
   * 用户点「生成」。
   * 如果 analyze 没完 → 等到 ready（轮询）；ready 后调 generate-report + save-share。
   */
  async function generate(opts: GenerateOptions): Promise<SavedShare | null> {
    const tStart = Date.now()
    logger.info('[useCreation] generate 被调用', {
      hasToken: _hasToken(),
      imageCount: prepared.value.length,
      videoCount: videos.value.length,
      allUploaded: allUploaded.value,
      analyzeReady: analyzeReady.value,
      allVideosReady: allVideosReady.value,
      style: opts.style,
      groupId: opts.groupId,
    })
    // 允许 video-only：至少要有一张图 *或* 一段视频
    if (!prepared.value.length && !videos.value.length) {
      errorMessage.value = '请先选图或视频'
      phase.value = 'error'
      logger.warn('[useCreation] generate 中断：无图片也无视频')
      return null
    }
    errorMessage.value = ''

    // —— 等图片 analyze 完（只有图片场景才检查 analyzeReady）——
    if (prepared.value.length > 0 && !analyzeReady.value) {
      phase.value = 'analyzing'
      stageMessage.value = '正在整理照片…'
      logger.info('[useCreation] generate 等待图片就绪', {
        analyzeReady: analyzeReady.value,
        uploadProgress: uploadProgress.value,
      })
      await _waitFor(() => analyzeReady.value, 60_000)
      if (!analyzeReady.value) {
        errorMessage.value = '照片整理超时，请重试'
        phase.value = 'error'
        logger.warn('[useCreation] generate 图片就绪超时（60s）', {
          allUploaded: allUploaded.value,
          firstAnalyzed: firstAnalyzed.value,
          failedCount: prepared.value.filter((p) => p.failed).length,
        })
        return null
      }
      logger.info('[useCreation] generate 图片就绪', { waitMs: Date.now() - tStart })
    }
    // 2026-08-09：部分图上传失败时不再阻断保存；带着成功的那些走完流程，
    // 只在"全部图都失败 + 也没视频"时才 return（前面的空判定已经覆盖）
    const failedCount = prepared.value.filter((p) => p.failed).length
    const okCount = prepared.value.length - failedCount
    if (failedCount > 0 && okCount === 0 && videos.value.length === 0) {
      errorMessage.value = '照片全部上传失败，请重选'
      phase.value = 'error'
      logger.warn('[useCreation] generate 全部图失败且无视频，中断')
      return null
    }
    if (failedCount > 0) {
      logger.info('[useCreation] generate 带着成功的图片继续', { failedCount, okCount })
    }

    // —— 等视频转码完（最多再等 10 分钟，视频本身在 addVideo 时就开始跑了） ——
    if (videos.value.length && !allVideosReady.value) {
      phase.value = 'analyzing'
      stageMessage.value = '正在处理视频，请稍候…'
      logger.info('[useCreation] generate 等待视频转码', {
        videos: videos.value.map((v) => ({
          uploadDone: v.uploadDone,
          transcoding: v.transcoding,
          failed: v.failed,
        })),
      })
      await _waitFor(() => allVideosReady.value, 10 * 60_000)
      if (!allVideosReady.value) {
        errorMessage.value = '视频处理未完成，请稍后再试'
        phase.value = 'error'
        logger.warn('[useCreation] generate 视频转码超时（10 分钟）')
        return null
      }
    }
    // 视频缩略图分析最多等 20s；超时也继续生成（visual_tags 留空，AI 不至于完全没素材）
    if (videos.value.length && !allVideosAnalyzed.value) {
      stageMessage.value = '正在整理视频…'
      await _waitFor(() => allVideosAnalyzed.value, 20_000)
    }

    try {
      // ============================================================
      // 2026-08-11 R0 硬性契约（用户明确要求 33 遍，写死不许改）：
      //   画匣子的正文文本 = 用户点击提交那一刻 textbox 里的文本，就这样。
      //   AI 只做一次 tone 转换（就是 pickStyle 触发的 apply-style 流式，改写完写进 textbox）。
      //   save 阶段**绝对不调用 generate-report**，也不允许后端任何 AI 二次改写。
      //
      //   删除的功能（凭空自创的、用户没要求过的）：
      //     - 上轮 hotfix14 加的"AI 导演模式：凭图片诗意扩写 100-150 字" → 全删
      //     - 上轮加的"精修模式 prompt：也调 AI 润色一次" → 全删
      //     - generate-report 的整个调用 → 全删
      //
      //   保留（用户明确认可）：
      //     - pickStyle 触发的 apply-style 流式改写（这是"文风滤镜"的定义）
      //     - 后端 save-share 之后的 _kick_auto_title_bg 异步起标题（用户明确要求）
      //     - 用户手输标题 优先于 auto-title 之上
      //     - 模板选择：用户主动选 opts.preferredTemplate，否则默认 wooden_box
      // ============================================================
      phase.value = 'generating'
      stageMessage.value = '正在保存'
      logger.info('[text-trace] build-report body 来源', {
        source: 'user_textbox_at_submit',
        bodyLen: (opts.text || '').length,
        bodyPreview: (opts.text || '').slice(0, 80),
        activeStyle: opts.style,
        userTitle: opts.title || '(empty)',
      })
      const report: AnnualReport = {
        report_title: '',                 // 交给 hotfix14 title-resolve 决定
        episodes: [
          {
            template_id: opts.preferredTemplate,
            copywriting: {
              h1: '',
              h2: '',
              body: opts.text || '',      // ← 硬性契约：body = 用户 textbox 内容
              style: opts.style || undefined,
            },
            images: [],
            audio_url: opts.audioUrl || '',
            audio_duration: opts.audioDuration || 0,
          } as AnnualReport['episodes'][number],
        ],
      }

      // 标题优先级：用户手输 > 今日日期（backend 异步 auto_title 拿到 body/图片会再优化）
      if (report.episodes?.[0]) {
        const ep0asTitle = report.episodes[0] as { copywriting?: Record<string, unknown> }
        const cw = (ep0asTitle.copywriting || (ep0asTitle.copywriting = {})) as Record<string, unknown>
        const inputTitle = (opts.title || '').trim()
        const d = new Date()
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const titleFinal = inputTitle || today
        logger.info('[text-trace] title-resolve', {
          userInput: inputTitle || '(empty)',
          fallbackToday: today,
          resolved: titleFinal,
          origin: inputTitle ? 'user' : 'date_fallback',
        })
        cw.h1 = titleFinal
        report.report_title = titleFinal
      }
      // [text-trace] 保存前记录 body 内容，让全链路可追（有 body 是"AI 生成 / 原文模式"两条分支的分水岭）
      if (report.episodes?.[0]) {
        const cwLog = report.episodes[0].copywriting as { h1?: string; body?: string; style?: string } | undefined
        logger.info('[text-trace] before save-share', {
          shareTopReportTitle: report.report_title,
          episodeH1: cwLog?.h1,
          episodeStyle: cwLog?.style,
          bodyLen: (cwLog?.body || '').length,
          bodyPreview: (cwLog?.body || '').slice(0, 80),
        })
      }

      // **重写** episode.images：
      //   之前为了让 generate-report 的 AI 看到视频，把视频缩略图作为 round.images 一项送进去 ——
      //   后端把它当作图片写回了 episode.images（image_url=thumbnail_url）。
      //   然后我们又追加视频本身（image_url=videoUrl, media_type=video）。
      //   结果一段视频出现 **两次**：一份缩略图（image）+ 一份视频本体。用户翻 2/2 才看到视频。
      // 修法：丢弃后端返回的 episode.images，用本地真实状态重建：
      //   - 真实图片（prepared.value）按顺序排前
      //   - 视频按顺序排后（media_type=video，url=videoUrl，poster=thumbnailUrl）
      if (report.episodes?.[0]) {
        const ep0 = report.episodes[0] as { images?: Array<Record<string, unknown>> }
        const realImages = prepared.value
          .filter((p) => !p.failed && p.imageUrl)
          .map((p, i) => ({
            image_url: p.imageUrl,
            thumbnail_url: p.thumbnailUrl || p.imageUrl,
            media_type: 'image',
            display_order: i,
            // 2026-07-13：把相册列表视图需要的元信息带上；相册和普通模式都写入，无害
            original_filename: p.originalFilename,
            size_bytes: p.sizeBytes,
            taken_at: p.takenAt,
            has_gps: p.hasGps,
            camera_model: p.cameraModel,
          }))
        const realVideos = videos.value
          .filter((v) => v.uploadDone && !v.failed && v.videoUrl)
          .map((v, i) => ({
            image_url: v.videoUrl,
            thumbnail_url: v.thumbnailUrl || '',
            media_type: 'video',
            display_order: realImages.length + i,
            // 2026-07-13：视频也带 metadata（原文件名 / 精确字节数 / 拍摄时间）
            original_filename: v.originalFilename,
            size_bytes: v.sizeBytes,
            taken_at: v.takenAt,
          }))
        ep0.images = [...realImages, ...realVideos]
      }

      // —— save-share ——
      phase.value = 'saving'
      stageMessage.value = '保存中'
      // 封面：图片优先；video-only 时回退视频缩略图（对齐网页端 cover_thumbnail 多级回退）
      const coverThumb = prepared.value[0]?.thumbnailUrl
        || prepared.value[0]?.imageUrl
        || videos.value.find((v) => v.thumbnailUrl)?.thumbnailUrl
      logger.info('[useCreation] 调用 save-share', { groupId: opts.groupId })
      const tSave = Date.now()
      const saved = await roundApi.saveShare({
        session_id: sessionId.value,
        report,
        cover_thumbnail: coverThumb,
        group_id: opts.groupId || undefined,
        personal_pinned: opts.personalPinned,
        auto_play_audio: opts.autoPlayAudio,
        original_quality: opts.originalQuality,
        author_display_name: opts.authorDisplayName,
        share_type: opts.shareType,
        visibility: opts.visibility,
        access_level: opts.accessLevel,
      })
      logger.info('[useCreation] save-share 完成', {
        elapsedMs: Date.now() - tSave,
        totalMs: Date.now() - tStart,
        shareId: saved.share_id,
      })

      phase.value = 'done'
      savedShare.value = saved
      return saved
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : '生成失败'
      errorMessage.value = msg
      phase.value = 'error'
      logger.warn('[useCreation] generate 失败', { msg, totalMs: Date.now() - tStart })
      return null
    }
  }

  return {
    phase,
    prepared,
    videos,
    sessionId,
    uploadProgress,
    allUploaded,
    firstAnalyzed,
    analyzeReady,
    allVideosReady,
    allVideosAnalyzed,
    hasError,
    errorMessage,
    stageMessage,
    savedShare,
    prepareImages,
    addImage,
    removeImage,
    addVideo,
    removeVideo,
    generate,
    clear,
    dismissError,
    resumePending,
    setOriginalQuality,
    analyzeFirstImage,
  }
}

// 简易轮询等待，timeoutMs 不达则 reject 但不抛
function _waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const tick = () => {
      if (predicate()) return resolve()
      if (Date.now() - t0 >= timeoutMs) return resolve()
      setTimeout(tick, 200)
    }
    tick()
  })
}
