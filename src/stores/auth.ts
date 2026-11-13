/**
 * 当前用户 / token 状态。
 *
 * 单一职责：
 * - 状态：current user + token
 * - action：登录 / 登出 / 刷新用户信息
 * - **不直接调** uni.* 平台 API；登录的 uni.login() 调用在 component / composable 层做完后把 code 传进来
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as authApi from '@/api/auth'
import { STORAGE_KEYS } from '@/config/env'
import { logger } from '@/utils/logger'
import type { CurrentUser } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(safeGet(STORAGE_KEYS.TOKEN))
  const user = ref<CurrentUser | null>(safeGet<CurrentUser>(STORAGE_KEYS.USER, true))

  const isLoggedIn = computed(() => !!token.value)
  const nickname = computed(() => user.value?.nickname || '')

  function persist() {
    try {
      if (token.value) uni.setStorageSync(STORAGE_KEYS.TOKEN, token.value)
      else uni.removeStorageSync(STORAGE_KEYS.TOKEN)
      if (user.value) uni.setStorageSync(STORAGE_KEYS.USER, user.value)
      else uni.removeStorageSync(STORAGE_KEYS.USER)
    } catch (e) {
      logger.warn('persist auth state failed', e)
    }
  }

  /** 微信小程序登录入口：传入 uni.login() 拿到的 code */
  async function loginWithWxCode(code: string) {
    logger.info('[store/auth] wx login start')
    const res = await authApi.wxLogin(code)
    await applyLoginResponse(res)
    return res
  }

  /**
   * H5 微信扫码登录回调：wx-callback 页拿到 backend 返回的 AuthSuccess 后调此方法。
   * 2026-07-24 hotfix12e：把「持久 token + 拉 me」提出来复用，方便未来其它登录路径（手机号等）也走同一入口
   */
  async function applyLoginResponse(res: { token: string }) {
    token.value = res.token
    persist()
    await refreshMe()
    // 账号切换 → 主页 loadedTabs 缓存必须失效，否则 personalShares / groups / likedShares
    // 会残留上一账号的数据，用户切号后看到上一个人的画匣子（"one-step-behind" bug）
    _markHomeDirty()
  }

  /** 旧账号用户名 + 密码登录 */
  async function loginWithLegacy(username: string, password: string) {
    const res = await authApi.legacyLogin(username, password)
    await applyLoginResponse(res)
    return res
  }

  /** 2026-07-24 hotfix12f：手机号 + 验证码登录 */
  async function loginWithPhone(phone: string, code: string) {
    const res = await authApi.phoneLogin(phone, code)
    await applyLoginResponse(res)
    return res
  }

  async function refreshMe() {
    if (!token.value) return null
    try {
      user.value = await authApi.fetchMe()
      persist()
      return user.value
    } catch (e) {
      logger.warn('[store/auth] fetchMe failed', e)
      return null
    }
  }

  function logout() {
    token.value = null
    user.value = null
    persist()
    _markHomeDirty()
  }

  // 通知主页「账号态变了，请弃用 loadedTabs 缓存 + 重拉」
  // 用 storage flag 而不是 eventbus/watch，因为主页可能未 mounted（用户在其它 tab）
  // 键名与 pages/index/index.vue onShow 消费的一致
  function _markHomeDirty() {
    try { uni.setStorageSync('photolio_home_dirty', true) } catch { /* ignore */ }
  }

  async function updateNicknameAction(nickname: string) {
    const res = await authApi.updateNickname(nickname)
    if (user.value) {
      user.value.nickname = res.nickname
      user.value.default_display_name = res.nickname
      persist()
    }
  }

  async function updateAvatarAction(filePath: string) {
    const res = await authApi.updateAvatar(filePath)
    if (user.value) {
      (user.value as { avatar_url?: string }).avatar_url = res.avatar_url
      persist()
    }
  }

  async function bindLegacyAction(legacyUsername: string, legacyPassword: string) {
    const res = await authApi.bindLegacy(legacyUsername, legacyPassword)
    await refreshMe()
    return res
  }

  /** 当前用户是否解锁某项特性（兑换码 / VIP 等） */
  function hasEntitlement(name: string): boolean {
    return !!user.value?.entitlements?.includes(name)
  }

  return {
    token,
    user,
    isLoggedIn,
    nickname,
    loginWithWxCode,
    applyLoginResponse,
    loginWithLegacy,
    loginWithPhone,
    refreshMe,
    updateAvatarAction,
    logout,
    updateNicknameAction,
    bindLegacyAction,
    hasEntitlement,
  }
})

function safeGet<T = string>(key: string, isJson = false): T | null {
  try {
    const v = uni.getStorageSync(key)
    if (!v) return null
    return isJson ? (v as T) : (v as T)
  } catch {
    return null
  }
}
