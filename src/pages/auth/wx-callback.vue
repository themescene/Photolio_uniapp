<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * H5 微信扫码登录回调页（2026-07-24 hotfix12e）
 *
 * 流程：
 * 1. login.vue 跳 open.weixin.qq.com/connect/qrconnect?state=<csrf>&redirect_uri=<本页>
 * 2. 用户扫码同意 → 微信跳回本页 URL：`?code=<code>&state=<state>` （hash router 里带 query）
 * 3. 本页 onLoad 取 code + state → 校验 state 匹配 sessionStorage → POST /api/auth/wx-oauth-callback
 * 4. 拿到 token → 走 authStore.applyLoginResponse → 跳主页（is_new 时引导绑定旧账号）
 *
 * 失败态：token 未换到 / state 不匹配 / 用户取消（微信跳回不带 code）→ 显示错误 + 返登录
 */
import { ref, onMounted } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { useAuthStore } from "@/stores/auth";
import { wxOauthCallback } from "@/api/auth";
import { ApiError } from "@/api/request";
import { logger } from "@/utils/logger";

const auth = useAuthStore();

const state = ref<"exchanging" | "ok" | "error">("exchanging");
const errorMsg = ref("");

onLoad((opt) => {
  const code = (opt as { code?: string })?.code || "";
  const stateParam = (opt as { state?: string })?.state || "";
  logger.info('[wx-callback] onLoad', { hasCode: !!code, hasState: !!stateParam });
  if (!code) {
    _fail("未收到微信授权 code（用户可能取消了扫码）");
    return;
  }
  // 校验 state 匹配（防 CSRF）
  let expected = "";
  try {
    // #ifdef H5
    expected = (globalThis as unknown as { sessionStorage?: Storage })
      .sessionStorage?.getItem('_wx_oauth_state') || "";
    // #endif
  } catch { /* ignore */ }
  if (expected && stateParam && expected !== stateParam) {
    _fail("state 不匹配，可能是安全问题，请重新扫码");
    return;
  }
  _exchange(code);
});

async function _exchange(code: string) {
  try {
    const res = await wxOauthCallback(code);
    if (!res?.token) throw new Error("未拿到 token");
    // 复用 authStore 的应用 login 结果逻辑
    await auth.applyLoginResponse(res);
    state.value = "ok";
    logger.info('[wx-callback] login success', { user_id: res.user_id, is_new: res.is_new });
    // 清 state
    try {
      // #ifdef H5
      (globalThis as unknown as { sessionStorage?: Storage }).sessionStorage?.removeItem('_wx_oauth_state');
      // #endif
    } catch { /* ignore */ }
    // is_new 时引导绑定旧账号
    if (res.is_new) {
      // 2026-09-14：这里的文案必须说实话。
      //
      // is_new=true 只有一种成因值得解释：用户在**小程序绑进开放平台之前**就用过小程序，
      // 那个老账号里没有 wx_unionid，服务端此刻没有任何依据认出"这是同一个人"。
      //
      // 好消息是这个状态会自愈：他下次打开小程序登录一次，后端拿到 openid 命中老账号、
      // 回填 unionid 时会发现这个 unionid 已属于本次新建的网页账号 → 自动合并
      // （AuthService._adopt_unionid）。用户零操作。
      //
      // 所以文案的主推荐是"去开一下小程序"，而不是让他手工绑什么 ——
      // 早先那版写的是"绑定旧账号(用户名+密码)"，但小程序用户**根本没有密码**，
      // 点进去只会卡住。
      uni.showModal({
        title: "以前用过画匣子吗？",
        content:
          "如果你在微信小程序里用过，只要再打开一次小程序登录，两边会自动合并，" +
          "你的画匣子和合集就都会出现在这里，不用手动操作。\n\n" +
          "用过旧网页版（有用户名密码）的话，可以到「我的 → 账号设置」绑定。",
        confirmText: "知道了",
        cancelText: "去账号设置",
        success: (r) => {
          if (r.cancel) {
            uni.redirectTo({ url: "/pages/account/settings" });
          } else {
            uni.reLaunch({ url: "/pages/index/index" });
          }
        },
      });
    } else {
      setTimeout(() => uni.reLaunch({ url: "/pages/index/index" }), 500);
    }
  } catch (e) {
    logger.warn('[wx-callback] exchange failed', e);
    _fail(e instanceof ApiError ? e.message : (e instanceof Error ? e.message : "登录失败"));
  }
}

function _fail(msg: string) {
  state.value = "error";
  errorMsg.value = msg;
}

function goLogin() {
  uni.redirectTo({ url: "/pages/auth/login" });
}

onMounted(() => {
  try { uni.hideTabBar({ animation: false, fail: () => {} }); } catch { /* ignore */ }
});
</script>

<template>
  <view class="page">
    <view v-if="state === 'exchanging'" class="state">
      <view class="spinner" />
      <text class="state-title">{{ uiText("正在登录…") }}</text>
      <text class="state-sub">{{ uiText("用微信授权码换取账号中，请稍候") }}</text>
    </view>
    <view v-else-if="state === 'ok'" class="state">
      <text class="state-title">{{ uiText("登录成功") }}</text>
      <text class="state-sub">{{ uiText("正在跳转…") }}</text>
    </view>
    <view v-else class="state">
      <text class="state-title state-err">{{ uiText("登录失败") }}</text>
      <text class="state-sub">{{ uiText(errorMsg) }}</text>
      <view class="btn btn-primary" @click="goLogin"><text>{{ uiText("返回登录页") }}</text></view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.page {
  min-height: 100vh;
  background: t.$color-bg;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: t.$spacing-5;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: t.$spacing-3;
  text-align: center;
}
.state-title {
  font-size: t.$font-lg;
  font-weight: t.$weight-bold;
  color: t.$color-text;
}
.state-title.state-err { color: t.$color-danger; }
.state-sub {
  font-size: t.$font-sm;
  color: t.$color-text-soft;
  max-width: 480rpx;
  line-height: 1.6;
}

.spinner {
  width: 56rpx;
  height: 56rpx;
  border: 4rpx solid t.$color-border;
  border-top-color: t.$color-accent;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.btn {
  margin-top: t.$spacing-4;
  height: 80rpx;
  padding: 0 t.$spacing-5;
  border-radius: 999rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: t.$font-sm;
}
.btn.btn-primary {
  background: t.$color-accent;
  color: t.$color-text-invert;
}
</style>
