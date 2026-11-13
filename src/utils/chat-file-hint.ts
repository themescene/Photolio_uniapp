/**
 * 「从聊天文件选原图」使用引导 modal（2026-07-23 hotfix12）
 *
 * 背景：用户实测反馈相册模式点「从聊天文件选」显示"无内容"。
 * 根因不是 bug —— `wx.chooseMessageFile` 打开的是"你的微信聊天里作为文件发过/收过的文件"，
 * 不是手机相册。新账号或从未把照片作为文件发送过的账号，选择器就是空的。
 *
 * 修法：第一次使用前弹一个步骤引导 modal，用户看懂后再打开选择器；
 * 看过一次就写 storage，之后不再弹（用户可通过清缓存重置）。
 *
 * 用法：
 *   const ok = await explainChatFileSourceOnce();
 *   if (!ok) return;   // 用户取消 = 直接放弃这次选择
 *   uni.chooseMessageFile({...});
 */
import { STORAGE_KEYS } from "@/config/env";

export function explainChatFileSourceOnce(): Promise<boolean> {
  return new Promise((resolve) => {
    let seen = false;
    try {
      seen = !!uni.getStorageSync(STORAGE_KEYS.CHAT_FILE_HINT_SEEN);
    } catch { /* ignore */ }
    if (seen) return resolve(true);

    uni.showModal({
      title: "如何选择原图 / 视频",
      // 微信 modal 的 content 会自动换行；用 \n 分段
      content:
        "「聊天文件」= 你在微信聊天里作为「文件」发过或收过的内容，不是手机相册。\n\n" +
        "若列表为空或找不到，请先：\n" +
        "① 打开微信 →「文件传输助手」\n" +
        "② 长按你要传的照片 / 视频 → 选「以文件发送」\n" +
        "③ 回到本页面点「已发送」\n\n" +
        "这样上传的图片会保留原始分辨率和 EXIF 信息。",
      confirmText: "已发送",
      cancelText: "取消",
      success: (r) => {
        if (r.confirm) {
          try { uni.setStorageSync(STORAGE_KEYS.CHAT_FILE_HINT_SEEN, "1"); } catch { /* ignore */ }
          resolve(true);
        } else {
          resolve(false);
        }
      },
      fail: () => resolve(false),
    });
  });
}
