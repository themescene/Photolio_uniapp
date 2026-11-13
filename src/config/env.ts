/**
 * 外部地址与运行期常量集中点。
 * 全仓任何业务代码都从此处取值，**禁止**硬编码 `https://hxiazi.com`、
 * `wx5ea018ce3dd2a6e5` 等到组件 / store / api 里。
 */

/** dev / production 判定（vite 提供） */
export const IS_DEV = import.meta.env.DEV

// 平台分支强烈推荐用 uniapp 的条件编译注释（构建期 tree-shake，运行期更稳）。
// 写法见 README「编码规范」一节。运行时需要平台标识时用
// uni.getSystemInfoSync().uniPlatform，不要再单独导出 PLATFORM 常量。

/** 后端 API 基础地址（含 /api 前缀） */
export const API_BASE = 'https://hxiazi.com/api'

/** 大视频上传子域名（绕 Cloudflare 100MB 限制）；不可用时回落到 API_BASE */
export const VIDEO_UPLOAD_BASE = 'https://upload.hxiazi.com/api'

/** 静态资源 / 上传文件直链域名 */
export const STATIC_BASE = 'https://hxiazi.com'

/** 微信小程序 AppID（前端展示用；登录走 uni.login()，AppID 内置在 manifest） */
export const WX_APPID = 'wx5ea018ce3dd2a6e5'

/**
 * 微信开放平台「网站应用」AppID（H5 扫码登录用；2026-07-24 hotfix12e）
 * 来自 open.weixin.qq.com → 管理中心 → 网站应用 → 应用详情。
 * ⚠️ 跟 WX_APPID（小程序）是**两个独立** AppID，不能混用。
 * unionid 才是跨应用统一 ID —— backend 用它把两端账号合并到同一 user_id。
 *
 * 2026-09-14 已申请通过并填入（应用名「画匣子」，主体 上海秦星人工智能科技有限责任公司）。
 * 对应的 AppSecret **只存在服务器 .env 的 WX_WEB_APPSECRET**，前端永远不碰。
 * 小程序 wx5ea018ce3dd2a6e5 与本网站应用已绑定到同一开放平台账号 → 共享 unionid。
 */
export const WX_WEB_APPID = 'wxfd80e9dd223c6805'

/**
 * H5 微信扫码登录回调地址（必须跟开放平台后台「授权回调域」严格匹配）。
 * 微信要求：只填域名（不含 http:// / https:// / 路径 / query），如 `hxiazi.com`
 * 我们跳转 URL 拼 `https://<域名>/#/pages/auth/wx-callback` 让 uni-h5 hash router 接
 *
 * 开发期本地测试：改成 `http://localhost:5173/#/pages/auth/wx-callback`，
 * 但开放平台后台不接受 localhost —— 必须部署到已备案域名才能真扫。
 *
 * 2026-09-14：从 app.hxiazi.com 改到根域名 hxiazi.com —— app 子域实测只是
 * 301 回主站（/var/www/photolio-h5 根本不存在），且新版网页端改为直接占用根域名。
 * 开放平台「授权回调域」必须填 `hxiazi.com`（只填域名，不带协议/路径）。
 * ⚠️ 改完必须重新 `npm run build:h5`，这个值是编译期打进产物的。
 */
export const WX_WEB_REDIRECT_URI = 'https://hxiazi.com/#/pages/auth/wx-callback'

/**
 * H5 端单次选图上限（2026-09-14）。
 *
 * 为什么需要这个常量：mp-weixin `chooseMedia` 一次最多 20 张是微信硬限，而 H5 走的是
 * 浏览器原生 `<input type="file" multiple>`，本来没有上限 —— 但 uni-h5 的
 * `chooseFile` 实现里有一句 `if (i < count) tempFiles.push(file)`（见
 * node_modules/@dcloudio/uni-h5/dist/uni-h5.es.js），会**按 count 硬切**。
 * 各处 H5 分支以前直接抄了小程序的 9 / 20，等于把小程序的限制搬进了网页版，
 * 而"突破 20 张上限"正是做 H5 端的初衷。
 *
 * 这里给一个足够大的值把切片关掉。不写 Infinity 是因为 uni-h5 还用
 * `count && count > 1` 判断要不要开 multiple，需要一个有限正数。
 */
export const H5_PICK_MAX = 1000

/** NFC 入口接收的 query 参数名（与后端 wechat_service 的 URL Link query 一致） */
export const NFC_QUERY_KEY = 'uid'

/** 客服联系方式（2026-07-17） */
export const SUPPORT_WECHAT_ID = 'Theme_Scene'
/** 客服二维码本地路径（拷自 annualreport/src/assets/devwechat.png） */
export const SUPPORT_QR_LOCAL = '/static/contact/support-qr.png'

/** 商家印刷物料 QR 生成端点（无 auth，前端 <image :src> 直接展示 → 长按保存/识别） */
export function qrImageUrl(text: string, size: number = 400): string {
  return `${STATIC_BASE}/api/qr?text=${encodeURIComponent(text)}&size=${size}`
}

/** 扩容包档位（对齐《影楼存储方案 v1》售卖档 —— 1GB/3GB 主推、5GB/10GB 大客户） */
export const STORAGE_BOOST_TIERS = [
  { label: '1GB', bytes: 1024 * 1024 * 1024 },
  { label: '3GB', bytes: 3 * 1024 * 1024 * 1024 },
  { label: '5GB', bytes: 5 * 1024 * 1024 * 1024 },
  { label: '10GB', bytes: 10 * 1024 * 1024 * 1024 },
] as const

/** Local Storage key 集中（避免散落各处拼错） */
export const STORAGE_KEYS = {
  TOKEN: 'photolio_token',
  USER: 'photolio_user',
  THEME: 'photolio_theme',
  /** 追加章节：share/play 写入，CreationFlow 启动时读取并预填 SettingsPanel.groupId */
  PENDING_GROUP_ID: 'photolio_pending_group_id',
  PENDING_GROUP_NAME: 'photolio_pending_group_name',
  /** 最近播放：play tab 跳转到 share/play 时读取 */
  LAST_PLAYED: 'photolio_last_played_share',
  /** NFC 绑定：NFC tab 选了模式 / 上传完成后由 CreationFlow / NFC tab 读取并 bind */
  PENDING_PRESET_ID: 'photolio_pending_preset_id',
  /** 主页脏标记：上传 / 编辑 / 删除 share 后写 true；主页 onShow 检到就清 tab 缓存重拉 */
  HOME_DIRTY: 'photolio_home_dirty',
  /** 单个 share 脏标记：编辑页保存后写 share_id；播放页 onShow 检到就重拉 share 详情 */
  SHARE_DIRTY: 'photolio_share_dirty_id',
  /** 已碰过的 NFC 卡本地历史（landing.vue 写入 → nfc/index.vue 读取展示可选修改） */
  NFC_HISTORY: 'photolio_nfc_history',
  /** 2026-07-13：NFC 绑定时预设的可见性 / 权限等级；CreationFlow 完成 save-share 时读出 */
  PENDING_NFC_VISIBILITY: 'photolio_pending_nfc_visibility',
  PENDING_NFC_ACCESS_LEVEL: 'photolio_pending_nfc_access_level',
  /** 2026-07-16：声纹授权 —— 用户首次点录音前必须弹独立授权 modal 同意后写入 true，
   * 存在即视为已授权，不再重复弹窗（对齐微信小程序审核合规要求）。 */
  VOICEPRINT_CONSENT: 'photolio_voiceprint_consent',
  /** 2026-07-23：从「聊天文件」选原图前的引导 modal 是否已看过。
   * 用户实测反馈选择器"无内容"根因是"没在微信里作为文件发送过"—— chooseMessageFile
   * 只显示微信聊天里的文件，不是手机相册。第一次使用时弹步骤引导 modal，看过即不再弹。 */
  CHAT_FILE_HINT_SEEN: 'photolio_chat_file_hint_seen',
} as const
