<script setup lang="ts">
import { onLaunch, onShow } from "@dcloudio/uni-app";
import { useAuthStore } from "@/stores/auth";
import { NFC_QUERY_KEY } from "@/config/env";
import { logger } from "@/utils/logger";
// #ifdef H5
import { exchangeCode } from "@/api/auth";
// #endif

/**
 * 应用入口：
 * 1. 解析启动参数里的 NFC UID（来自微信 URL Link query）
 *    → redirect 到 /pages/nfc/landing?uid=<UID>
 * 2. 如有持久化 token，启动时悄悄拉一次 /api/auth/me 刷新用户态
 *
 * 注意：onLaunch 后 onShow 也会触发一次，必须去重；
 * 否则会触发两次 redirectTo，导致 WeChat 内部一个会 timeout（无影响但污染控制台）。
 */

// 2026-08-08 hotfix14：dedupe 加时间窗口（3s）。
// 老版是「module-level 永久 dedupe」→ 用户第二次扫同一个二维码/NFC 卡时，
// 小程序还在运行，onShow 命中「code === lastHandled」→ 不 redirect →
// 用户看到还是上次退出前的页面，感觉"扫码卡死"。
// 时间窗口足够拦掉 onLaunch/onShow 的同次启动双触发（几十 ms 间隔），
// 但允许用户主动几秒后再次扫码合法触发。
let lastHandledUid: string | null = null;
let lastHandledUidAt = 0;
let lastHandledStorageCode: string | null = null;
let lastHandledStorageCodeAt = 0;
const DEDUPE_WINDOW_MS = 3000;

function tryHandleStorageEntry(
  query: Record<string, string> | undefined,
  path?: string,
): boolean {
  // 存储扩容 URL Link：backend 生成的 URL Link path=/pages/storage/redeem query=code=xxx
  // 小程序 onLaunch/onShow 拿到的 query 里带 code；本函数把它 redirect 到兑换页
  if (!query) return false;

  // 2026-09-14：**参数名撞车**。微信网站应用扫码登录回跳的地址是
  //   /pages/auth/wx-callback?code=<OAuth code>&state=<csrf>
  // OAuth 的 code 是 32 位字母数字，正好落进下面那条 {6,32} 正则 →
  // 扫码登录时这里误判成"兑换扩容包"，redirectTo 兑换页闪一下再被 callback 页顶掉。
  // 用户实测日志：`[app] 存储扩容入口检测到 code: 081D5ull2K4Upi4yh4nl2bB4HU2D5ult`
  //
  // 两道闸：① 落地页是 auth/wx-callback 一律不认（最强判据）
  //        ② 带 state 的一律不认 —— state 是 OAuth 的 CSRF 参数，
  //           扩容 URL Link 从来不带它
  if (path && path.indexOf("auth/wx-callback") >= 0) return false;
  if (query["state"]) return false;

  const code = query["code"];
  if (!code) return false;
  if (!/^[A-Za-z0-9_\-]{6,32}$/.test(code)) return false;
  const now = Date.now();
  if (code === lastHandledStorageCode && now - lastHandledStorageCodeAt < DEDUPE_WINDOW_MS) {
    return true;   // onLaunch/onShow 同次启动的双触发去重
  }
  lastHandledStorageCode = code;
  lastHandledStorageCodeAt = now;
  logger.info("[app] 存储扩容入口检测到 code:", code);
  uni.redirectTo({
    url: `/pages/storage/redeem?code=${encodeURIComponent(code)}`,
  });
  return true;
}

function tryHandleNfcEntry(query: Record<string, string> | undefined): boolean {
  if (!query) return false;
  const uid = query[NFC_QUERY_KEY] || query["q"];
  if (!uid) return false;
  // hotfix6：放宽到任意 14 位 hex —— 之前硬性要求 04 开头把非 NXP 芯片全挡了。
  // 真正的问题是 UID Mirroring 是否生效（这由芯片型号决定），格式校验只做长度即可。
  // 命中 00000000000000 说明 NFC 芯片的 UID Mirroring 没工作，后续在 landing 页给专门提示。
  if (!/^[0-9A-Fa-f]{14}$/.test(uid)) {
    logger.warn("[app] NFC uid 格式不合法，忽略:", uid);
    return false;
  }
  const now = Date.now();
  if (uid === lastHandledUid && now - lastHandledUidAt < DEDUPE_WINDOW_MS) {
    return true;   // 同次启动的 onLaunch/onShow 双触发；用户几秒后再次贴卡应正常触发
  }
  lastHandledUid = uid;
  lastHandledUidAt = now;
  logger.info("[app] NFC 入口检测到 uid:", uid);
  uni.redirectTo({
    url: `/pages/nfc/landing?uid=${encodeURIComponent(uid)}`,
  });
  return true;
}

// 2026-09-25：H5 全局无感登录 —— URL 带 ?exchange_code=xxx 时（不管落在哪个 hash 路由），
// 从 mp-weixin 生成的一次性 code 换 token 并写入 auth store，然后清 URL 里的 code。
// 场景：mp 相册模式底部"想去完整网页版"入口生成 QR/复制链接，用户到浏览器打开 → 免手机号登录。
async function _tryH5AutoLogin(): Promise<boolean> {
  // #ifdef H5
  const w = globalThis as unknown as {
    location?: { search?: string; pathname?: string; hash?: string };
    history?: { replaceState?: (a: unknown, b: string, c: string) => void };
  };
  const search = w.location?.search || "";
  if (!search) return false;
  const params = new URLSearchParams(search);
  const code = params.get("exchange_code");
  if (!code) return false;
  try {
    const res = await exchangeCode(code);
    const auth = useAuthStore();
    await auth.applyLoginResponse(res);
    logger.info("[app] H5 exchange_code 无感登录成功", { userId: res.user_id });
    // 清 URL 里的 exchange_code + scene，避免刷新时 code 已消费失败
    params.delete("exchange_code");
    params.delete("scene");
    const cleanSearch = params.toString() ? "?" + params.toString() : "";
    const cleanUrl = (w.location?.pathname || "/") + cleanSearch + (w.location?.hash || "");
    w.history?.replaceState?.(null, "", cleanUrl);
    return true;
  } catch (e) {
    logger.warn("[app] H5 exchange_code 无感登录失败", e);
    return false;
  }
  // #endif
  return false;
}

onLaunch(async (options) => {
  logger.info("[app] onLaunch", options);
  // 提前 hideTabBar：pages.json 里保留了原生 tabBar（switchTab 依赖 list），但视觉靠
  // CustomTabBar 组件。原生 tabBar 在首屏首次渲染时会 flash 一下 PNG 图标 —
  // 这里在 onLaunch 就 hide 一次，加上 tabbar/*.png 已改成透明像素，flash 不可见
  try { uni.hideTabBar({ animation: false, fail: () => {} }); } catch { /* ignore */ }

  // 2026-07-25：从根源移除 vConsole。以后统一用微信开发者工具"真机调试"看日志。
  // 每次启动都显式 setEnableDebug(false)，覆盖任何历史开启的持久状态
  // （早期扫过 dev 二维码的用户 / 体验版默认开 / 管理后台调试开关 → 全部关掉）。
  // #ifdef MP-WEIXIN
  try {
    const _wxDbg = (wx as unknown as { setEnableDebug?: (o: { enableDebug: boolean }) => void });
    _wxDbg.setEnableDebug?.({ enableDebug: false });
  } catch { /* ignore */ }
  // #endif

  // H5 无感登录（如 URL 带 exchange_code）—— 抢在 refreshMe 前完成 token 写入
  const autoLoggedIn = await _tryH5AutoLogin();

  const q = options?.query as Record<string, string>;
  const handled = tryHandleStorageEntry(q, options?.path) || tryHandleNfcEntry(q);

  const auth = useAuthStore();
  // 个人空间可匿名阅读；失效的历史token不能通过全局refresh把访客送到登录页。
  let publicPersonalPage = false;
  // #ifdef H5
  publicPersonalPage = options?.path === "pages/personal/index";
  // #endif
  if (auth.token && !handled && !autoLoggedIn && !publicPersonalPage) {
    auth.refreshMe();
  }
});

onShow((options) => {
  const q = options?.query as Record<string, string>;
  if (!tryHandleStorageEntry(q, options?.path)) tryHandleNfcEntry(q);
});
</script>

<style lang="scss">
/* 引入全局 tokens —— App.vue 的 <style> 不带 scoped 是 uniapp 全局样式入口 */
@use "@/styles/tokens.scss";

page {
  background-color: var(--color-bg);
  color: var(--color-text);
  font-size: 30rpx;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif;
}

/*
 * 全局 button 复位 —— mp-weixin 原生 <button> 有以下问题，会导致排版混乱：
 *   - 默认 ::after 一道 1px 边线，width:100% + 内 padding 时会撑出容器
 *   - 默认 min-width: 184px，窄屏时强行撑宽
 *   - 默认 line-height 跟 height 不同步，看起来文字偏移
 *   - 长按会变 hover 灰
 * 这里抹平为可控的盒子元素，业务再叠 .btn-primary / .btn-ghost 等样式。
 */
button {
  box-sizing: border-box;
  min-width: 0;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  line-height: inherit;
  font-size: inherit;
  color: inherit;
  text-align: center;
  overflow: visible;
}
button::after {
  border: none !important;
}

/*
 * 2026-07-23 hotfix12c：H5 桌面浏览器最大宽度限制。
 *
 * 首版只锁了 uni-page 主内容框（自己写 CSS），但 CustomTabBar / actions-bar / overlay 等
 * `position: fixed` 元素依然铺满浏览器 —— 用户 1920 宽屏底栏贯穿全屏，5 个 tab 挤出巨大空隙。
 *
 * hotfix12c 换成 uni-app 官方方案：[manifest.json h5.maxWidth: 480]
 *   - uni-app 编译期给整个 <uni-app> 加 `uni-app--maxwidth` class + inline style: max-width: 480px
 *   - 所有 fixed 元素（tab-bar / actions-bar / overlay 等）自动被官方 CSS 约束到内容框宽度
 *   - 不用挨个改各组件 scoped 样式
 *
 * 这里额外加：宽屏时露出的外围背景色，避免视觉空旷。
 */
/* #ifdef H5 */
html, body, #app {
  /* 2026-09-14 用户决策：去掉左右灰边，整屏同色。
     原来外围写死 #EDE5D9 想跟 480 版心做"分隔感"，实际观感是
     "左右两侧颜色不一样 / 像有个边框"。改成跟版心同一个背景 token，
     顺带跟着暗色主题走（写死的 #EDE5D9 在暗色下是错的）。 */
  background: var(--color-bg);
  min-height: 100vh;
}

/* 2026-07-23 hotfix12d：pages.json h5.titleNView=false 隐藏了原生导航栏 →
   页面内容会直接贴到窗口顶部（用户反馈"顶太挤"）。给 page-body 加统一 top padding
   保证第一屏内容与顶部有呼吸空间。iPhone 有 safe-area 时也会加上刘海高度。 */
uni-page-body {
  padding-top: calc(env(safe-area-inset-top) + 32px);
}

/* ═══════════════════════════════════════════════════════════════════════════
   2026-09-15 v5 · 对齐契约（单一真源）
   ═══════════════════════════════════════════════════════════════════════════
   历史教训：alignment 曾经散在 8+ 处（pages.json maxWidth / App.vue 全局 /
   CustomTabBar scoped / H5BackFab @media / share/play back-fab @media /
   每页 .container padding / 每页 topbar padding），任意一处偏离 → 视觉错位。
   四轮"追页"没修好，用户在这一轮拍板：**回到根因层做单一真源**。

   契约：任何 fixed 元素、任何页面的 topbar padding 都**只能**从这两条 var 派生：
     --doc-max-width  版心最大宽度（默认 700px，跟 pages.json maxWidth 一致）
     --doc-pad-x      版心内容左右 padding（默认 32rpx = t.$spacing-4，跟每页 .container / .topbar 一致）

   派生量：
     居中 fixed 条（tab-bar / ctrl-fixed / actions-bar 等）
        max-width = calc(var(--doc-max-width) - 2 * var(--doc-pad-x))
     角落 fixed 钮（back-fab / h5-back-fab / top-corner-actions 等）
        left/right = max(var(--doc-pad-x), calc((100vw - var(--doc-max-width)) / 2 + var(--doc-pad-x)))
        （视口窄于版心时退到 doc-pad-x = 32rpx；视口宽于版心时贴版心内缘）

   下次改宽度 / padding，只改这两条 var，全部同步。
   禁止在任何组件里硬编码 700 / 480 / 350 / 240 / 32rpx / 20rpx / 8rpx 之类的对齐魔数。
   ═══════════════════════════════════════════════════════════════════════════ */
:root {
  --doc-max-width: 700px;
  --doc-pad-x: 32rpx;
  /* 派生量：一行改动全局同步 */
  --doc-inner-width: calc(var(--doc-max-width) - 2 * var(--doc-pad-x));
  --doc-inner-left: max(var(--doc-pad-x), calc((100vw - var(--doc-max-width)) / 2 + var(--doc-pad-x)));
  --doc-inner-right: max(var(--doc-pad-x), calc((100vw - var(--doc-max-width)) / 2 + var(--doc-pad-x)));
}

/* 居中 fixed 条：宽度 = 版心内容可见宽度（与卡片可见边严格对齐） */
.tab-bar,
.actions-bar,
.ctrl-fixed,
.selection-bar,
.comments-drawer,
.overlay,
.modal-backdrop,
.sheet-backdrop,
.video-fullscreen,
.next-btn-fixed,
.append-progress-fixed {
  left: 50% !important;
  right: auto !important;
  transform: translateX(-50%) !important;
  width: 100% !important;
  max-width: var(--doc-inner-width) !important;
  box-sizing: border-box;
}
/* 2026-09-16：`.chapter-fab-wrap` 之前误纳入居中长条名单 → 被拉成横条，1/2 pill 撑满一行。
   它是右下角小浮 fab，位置由其组件 scoped CSS 自管（right: 24rpx）。 */

/* 角落 fixed 钮：贴版心内缘（左/右）。视口窄于版心时退 --doc-pad-x。
   .back-fab（share/play 悬浮返回）、.h5-back-fab（子页悬浮返回）都命中。 */
.back-fab,
.h5-back-fab {
  left: var(--doc-inner-left) !important;
}
/* .top-corner-actions（index 首页右上关于/旧版）—— 由页内自己布局，此处不覆盖 */

/* 2026-09-14：uni-h5 的 actionSheet 底部没算安全区，最后一项（「删除」）几乎贴屏幕边，
   在带手势条的设备上会被系统条压住。给菜单列表补一段底部内边距。 */
uni-actionsheet .uni-actionsheet__menu,
.uni-actionsheet__menu {
  padding-bottom: calc(env(safe-area-inset-bottom) + 8px);
}
uni-actionsheet .uni-actionsheet__cell,
.uni-actionsheet__cell {
  line-height: 1.6;
  padding-top: 12px;
  padding-bottom: 12px;
}
/* #endif */
</style>
