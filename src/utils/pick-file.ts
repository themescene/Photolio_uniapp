// 参考：annualreport/src/views/NfcLandingView.vue；同一文件选择器供NFC和录音编辑使用。
import { ensurePrivacyAuthorized } from './privacy'
export interface PickedFile { path: string; name: string; size: number }
export async function pickLocalFile(kind: 'audio' | 'all'): Promise<PickedFile | null> {
  if (!await ensurePrivacyAuthorized()) throw new Error('需要先同意隐私协议才能选择文件')
  // #ifdef H5
  return new Promise((resolve, reject) => uni.chooseFile({ count: 1, type: 'all',
    extension: kind === 'audio' ? ['.mp3', '.m4a', '.mp4', '.webm', '.wav', '.ogg', '.flac'] : undefined,
    success: result => { const file = (Array.isArray(result.tempFiles) ? result.tempFiles[0] : result.tempFiles) as File & { path?: string }; resolve(file?.path ? { path: file.path, name: file.name, size: file.size } : null) },
    fail: error => /cancel/i.test(error.errMsg || '') ? resolve(null) : reject(new Error('选择文件失败，请重试')),
  }))
  // #endif
  // #ifndef H5
  return new Promise((resolve, reject) => uni.chooseMessageFile({ count: 1, type: 'file',
    extension: kind === 'audio' ? ['mp3', 'm4a', 'mp4', 'webm', 'wav', 'ogg', 'flac'] : undefined,
    success: result => { const file = result.tempFiles[0]; resolve(file?.path ? { path: file.path, name: file.name || '', size: file.size || 0 } : null) },
    fail: error => /cancel/i.test(error.errMsg || '') ? resolve(null) : reject(new Error('无法选择文件，请检查文件权限后重试')),
  }))
  // #endif
}
