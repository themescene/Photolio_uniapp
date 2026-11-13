/**
 * NFC Preset Link API。
 *
 * 对齐网页端 [annualreport/src/views/UploadView.vue:338-440]：
 *   GET  /presets/mine → { presets: PresetLink[] }
 *   POST /presets body: { count }
 *   DELETE /preset/<id>
 *   POST /preset/<id>/unbind
 */
import { request } from './request'
import type { PresetLink } from '@/types'

export function fetchMyPresets() {
  return request<{ presets: PresetLink[] }>({
    method: 'GET',
    path: '/presets/mine',
  })
}

export function createPresets(count: number) {
  return request<{ presets: PresetLink[] }>({
    method: 'POST',
    path: '/presets',
    body: { count },
  })
}

export function deletePreset(presetId: string) {
  return request({
    method: 'DELETE',
    path: `/preset/${presetId}`,
  })
}

export function unbindPreset(presetId: string) {
  return request({
    method: 'POST',
    path: `/preset/${presetId}/unbind`,
  })
}
