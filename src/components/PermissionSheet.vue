<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 权限底部弹出栏 —— 合并「分享」+「邀请」入口。
 *
 * 参考：用户 2026-07-13 需求 —— 分享按钮点击后弹出二级 bar，两根滑条表达
 *   - 范围（4 档）：私密 / 已分享的人 / 所有好友 / 公开
 *   - 等级（3 档）：仅查看 / 可编辑 / 可编辑并分享
 *
 * 与 backend 的关系：
 *   - 目前 backend share_entity 没有 visibility / access_level 字段（本轮不改 backend）
 *   - 本组件先做 UI 骨架 + 本地态；下一轮 backend 加字段后 save 事件才真正写数据库
 *   - 「分享到微信」通过 <button open-type="share"> 触发（页面自身 onShareAppMessage 生成卡片）
 *   - 「邀请共创」emit 'invite'，由页面决定跳邀请页
 *
 * 权限模型语义（与用户对齐）：
 *   - 只有 canManage=true（owner）能改滑条；非 owner 只读展示
 *   - 「所有好友」需 backend 好友系统落地才实际生效；未落地时保存后按「公开」等价处理
 */
import { computed, ref, watch } from "vue";
import SvgIcon from "@/components/SvgIcon.vue";

type ScopeLevel = 0 | 1 | 2 | 3;
type PermLevel = 0 | 1 | 2;
type NfcAccess = "off" | "view" | "edit";

interface Props {
  open: boolean;
  canManage: boolean;
  scope?: ScopeLevel;
  level?: PermLevel;
  nfcAccess?: NfcAccess;
  canInvite: boolean;
  subjectTitle: string;
}
const props = withDefaults(defineProps<Props>(), { scope: 1, level: 0, nfcAccess: "view" });

const emit = defineEmits<{
  (e: "update:open", v: boolean): void;
  (e: "save", payload: { scope: ScopeLevel; level: PermLevel; nfc_access: NfcAccess }): void;
  (e: "invite"): void;
  (e: "copyLink"): void;
}>();

// 2026-08-11 redesign：文案简化 + NFC 与链接分享共用「能做什么」滑条
//   之前 3 根滑条（NFC + 可见性 + 能做什么）用户反馈太复杂；合成 2 根：
//     ① 谁能看到（scope 4 档）
//     ② 能做什么（level 3 档，同时套给 NFC 触达者：level=0 → nfc='view', level≥1 → nfc='edit'）
//   如果整份要"仅自己可见"，把第一根拨到"私密"，就把 NFC 也一并挡下（backend
//   can_view_share_via_nfc 的 nfc_access='off' 语义被 visibility=private 覆盖）
const SCOPE_LABELS = ["私密", "有链接的人", "好友", "公开"];
const SCOPE_HINTS = [
  "只有你自己能看",
  "有链接的人能看（NFC 也算）",
  "画匣子里的好友能看",
  "任何人都能看",
];
const LEVEL_LABELS = ["只能看", "能编辑", "能编辑再分享"];
const LEVEL_HINTS = [
  "别人只能浏览，不能修改",
  "别人能追加章节 / 改文字",
  "别人能编辑，也能拉朋友一起编辑",
];

const scopeIdx = ref<ScopeLevel>(props.scope);
const levelIdx = ref<PermLevel>(props.level);

// level → nfc_access 派生：只看 → view；能编辑及以上 → edit
function _levelToNfc(l: PermLevel): NfcAccess {
  return l === 0 ? 'view' : 'edit';
}

watch(() => props.open, (v) => {
  if (v) {
    scopeIdx.value = props.scope;
    levelIdx.value = props.level;
  }
});
watch(() => props.scope, (v) => { if (props.open) scopeIdx.value = v; });
watch(() => props.level, (v) => { if (props.open) levelIdx.value = v; });

const dirty = computed(
  () =>
    scopeIdx.value !== props.scope
    || levelIdx.value !== props.level
    || _levelToNfc(levelIdx.value) !== props.nfcAccess,
);

function close() { emit("update:open", false); }

function pickScope(i: number) {
  if (!props.canManage) return;
  scopeIdx.value = i as ScopeLevel;
}
function pickLevel(i: number) {
  if (!props.canManage) return;
  levelIdx.value = i as PermLevel;
}

function onSave() {
  if (!props.canManage || !dirty.value) { close(); return; }
  emit("save", {
    scope: scopeIdx.value,
    level: levelIdx.value,
    nfc_access: _levelToNfc(levelIdx.value),
  });
}

function onCopyLink() { emit("copyLink"); close(); }
function onShareToWx() { close(); }
</script>

<template>
  <view v-if="open" class="overlay" @click="close">
    <view class="sheet" @click.stop>
      <view class="sheet-header">
        <view class="handle-bar" />
        <text class="sheet-title">{{ uiText("分享权限") }}</text>
        <text class="sheet-sub">「{{ subjectTitle || uiText("画匣子") }}」</text>
      </view>

      <scroll-view scroll-y class="sheet-scroll">
      <!-- 2026-08-11 redesign：两根滑条（谁能看到 + 能做什么）；
           NFC 触达者的能力和链接分享共享 level 值（level → nfc_access 派生） -->
      <view class="section">
        <view class="section-head">
          <text class="section-label">{{ uiText("谁能看到") }}</text>
          <text v-if="!canManage" class="lock-tag">{{ uiText("仅创建者可改") }}</text>
        </view>
        <view class="track" :class="{ 'is-readonly': !canManage }">
          <view class="track-inner">
            <view class="track-line" />
            <view
              class="track-line-fill"
              :style="{ width: (scopeIdx / (SCOPE_LABELS.length - 1) * 100) + '%' }"
            />
            <view
              v-for="(l, i) in SCOPE_LABELS"
              :key="'sc'+i"
              class="track-dot"
              :class="{
                active: scopeIdx === i,
                done: i < scopeIdx,
                'is-first': i === 0,
                'is-last': i === SCOPE_LABELS.length - 1,
              }"
              :style="{ left: (i / (SCOPE_LABELS.length - 1) * 100) + '%' }"
              @click="pickScope(i)"
            >
              <view class="dot" />
              <text class="dot-label">{{ l }}</text>
            </view>
          </view>
        </view>
        <text class="hint-line">{{ SCOPE_HINTS[scopeIdx] }}</text>
      </view>

      <view class="divider" />

      <view class="section">
        <view class="section-head">
          <text class="section-label">{{ uiText("能做什么") }}</text>
          <text v-if="!canManage" class="lock-tag">{{ uiText("仅创建者可改") }}</text>
        </view>
        <view class="track" :class="{ 'is-readonly': !canManage }">
          <view class="track-inner">
            <view class="track-line" />
            <view
              class="track-line-fill"
              :style="{ width: (levelIdx / (LEVEL_LABELS.length - 1) * 100) + '%' }"
            />
            <view
              v-for="(l, i) in LEVEL_LABELS"
              :key="'lv'+i"
              class="track-dot"
              :class="{
                active: levelIdx === i,
                done: i < levelIdx,
                'is-first': i === 0,
                'is-last': i === LEVEL_LABELS.length - 1,
              }"
              :style="{ left: (i / (LEVEL_LABELS.length - 1) * 100) + '%' }"
              @click="pickLevel(i)"
            >
              <view class="dot" />
              <text class="dot-label">{{ l }}</text>
            </view>
          </view>
        </view>
        <text class="hint-line">{{ LEVEL_HINTS[levelIdx] }}</text>
        <text class="hint-line hint-sub">{{ uiText("NFC 贴一贴的人 和 拿到链接的人 权限一样") }}</text>
      </view>

      <view v-if="canManage && dirty" class="dirty-banner">
        <text>{{ uiText("权限已修改，保存后生效") }}</text>
        <view class="dirty-btn" @click="onSave"><text>{{ uiText("保存") }}</text></view>
      </view>

      <view class="divider thick" />

      <!-- 2026-07-19：actions-grid 只保留 "分享到微信" + "复制链接"；
           删除「邀请共创」cell —— 那是 Bug C 旧遗留（点击后隐式改 access_level=2）。
           邀请共创现在通过播放页汉堡菜单里独立入口触发，不再耦合权限面板。 -->
      <view class="actions-grid actions-grid-2">
        <button class="action-cell" open-type="share" @click="onShareToWx">
          <view class="action-icon">
            <SvgIcon name="share" size="32rpx" color="#3D2E1F" />
          </view>
          <text>{{ uiText("分享到微信") }}</text>
        </button>
        <view class="action-cell" @click="onCopyLink">
          <view class="action-icon">
            <SvgIcon name="folder" size="32rpx" color="#3D2E1F" />
          </view>
          <text>{{ uiText("复制链接") }}</text>
        </view>
      </view>
      </scroll-view>

      <view class="close-row" @click="close">
        <text>{{ uiText("关闭") }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  z-index: 200;
  display: flex; align-items: flex-end;
}
.sheet {
  width: 100%;
  background: t.$color-bg;
  border-top-left-radius: 40rpx;
  border-top-right-radius: 40rpx;
  // 2026-07-14 用户反馈"左右太靠边，有些字溢出屏幕"
  //   sheet 左右 padding 从 t.$spacing-4 (32rpx) 缩到 t.$spacing-3 (24rpx)
  //   给内部滑条 + 动作 grid 让出更多有效宽度
  padding: t.$spacing-3 t.$spacing-3 calc(env(safe-area-inset-bottom) + #{t.$spacing-4});
  display: flex; flex-direction: column;
  gap: t.$spacing-3;
  box-shadow: 0 -12rpx 32rpx rgba(61, 46, 31, 0.10);
}
.sheet-header {
  display: flex; flex-direction: column; align-items: center;
  gap: 4rpx;
  padding-bottom: t.$spacing-2;
}
// 2026-07-19：sheet 内容增加到 3 段（NFC + 链接可见 + 链接能力）+ 底部 actions + close，
// 在小屏机型（如 iPhone SE 568rpx 高）可能顶出屏幕外。用 scroll-view 承载内容主体，
// max-height 留出安全区 + 底部 close-row 空间。
.sheet-scroll {
  max-height: 65vh;
}
.handle-bar {
  width: 60rpx; height: 6rpx;
  background: t.$color-border;
  border-radius: 999rpx;
  margin-bottom: t.$spacing-2;
}
.sheet-title {
  font-size: t.$font-lg;
  font-weight: t.$weight-bold;
  color: t.$color-text;
}
.sheet-sub {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
}

.section {
  display: flex; flex-direction: column;
  gap: t.$spacing-2;
  padding: t.$spacing-2 4rpx;
}
.section-head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: t.$spacing-2;
}
.section-label {
  font-size: t.$font-sm;
  font-weight: t.$weight-bold;
  color: t.$color-text;
}
.lock-tag {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
}

// —— 权限滑条重做（2026-07-13 用户反馈条与点没贴合） ——
// 关键：dot 用绝对定位到 percent，线只画在 dot 中心之间，line-fill 用同一 percent 系统
// 内部容器 track-inner 有左右对称的水平 padding（= dot 半径 20rpx），保证第一/最后一个点
// 的中心正好落在 padding 起止点上，线和点严丝合缝。
$dot-size: 40rpx;

.track {
  position: relative;
  // 2026-07-26：首/末档 label 被屏幕边缘裁切（is-first/is-last 在部分 mp-weixin
  // 基础库不生效，label 仍居中，压到边界）。整条滑轨左右各内缩 48rpx 兜底，
  // 给最长的边缘 label（如「可编辑并分享」6 字）留出居中溢出所需空间。
  padding: 12rpx 56rpx 60rpx;   // 顶部给光晕留 breathing，底部留 label，左右防溢出
  &.is-readonly { opacity: 0.72; }
}
.track-inner {
  position: relative;
  width: 100%;
  height: $dot-size;
  padding: 0 calc($dot-size / 2);
  box-sizing: border-box;
}
.track-line {
  position: absolute;
  left: calc($dot-size / 2);
  right: calc($dot-size / 2);
  top: 50%;
  height: 4rpx;
  transform: translateY(-50%);
  background: t.$color-border;
  border-radius: 999rpx;
  z-index: 0;
}
.track-line-fill {
  position: absolute;
  left: calc($dot-size / 2);
  top: 50%;
  height: 4rpx;
  max-width: calc(100% - $dot-size);
  transform: translateY(-50%);
  background: t.$color-accent;
  border-radius: 999rpx;
  z-index: 1;
  transition: width 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.track-dot {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: $dot-size;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  z-index: 2;
}
.dot {
  width: $dot-size; height: $dot-size;
  border-radius: 50%;
  background: t.$color-surface;
  border: 4rpx solid t.$color-border;
  box-sizing: border-box;
  transition:
    background 0.2s cubic-bezier(0.22, 0.61, 0.36, 1),
    border-color 0.2s cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.2s ease;
}
.track-dot.done .dot,
.track-dot.active .dot {
  background: t.$color-accent;
  border-color: t.$color-accent;
}
.track-dot.active .dot {
  transform: scale(1.24);
  box-shadow: 0 0 0 10rpx rgba(61, 46, 31, 0.14);
}
.dot-label {
  position: absolute;
  top: calc(#{$dot-size} + 8rpx);
  left: 50%;
  transform: translateX(-50%);
  font-size: 22rpx;
  color: t.$color-text-soft;
  text-align: center;
  white-space: nowrap;
  transition: color 0.15s;
}
.track-dot.active .dot-label {
  color: t.$color-text;
  font-weight: t.$weight-bold;
}
// 2026-07-14：最左档 label 左对齐、最右档右对齐，避免"公开"/"可编辑并分享"溢出屏幕
// 早期版本用 :first-child / :last-child，但 track-inner 里 track-dot 之前还有
// .track-line + .track-line-fill 两个兄弟 → :first-child 匹配不到 track-dot，
// :last-child 是 track-dot 但 mp-weixin 某些基础库有 bug 也不稳。
// **改用显式 is-first / is-last class**（v-for 里 i===0 / i===len-1 判定），稳如 gou。
.track-dot.is-first .dot-label {
  left: 0;
  transform: none;
  text-align: left;
}
.track-dot.is-last .dot-label {
  left: auto;
  right: 0;
  transform: none;
  text-align: right;
}

.hint-line {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
  line-height: 1.4;
  padding: 0 4rpx;
}
// NFC/链接共用说明：淡一点，避免和主 hint 抢焦点
.hint-line.hint-sub {
  color: t.$color-text-soft;
  font-size: 22rpx;
  margin-top: 4rpx;
}

.divider { height: 2rpx; background: t.$color-border; opacity: 0.6; }
.divider.thick { height: 4rpx; margin: t.$spacing-2 0; opacity: 0.4; }

.dirty-banner {
  display: flex; align-items: center; justify-content: space-between;
  gap: t.$spacing-2;
  padding: 16rpx 24rpx;
  background: rgba(61, 46, 31, 0.06);
  border-radius: t.$radius-md;
  font-size: t.$font-sm;
  color: t.$color-text;
}
.dirty-btn {
  padding: 8rpx 24rpx;
  border-radius: 999rpx;
  background: t.$color-accent;
  color: t.$color-text-invert;
  font-size: t.$font-sm;
  font-weight: t.$weight-bold;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  // 2026-07-14 用户反馈"邀请共创"在最右溢出屏幕：gap 缩到 8rpx（原 16rpx）
  gap: 8rpx;
}
.action-cell {
  display: flex; flex-direction: column; align-items: center;
  gap: 8rpx;
  // padding 左右从 8rpx → 4rpx，让文字有更多空间
  padding: 20rpx 4rpx;
  border-radius: t.$radius-md;
  background: t.$color-surface;
  border: 2rpx solid t.$color-border;
  color: t.$color-text;
  // font-size 从 sm(28rpx) 缩到 xs(24rpx)；4 字标签更保守
  font-size: t.$font-xs;
  text-align: center;
  min-width: 0;
  line-height: 1.3;
  // 强制不换行 + overflow 隐藏，宁可省略号也别叠成两行
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.action-icon {
  width: 56rpx; height: 56rpx;
  border-radius: 50%;
  background: t.$color-bg;
  display: flex; align-items: center; justify-content: center;
}

.close-row {
  display: flex; align-items: center; justify-content: center;
  padding: 20rpx 0 8rpx;
  color: t.$color-text-soft;
  font-size: t.$font-sm;
}
</style>
