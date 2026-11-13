/**
 * 隐私接口 preflight 帮手（2026-07-19 抽公共）
 *
 * 微信从基础库 2.32.3 起把 `chooseMessageFile` / `setClipboardData` /
 * `getRecorderManager` 等接入「隐私接口」名单。首次调用前必须走
 * `wx.requirePrivacyAuthorize`，否则直接报 `errno 112 / api scope is not declared`。
 *
 * 调用前提：
 *   - 小程序管理后台 → 设置 → 用户隐私保护指引 → 已声明对应「信息类型」
 *     （聊天文件 / 剪贴板信息 / 麦克风 / 相册 / 摄像头 等）
 *   - 后台未声明的接口，即使 preflight 通过，wx API 仍会返 scope 错
 *
 * 使用：
 *   const ok = await ensurePrivacyAuthorized();
 *   if (!ok) return uni.showToast({ title: "需先同意隐私协议", icon: "none" });
 *   uni.chooseMessageFile({...});
 */
type MpWx = {
  requirePrivacyAuthorize?: (opts: {
    success?: () => void;
    fail?: (err: unknown) => void;
    complete?: () => void;
  }) => void;
  getPrivacySetting?: (opts: {
    success: (r: { needAuthorization: boolean }) => void;
    fail: () => void;
  }) => void;
};

export function ensurePrivacyAuthorized(): Promise<boolean> {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    const g = globalThis as unknown as { wx?: MpWx };
    const w = g.wx;
    if (!w?.requirePrivacyAuthorize) {
      // 老基础库无此 API，直接放行让底层 API 自己抛
      return resolve(true);
    }
    if (w.getPrivacySetting) {
      w.getPrivacySetting({
        success: (r) => {
          if (!r.needAuthorization) return resolve(true);
          w.requirePrivacyAuthorize!({
            success: () => resolve(true),
            fail: () => resolve(false),
          });
        },
        fail: () => {
          // fallback：直接尝试授权对话
          w.requirePrivacyAuthorize!({
            success: () => resolve(true),
            fail: () => resolve(false),
          });
        },
      });
      return;
    }
    w.requirePrivacyAuthorize({
      success: () => resolve(true),
      fail: () => resolve(false),
    });
    return;
    // #endif
    // #ifndef MP-WEIXIN
    resolve(true);
    // #endif
  });
}
