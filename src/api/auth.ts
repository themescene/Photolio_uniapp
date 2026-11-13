/**
 * 认证相关 API。所有请求经 `src/api/request.ts` 统一封装。
 */
import { request, uploadFile } from './request'
import type { AuthSuccess, CurrentUser } from '@/types'

/** 微信小程序登录：用 uni.login() 拿到的 code 换 token */
export function wxLogin(code: string) {
  return request<AuthSuccess>({
    method: 'POST',
    path: '/auth/wx-login',
    body: { code },
    requireAuth: false,
  })
}

/**
 * 2026-09-17：小程序 → h5 web-view 无感换 token。
 * 小程序端已登录 → 拿一个一次性 code → 拼进 web-view URL query。
 * TTL 5 分钟，服务端一次性消费。
 */
export function mpToH5Code() {
  return request<{ code: string }>({
    method: 'POST',
    path: '/auth/mp-to-h5-code',
  })
}

/** h5 端用 code 换正式 token（一次性）。用于 web-view 首次加载时。 */
export function exchangeCode(code: string) {
  return request<AuthSuccess>({
    method: 'POST',
    path: '/auth/exchange-code',
    body: { code },
    requireAuth: false,
  })
}

/**
 * H5 微信扫码登录回调 —— 2026-07-24 hotfix12e。
 * 前端 login 页把用户跳到 open.weixin.qq.com/connect/qrconnect → 用户扫码 →
 * 微信跳回 redirect_uri?code=xxx → wx-callback.vue 拿 code POST 到本接口 → 拿 token
 */
export function wxOauthCallback(code: string) {
  return request<AuthSuccess>({
    method: 'POST',
    path: '/auth/wx-oauth-callback',
    body: { code },
    requireAuth: false,
  })
}

// ========== 手机号绑定 / 登录（2026-07-24 hotfix12f） ==========

/** 发送手机号验证码。purpose: 'bind'（绑定当前账号）| 'login'（手机号登录） */
export function sendPhoneCode(phone: string, purpose: 'bind' | 'login') {
  return request<{ sent: boolean; cooldown_seconds: number }>({
    method: 'POST',
    path: '/auth/send-phone-code',
    body: { phone, purpose },
    requireAuth: false,
  })
}

/**
 * 绑定手机号到当前账号（登录态调用）；首次绑定送 1GB 空间。
 *
 * 2026-09-14：如果这个手机号已经属于另一个账号，后端不再报错，而是把两个账号
 * 合并成同一身份（`merged: true`）—— 用户契约「绑同一个手机号 = 合并账号」。
 */
export function bindPhone(phone: string, code: string) {
  return request<{
    phone: string
    bonus_bytes: number
    merged?: boolean
    merged_with_user_id?: string
    message?: string
  }>({
    method: 'POST',
    path: '/auth/bind-phone',
    body: { phone, code },
  })
}

/** 解绑手机号（不撤回已送空间） */
export function unbindPhone() {
  return request<unknown>({
    method: 'POST',
    path: '/auth/unbind-phone',
  })
}

/** 手机号 + 验证码登录（未绑定过会自动注册 + 送空间） */
export function phoneLogin(phone: string, code: string) {
  return request<AuthSuccess>({
    method: 'POST',
    path: '/auth/phone-login',
    body: { phone, code },
    requireAuth: false,
  })
}

/** 旧账号用户名 + 密码登录（H5 / 找回旧数据用） */
export function legacyLogin(username: string, password: string) {
  return request<AuthSuccess>({
    method: 'POST',
    path: '/auth/login',
    body: { username, password },
    requireAuth: false,
  })
}

/** 取当前登录用户完整信息 */
export function fetchMe() {
  return request<CurrentUser>({
    method: 'GET',
    path: '/auth/me',
  })
}

/** 绑定旧画匣子网页端账号到当前微信账号 */
export function bindLegacy(legacyUsername: string, legacyPassword: string) {
  return request<{ linked_legacy_user_id: string }>({
    method: 'POST',
    path: '/auth/bind-legacy',
    body: { username: legacyUsername, password: legacyPassword },
  })
}

/** 解绑旧账号 */
export function unbindLegacy() {
  return request<unknown>({
    method: 'POST',
    path: '/auth/unbind-legacy',
  })
}

/** 设置/修改密码。首次设密 oldPassword 可省略 */
export function setPassword(newPassword: string, oldPassword?: string) {
  return request<{ has_password: boolean }>({
    method: 'POST',
    path: '/auth/set-password',
    body: { new_password: newPassword, old_password: oldPassword },
  })
}

/** 修改登录用户名（唯一性校验） */
export function updateUsername(newUsername: string) {
  return request<{ username: string }>({
    method: 'PUT',
    path: '/auth/username',
    body: { username: newUsername },
  })
}

/** 修改昵称（即 default_display_name 的 API 别名） */
export function updateNickname(nickname: string) {
  return request<{ nickname: string }>({
    method: 'PUT',
    path: '/auth/nickname',
    body: { nickname },
  })
}

/** 2026-08-11：上传头像 —— mp-weixin chooseAvatar 拿到 tempFilePath 后调这个 */
export function updateAvatar(filePath: string) {
  return uploadFile<{ avatar_url: string }>({
    path: '/auth/avatar',
    filePath,
    name: 'avatar',
  })
}

/** 兑换码 → 解锁某 entitlement（如 preset_links） */
export function redeemCode(code: string) {
  return request<{ entitlements: string[] }>({
    method: 'POST',
    path: '/auth/redeem-code',
    body: { code },
  })
}
