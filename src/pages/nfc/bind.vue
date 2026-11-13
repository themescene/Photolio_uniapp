<script setup lang="ts">
import { t as uiText } from "@/i18n";
// 参考：annualreport/src/views/NfcLandingView.vue addToHistory；复用NFC页同一内容库与确认绑定。
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import NfcContentLibrary from '@/components/NfcContentLibrary.vue'
import { setPending } from '@/utils/media'
import { STORAGE_KEYS } from '@/config/env'
const uid = ref('')
const valid = computed(() => /^[0-9A-F]{14}$/.test(uid.value))
onLoad(options => {
  uid.value = String(options?.uid || '').trim().toUpperCase()
  if (valid.value) setPending(STORAGE_KEYS.PENDING_PRESET_ID, uid.value)
})
function uploadNew() {
  if (!valid.value) return
  setPending(STORAGE_KEYS.PENDING_PRESET_ID, uid.value)
  uni.switchTab({ url: '/pages/nfc/index' })
}
function bound(value: string) {
  setTimeout(() => uni.reLaunch({ url: '/pages/nfc/landing?uid=' + encodeURIComponent(value) }), 500)
}
</script>
<template>
  <view class="page">
    <view class="header"><text class="title">{{ uiText("选择已有内容绑定") }}</text><text class="hint">{{ uiText("可选择画匣子、合集，或之前上传的文件和音视频") }}</text><text v-if="valid" class="uid">{{ uiText("当前卡片 · UID 末四位") }} {{ uid.slice(-4) }}</text></view>
    <view v-if="!valid" class="state"><text>{{ uiText("卡片信息不完整，请重新碰一碰 NFC 卡片。") }}</text></view>
    <template v-else><view class="upload-new" role="button" @click="uploadNew"><text>{{ uiText("上传新内容并绑定") }}</text></view><NfcContentLibrary :preset-id="uid" @bound="bound" /></template>
  </view>
</template>
<style lang="scss" scoped>
@use '@/styles/tokens.scss' as t;
.page { min-height: 100vh; padding: t.$spacing-5 t.$spacing-4 calc(80rpx + env(safe-area-inset-bottom)); background: t.$color-bg; display: flex; flex-direction: column; gap: t.$spacing-3; }
.header { display: flex; flex-direction: column; gap: 12rpx; }.title { font-size: t.$font-xl; font-weight: t.$weight-bold; color: t.$color-text; }.hint { font-size: t.$font-sm; line-height: 1.6; color: t.$color-text-soft; }.uid { font-size: t.$font-xs; color: t.$color-text-mute; }
.upload-new { padding: 20rpx 28rpx; align-self: flex-start; border-radius: t.$radius-pill; border: 2rpx solid t.$color-border; color: t.$color-text; background: t.$color-surface; font-size: t.$font-sm; }.state { padding: t.$spacing-5 0; color: t.$color-danger; font-size: t.$font-sm; }
</style>
