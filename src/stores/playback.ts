import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
export const usePlaybackStore = defineStore('playback', () => {
  let initial = true
  try { initial = uni.getStorageSync('photolio_media_autoplay') !== false } catch { /* default on */ }
  const autoplay = ref(initial)
  watch(autoplay, value => { try { uni.setStorageSync('photolio_media_autoplay', value) } catch { /* session still works */ } })
  return { autoplay }
})
