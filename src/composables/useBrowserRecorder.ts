// 参考：annualreport/src/composables/useRecorder.ts。H5不调用uni的原生RecorderManager。
import { ref, onUnmounted } from 'vue'
import { logger } from '@/utils/logger'
export interface RecorderCallbacks {
  onAudioReady: (audio: { tempFilePath: string; duration: number; format: string }) => void
  onError?: (message: string) => void
}
export function useBrowserRecorder(options: RecorderCallbacks) {
  const isRecording = ref(false), recordingTime = ref(0), recordingCompleted = ref(false), starting = ref(false), finishing = ref(false)
  let recorder: MediaRecorder | null = null, stream: MediaStream | null = null, context: AudioContext | null = null
  let timer: ReturnType<typeof setInterval> | null = null, generation = 0, disposed = false
  let activeUrl = '', started = 0, spoken = false, silentFor = 0
  const formatRecordingTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
  function release() {
    if (timer) clearInterval(timer)
    timer = null; stream?.getTracks().forEach(track => track.stop()); stream = null
    void context?.close().catch(() => {}); context = null
  }
  function stopRecording() {
    if (starting.value) { ++generation; starting.value = false; release(); return }
    if (recorder?.state === 'recording') { finishing.value = true; recorder.stop() }
    isRecording.value = false
    if (timer) clearInterval(timer)
    timer = null
  }
  async function startRecording() {
    if (starting.value || finishing.value || isRecording.value || disposed) return
    const run = ++generation
    starting.value = true; recordingCompleted.value = false
    logger.info('[recorder-browser] request', { secure: window.isSecureContext, supported: !!navigator.mediaDevices?.getUserMedia })
    try {
      if (!window.isSecureContext) throw new Error('录音需要 HTTPS 或 localhost，请在安全连接下打开')
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('当前浏览器不支持录音，请使用系统浏览器或选择音频文件')
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      if (run !== generation || disposed) { acquired.getTracks().forEach(track => track.stop()); return }
      stream = acquired
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type))
      recorder = new MediaRecorder(acquired, mime ? { mimeType: mime } : undefined)
      const chunks: BlobPart[] = []
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => {
        const actualType = (recorder?.mimeType || mime || 'audio/webm').split(';')[0]
        const duration = Math.max(0, (Date.now() - started) / 1000)
        release(); isRecording.value = false; finishing.value = false
        if (disposed || run !== generation) return
        if (!chunks.length) { options.onError?.('未录到音频，请重试'); return }
        if (activeUrl) URL.revokeObjectURL(activeUrl)
        activeUrl = URL.createObjectURL(new Blob(chunks, { type: actualType }))
        const format = actualType.includes('mp4') ? 'mp4' : actualType.includes('ogg') ? 'ogg' : 'webm'
        recordingCompleted.value = true
        logger.info('[recorder-browser] ready', { duration, format, chunks: chunks.length })
        options.onAudioReady({ tempFilePath: activeUrl, duration, format })
      }
      recorder.onerror = () => { ++generation; release(); finishing.value = false; starting.value = false; isRecording.value = false; options.onError?.('录音失败，请检查麦克风后重试') }
      let analyser: AnalyserNode | null = null
      try {
        const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (AudioCtor) { context = new AudioCtor(); void context.resume(); analyser = context.createAnalyser(); analyser.fftSize = 256; context.createMediaStreamSource(acquired).connect(analyser) }
      } catch { /* iOS音量分析不可用时，录音本身继续 */ }
      recorder.start(250); started = Date.now(); spoken = false; silentFor = 0
      recordingTime.value = 0; isRecording.value = true
      timer = setInterval(() => {
        recordingTime.value = Math.floor((Date.now() - started) / 1000)
        if (analyser && recordingTime.value > 3) {
          const data = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(data)
          const rms = Math.sqrt(data.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / data.length)
          if (rms > .05) { spoken = true; silentFor = 0 } else if (spoken) silentFor++
          if (silentFor >= 30) { stopRecording(); options.onError?.('已检测到长时间静音，录音自动停止') }
        }
        if (recordingTime.value >= 300) stopRecording()
      }, 1000)
    } catch (error) {
      if (run !== generation || disposed) return
      release(); isRecording.value = false
      const name = error instanceof Error ? error.name : ''
      const message = name === 'NotAllowedError' ? '麦克风权限被拒绝，请在浏览器设置中允许' : name === 'NotFoundError' ? '未检测到麦克风设备' : name === 'NotReadableError' ? '麦克风正被其他应用占用，请关闭后重试' : error instanceof Error && (error.message.startsWith('录音需要 HTTPS') || !/[a-zA-Z]{4,}/.test(error.message)) ? error.message : '启动录音失败，请检查浏览器和麦克风权限'
      logger.warn('[recorder-browser] failed', { name, message }); options.onError?.(message)
    } finally { if (run === generation) starting.value = false }
  }
  onUnmounted(() => { disposed = true; ++generation; if (recorder?.state === 'recording') { finishing.value = true; recorder.stop() }; release(); if (activeUrl) URL.revokeObjectURL(activeUrl) })
  return { isRecording, recordingTime, recordingCompleted, starting, finishing, formatRecordingTime, startRecording, stopRecording }
}
