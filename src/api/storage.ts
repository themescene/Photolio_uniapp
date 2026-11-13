/**
 * 存储额度 API（2026-07-17）
 *
 * 端点：
 * - GET  /storage/usage
 * - POST /storage/redeem            → 兑换扩容包（等价于 /api/auth/redeem-code 命中扩容包分支）
 * - POST /storage/boost/preview     → 查看未兑换扩容包内容
 * - POST /storage/boost/create      → 生成扩容包（entitlement=preset_links）
 * - POST /storage/boost/create-batch
 * - GET  /storage/boosts            → 我生成过的扩容包
 */
import { request } from './request'
import type {
  RedeemResult,
  StorageBoost,
  StorageBoostPreview,
  StorageUsageSummary,
} from '@/types'

export function getStorageUsage(): Promise<StorageUsageSummary> {
  return request<StorageUsageSummary>({ path: '/storage/usage' })
}

/** 兑换扩容包（专用端点；成功后返回 {kind:'storage', grant, boost, summary}） */
export function redeemStorage(code: string): Promise<RedeemResult> {
  return request<RedeemResult>({
    method: 'POST',
    path: '/storage/redeem',
    body: { code },
  })
}

/** 预览扩容包内容（不消耗；code 无效返回 ApiError 404） */
export function previewBoost(code: string): Promise<StorageBoostPreview> {
  return request<StorageBoostPreview>({
    method: 'POST',
    path: '/storage/boost/preview',
    body: { code },
    requireAuth: false,
  })
}

export interface CreateBoostBody {
  capacity_bytes: number
  note?: string
  label?: string
}

export function createBoost(body: CreateBoostBody): Promise<StorageBoost> {
  return request<StorageBoost>({
    method: 'POST',
    path: '/storage/boost/create',
    body,
  })
}

export interface CreateBoostBatchBody extends CreateBoostBody {
  count: number
}

export function createBoostBatch(body: CreateBoostBatchBody): Promise<{
  count: number
  boosts: StorageBoost[]
}> {
  return request({
    method: 'POST',
    path: '/storage/boost/create-batch',
    body,
  })
}

export function listMyBoosts(): Promise<{ boosts: StorageBoost[] }> {
  return request({ path: '/storage/boosts' })
}
