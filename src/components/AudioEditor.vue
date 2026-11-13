<script setup lang="ts">
import { t as uiText } from "@/i18n";
// 参考：annualreport/src/components/ShareModal.vue episode.audio_url；只改音轨草稿，不调用文案生成。
import { computed, ref, watch, onUnmounted } from 'vue'
import { useRecorder } from '@/composables/useRecorder'
import { uploadNfcAudio } from '@/api/nfc'
import { pickLocalFile } from '@/utils/pick-file'
import { ensureVoiceConsent } from '@/utils/voice-consent'
import { STATIC_BASE } from '@/config/env'
import { logger } from '@/utils/logger'
import SvgIcon from './SvgIcon.vue'
const props = defineProps<{ modelValue: string; duration?: number; disabled?: boolean }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void; (event: 'duration', value: number): void; (event: 'busy', value: boolean): void }>()
const uploading = ref(false), error = ref(''), percent = ref(0)
let disposed = false, preview: UniApp.InnerAudioContext | null = null
const playing = ref(false)
const src = computed(() => props.modelValue.startsWith('/uploads/') ? STATIC_BASE + props.modelValue : props.modelValue)
const recorder = useRecorder({ onAudioReady: audio => { void upload(audio.tempFilePath, audio.duration) }, onError: message => { error.value = message } })
const busy = computed(() => uploading.value || recorder.isRecording.value || ('starting' in recorder && recorder.starting.value) || ('finishing' in recorder && recorder.finishing.value))
watch(busy, value => emit('busy', value))
async function upload(path: string, duration = 0) {
  if (props.disabled || disposed || uploading.value) return
  uploading.value = true; error.value = ''; percent.value = 0
  try {
    const result = await uploadNfcAudio(path, value => { percent.value = value })
    if (disposed) return
    logger.info('[audio-edit] draft:replace', { previous: !!props.modelValue, duration: result.duration || duration })
    stopPreview(); emit('update:modelValue', result.audio_url); emit('duration', result.duration || duration)
  } catch { if (!disposed) error.value = '音频上传失败，请重试；原录音仍保留' }
  finally { uploading.value = false }
}
async function pick() {
  if (props.disabled || busy.value) return
  try { const file = await pickLocalFile('audio'); if (file) { if (file.size > 50 * 1024 * 1024) { error.value = '音频不能超过 50MB'; return } await upload(file.path) } } catch { error.value = '无法选择音频文件，请重试' }
}
async function record() {
  if (recorder.isRecording.value) { recorder.stopRecording(); return }
  if (props.disabled || uploading.value) return
  if (!await ensureVoiceConsent()) return
  stopPreview(); error.value = ''; await recorder.startRecording()
}
function stopPreview() { try { preview?.destroy() } catch { /* already destroyed */ } preview = null; playing.value = false }
function play() {
  if (!src.value) return
  if (!preview) { preview = uni.createInnerAudioContext(); preview.src = src.value; preview.onPlay(() => { playing.value = true }); preview.onPause(() => { playing.value = false }); preview.onEnded(() => { playing.value = false }); preview.onError(() => { error.value = '暂时无法播放音频，请重试'; playing.value = false }) }
  if (playing.value) preview.pause(); else preview.play()
}
async function remove() {
  if (props.disabled || busy.value) return
  const confirmed = await new Promise<boolean>(resolve => uni.showModal({ title: '移除当前录音？', content: '保存画匣子后才会生效，取消编辑可保留原录音。', success: result => resolve(!!result.confirm), fail: () => resolve(false) }))
  if (confirmed) { logger.info('[audio-edit] draft:remove'); stopPreview(); emit('update:modelValue', ''); emit('duration', 0) }
}
watch(() => props.modelValue, stopPreview)
onUnmounted(() => { disposed = true; stopPreview(); emit('busy', false) })
</script>
<template>
  <view class="audio-editor">
    <view v-if="modelValue" class="audio-track"><view role="button" @click="play"><SvgIcon :name="playing ? 'pause' : 'play'" size="32rpx" /><text>{{ playing ? uiText("暂停试听") : uiText("试听当前录音") }}</text></view><text v-if="duration">{{ recorder.formatRecordingTime(duration) }}</text></view>
    <text v-else class="audio-note">{{ uiText("当前章节还没有录音") }}</text>
    <view class="audio-actions"><view class="audio-action" :class="{ recording: recorder.isRecording.value }" role="button" :aria-disabled="disabled || uploading" @click="record"><SvgIcon :name="recorder.isRecording.value ? 'stop' : 'mic'" size="28rpx" /><text>{{ recorder.isRecording.value ? uiText("停止录音") : modelValue ? uiText("重新录音") : uiText("开始录音") }}</text></view><text v-if="recorder.isRecording.value">{{ recorder.formatRecordingTime(recorder.recordingTime.value) }}</text><view v-else class="audio-action" role="button" :aria-disabled="disabled || busy" @click="pick"><text>{{ modelValue ? uiText("替换音频文件") : uiText("添加音频文件") }}</text></view><view v-if="modelValue && !busy" class="audio-action audio-remove" role="button" :aria-disabled="disabled" @click="remove"><text>{{ uiText("移除录音") }}</text></view></view>
    <text v-if="uploading" class="audio-note">{{ uiText("音频上传中") }} {{ percent }}%</text><text v-if="error" class="audio-error">{{ uiText(error) }}</text><text class="audio-note">{{ uiText("录音变更在点击保存后生效，不会改写正文。") }}</text>
  </view>
</template>
<style lang="scss" scoped>
@use '@/styles/tokens.scss' as t;
.audio-editor { display: flex; flex-direction: column; gap: 16rpx; }.audio-actions { display: flex; flex-wrap: wrap; gap: 16rpx; align-items: center; font-size: t.$font-sm; }.audio-action { display: flex; align-items: center; gap: 8rpx; padding: 16rpx 22rpx; border: 2rpx solid t.$color-border; border-radius: t.$radius-pill; background: t.$color-surface; color: t.$color-text; }.audio-action[aria-disabled='true'] { opacity: .45; }.audio-remove,.audio-error { color: t.$color-danger; }.audio-error,.audio-note { font-size: t.$font-xs; line-height: 1.6; }.audio-note { color: t.$color-text-soft; }.audio-track { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; font-size: t.$font-sm; padding: 22rpx; border-radius: t.$radius-md; background: t.$color-surface; }.audio-track > view { display: flex; align-items: center; gap: 12rpx; }.recording { border-color: t.$color-danger; }
</style>
