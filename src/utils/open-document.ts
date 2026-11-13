// 参考：annualreport/src/views/NfcFileDownloadView.vue；原NFC落地页的真名打开逻辑共用。
import { logger } from '@/utils/logger'
export function openRemoteDocument(url: string, realName: string, onFailure: () => void) {
  // #ifdef H5
  window.open(url, '_blank', 'noopener,noreferrer')
  // noopener可能返回null，即使窗口已打开；保留页面上的复制入口作兜底。
  return
  // #endif
  // #ifndef H5
  uni.showLoading({ title: '正在打开文件…', mask: true })
  uni.downloadFile({ url, success: result => {
    uni.hideLoading()
    if (result.statusCode !== 200) { onFailure(); return }
    openWithRealName(result.tempFilePath, realName, onFailure)
  }, fail: () => { uni.hideLoading(); onFailure() } })
  // #endif
}
function openWithRealName(tempFilePath: string, realName: string, onFailure: () => void) {
  // 真名兜底：解析不出就退化到 tempFilePath 原名
  const clean = (realName || "").replace(/[/\\:*?"<>|]/g, "_").trim();
  if (!clean) {
    uni.openDocument({ filePath: tempFilePath, showMenu: true, fail: () => onFailure() });
    return;
  }
  try {
    const fs = uni.getFileSystemManager();
    // uni.env.USER_DATA_PATH 是 uni-app 统一的用户数据目录（mp-weixin 下映射 wx.env.USER_DATA_PATH）
    // 类型定义里没有这个字段，用显式窄类型访问
    const userDataPath = (uni as unknown as { env?: { USER_DATA_PATH?: string } }).env?.USER_DATA_PATH || "";
    if (!userDataPath) {
      uni.openDocument({ filePath: tempFilePath, showMenu: true, fail: () => onFailure() });
      return;
    }
    const destPath = `${userDataPath}/${clean}`;
    // 先尝试删除同名旧文件（避免 copyFile 因文件存在失败）；忽略"文件不存在"报错
    try { fs.unlinkSync(destPath); } catch { /* not exist, ignore */ }
    fs.copyFile({
      srcPath: tempFilePath,
      destPath,
      success: () => {
        uni.openDocument({ filePath: destPath, showMenu: true, fail: () => onFailure() });
      },
      fail: (err) => {
        logger.warn("[nfc] copyFile fail, fallback to temp path", err);
        uni.openDocument({ filePath: tempFilePath, showMenu: true, fail: () => onFailure() });
      },
    });
  } catch (e) {
    logger.warn("[nfc] rename before openDocument failed", e);
    uni.openDocument({ filePath: tempFilePath, showMenu: true, fail: () => onFailure() });
  }
}
