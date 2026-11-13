<script setup lang="ts">
import LanguageSwitcher from "@/components/LanguageSwitcher.vue";
import { t as uiText } from "@/i18n";
/**
 * 账号设置页。
 *
 * 一页囊括所有账号操作，每个子操作用一个独立的对话框（同一个 dialog 状态机），
 * 避免另开多个 page 增加导航深度。
 *
 * 子操作：
 * - 改昵称 / 改用户名 / 设(改)密码 / 绑定/解绑旧账号 / 兑换码 / 退出登录
 */
import { ref, computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import * as authApi from "@/api/auth";
import { ApiError } from "@/api/request";
import { usePlaybackStore } from "@/stores/playback";
import { useDebugStore } from "@/stores/debug";
import AppRow from "@/components/AppRow.vue";

const auth = useAuthStore();
const debug = useDebugStore();
const playback = usePlaybackStore();
const { user, nickname } = storeToRefs(auth);

type Dialog =
  | { kind: "none" }
  | { kind: "nickname"; value: string }
  | { kind: "username"; value: string }
  | { kind: "password"; oldVal: string; newVal: string; confirmVal: string }
  | { kind: "bindLegacy"; username: string; password: string }
  | { kind: "unbindLegacy" }
  | { kind: "redeem"; value: string }
  // 2026-07-24 hotfix12f：绑定手机号（送 1GB 空间）+ 解绑
  | { kind: "bindPhone"; phone: string; code: string; sending: boolean; cooldown: number }
  | { kind: "unbindPhone" };

const dialog = ref<Dialog>({ kind: "none" });
const submitting = ref(false);

const hasPassword = computed(() => !!user.value?.has_password);
const linkedLegacy = computed(() => !!user.value?.linked_legacy_user_id);
const boundPhone = computed(() => user.value?.phone || "");
const entitlements = computed(() => user.value?.entitlements || []);
const hasPresetLinks = computed(() => entitlements.value.includes("preset_links"));
const avatarUrl = computed(() => (user.value as { avatar_url?: string } | null)?.avatar_url || "");

// 2026-08-11：微信 chooseAvatar 事件（open-type="chooseAvatar" 触发）
async function onChooseAvatar(e: { detail?: { avatarUrl?: string } } & Event) {
  const localPath = e?.detail?.avatarUrl;
  if (!localPath) return;
  uni.showLoading({ title: "上传头像中…", mask: true });
  try {
    await auth.updateAvatarAction(localPath);
    uni.hideLoading();
    uni.showToast({ title: "头像已更新", icon: "success" });
  } catch (err) {
    uni.hideLoading();
    const msg = err instanceof ApiError ? err.message : "头像上传失败";
    uni.showToast({ title: msg, icon: "none", duration: 3000 });
  }
}

onMounted(() => {
  // 进入设置页强制刷新一次 me，避免显示陈旧数据
  auth.refreshMe();
});

// ---------- 打开各对话框 ----------

function openNickname() {
  dialog.value = { kind: "nickname", value: user.value?.nickname || "" };
}
function openUsername() {
  dialog.value = { kind: "username", value: user.value?.username || "" };
}
function openPassword() {
  dialog.value = { kind: "password", oldVal: "", newVal: "", confirmVal: "" };
}
function openBindLegacy() {
  dialog.value = { kind: "bindLegacy", username: "", password: "" };
}
function openUnbindLegacy() {
  dialog.value = { kind: "unbindLegacy" };
}
function openRedeem() {
  dialog.value = { kind: "redeem", value: "" };
}
function openBindPhone() {
  dialog.value = { kind: "bindPhone", phone: "", code: "", sending: false, cooldown: 0 };
}
function openUnbindPhone() {
  dialog.value = { kind: "unbindPhone" };
}
function closeDialog() {
  if (submitting.value) return;
  dialog.value = { kind: "none" };
}

// ---------- 提交逻辑 ----------

async function submitNickname() {
  if (dialog.value.kind !== "nickname") return;
  const v = dialog.value.value.trim();
  if (!v) return uni.showToast({ title: "昵称不能为空", icon: "none" });
  await run(() => auth.updateNicknameAction(v), "昵称已更新");
}

async function submitUsername() {
  if (dialog.value.kind !== "username") return;
  const v = dialog.value.value.trim();
  if (!v || v.length < 2) return uni.showToast({ title: "至少 2 个字符", icon: "none" });
  await run(async () => {
    await authApi.updateUsername(v);
    await auth.refreshMe();
  }, "用户名已更新");
}

async function submitPassword() {
  if (dialog.value.kind !== "password") return;
  const { oldVal, newVal, confirmVal } = dialog.value;
  if (hasPassword.value && !oldVal) return uni.showToast({ title: "请输入当前密码", icon: "none" });
  if (!newVal || newVal.length < 4) return uni.showToast({ title: "新密码至少 4 个字符", icon: "none" });
  if (newVal !== confirmVal) return uni.showToast({ title: "两次输入不一致", icon: "none" });
  await run(async () => {
    await authApi.setPassword(newVal, hasPassword.value ? oldVal : undefined);
    await auth.refreshMe();
  }, hasPassword.value ? "密码已修改" : "密码已设置");
}

async function submitBindLegacy() {
  if (dialog.value.kind !== "bindLegacy") return;
  const { username, password } = dialog.value;
  if (!username || !password) return uni.showToast({ title: "请输入用户名密码", icon: "none" });
  await run(async () => {
    await auth.bindLegacyAction(username.trim(), password);
  }, "绑定成功");
}

async function submitUnbindLegacy() {
  await run(async () => {
    await authApi.unbindLegacy();
    await auth.refreshMe();
  }, "已解绑");
}

async function submitRedeem() {
  if (dialog.value.kind !== "redeem") return;
  const code = dialog.value.value.trim();
  if (!code) return uni.showToast({ title: "请输入兑换码", icon: "none" });
  await run(async () => {
    await authApi.redeemCode(code);
    await auth.refreshMe();
  }, "兑换成功，新功能已解锁");
}

// 2026-07-24 hotfix12f：手机号绑定 / 解绑
// 发送验证码：非登录路径下同一号码 60 秒冷却（backend 强制），前端也倒计时
async function sendPhoneCodeForBind() {
  if (dialog.value.kind !== "bindPhone") return;
  const { phone } = dialog.value;
  if (!phone || phone.length !== 11) {
    return uni.showToast({ title: "请输入 11 位手机号", icon: "none" });
  }
  dialog.value.sending = true;
  try {
    await authApi.sendPhoneCode(phone, "bind");
    dialog.value.cooldown = 60;
    _startPhoneCooldown();
    uni.showToast({ title: "验证码已发送", icon: "success" });
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : "发送失败，请稍后再试";
    uni.showToast({ title: msg, icon: "none" });
  } finally {
    if (dialog.value.kind === "bindPhone") dialog.value.sending = false;
  }
}

function _startPhoneCooldown() {
  const timer = setInterval(() => {
    if (dialog.value.kind !== "bindPhone") { clearInterval(timer); return; }
    dialog.value.cooldown -= 1;
    if (dialog.value.cooldown <= 0) clearInterval(timer);
  }, 1000);
}

async function submitBindPhone() {
  if (dialog.value.kind !== "bindPhone") return;
  const { phone, code } = dialog.value;
  if (!phone || !code) return uni.showToast({ title: "请填写手机号和验证码", icon: "none" });
  await run(async () => {
    const res = await authApi.bindPhone(phone, code);
    await auth.refreshMe();

    // 2026-09-14：手机号已属于另一个账号 → 后端把两边合并了，不是失败
    if (res.merged) {
      setTimeout(() => {
        uni.showModal({
          title: "两个账号已合并",
          content: res.message
            || "这个手机号已有账号，已把两边合并 —— 你的画匣子、合集和好友现在在一起了。",
          showCancel: false,
          confirmText: "知道了",
        });
      }, 400);
      return;
    }

    // 通知用户送了多少空间
    const gb = res.bonus_bytes ? (res.bonus_bytes / (1024 * 1024 * 1024)).toFixed(1) : "0";
    if (Number(gb) > 0) {
      setTimeout(() => {
        uni.showToast({ title: `已到账 ${gb} GB 存储空间`, icon: "none", duration: 2500 });
      }, 800);
    }
  }, "手机号已绑定");
}

async function submitUnbindPhone() {
  await run(async () => {
    await authApi.unbindPhone();
    await auth.refreshMe();
  }, "已解绑手机号");
}

// 通用提交包装：错误统一 toast，成功后关闭对话框 + 提示
async function run(fn: () => Promise<unknown>, successMsg: string) {
  if (submitting.value) return;
  submitting.value = true;
  try {
    await fn();
    uni.showToast({ title: successMsg, icon: "success" });
    dialog.value = { kind: "none" };
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : "操作失败";
    uni.showToast({ title: msg, icon: "none" });
  } finally {
    submitting.value = false;
  }
}

function openLegalPage(kind: "terms" | "privacy") {
  uni.navigateTo({ url: `/pages/legal/${kind}` });
}

function openNfcBurn() {
  uni.navigateTo({ url: "/pages/dev/nfc-burn" });
}

function openNfcWrite() {
  uni.navigateTo({ url: "/pages/dev/nfc-write" });
}

function openStorageBoost() {
  uni.navigateTo({ url: "/pages/dev/storage-boost" });
}

function onLogout() {
  uni.showModal({
    title: "退出登录",
    content: "退出后将不能查看 / 编辑你的画匣子，下次需要重新登录",
    success: (res) => {
      if (res.confirm) {
        auth.logout();
        uni.reLaunch({ url: "/pages/index/index" });
      }
    },
  });
}
import H5BackFab from "@/components/H5BackFab.vue";
</script>

<template>
  <H5BackFab />
  <view class="page">
    <LanguageSwitcher />
    <view class="hero">
      <!-- 2026-08-11：头像圈；点/长按跳换头像 -->
      <button
        class="avatar-btn"
        open-type="chooseAvatar"
        @chooseavatar="onChooseAvatar"
      >
        <image
          v-if="avatarUrl"
          class="avatar-img"
          :src="avatarUrl"
          mode="aspectFill"
        />
        <view v-else class="avatar-placeholder"><text>{{ uiText("头像") }}</text></view>
      </button>
      <text class="nick">{{ nickname || uiText("匣子用户") }}</text>
      <text class="username">@ {{ user?.username }}</text>
      <view v-if="entitlements.length" class="tags">
        <text v-for="ent in entitlements" :key="ent" class="tag">{{ ent }}</text>
      </view>
    </view>

    <view class="group">
      <view class="group-title"><text>{{ uiText("账号") }}</text></view>
      <!-- 2026-08-11：微信头像选择器（新规必须走 open-type="chooseAvatar"，getUserProfile 已废弃） -->
      <button
        class="row-avatar"
        open-type="chooseAvatar"
        @chooseavatar="onChooseAvatar"
      >
        <text>{{ uiText("更改头像") }}</text>
        <text class="row-avatar-hint">{{ uiText("点击选择微信头像") }}</text>
      </button>
      <AppRow :label='uiText("昵称")' :value="user?.nickname || ''" @click="openNickname" />
      <AppRow :label='uiText("登录用户名")' :value="user?.username || ''" @click="openUsername" />
      <AppRow
        :label="hasPassword ? uiText('修改密码') : uiText('设置密码')"
        :value="hasPassword ? uiText('已设置') : uiText('未设置')"
        @click="openPassword"
      />
    </view>

    <view class="group">
      <view class="group-title"><text>{{ uiText("旧账号 / 数据迁移") }}</text></view>
      <AppRow
        v-if="!linkedLegacy"
        :label='uiText("绑定旧画匣子账号")'
        :value="uiText('未绑定')"
        @click="openBindLegacy"
      />
      <template v-else>
        <AppRow :label='uiText("已绑定旧账号")' :value="user?.linked_legacy_user_id || ''" :arrow="false" />
        <AppRow :label='uiText("解绑")' tone="danger" :arrow="false" @click="openUnbindLegacy" />
      </template>
    </view>

    <view class="group"><view class="group-title"><text>{{ uiText("播放偏好") }}</text></view><view class="debug-setting"><view><text>{{ uiText("自动播放视频和 GIF") }}</text><text class="debug-setting-hint">{{ uiText("进入可见区域后播放；视频自动播放时静音，可手动开启声音") }}</text></view><switch :checked="playback.autoplay" @change="playback.autoplay = $event.detail.value" color="#3D2E1F" /></view></view>
    <!-- 2026-07-24 hotfix12f：手机号绑定 = 用户主观身份锚点 + 送空间引导 -->
    <view class="group">
      <view class="group-title"><text>{{ uiText("手机号") }}</text></view>
      <AppRow
        v-if="!boundPhone"
        :label='uiText("绑定手机号")'
        :value="uiText('首次绑定送 1GB 存储')"
        @click="openBindPhone"
      />
      <template v-else>
        <AppRow :label='uiText("已绑定")' :value="boundPhone" :arrow="false" />
        <AppRow :label='uiText("解绑手机号")' tone="danger" :arrow="false" @click="openUnbindPhone" />
      </template>
    </view>

    <view class="group">
      <view class="group-title"><text>{{ uiText("更多") }}</text></view>
      <AppRow v-if="!hasPresetLinks" :label='uiText("开启管理员模式")' :value="uiText('输入兑换码解锁')" @click="openRedeem" />
      <AppRow :label='uiText("兑换码")' @click="openRedeem" />
      <AppRow :label='uiText("用户协议")' @click="openLegalPage('terms')" />
      <AppRow :label='uiText("隐私协议")' @click="openLegalPage('privacy')" />
    </view>

    <view v-if="hasPresetLinks" class="group">
      <view class="group-title"><text>{{ uiText("管理员模式") }}</text></view>
      <view class="debug-setting"><view><text>{{ uiText("调试模式") }}</text><text class="debug-setting-hint">{{ uiText("默认关闭；开启后才显示模拟归档等调试入口") }}</text></view><switch :checked="debug.enabled" @change="debug.setEnabled($event.detail.value)" color="#3D2E1F" /></view>
      <AppRow :label='uiText("NFC 自动烧卡（安卓）")' :value="uiText('一贴一烧，免复制粘贴')" @click="openNfcWrite" />
      <AppRow :label='uiText("NFC 烧卡助手")' :value="uiText('手动：生成 weixin scheme')" @click="openNfcBurn" />
      <AppRow :label='uiText("扩容包管理")' :value="uiText('生成 / 查看兑换码')" @click="openStorageBoost" />
    </view>

    <view class="group">
      <AppRow :label='uiText("退出登录")' tone="danger" :arrow="false" @click="onLogout" />
    </view>

    <!-- ============== 对话框 ============== -->

    <view
      v-if="dialog.kind !== 'none'"
      class="dialog-mask"
      :class="{ 'is-submitting': submitting }"
      @click="closeDialog"
    >
      <view class="dialog" @click.stop>
        <!-- 改昵称 -->
        <template v-if="dialog.kind === 'nickname'">
          <text class="dialog-title">{{ uiText("修改昵称") }}</text>
          <text class="dialog-hint">{{ uiText("发布、评论时其他人看到的名字") }}</text>
          <input v-model="dialog.value" class="dialog-input" maxlength="32" :placeholder='uiText("新昵称")' />
        </template>

        <!-- 改用户名 -->
        <template v-else-if="dialog.kind === 'username'">
          <text class="dialog-title">{{ uiText("修改登录用户名") }}</text>
          <text class="dialog-hint">{{ uiText("用于「用户名 + 密码」登录，全局唯一，2–32 字符") }}</text>
          <input v-model="dialog.value" class="dialog-input" maxlength="32" :placeholder='uiText("新用户名")' />
        </template>

        <!-- 设/改密码 -->
        <template v-else-if="dialog.kind === 'password'">
          <text class="dialog-title">{{ hasPassword ? uiText("修改密码") : uiText("设置密码") }}</text>
          <text class="dialog-hint">
            {{ hasPassword ? uiText("请输入当前密码，再设置新密码") : uiText("设置密码后，可用「用户名 + 密码」登录") }}
          </text>
          <input
            v-if="hasPassword"
            v-model="dialog.oldVal"
            class="dialog-input"
            password
            :placeholder='uiText("当前密码")'
          />
          <input v-model="dialog.newVal" class="dialog-input" password :placeholder='uiText("新密码（≥4 位）")' />
          <input v-model="dialog.confirmVal" class="dialog-input" password :placeholder='uiText("再输一遍")' />
        </template>

        <!-- 绑定旧账号 -->
        <template v-else-if="dialog.kind === 'bindLegacy'">
          <text class="dialog-title">{{ uiText("绑定旧画匣子账号") }}</text>
          <text class="dialog-hint">{{ uiText("绑定后旧账号创建的画匣子会自动出现在主页（数据不迁移，旧账号仍可在网页端正常使用）") }}</text>
          <input v-model="dialog.username" class="dialog-input" :placeholder='uiText("旧用户名")' />
          <input v-model="dialog.password" class="dialog-input" password :placeholder='uiText("旧密码")' />
        </template>

        <!-- 解绑旧账号 -->
        <template v-else-if="dialog.kind === 'unbindLegacy'">
          <text class="dialog-title">{{ uiText("解绑旧账号") }}</text>
          <text class="dialog-hint">{{ uiText("解绑后主页将不再显示旧账号的画匣子；旧账号本身保留") }}</text>
        </template>

        <!-- 兑换码 -->
        <template v-else-if="dialog.kind === 'redeem'">
          <text class="dialog-title">{{ uiText("兑换码") }}</text>
          <text class="dialog-hint">{{ uiText("输入兑换码可解锁特殊功能（如商家批量预置链接）") }}</text>
          <input v-model="dialog.value" class="dialog-input" :placeholder='uiText("请输入兑换码")' />
        </template>


    <!-- 2026-07-24 hotfix12f：绑定手机号 -->
        <template v-else-if="dialog.kind === 'bindPhone'">
          <text class="dialog-title">{{ uiText("绑定手机号") }}</text>
          <text class="dialog-hint">{{ uiText("首次绑定送 1GB 存储空间。手机号仅用于账号登录 / 数据找回，不用于推送 / 广告") }}</text>
          <input
            v-model="dialog.phone"
            class="dialog-input"
            maxlength="11"
            type="number"
            :placeholder='uiText("11 位手机号")'
          />
          <view class="phone-code-row">
            <input
              v-model="dialog.code"
              class="dialog-input dialog-input-code"
              maxlength="6"
              type="number"
              :placeholder='uiText("6 位验证码")'
            />
            <view
              class="btn btn-ghost btn-code"
              :class="{ dim: dialog.cooldown > 0 || dialog.sending }"
              @click="sendPhoneCodeForBind"
            >
              <text>{{ dialog.cooldown > 0 ? `${dialog.cooldown}s` : (dialog.sending ? uiText("发送中…") : uiText("获取验证码")) }}</text>
            </view>
          </view>
        </template>


    <!-- 2026-07-24 hotfix12f：解绑手机号 -->
        <template v-else-if="dialog.kind === 'unbindPhone'">
          <text class="dialog-title">{{ uiText("解绑手机号") }}</text>
          <text class="dialog-hint">{{ uiText("解绑后不能用手机号登录本账号；**已到账的存储空间不会撤回**") }}</text>
        </template>

        <view class="dialog-buttons">
          <button class="btn btn-ghost" :disabled="submitting" @click="closeDialog">{{ uiText("取消") }}</button>
          <button
            v-if="dialog.kind === 'nickname'"
            class="btn btn-primary"
            :loading="submitting"
            :disabled="submitting"
            @click="submitNickname"
          >{{ uiText("保存") }}</button>
          <button
            v-else-if="dialog.kind === 'username'"
            class="btn btn-primary"
            :loading="submitting"
            :disabled="submitting"
            @click="submitUsername"
          >{{ uiText("保存") }}</button>
          <button
            v-else-if="dialog.kind === 'password'"
            class="btn btn-primary"
            :loading="submitting"
            :disabled="submitting"
            @click="submitPassword"
          >{{ uiText("保存") }}</button>
          <button
            v-else-if="dialog.kind === 'bindLegacy'"
            class="btn btn-primary"
            :loading="submitting"
            :disabled="submitting"
            @click="submitBindLegacy"
          >{{ uiText("绑定") }}</button>
          <button
            v-else-if="dialog.kind === 'unbindLegacy'"
            class="btn btn-danger"
            :loading="submitting"
            :disabled="submitting"
            @click="submitUnbindLegacy"
          >{{ uiText("确认解绑") }}</button>
          <button
            v-else-if="dialog.kind === 'redeem'"
            class="btn btn-primary"
            :loading="submitting"
            :disabled="submitting"
            @click="submitRedeem"
          >{{ uiText("兑换") }}</button>
          <button
            v-else-if="dialog.kind === 'bindPhone'"
            class="btn btn-primary"
            :loading="submitting"
            :disabled="submitting"
            @click="submitBindPhone"
          >{{ uiText("绑定") }}</button>
          <button
            v-else-if="dialog.kind === 'unbindPhone'"
            class="btn btn-danger"
            :loading="submitting"
            :disabled="submitting"
            @click="submitUnbindPhone"
          >{{ uiText("确认解绑") }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;
.debug-setting { padding: 24rpx 32rpx; display: flex; align-items: center; justify-content: space-between; gap: 24rpx; font-size: t.$font-sm; }.debug-setting > view { display: flex; flex-direction: column; gap: 8rpx; }.debug-setting-hint { font-size: t.$font-xs; color: t.$color-text-soft; }

.page {
  min-height: 100vh;
  padding: t.$spacing-3 0 t.$spacing-5;
}

.hero {
  padding: t.$spacing-5 t.$spacing-4 t.$spacing-4;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: t.$spacing-2;
  .nick {
    font-size: t.$font-xl;
    font-weight: 700;
    color: t.$color-text;
  }
  .username {
    color: t.$color-text-mute;
    font-size: t.$font-sm;
  }
}
// 头像圆按钮：微信 <button open-type="chooseAvatar"> 有默认样式（有边线 + min-width），
// 用 &::after { border:none } 和 min-width:0 复位，让它显示成纯圆头像
.avatar-btn {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  overflow: hidden;
  padding: 0;
  margin: 0 0 t.$spacing-2 0;
  background: t.$color-bg;
  border: 2rpx solid t.$color-border;
  min-width: 0;
  line-height: normal;
  display: flex;
  align-items: center;
  justify-content: center;
  &::after { border: none; }
}
.avatar-img { width: 100%; height: 100%; }
.avatar-placeholder {
  color: t.$color-text-mute;
  font-size: t.$font-xs;
}
// "更改头像" row（用 <button> 承载 chooseAvatar 事件，视觉对齐 AppRow）
.row-avatar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 32rpx;
  background: transparent;
  border: none;
  border-bottom: 2rpx solid t.$color-border;
  color: t.$color-text;
  font-size: t.$font-md;
  text-align: left;
  min-width: 0;
  line-height: normal;
  &::after { border: none; }
  .row-avatar-hint {
    color: t.$color-text-mute;
    font-size: t.$font-sm;
  }
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: t.$spacing-1;
  margin-top: t.$spacing-1;
  .tag {
    background: t.$color-accent;
    color: t.$color-text-invert;
    border-radius: t.$radius-pill;
    padding: t.$spacing-1 t.$spacing-3;
    font-size: t.$font-xs;
  }
}

.group {
  margin: t.$spacing-3 t.$spacing-3;
  border-radius: t.$radius-lg;
  background: t.$color-surface;
  box-shadow: t.$shadow-soft;
  overflow: hidden;
}
.group-title {
  padding: t.$spacing-2 t.$spacing-3 0;
  font-size: t.$font-xs;
  color: t.$color-text-mute;
}

// ---- 对话框 ----
.dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(20, 14, 8, 0.55);
  z-index: 99;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: t.$spacing-4;
  // 提交中：mask 不响应点击，避免误关 + 减少闪烁
  &.is-submitting {
    pointer-events: none;
    .dialog { pointer-events: auto; }
  }
}
.dialog {
  width: 100%;
  max-width: 600rpx;
  background: t.$color-surface;
  border-radius: t.$radius-lg;
  padding: t.$spacing-4;
  display: flex;
  flex-direction: column;
  gap: t.$spacing-3;
  box-shadow: t.$shadow-pop;
}
.dialog-title {
  font-size: t.$font-lg;
  font-weight: 600;
  color: t.$color-text;
}
.dialog-hint {
  font-size: t.$font-xs;
  color: t.$color-text-soft;
  line-height: 1.6;
}
.dialog-input {
  height: 80rpx;
  padding: 0 t.$spacing-3;
  border-radius: t.$radius-md;
  border: 2rpx solid t.$color-border;
  background: t.$color-surface-2;
  font-size: t.$font-md;
  color: t.$color-text;
}

/* 2026-07-24 hotfix12f：手机号绑定 dialog 里的验证码行 */
.phone-code-row {
  display: flex;
  gap: t.$spacing-2;
  align-items: center;
}
.dialog-input-code {
  flex: 1;
}
.btn-code {
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
}
.btn-code.dim { opacity: 0.5; }

.dialog-buttons {
  display: flex;
  gap: t.$spacing-3;
  margin-top: t.$spacing-2;
}
.btn {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  font-size: t.$font-md;
  border-radius: t.$radius-pill;
  margin: 0;
  padding: 0;
}
.btn-primary { background: t.$color-accent; color: t.$color-text-invert; }
.btn-ghost   { background: transparent; color: t.$color-text-soft; border: 2rpx solid t.$color-border; }
.btn-danger  { background: t.$color-danger; color: t.$color-text-invert; }
</style>
