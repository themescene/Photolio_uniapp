<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 登录页。
 *
 * 主路径（小程序）：微信一键登录 → uni.login() 拿 code → 后端 /api/auth/wx-login 换 token
 * 旁路（H5 / 找回旧账号）：用户名 + 密码登录旧账号
 *
 * 设计原则：
 * - 平台分支用条件编译；按钮 UI 复用统一样式（暂时直接写在本页内，后续抽到 AppButton）
 * - 错误显示用 uni.showToast，不阻塞流程
 */
import { ref, computed } from "vue";
import { useAuthStore } from "@/stores/auth";
import * as authApi from "@/api/auth";
import { ApiError } from "@/api/request";
import { logger } from "@/utils/logger";
import { WX_WEB_APPID, WX_WEB_REDIRECT_URI } from "@/config/env";
import SvgIcon from "@/components/SvgIcon.vue";

const auth = useAuthStore();

const loading = ref(false);
const showLegacy = ref(false);
// "login" = 切换到旧账号登录；"bind" = 把旧账号绑定到当前微信账号（保留 wx 身份）
const legacyMode = ref<"login" | "bind">("login");
const legacyUsername = ref("");
const legacyPassword = ref("");

// 2026-07-24 hotfix12f：手机号登录
const showPhone = ref(false);

/**
 * 2026-09-14：H5 端登录方式要按「打开环境」分流，不能一律给扫码按钮。
 *
 * - 电脑浏览器：`connect/qrconnect` 出大二维码，手机微信扫 → 正解
 * - **微信内置浏览器**：页面已经在微信里了，屏幕上再出一个二维码让他用自己的微信扫
 *   自己的屏幕，扫不了。这条路必须关掉，否则用户点了只会卡在一个扫不动的码上。
 * - 手机浏览器（非微信）：微信不支持从手机浏览器直接唤起 App 授权（那是移动应用
 *   SDK 的能力，网站应用没有）。同样不给扫码，引导走手机号验证码。
 *
 * 判定只用 UA 里的 MicroMessenger / 移动端特征，不做更复杂的探测。
 */
const isWeixinBrowser = ref(false);
const isMobileBrowser = ref(false);
// #ifdef H5
try {
  const ua = (globalThis as unknown as { navigator?: { userAgent?: string } })
    ?.navigator?.userAgent || "";
  isWeixinBrowser.value = /MicroMessenger/i.test(ua);
  isMobileBrowser.value = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
} catch { /* ignore */ }
// #endif

/** 扫码登录只在「电脑浏览器」上有意义 */
const canQrLogin = computed(
  () => !!WX_WEB_APPID && !isWeixinBrowser.value && !isMobileBrowser.value,
);

/** 按钮文案：小程序端是「一键登录」，电脑网页是「扫码登录」，其余保持中性 */
const wxLoginLabel = computed(() => {
  // #ifdef MP-WEIXIN
  return "微信一键登录";
  // #endif
  // #ifndef MP-WEIXIN
  return canQrLogin.value ? "微信扫码登录" : "微信登录";
  // #endif
});
const phoneNumber = ref("");
const phoneCode = ref("");
const phoneSending = ref(false);
const phoneCooldown = ref(0);

// 审核要求：用户必须**主动勾选**才能同意《用户协议》《隐私协议》——不能默认同意/默认勾选。
// 之前的实现写的是「登录即表示同意」（隐式同意）被驳回。这里默认 false，未勾选阻止登录入口。
const legalAgreed = ref(false);

function requireAgreement(): boolean {
  if (legalAgreed.value) return true;
  uni.showToast({
    title: "请先阅读并勾选同意《用户协议》《隐私协议》《声纹授权协议》",
    icon: "none",
    duration: 2500,
  });
  return false;
}

async function onWxLogin() {
  if (loading.value) return;
  if (!requireAgreement()) return;
  loading.value = true;
  try {
    // #ifdef MP-WEIXIN
    const { code } = await uniLogin();
    const res = await auth.loginWithWxCode(code);
    loading.value = false;
    // 关键引导：新建的微信账号八成在网页版有旧账号，主动问一下
    // is_new=true 表示这次微信登录是首次注册，本机数据为空
    if (res?.is_new) {
      uni.showModal({
        title: "你在网页版有账号吗？",
        content: "如果你之前用过画匣子网页版，绑定旧账号即可看到你的全部画匣子和合集。也可以稍后在「我的 → 账号设置」里绑定。",
        confirmText: "立即绑定",
        cancelText: "稍后",
        success: (r) => {
          if (r.confirm) {
            showLegacy.value = true;
            legacyMode.value = "bind";  // 切换到「绑定模式」表单
          } else {
            goHomeAfterLogin();
          }
        },
      });
    } else {
      goHomeAfterLogin();
    }
    // #endif

    // #ifndef MP-WEIXIN
    // H5 端：微信扫码登录（OAuth2 sns qrconnect），2026-07-24 hotfix12e 落地。
    //
    // 只要 [WX_WEB_APPID] 有值就跳；未配置则降级为"引导用旧账号登录"，不阻断。
    // 跳转后微信会在页面上显示大二维码，用户手机微信扫码同意 → 微信跳回 redirect_uri?code=xxx
    // → wx-callback 页面接住 code → POST /api/auth/wx-oauth-callback → 拿 token
    if (!WX_WEB_APPID) {
      uni.showModal({
        title: "网页版扫码登录暂未开放",
        content: "网站应用还在配置中。请用「旧账号登录」；或在手机上用小程序一键登录。",
        showCancel: false,
        confirmText: "去用旧账号登录",
      });
      showLegacy.value = true;
      loading.value = false;
    } else if (isWeixinBrowser.value) {
      // 已经在微信里了，没法自己扫自己 —— 引导走手机号（同一手机号会自动合并账号）
      uni.showModal({
        title: "在微信里打开，用手机号登录更快",
        content:
          "扫码登录需要用另一台设备的微信扫，在微信里打开这个页面时用不了。\n\n" +
          "用手机号验证码登录即可；之后在小程序里绑定同一个手机号，两边就是同一个账号。",
        showCancel: false,
        confirmText: "用手机号登录",
        success: () => { showPhone.value = true; },
      });
      loading.value = false;
    } else if (isMobileBrowser.value) {
      uni.showModal({
        title: "手机浏览器请用手机号登录",
        content:
          "微信的网站应用扫码登录是给电脑浏览器用的，手机浏览器唤不起微信授权。\n\n" +
          "用手机号验证码登录即可；之后在小程序里绑定同一个手机号，两边就是同一个账号。",
        showCancel: false,
        confirmText: "用手机号登录",
        success: () => { showPhone.value = true; },
      });
      loading.value = false;
    } else {
      _redirectToWxQrConnect();
    }
    // #endif
  } catch (e) {
    loading.value = false;
    showError(e, "微信登录失败");
  }
}

// 「绑定模式」：把旧账号绑定到当前微信账号，而不是切换登录
async function onBindLegacy() {
  if (loading.value) return;
  if (!requireAgreement()) return;
  if (!legacyUsername.value || !legacyPassword.value) {
    uni.showToast({ title: "请输入用户名和密码", icon: "none" });
    return;
  }
  loading.value = true;
  try {
    await auth.bindLegacyAction(legacyUsername.value.trim(), legacyPassword.value);
    uni.showToast({ title: "绑定成功", icon: "success" });
    setTimeout(() => goHomeAfterLogin(), 500);
  } catch (e) {
    loading.value = false;
    showError(e, "绑定失败");
  }
}

async function onLegacyLogin() {
  if (loading.value) return;
  if (!requireAgreement()) return;
  if (!legacyUsername.value || !legacyPassword.value) {
    uni.showToast({ title: "请输入用户名和密码", icon: "none" });
    return;
  }
  loading.value = true;
  try {
    await auth.loginWithLegacy(legacyUsername.value.trim(), legacyPassword.value);
    goHomeAfterLogin();
  } catch (e) {
    loading.value = false;
    showError(e, "登录失败");
  }
}

// ================ 手机号登录（2026-07-24 hotfix12f）================

async function onSendPhoneCode() {
  if (!requireAgreement()) return;
  if (!phoneNumber.value || phoneNumber.value.length !== 11) {
    return uni.showToast({ title: "请输入 11 位手机号", icon: "none" });
  }
  phoneSending.value = true;
  try {
    await authApi.sendPhoneCode(phoneNumber.value, "login");
    phoneCooldown.value = 60;
    _startCooldown();
    uni.showToast({ title: "验证码已发送", icon: "success" });
  } catch (e) {
    showError(e, "发送验证码失败");
  } finally {
    phoneSending.value = false;
  }
}

function _startCooldown() {
  const timer = setInterval(() => {
    phoneCooldown.value -= 1;
    if (phoneCooldown.value <= 0) clearInterval(timer);
  }, 1000);
}

async function onPhoneLogin() {
  if (loading.value) return;
  if (!requireAgreement()) return;
  if (!phoneNumber.value || !phoneCode.value) {
    return uni.showToast({ title: "请填写手机号和验证码", icon: "none" });
  }
  loading.value = true;
  try {
    const res = await auth.loginWithPhone(phoneNumber.value.trim(), phoneCode.value.trim());
    if (res?.is_new) {
      // 新用户提示送空间 + 引导绑旧账号
      uni.showToast({ title: "已到账 1GB 存储空间", icon: "none", duration: 2000 });
      setTimeout(() => {
        uni.showModal({
          title: "你在网页版有账号吗？",
          content: "如果你之前用过画匣子网页版，绑定旧账号即可看到你的全部画匣子和合集。也可以稍后在「我的 → 账号设置」里绑定。",
          confirmText: "立即绑定",
          cancelText: "稍后",
          success: (r) => {
            if (r.confirm) {
              uni.reLaunch({ url: "/pages/account/settings" });
            } else {
              goHomeAfterLogin();
            }
          },
        });
      }, 900);
    } else {
      goHomeAfterLogin();
    }
  } catch (e) {
    loading.value = false;
    showError(e, "登录失败");
  }
}

function goHomeAfterLogin() {
  uni.showToast({ title: "登录成功", icon: "success" });
  setTimeout(() => {
    // 关键修复：用 navigateBack 回到触发登录的那一页（CreationFlow 上传 / 播放页 / 我的 等），
    // 保留对方页面的本地状态（已选图、已写文字、未发草稿等）。
    // 之前用 uni.reLaunch 直接清栈跳主页 → CreationFlow 组件被销毁 → 用户已上传的图和文字全没。
    // 只有页面栈里**只剩 login 自己**（典型场景：app 启动直接落地 login）时才回退到 reLaunch 到主页。
    const pages = getCurrentPages();
    const hasPrev = pages && pages.length > 1;
    logger.info('[login] 登录成功跳转', {
      stackLen: pages?.length || 0,
      strategy: hasPrev ? 'navigateBack' : 'reLaunch',
    });
    if (hasPrev) {
      uni.navigateBack({
        // 兜底：navigateBack 偶发失败（栈结构异常）时仍能回到主页
        fail: () => uni.reLaunch({ url: "/pages/index/index" }),
      });
    } else {
      uni.reLaunch({ url: "/pages/index/index" });
    }
  }, 500);
}

function showError(e: unknown, fallback: string) {
  const msg = e instanceof ApiError ? e.message : (e instanceof Error ? e.message : fallback);
  uni.showToast({ title: msg || fallback, icon: "none" });
}

function openLegal(kind: "terms" | "privacy" | "voiceprint") {
  uni.navigateTo({ url: `/pages/legal/${kind}` });
}

/**
 * H5：跳到微信开放平台扫码登录页（2026-07-24 hotfix12e）
 *
 * qrconnect 参数：
 * - appid: 网站应用 AppID（不是小程序 AppID）
 * - redirect_uri: 授权后跳回的 URL，必须**先 URL 编码**，且域名要跟开放平台后台"授权回调域"匹配
 * - response_type: 固定 code
 * - scope: 固定 snsapi_login
 * - state: CSRF 令牌，wx-callback 页要校验一致才继续
 * - lang: 中文界面
 * - #wechat_redirect: 必须以此 fragment 结尾（微信硬性要求）
 *
 * state 存 sessionStorage，跳回时校验。防止别人伪造 code 参数往回调页塞。
 */
function _redirectToWxQrConnect() {
  const state = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  try {
    // #ifdef H5
    (globalThis as unknown as { sessionStorage?: Storage }).sessionStorage?.setItem('_wx_oauth_state', state);
    // #endif
  } catch { /* ignore */ }
  const redirect = encodeURIComponent(WX_WEB_REDIRECT_URI);
  const url = `https://open.weixin.qq.com/connect/qrconnect?appid=${WX_WEB_APPID}&redirect_uri=${redirect}&response_type=code&scope=snsapi_login&state=${state}&lang=zh_CN#wechat_redirect`;
  logger.info('[login] redirect to WeChat qrconnect', { state, redirect: WX_WEB_REDIRECT_URI });
  // #ifdef H5
  (globalThis as unknown as { location?: Location }).location!.href = url;
  // #endif
}

/** Promise 封装 uni.login，便于 await */
function uniLogin(): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: "weixin",
      success: (res) => {
        if (res.code) resolve({ code: res.code });
        else reject(new Error("uni.login 未返回 code"));
      },
      fail: (err) => reject(new Error(err.errMsg || "uni.login 失败")),
    });
  });
}
</script>

<template>
  <view class="login-page">
    <view class="hero">
      <text class="title">{{ uiText("画匣子") }}</text>
      <text class="subtitle">{{ uiText("用一碰即开的方式，封存共同回忆") }}</text>
    </view>

    <view class="card">
      <button class="btn btn-primary" :loading="loading" :disabled="loading" @click="onWxLogin">
        {{ wxLoginLabel }}
      </button>

      <view class="divider"><text>{{ uiText("或") }}</text></view>

      <!-- 2026-07-24 hotfix12f：手机号登录（首次登录送 1GB 空间） -->
      <view v-if="!showPhone" class="link" @click="showPhone = true">
        <text>{{ uiText("手机号验证码登录 · 送 1GB 空间") }}</text>
      </view>
      <view v-else class="phone-form">
        <text class="legacy-mode-label">{{ uiText("手机号验证码登录") }}</text>
        <input
          v-model="phoneNumber"
          class="input"
          maxlength="11"
          type="number"
          :placeholder='uiText("11 位手机号")'
          :disabled="loading"
        />
        <view class="phone-code-row">
          <input
            v-model="phoneCode"
            class="input input-code"
            maxlength="6"
            type="number"
            :placeholder='uiText("6 位验证码")'
            :disabled="loading"
          />
          <view
            class="btn btn-ghost btn-code"
            :class="{ dim: phoneCooldown > 0 || phoneSending }"
            @click="onSendPhoneCode"
          >
            <text>{{ phoneCooldown > 0 ? `${phoneCooldown}s` : (phoneSending ? uiText("发送中…") : uiText("获取验证码")) }}</text>
          </view>
        </view>
        <button
          class="btn btn-primary"
          :loading="loading"
          :disabled="loading"
          @click="onPhoneLogin"
        >{{ uiText("登录") }}</button>
        <view class="link link-mute" @click="showPhone = false">
          <text>{{ uiText("返回") }}</text>
        </view>
      </view>

      <view v-if="!showLegacy && !showPhone" class="link" @click="legacyMode = 'login'; showLegacy = true">
        <text>{{ uiText("使用旧画匣子账号登录 / 找回旧数据") }}</text>
      </view>

      <view v-if="showLegacy" class="legacy-form">
        <text class="legacy-mode-label">
          {{ legacyMode === 'bind' ? uiText("绑定旧账号（保留当前微信身份）") : uiText("直接用旧账号登录") }}
        </text>
        <input
          v-model="legacyUsername"
          class="input"
          :placeholder='uiText("旧账号用户名")'
          :disabled="loading"
        />
        <input
          v-model="legacyPassword"
          class="input"
          :placeholder='uiText("密码")'
          password
          :disabled="loading"
        />
        <button
          v-if="legacyMode === 'bind'"
          class="btn btn-primary"
          :loading="loading"
          :disabled="loading"
          @click="onBindLegacy"
        >{{ uiText("绑定到当前账号") }}</button>
        <button
          v-else
          class="btn btn-ghost"
          :loading="loading"
          :disabled="loading"
          @click="onLegacyLogin"
        >{{ uiText("登录旧账号") }}</button>
        <view class="link link-mute" @click="showLegacy = false">
          <text>{{ uiText("返回") }}</text>
        </view>
      </view>
    </view>

    <!-- 审核要求：用户必须**主动勾选**同意，不能默认勾选/默认同意。
         之前写「登录即表示同意」被驳回（隐式同意不合规）。点击复选框或文本均可切换。 -->
    <view class="agree-row" @click="legalAgreed = !legalAgreed">
      <view class="check-box" :class="{ checked: legalAgreed }">
        <SvgIcon v-if="legalAgreed" name="check" size="20rpx" color="#F7F3EE" />
      </view>
      <view class="agree-text">
        <text>{{ uiText("我已阅读并同意") }}</text>
        <text class="link-inline" @click.stop="openLegal('terms')">{{ uiText("《用户协议》") }}</text>
        <text>、</text>
        <text class="link-inline" @click.stop="openLegal('privacy')">{{ uiText("《隐私协议》") }}</text>
        <text>{{ uiText("和") }}</text>
        <text class="link-inline" @click.stop="openLegal('voiceprint')">{{ uiText("《声纹授权协议》") }}</text>
      </view>
    </view>

    <!-- 全屏遮罩：登录中拦截误触、避免页面元素闪烁感 -->
    <view v-if="loading" class="overlay" catch:tap @touchmove.stop.prevent="() => {}">
      <view class="overlay-inner">
        <view class="spinner" />
        <text class="overlay-text">{{ uiText("正在登录…") }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.login-page {
  min-height: 100vh;
  padding: t.$spacing-5 t.$spacing-4;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.hero {
  margin-top: t.$spacing-6;
  margin-bottom: t.$spacing-6;
  text-align: center;
  .title {
    display: block;
    font-size: t.$font-2xl;
    font-weight: 700;
    color: t.$color-text;
    letter-spacing: 8rpx;
  }
  .subtitle {
    display: block;
    margin-top: t.$spacing-3;
    font-size: t.$font-sm;
    color: t.$color-text-soft;
  }
}

.card {
  width: 100%;
  max-width: 600rpx;
  background: t.$color-surface;
  border-radius: t.$radius-lg;
  padding: t.$spacing-5 t.$spacing-4;
  box-shadow: t.$shadow-card;
}

.btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: t.$radius-pill;
  font-size: t.$font-md;
  margin: 0;
  padding: 0;
}
.btn-primary {
  background: t.$color-accent;
  color: t.$color-text-invert;
}
.btn-ghost {
  background: transparent;
  color: t.$color-accent;
  border: 2rpx solid t.$color-accent;
}

.divider {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: t.$spacing-4 0;
  font-size: t.$font-xs;
  color: t.$color-text-mute;
}

.link {
  margin-top: t.$spacing-3;
  text-align: center;
  font-size: t.$font-sm;
  color: t.$color-accent;
  &.link-mute {
    color: t.$color-text-mute;
    margin-top: t.$spacing-3;
  }
}

.legacy-form,
.phone-form {
  display: flex;
  flex-direction: column;
  gap: t.$spacing-3;
}
.legacy-mode-label {
  font-size: t.$font-sm;
  color: t.$color-text-soft;
  text-align: center;
}

/* 2026-07-24 hotfix12f：手机号 + 验证码同一行 */
.phone-code-row {
  display: flex;
  gap: t.$spacing-2;
  align-items: center;
}
.input.input-code {
  flex: 1;
}
.btn.btn-code {
  width: 200rpx;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: t.$radius-md;
  font-size: t.$font-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid t.$color-border;
  background: t.$color-surface;
  color: t.$color-text-soft;
  margin: 0;
  padding: 0;
}
.btn.btn-code.dim { opacity: 0.5; }

.input {
  height: 80rpx;
  padding: 0 t.$spacing-3;
  border-radius: t.$radius-md;
  border: 2rpx solid t.$color-border;
  background: t.$color-surface-2;
  font-size: t.$font-md;
  color: t.$color-text;
}

// ---- 协议同意行（审核合规：用户必须主动勾选）----
.agree-row {
  margin-top: t.$spacing-5;
  padding: t.$spacing-3 t.$spacing-4;
  display: flex;
  align-items: flex-start;
  gap: t.$spacing-2;
  font-size: t.$font-xs;
  color: t.$color-text-soft;
}
.check-box {
  flex-shrink: 0;
  width: 32rpx;
  height: 32rpx;
  border-radius: 6rpx;
  border: 2rpx solid t.$color-border;
  background: t.$color-surface;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 4rpx;
}
.check-box.checked {
  background: t.$color-accent;
  border-color: t.$color-accent;
}
.check-mark {
  color: t.$color-text-invert;
  font-size: 22rpx;
  line-height: 1;
  font-weight: t.$weight-bold;
}
.agree-text {
  flex: 1;
  line-height: 1.5;
}
.link-inline {
  color: t.$color-accent;
  margin: 0 2rpx;
}

// ---- 登录中遮罩 ----
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(20, 14, 8, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99;
}
.overlay-inner {
  background: t.$color-surface;
  border-radius: t.$radius-lg;
  padding: t.$spacing-4 t.$spacing-5;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: t.$spacing-3;
  box-shadow: t.$shadow-pop;
}
.overlay-text {
  font-size: t.$font-sm;
  color: t.$color-text-soft;
}
.spinner {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  border: 4rpx solid t.$color-border;
  border-top-color: t.$color-accent;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
