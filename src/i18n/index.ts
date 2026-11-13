import { inject, ref, watch } from 'vue'
import type { App, InjectionKey } from 'vue'
import english from './en.json'
export type Locale = 'zh' | 'en'
const KEY = 'pianyu_lang'
function initialLocale(): Locale {
  try {
    // 与旧官网about共用原始localStorage值；不将用户内容或接口参数交给翻译器。
    // #ifdef H5
    const saved = localStorage.getItem(KEY)
    if (saved === 'zh' || saved === 'en') return saved
    return /^zh/i.test(navigator.languages?.[0] || navigator.language || 'zh') ? 'zh' : 'en'
    // #endif
    const stored = uni.getStorageSync('photolio_language')
    if (stored === 'zh' || stored === 'en') return stored
    const language = uni.getSystemInfoSync().language || 'zh'
    return /^zh/i.test(language) ? 'zh' : 'en'
  } catch { return 'zh' }
}
export const locale = ref<Locale>(initialLocale())
export function setLocale(value: Locale) {
  locale.value = value
  uni.setStorageSync('photolio_language', value)
  // #ifdef H5
  localStorage.setItem(KEY, value); document.documentElement.lang = value === 'zh' ? 'zh-CN' : 'en'
  // #endif
}
const patterns = Object.entries(english).filter(([key]) => /\{\d+\}/.test(key)).map(([key, value]) => ({
  regex: new RegExp('^' + key.split(/(\{\d+\})/).map(part => /^\{\d+\}$/.test(part) ? '([\\s\\S]*?)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$'), value,
}))
export function t(source: string, ...args: Array<string | number>): string {
  return translate(locale.value, source, args)
}
export const previewLocaleKey: InjectionKey<Locale> = Symbol('previewLocale')
export function usePreviewText() {
  const override = inject(previewLocaleKey, undefined)
  return (source: string, ...args: Array<string | number>) => translate(override ?? locale.value, source, args)
}
function translate(language: Locale, source: string, args: Array<string | number>): string {
  let result = source
  if (language === 'en') {
    result = (english as Record<string, string>)[source] || source
    if (result === source) for (const pattern of patterns) {
      const match = source.match(pattern.regex)
      if (match) { result = pattern.value.replace(/\{(\d+)\}/g, (_all, index) => match[Number(index) + 1] || ''); break }
    }
  }
  return args.length ? result.replace(/\{(\d+)\}/g, (_all, index) => String(args[Number(index)] ?? '')) : result
}
const pageTitles: Record<string, string> = {
  "pages/index/index": "画匣子",
  "pages/upload/index": "上传",
  "pages/play/index": "播放",
  "pages/nfc/index": "NFC",
  "pages/my/index": "我的",
  "pages/auth/login": "登录",
  "pages/auth/wx-callback": "登录中",
  "pages/nfc/landing": "正在打开",
  "pages/account/settings": "账号设置",
  "pages/legal/privacy": "隐私协议",
  "pages/legal/terms": "用户协议",
  "pages/legal/voiceprint": "声纹授权协议",
  "pages/create/index": "新建画匣子",
  "pages/share/play": "回忆",
  "pages/share/edit": "编辑画匣子",
  "pages/nfc/bind": "绑定内容",
  "pages/group/index": "合集",
  "pages/share/invite": "邀请共创",
  "pages/couplet/display": "春联",
  "pages/dev/nfc-burn": "NFC 烧卡助手",
  "pages/dev/nfc-write": "NFC 自动烧卡（安卓）",
  "pages/friends/index": "好友",
  "pages/album/index": "相册",
  "pages/nfc/history": "重置 NFC 匣子内容",
  "pages/storage/index": "存储空间",
  "pages/storage/redeem": "兑换扩容包",
  "pages/my/support": "联系客服",
  "pages/dev/storage-boost": "扩容包管理"
}
export function installLocale(app: App) {
  // #ifdef H5
  document.documentElement.lang = locale.value === 'zh' ? 'zh-CN' : 'en'
  // #endif
  const heading = () => { const pages = getCurrentPages(); const route = pages[pages.length - 1]?.route; if (route && pageTitles[route]) uni.setNavigationBarTitle({ title: t(pageTitles[route]) }) }
  watch(locale, heading)
  app.mixin({ onShow() { heading() } })
  // 只处理系统UI的文案，不改写持久化数据、权限值、模板标识和网络请求。
  for (const name of ['showToast', 'showModal', 'showLoading', 'setNavigationBarTitle'] as const) {
    // H5生产编译会将静态uni API改为导入函数；动态uni[name]在裁剪后不存在。
    uni.addInterceptor(name, {
      invoke(options: Record<string, unknown>) {
        if (name === 'showModal' && locale.value === 'en') { options.confirmText ??= 'OK'; options.cancelText ??= 'Cancel' }
        for (const field of ['title', 'content', 'confirmText', 'cancelText']) if (typeof options[field] === 'string') options[field] = t(options[field] as string)
      },
    })
  }
}
