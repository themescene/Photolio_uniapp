/**
 * 媒体本地缓存（2026-07-13 用户明确要求）
 *
 * 场景：
 *   用户在小程序内选了一批图/视频上传成相册。选中时手机里有 tempFilePath，
 *   上传后拿到远端 URL。之后每次进入相册页，App 都会去 CDN 拉图 —— 用户反馈"加载超级慢"。
 *
 * 想法：
 *   把本机选中过的 tempFilePath 用 uni.saveFile() 保存到微信小程序的持久化沙盒里
 *   （wxfile://store_xxx，跨会话保留，直到用户清理小程序缓存或换设备）。
 *   下次页面渲染时，若 remoteUrl 有本地缓存，直接用本地路径。
 *
 * 实现：
 *   - 映射存 uni.setStorage：`{ [remoteUrl]: savedFilePath }`
 *   - saveAfterUpload(remoteUrl, tempFilePath) — 上传成功后调，把本地图存到 wxfile://
 *   - resolve(remoteUrl) — 页面渲染前调，返回本地 savedFilePath 或原 remoteUrl
 *   - 兜底：uni.saveFile 失败（磁盘满 / API 不可用）静默 fallback 到远端 URL
 *
 * 限制：
 *   - uni.saveFile 在 mp-weixin 上有 10MB 总配额（跨小程序）；超限会清老文件
 *   - H5 / 其它端 fallback：不缓存，直接返回 remoteUrl
 */
import { logger } from "./logger";

const CACHE_KEY = "photolio_media_cache_v1";

interface CacheMap {
  [remoteUrl: string]: string;   // savedFilePath (wxfile://...)
}

function _read(): CacheMap {
  try {
    const raw = uni.getStorageSync(CACHE_KEY);
    if (!raw) return {};
    if (typeof raw === "string") return JSON.parse(raw);
    if (typeof raw === "object") return raw as CacheMap;
    return {};
  } catch {
    return {};
  }
}

function _write(m: CacheMap) {
  try {
    uni.setStorageSync(CACHE_KEY, m);
  } catch (e) {
    logger.warn("[media-cache] write map failed", e);
  }
}

/**
 * 上传成功后把 tempFilePath 保存到本地持久沙盒
 * @returns 保存后的 wxfile:// 路径（或原 tempFilePath 若失败）
 *
 * 2026-07-14：uni.saveFile 已被微信标为「即将废弃，请使用 getFileSystemManager().saveFile」
 * mp-weixin 走 fsm，其他端 fallback 到 uni.saveFile
 */
export function saveAfterUpload(remoteUrl: string, tempFilePath: string): Promise<string> {
  if (!remoteUrl || !tempFilePath) return Promise.resolve(tempFilePath);
  // 已缓存过就跳过（避免重复写占配额）
  const map = _read();
  if (map[remoteUrl]) return Promise.resolve(map[remoteUrl]);

  return new Promise((resolve) => {
    try {
      // #ifdef MP-WEIXIN
      const fsm = (wx as unknown as { getFileSystemManager?: () => {
        saveFile: (opts: { tempFilePath: string; success: (r: { savedFilePath: string }) => void; fail: (e: unknown) => void }) => void;
      } }).getFileSystemManager?.();
      if (fsm && typeof fsm.saveFile === "function") {
        fsm.saveFile({
          tempFilePath,
          success: (r) => {
            const saved = r.savedFilePath || tempFilePath;
            const m2 = _read();
            m2[remoteUrl] = saved;
            _write(m2);
            logger.info("[media-cache] saved (fsm)", { remoteUrl: remoteUrl.slice(-40), saved });
            resolve(saved);
          },
          fail: (e) => {
            logger.warn("[media-cache] fsm.saveFile failed, keep temp", e);
            resolve(tempFilePath);
          },
        });
        return;
      }
      // #endif

      // 其它端（H5 / App）保留 uni.saveFile；uni-app 会内部走 platform 兼容路径
      uni.saveFile({
        tempFilePath,
        success: (r) => {
          const saved = (r as { savedFilePath?: string })?.savedFilePath || tempFilePath;
          const m2 = _read();
          m2[remoteUrl] = saved;
          _write(m2);
          logger.info("[media-cache] saved (uni)", { remoteUrl: remoteUrl.slice(-40), saved });
          resolve(saved);
        },
        fail: (e) => {
          logger.warn("[media-cache] uni.saveFile failed, keep temp", e);
          resolve(tempFilePath);
        },
      });
    } catch (e) {
      logger.warn("[media-cache] saveAfterUpload exception", e);
      resolve(tempFilePath);
    }
  });
}

/**
 * 页面渲染前调用：如有本地缓存返回本地路径，否则返回远端
 * 同步方法 —— 页面 template 里 map() 需要立刻拿到值
 */
export function resolve(remoteUrl: string): string {
  if (!remoteUrl) return remoteUrl;
  const map = _read();
  const local = map[remoteUrl];
  if (local) return local;
  return remoteUrl;
}

/**
 * 反向查询：给一个 tempFilePath，问它上传后的 remoteUrl 是什么。
 * 目前不 index temp→remote 方向；调用方自己在业务层记 tempFilePath → item.imageUrl 映射即可。
 * 这里只做单向 remote→local 加速。
 */

/**
 * 清理某条缓存（用户删了这张图的时候）
 * 2026-07-14：removeSavedFile 也走 fsm；uni.removeSavedFile 同样标为废弃
 */
function _removeSavedFilePath(savedFilePath: string) {
  try {
    // #ifdef MP-WEIXIN
    const fsm = (wx as unknown as { getFileSystemManager?: () => {
      removeSavedFile?: (opts: { filePath: string; fail?: (e: unknown) => void }) => void;
    } }).getFileSystemManager?.();
    if (fsm && typeof fsm.removeSavedFile === "function") {
      fsm.removeSavedFile({ filePath: savedFilePath, fail: () => { /* ignore */ } });
      return;
    }
    // #endif
    (uni as unknown as { removeSavedFile?: (opts: { filePath: string }) => void }).removeSavedFile?.({
      filePath: savedFilePath,
    });
  } catch { /* ignore */ }
}

export function forget(remoteUrl: string) {
  const map = _read();
  if (map[remoteUrl]) {
    _removeSavedFilePath(map[remoteUrl]);
    delete map[remoteUrl];
    _write(map);
  }
}

/**
 * 全部清空 —— 用户主动"清缓存"或者用完转账等场景
 */
export function clearAll() {
  const map = _read();
  for (const url of Object.keys(map)) {
    _removeSavedFilePath(map[url]);
  }
  try {
    uni.removeStorageSync(CACHE_KEY);
  } catch { /* ignore */ }
}

export function stats(): { count: number; keys: string[] } {
  const map = _read();
  const keys = Object.keys(map);
  return { count: keys.length, keys };
}
