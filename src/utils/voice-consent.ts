import { STORAGE_KEYS } from '@/config/env'
export function ensureVoiceConsent(): Promise<boolean> {
  try { if (uni.getStorageSync(STORAGE_KEYS.VOICEPRINT_CONSENT)) return Promise.resolve(true) } catch { /* ask below */ }
  return new Promise(resolve => uni.showModal({ title: '声纹授权',
    content: '本次录音仅用于保存和播放，不用于声纹识别、身份认证或模型训练。详见《声纹授权协议》。',
    confirmText: '同意', cancelText: '查看协议', success: result => {
      if (result.confirm) { uni.setStorageSync(STORAGE_KEYS.VOICEPRINT_CONSENT, true); resolve(true) }
      else { uni.navigateTo({ url: '/pages/legal/voiceprint' }); resolve(false) }
    }, fail: () => resolve(false) }))
}
