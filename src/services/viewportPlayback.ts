import { watch } from 'vue'
import { usePlaybackStore } from '@/stores/playback'
/** H5共用播放策略：每个视频独立跟随可见性，浏览器要求自动播放时静音。 */
export function installViewportPlayback() {
  if (typeof IntersectionObserver === 'undefined' || typeof MutationObserver === 'undefined') return
  const preferences = usePlaybackStore(), states = new Map<HTMLVideoElement, { visible: boolean; optedOut: boolean }>()
  function update(video: HTMLVideoElement) {
    const state = states.get(video)
    if (!state) return
    if (document.hidden) { video.pause(); return }
    const allowed = preferences.autoplay && video.closest('[data-media-autoplay="false"]') === null
    if (!allowed) { if (!state.optedOut) video.pause(); state.optedOut = true; return }
    state.optedOut = false
    if (!state.visible || document.hidden) { video.pause(); return }
    video.muted = true; video.playsInline = true
    void video.play().catch(() => { /* autoplay被浏览器拒绝时保留原生播放按钮 */ })
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) { const video = entry.target as HTMLVideoElement; const state = states.get(video); if (state) { state.visible = entry.isIntersecting && entry.intersectionRatio >= .5; update(video) } }
  }, { threshold: [0, .5] })
  function scan() {
    for (const [video] of states) if (!video.isConnected) { observer.unobserve(video); states.delete(video) }
    for (const video of document.querySelectorAll<HTMLVideoElement>('video')) if (!states.has(video)) { states.set(video, { visible: false, optedOut: false }); observer.observe(video) }
  }
  const mutations = new MutationObserver(records => {
    scan()
    if (records.some(record => record.type === 'attributes')) for (const [video] of states) update(video)
  })
  mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-media-autoplay', 'src'] })
  document.addEventListener('visibilitychange', () => { for (const [video] of states) update(video) })
  watch(() => preferences.autoplay, () => { for (const [video] of states) update(video) })
  scan()
}
