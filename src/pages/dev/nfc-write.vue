<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * NFC 自动烧卡（安卓）—— 一贴一烧，替代 nfc-burn.vue 的手动"复制→切APP→粘贴"流程。
 *
 * 门禁：entitlement=preset_links（与 nfc-burn / storage-boost 同一权限）
 * 平台：仅 mp-weixin + 安卓；iOS 显式不支持
 *
 * 流程（一次点开循环工作，商家每贴一张自动烧）：
 *   1) 「开始扫卡」→ getNFCAdapter().startDiscovery() + onDiscovered
 *   2) 卡贴上 → onDiscovered 触发，读 res.id → 14 hex UID
 *   3) 3 次重试链：GET /api/nfc-scheme?uid=xxx 拿永久 scheme
 *      → Ndef.connect() → writeNdefMessage(records=URI+AAR) → close()
 *   4) 成功震动短一下 / 失败震动长；两个列表分类展示
 *   5) 「结束扫卡」→ stopDiscovery + offDiscovered
 *
 * NDEF 载荷：
 *   - Record 1 (URI, TNF=Well Known, type='U')：weixin scheme（前缀 0x00 无缩写）
 *   - Record 2 (AAR, TNF=External, type='android.com:pkg')：'com.tencent.mm'
 *   AAR 必写，否则安卓识别到 URI 后不知道拉哪个 APP，走浏览器兜底。
 */
import { ref, computed, onMounted, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { fetchNfcScheme } from "@/api/nfc";
import { ApiError } from "@/api/request";
import { logger } from "@/utils/logger";

const auth = useAuthStore();
const { user, isLoggedIn } = storeToRefs(auth);

const hasEntitlement = computed(() =>
  (user.value?.entitlements || []).includes("preset_links"),
);

// —— 平台探测 & adapter 初始化 ——
interface NFCAdapter {
  startDiscovery: (opts: { success?: () => void; fail?: (e: unknown) => void }) => void;
  stopDiscovery: (opts?: { success?: () => void; fail?: (e: unknown) => void }) => void;
  onDiscovered: (cb: (res: NfcDiscovered) => void) => void;
  offDiscovered: (cb: (res: NfcDiscovered) => void) => void;
  getNdef: () => NdefInstance;
}
interface NfcDiscovered {
  id: ArrayBuffer;
  techs?: string[];
  messages?: ArrayBuffer[];
}
interface NdefRecord {
  tnf: number;
  type: ArrayBuffer;
  id: ArrayBuffer;
  payload: ArrayBuffer;
}
interface NdefInstance {
  connect: (opts: { success?: () => void; fail?: (e: unknown) => void }) => void;
  close: (opts: { success?: () => void; fail?: (e: unknown) => void }) => void;
  writeNdefMessage: (opts: {
    records?: NdefRecord[];
    uris?: string[];
    success?: () => void;
    fail?: (e: unknown) => void;
  }) => void;
}

const supportError = ref<string>("");
const adapter = ref<NFCAdapter | null>(null);

function initAdapter() {
  // #ifdef MP-WEIXIN
  try {
    const sys = uni.getSystemInfoSync();
    if (sys.platform !== "android") {
      supportError.value = "本页面仅支持安卓手机 —— iOS 微信小程序无 NFC 读写能力，请换安卓机操作";
      return;
    }
    const wxAny = wx as unknown as { getNFCAdapter?: () => NFCAdapter };
    if (typeof wxAny.getNFCAdapter !== "function") {
      supportError.value = "本机微信版本太旧，无 wx.getNFCAdapter（需要基础库 ≥ 2.15.0）";
      return;
    }
    adapter.value = wxAny.getNFCAdapter();
    logger.info("[nfc-write] adapter 初始化成功");
  } catch (e) {
    supportError.value = "NFC 初始化失败：" + ((e as Error)?.message || String(e));
    logger.warn("[nfc-write] init failed", e);
  }
  // #endif
  // #ifndef MP-WEIXIN
  supportError.value = "自动烧卡仅在微信小程序（安卓）内可用";
  // #endif
}

// —— NDEF 构造 ——
function stringToUint8(s: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
    else if (c < 0x10000) bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    else bytes.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
  }
  return new Uint8Array(bytes);
}
function u8ToBuf(u: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u.byteLength);
  new Uint8Array(buf).set(u);
  return buf;
}
function bufToHex(buf: ArrayBuffer): string {
  const view = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < view.length; i++) s += view[i].toString(16).padStart(2, "0");
  return s.toUpperCase();
}

function buildRecords(scheme: string): NdefRecord[] {
  // URI record：TNF=1 (Well Known), type='U' (0x55), payload = [前缀字节, URI 剩余]
  // weixin:// 不在预定义前缀表里 → 前缀 = 0x00（no prefix，跟完整 URI）
  const uriBody = stringToUint8(scheme);
  const uriPayload = new Uint8Array(uriBody.length + 1);
  uriPayload[0] = 0x00;
  uriPayload.set(uriBody, 1);

  // AAR record：TNF=4 (External), type='android.com:pkg', payload=包名
  //   缺这条安卓识别到 URI 后走系统兜底浏览器，不会直接拉起微信
  const aarType = stringToUint8("android.com:pkg");
  const aarPayload = stringToUint8("com.tencent.mm");

  return [
    {
      tnf: 0x01,
      type: u8ToBuf(new Uint8Array([0x55])),
      id: u8ToBuf(new Uint8Array(0)),
      payload: u8ToBuf(uriPayload),
    },
    {
      tnf: 0x04,
      type: u8ToBuf(aarType),
      id: u8ToBuf(new Uint8Array(0)),
      payload: u8ToBuf(aarPayload),
    },
  ];
}

// —— 状态 & 结果集 ——
type Status = "idle" | "scanning" | "writing";
const status = ref<Status>("idle");
const statusText = ref("待启动");
const currentUid = ref("");

interface Result {
  uid: string;
  ts: number;
  scheme?: string;
  reason?: string;
}
const successList = ref<Result[]>([]);
const failedList = ref<Result[]>([]);

// 防止商家不小心把同一张卡在同次扫描里重贴多遍
const successUidSet = new Set<string>();

// —— 核心烧卡逻辑 ——
async function tryWrite(uid: string): Promise<void> {
  if (!adapter.value) throw new Error("adapter 不可用");
  const schemeRes = await fetchNfcScheme(uid);
  const ndef = adapter.value.getNdef();
  await new Promise<void>((resolve, reject) => {
    ndef.connect({ success: resolve, fail: reject });
  });
  try {
    const records = buildRecords(schemeRes.scheme);
    await new Promise<void>((resolve, reject) => {
      ndef.writeNdefMessage({ records, success: resolve, fail: reject });
    });
    successList.value.unshift({ uid, ts: Date.now(), scheme: schemeRes.scheme });
    successUidSet.add(uid);
  } finally {
    // close 失败不影响成功判定（有些卡断开时抖动就报错）
    await new Promise<void>((resolve) => {
      ndef.close({ success: resolve, fail: () => resolve() });
    });
  }
}

let onCardBound: ((res: NfcDiscovered) => void) | null = null;

async function onCard(res: NfcDiscovered) {
  if (status.value === "writing") {
    logger.info("[nfc-write] 上一张还在处理，忽略新触发");
    return;
  }
  const uid = bufToHex(res.id).slice(0, 14);
  if (!/^[0-9A-F]{14}$/.test(uid)) {
    failedList.value.unshift({ uid, ts: Date.now(), reason: `UID 格式非法：${uid}` });
    uni.showToast({ title: `× UID 非法`, icon: "none", duration: 2000 });
    return;
  }
  if (successUidSet.has(uid)) {
    uni.showToast({ title: `跳过：${uid.slice(-6)} 已烧`, icon: "none", duration: 1500 });
    return;
  }

  status.value = "writing";
  currentUid.value = uid;
  statusText.value = `正在烧 ${uid.slice(-6)}...`;
  logger.info("[nfc-write] 开始烧", uid);

  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await tryWrite(uid);
      // 成功
      uni.vibrateShort({ type: "medium" });
      uni.showToast({ title: `${uid.slice(-6)} 已烧`, icon: "success", duration: 1500 });
      logger.info("[nfc-write] 烧成功", { uid, attempt });
      status.value = "scanning";
      statusText.value = "待下一张…";
      currentUid.value = "";
      return;
    } catch (e) {
      lastErr = e instanceof ApiError ? e.message
        : (e as { errMsg?: string })?.errMsg
        || (e as Error)?.message
        || String(e);
      logger.warn("[nfc-write] attempt fail", { uid, attempt, lastErr });
      if (attempt < 3) {
        statusText.value = `第 ${attempt} 次失败，重试中…`;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  failedList.value.unshift({ uid, ts: Date.now(), reason: lastErr });
  uni.vibrateLong();
  uni.showToast({ title: `× ${uid.slice(-6)} 失败`, icon: "none", duration: 3000 });
  status.value = "scanning";
  statusText.value = "待下一张（上张失败，可重贴）";
  currentUid.value = "";
}

async function startScan() {
  if (!adapter.value) {
    uni.showToast({ title: supportError.value || "不支持", icon: "none" });
    return;
  }
  if (status.value !== "idle") return;
  try {
    await new Promise<void>((resolve, reject) => {
      adapter.value!.startDiscovery({ success: resolve, fail: reject });
    });
    onCardBound = onCard;
    adapter.value.onDiscovered(onCardBound);
    status.value = "scanning";
    statusText.value = "待贴卡…";
    logger.info("[nfc-write] startDiscovery ok");
  } catch (e) {
    const msg = (e as { errMsg?: string })?.errMsg || String(e);
    supportError.value = "启动 NFC 失败：" + msg + "（是否已在手机设置里打开 NFC？）";
    logger.warn("[nfc-write] startDiscovery fail", e);
  }
}

async function stopScan() {
  if (!adapter.value) return;
  try {
    if (onCardBound) {
      adapter.value.offDiscovered(onCardBound);
      onCardBound = null;
    }
    await new Promise<void>((resolve) => {
      adapter.value!.stopDiscovery({ success: resolve, fail: () => resolve() });
    });
  } catch { /* ignore */ }
  status.value = "idle";
  statusText.value = "已停止";
  logger.info("[nfc-write] stopDiscovery ok");
}

function clearAll() {
  successList.value = [];
  failedList.value = [];
  successUidSet.clear();
}

function fmtTs(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

onMounted(() => {
  initAdapter();
});

onUnmounted(() => {
  // 页面 destroy 时兜底关掉 NFC，防止后台占着 adapter
  if (status.value !== "idle") stopScan();
});
</script>

<template>
  <view class="page">
    <view v-if="!isLoggedIn" class="empty">
      <text>{{ uiText("请先登录") }}</text>
    </view>
    <view v-else-if="!hasEntitlement" class="empty">
      <text class="empty-title">{{ uiText("未解锁") }}</text>
      <text class="empty-sub">{{ uiText("该工具仅对持有 preset_links 兑换码的用户开放") }}</text>
      <text class="empty-sub">{{ uiText("去「账号设置 → 兑换码」输入内部码后再来") }}</text>
    </view>
    <template v-else>
      <view class="intro">
        <text class="intro-title">{{ uiText("NFC 自动烧卡 · 安卓") }}</text>
        <text class="intro-sub">
          {{ uiText("点「开始扫卡」后，把 NTAG213/215/216 空白卡片依次贴到手机背面 NFC 区域。\n          每张 1-2 秒自动完成，成功震动一下、失败震动更久。") }}
        </text>
      </view>

      <view v-if="supportError" class="err-card">
        <text>{{ supportError }}</text>
      </view>

      <view class="status-card" :class="{ scanning: status === 'scanning', writing: status === 'writing' }">
        <text class="status-label">{{ uiText("当前状态") }}</text>
        <text class="status-text">{{ statusText }}</text>
        <text v-if="currentUid" class="status-uid">UID: {{ currentUid }}</text>
      </view>

      <view class="btn-row">
        <view
          v-if="status === 'idle'"
          class="btn btn-primary"
          :class="{ disabled: !adapter }"
          @tap="startScan"
        ><text>{{ uiText("开始扫卡") }}</text></view>
        <view
          v-else
          class="btn btn-stop"
          @tap="stopScan"
        ><text>{{ uiText("结束扫卡") }}</text></view>

        <view
          v-if="successList.length + failedList.length > 0"
          class="btn btn-ghost"
          @tap="clearAll"
        ><text>{{ uiText("清空结果") }}</text></view>
      </view>

      <view v-if="successList.length" class="section success-section">
        <text class="section-title">{{ uiText("成功 ·") }} {{ successList.length }} {{ uiText("张") }}</text>
        <view v-for="r in successList" :key="'s'+r.uid" class="row row-ok">
          <text class="row-uid">{{ r.uid }}</text>
          <text class="row-ts">{{ fmtTs(r.ts) }}</text>
        </view>
      </view>

      <view v-if="failedList.length" class="section failed-section">
        <text class="section-title">{{ uiText("失败 ·") }} {{ failedList.length }} {{ uiText("张（可重贴）") }}</text>
        <view v-for="r in failedList" :key="'f'+r.uid+r.ts" class="row row-err">
          <view class="row-line">
            <text class="row-uid">{{ r.uid }}</text>
            <text class="row-ts">{{ fmtTs(r.ts) }}</text>
          </view>
          <text class="row-reason">{{ r.reason }}</text>
        </view>
      </view>

      <view class="help">
        <text class="help-title">{{ uiText("使用提示") }}</text>
        <text class="help-line">{{ uiText("· 卡贴上后**保持贴合 1-2 秒**，别急着拿开") }}</text>
        <text class="help-line">{{ uiText("· 卡对准手机背面 NFC 区域（通常在摄像头周围）") }}</text>
        <text class="help-line">{{ uiText("· NTAG213 容量足够；空白卡 or 未 lock 的卡才可烧") }}</text>
        <text class="help-line">{{ uiText("· 同一张卡在本次扫描里已烧过会自动跳过（防误贴）") }}</text>
        <text class="help-line">{{ uiText("· 底层复用后端 /api/nfc-scheme，与手动烧卡助手同一 scheme") }}</text>
      </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.page {
  min-height: 100vh;
  background: t.$color-bg;
  padding: t.$spacing-4;
  padding-bottom: calc(t.$spacing-8 + env(safe-area-inset-bottom));
  display: flex; flex-direction: column; gap: t.$spacing-4;
}

.empty {
  padding: t.$spacing-8;
  text-align: center;
  color: t.$color-text-mute;
  display: flex; flex-direction: column; gap: t.$spacing-2; align-items: center;
}
.empty-title { font-size: 36rpx; font-weight: t.$weight-bold; color: t.$color-text; }
.empty-sub { font-size: t.$font-sm; color: t.$color-text-mute; line-height: 1.6; }

.intro { padding: 0 t.$spacing-1; display: flex; flex-direction: column; gap: t.$spacing-1; }
.intro-title { font-size: t.$font-xl; font-weight: t.$weight-bold; color: t.$color-text; }
.intro-sub { font-size: t.$font-xs; color: t.$color-text-soft; line-height: 1.6; }

.err-card {
  padding: t.$spacing-3 t.$spacing-4;
  background: rgba(193, 57, 57, 0.08);
  border: 2rpx solid rgba(193, 57, 57, 0.3);
  border-radius: t.$radius-md;
  color: t.$color-danger;
  font-size: t.$font-sm;
  line-height: 1.5;
}

.status-card {
  padding: t.$spacing-4;
  border-radius: t.$radius-card;
  background: t.$color-surface;
  display: flex; flex-direction: column; gap: t.$spacing-1;
  align-items: center;
  transition: background 0.2s;
  &.scanning { background: rgba(107, 142, 78, 0.10); }
  &.writing  { background: rgba(196, 168, 130, 0.20); }
}
.status-label { font-size: t.$font-xs; color: t.$color-text-mute; }
.status-text  { font-size: t.$font-lg; font-weight: t.$weight-bold; color: t.$color-text; }
.status-uid   { font-size: t.$font-sm; color: t.$color-accent; font-family: monospace; }

.btn-row { display: flex; gap: t.$spacing-3; }
.btn {
  flex: 1;
  height: 88rpx; line-height: 88rpx;
  border-radius: t.$radius-pill; text-align: center;
  font-size: t.$font-md;
  box-sizing: border-box;
  &.disabled { opacity: 0.5; }
}
.btn-primary { background: t.$color-accent; color: t.$color-text-invert; }
.btn-stop { background: t.$color-danger; color: t.$color-text-invert; }
.btn-ghost {
  flex: 0 0 auto;
  min-width: 200rpx;
  background: transparent;
  border: 2rpx solid t.$color-border;
  color: t.$color-text-soft;
}

.section {
  padding: t.$spacing-3;
  border-radius: t.$radius-md;
  background: t.$color-surface;
  display: flex; flex-direction: column; gap: t.$spacing-2;
}
.section-title { font-size: t.$font-sm; font-weight: t.$weight-bold; color: t.$color-text; }
.row {
  padding: t.$spacing-2;
  border-radius: t.$radius-sm;
  display: flex; flex-direction: column; gap: 4rpx;
}
.row-ok { background: rgba(107, 142, 78, 0.10); }
.row-err { background: rgba(193, 57, 57, 0.08); }
.row-line { display: flex; justify-content: space-between; align-items: center; }
.row-uid { font-family: monospace; font-size: t.$font-xs; color: t.$color-text; }
.row-ts { font-size: 22rpx; color: t.$color-text-mute; }
.row-reason { font-size: 22rpx; color: t.$color-danger; word-break: break-all; }

.help {
  padding: t.$spacing-4;
  background: t.$color-surface;
  border-radius: t.$radius-md;
  display: flex; flex-direction: column; gap: 8rpx;
}
.help-title { font-size: t.$font-sm; font-weight: t.$weight-bold; color: t.$color-text-soft; }
.help-line { font-size: t.$font-xs; color: t.$color-text-mute; line-height: 1.7; }
</style>
