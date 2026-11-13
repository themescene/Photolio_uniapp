<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * NFC 烧卡助手（小程序内版本）。
 *
 * 入口：账号设置 → 开发者工具（仅 entitlement 含 preset_links 时显示）。
 * 同等功能网页版在 /api/tools/nfc-burn，CLI 在 arbackend/scripts/nfc_burn_helper.py。
 *
 * 流程：输入 UID（NFC Tools 读出的"序列号"）→ 调 /api/nfc-scheme → 显示 scheme
 *      → 一键复制 → 切到 NFC Tools 粘贴烧卡 + AAR com.tencent.mm。
 */
import { ref, onMounted, computed } from "vue";
import { fetchNfcScheme } from "@/api/nfc";
import { ApiError } from "@/api/request";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";
import { logger } from "@/utils/logger";

const HIST_KEY = "pianyu_burn_hist_v1";
const MAX_HIST = 20;

interface HistItem {
  uid: string;
  scheme: string;
  ts: number;
}

const auth = useAuthStore();
const { user } = storeToRefs(auth);

const uidInput = ref("");
const submitting = ref(false);
const errMsg = ref("");
const lastUid = ref("");
const lastScheme = ref("");
const history = ref<HistItem[]>([]);

const hasEntitlement = computed(() =>
  (user.value?.entitlements || []).includes("preset_links"),
);

onMounted(() => {
  loadHistory();
});

function normalizeUid(raw: string): string {
  const s = raw.replace(/[\s:\-]/g, "").toUpperCase();
  if (!/^[0-9A-F]{14}$/.test(s)) {
    throw new Error("UID 必须 14 位 hex（可带冒号/空格/横线）");
  }
  return s;
}

async function onSubmit() {
  errMsg.value = "";
  if (submitting.value) return;

  let uid: string;
  try {
    uid = normalizeUid(uidInput.value);
  } catch (e) {
    errMsg.value = e instanceof Error ? e.message : "UID 格式错误";
    return;
  }

  submitting.value = true;
  try {
    const res = await fetchNfcScheme(uid);
    lastUid.value = res.uid;
    lastScheme.value = res.scheme;
    pushHistory(res.uid, res.scheme);
  } catch (e) {
    errMsg.value = e instanceof ApiError ? e.message : "生成失败";
  } finally {
    submitting.value = false;
  }
}

function copyScheme(scheme: string) {
  logger.info("[burn] copyScheme click", { len: scheme?.length });
  if (!scheme) {
    uni.showToast({ title: "scheme 为空", icon: "none" });
    return;
  }
  // #ifdef MP-WEIXIN
  copyWithPrivacy(scheme, "[burn]");
  // #endif
  // #ifdef H5
  uni.setClipboardData({ data: scheme });
  // #endif
}

// setClipboardData 自 2.32.3 起是隐私接口 → 必须前置 wx.requirePrivacyAuthorize
// #ifdef MP-WEIXIN
function copyWithPrivacy(data: string, tag: string) {
  const doCopy = () => {
    try {
      wx.setClipboardData({
        data,
        success: (res) => logger.info(`${tag} wx.setClipboardData success`, res),
        fail: (err) => {
          logger.warn(`${tag} wx.setClipboardData fail RAW`, JSON.stringify(err), err);
          uni.showToast({ title: "复制失败，请长按上方文本手动复制", icon: "none", duration: 3000 });
        },
      });
    } catch (e) {
      logger.warn(`${tag} wx.setClipboardData throw`, e);
      uni.showToast({ title: "复制异常，请长按上方文本", icon: "none", duration: 3000 });
    }
  };
  const req = (wx as unknown as { requirePrivacyAuthorize?: (o: {
    success?: () => void;
    fail?: (err: unknown) => void;
  }) => void }).requirePrivacyAuthorize;
  if (typeof req === "function") {
    req({
      success: doCopy,
      fail: (err) => {
        logger.warn(`${tag} requirePrivacyAuthorize fail`, err);
        uni.showToast({ title: "需先同意隐私协议才能复制", icon: "none", duration: 2500 });
      },
    });
  } else {
    doCopy();
  }
}
// #endif

function loadHistory() {
  try {
    const raw = uni.getStorageSync(HIST_KEY);
    history.value = raw ? JSON.parse(raw) : [];
  } catch {
    history.value = [];
  }
}

function pushHistory(uid: string, scheme: string) {
  const filtered = history.value.filter((x) => x.uid !== uid);
  filtered.unshift({ uid, scheme, ts: Date.now() });
  history.value = filtered.slice(0, MAX_HIST);
  uni.setStorageSync(HIST_KEY, JSON.stringify(history.value));
}

function clearHistory() {
  uni.showModal({
    title: "清空历史",
    content: "清空后无法恢复，本地的卡片烧卡记录会全部丢失",
    success: (res) => {
      if (res.confirm) {
        history.value = [];
        uni.removeStorageSync(HIST_KEY);
      }
    },
  });
}
</script>

<template>
  <view class="page">
    <view v-if="!hasEntitlement" class="locked">
      <text class="locked-title">{{ uiText("未解锁") }}</text>
      <text class="locked-sub">{{ uiText("该工具仅对持有 preset_links 兑换码的用户开放。") }}</text>
      <text class="locked-sub">{{ uiText("去「账号设置 → 兑换码」输入兑换码后再来。") }}</text>
    </view>

    <template v-else>
      <view class="intro">
        <text class="intro-title">{{ uiText("输入 NFC 卡 UID，拿到对应永久 weixin scheme") }}</text>
        <text class="intro-sub">
          {{ uiText("NFC Tools 读出\"序列号\"复制到这里。生成后复制 scheme 粘到 NFC Tools 写卡：\n          『URL/URI → 自定义』 + 应用程序 com.tencent.mm。") }}
        </text>
      </view>

      <view class="card">
        <text class="label">{{ uiText("NFC 卡 UID（14 位 hex，冒号可选）") }}</text>
        <input
          class="input"
          v-model="uidInput"
          :placeholder='uiText("例：04312 7B6CD2A81")'
          :disabled="submitting"
          @confirm="onSubmit"
        />
        <view class="btn" :class="{ disabled: submitting }" @tap="onSubmit">
          <text>{{ submitting ? uiText("生成中...") : uiText("生成 weixin scheme") }}</text>
        </view>
        <text v-if="errMsg" class="err">{{ errMsg }}</text>
      </view>

      <view v-if="lastScheme" class="card result">
        <text class="result-uid">UID · {{ lastUid }}</text>
        <!-- scheme 展示：textarea 长按可弹「全选 / 复制」系统菜单 —— 永远最稳的兜底 -->
        <textarea
          class="scheme-textarea"
          :value="lastScheme"
          auto-height
          disable-default-padding
          :show-confirm-bar="false"
          :cursor-spacing="0"
          :adjust-position="false"
        />
        <text class="fallback-hint">{{ uiText("若下方按钮无效，长按上方文本 → 全选 → 复制") }}</text>
        <view class="copy-btn" @tap="copyScheme(lastScheme)">
          <text>{{ uiText("复制 scheme") }}</text>
        </view>
      </view>

      <view v-if="history.length" class="card hist">
        <view class="hist-head">
          <text class="label">{{ uiText("历史（最近") }} {{ history.length }} {{ uiText("张）") }}</text>
          <text class="clear" @click="clearHistory">{{ uiText("清空") }}</text>
        </view>
        <view
          v-for="item in history"
          :key="item.uid + item.ts"
          class="hist-item"
          @click="copyScheme(item.scheme)"
        >
          <text class="hist-uid">{{ item.uid }}</text>
          <text class="hist-hint">{{ uiText("点击即复制 scheme") }}</text>
        </view>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  background: #f4ede1;
  padding: 24rpx 24rpx 80rpx;
  box-sizing: border-box;
}

.locked {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 40rpx;
  text-align: center;

  .locked-title {
    font-size: 36rpx;
    font-weight: 600;
    color: #3d2c1f;
    margin-bottom: 16rpx;
  }
  .locked-sub {
    font-size: 26rpx;
    color: #9c8e74;
    line-height: 1.6;
  }
}

.intro {
  padding: 16rpx 8rpx 24rpx;

  .intro-title {
    font-size: 30rpx;
    color: #3d2c1f;
    font-weight: 500;
    display: block;
    margin-bottom: 8rpx;
  }
  .intro-sub {
    font-size: 24rpx;
    color: #9c8e74;
    line-height: 1.6;
    display: block;
  }
}

.card {
  background: #fffaf2;
  border-radius: 20rpx;
  padding: 28rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 4rpx 18rpx rgba(60, 40, 20, 0.08);
}

.label {
  font-size: 24rpx;
  color: #7a6a55;
  display: block;
  margin-bottom: 12rpx;
}

.input {
  width: 100%;
  padding: 20rpx 20rpx;
  background: #fff;
  border: 1rpx solid #e8dfc7;
  border-radius: 12rpx;
  // 精简 placeholder 后 monospace 28rpx 也不会裁；字号回到易读的 28rpx
  font-size: 28rpx;
  font-family: monospace;
  color: #3d2c1f;
  box-sizing: border-box;
  margin-bottom: 20rpx;
}

.btn {
  background: #5b8a4a;
  color: #fff;
  border-radius: 12rpx;
  padding: 22rpx;
  font-size: 30rpx;
  font-weight: 500;
  width: 100%;
  text-align: center;
  box-sizing: border-box;
  &.disabled {
    opacity: 0.5;
  }
}

.err {
  display: block;
  color: #c0392b;
  font-size: 24rpx;
  margin-top: 16rpx;
}

.result {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.result-uid {
  font-size: 24rpx;
  color: #9c8e74;
  font-family: monospace;
}

.scheme-textarea {
  width: 100%;
  min-height: 120rpx;
  padding: 20rpx;
  background: #fff;
  border: 1rpx dashed #c9b990;
  border-radius: 12rpx;
  font-family: monospace;
  font-size: 24rpx;
  color: #3d2c1f;
  line-height: 1.5;
  box-sizing: border-box;
  word-break: break-all;
}

.fallback-hint {
  display: block;
  font-size: 22rpx;
  color: #9c8e74;
  text-align: center;
  margin: 4rpx 0 8rpx;
}

.copy-btn {
  background: #3d2e1f;
  color: #fff;
  border-radius: 12rpx;
  padding: 22rpx;
  font-size: 30rpx;
  font-weight: 500;
  width: 100%;
  text-align: center;
  box-sizing: border-box;
  line-height: normal;
}

.hist {
  .hist-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8rpx;
  }
  .clear {
    font-size: 24rpx;
    color: #c0392b;
  }
  .hist-item {
    padding: 20rpx 0;
    border-bottom: 1rpx solid #e8dfc7;
    display: flex;
    justify-content: space-between;
    align-items: center;
    &:last-child { border-bottom: 0; }
  }
  .hist-uid {
    font-size: 24rpx;
    color: #3d2c1f;
    font-family: monospace;
  }
  .hist-hint {
    font-size: 22rpx;
    color: #5b8a4a;
  }
}
</style>
