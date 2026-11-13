<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 集合详情页 —— 列出集合内所有章节（按 chapter_index 顺序）。
 *
 * 参考：annualreport/src/views/GroupView.vue
 * 后端：GET /api/group/<id>/memories → { memories, max_members? }
 *
 * 章节点击：跳 share/play。
 * 顶部「追加章节」：写 PENDING_GROUP_ID 后切到上传 tab，CreationFlow 启动时预填集合。
 */
import { ref, computed, onMounted } from "vue";
import { onLoad, onShareAppMessage } from "@dcloudio/uni-app";
import { storeToRefs } from "pinia";
import { fetchGroupMemories, deleteMyShareInGroup, type GroupMemory } from "@/api/group";
import { useAuthStore } from "@/stores/auth";
import { ApiError } from "@/api/request";
import { STATIC_BASE, STORAGE_KEYS } from "@/config/env";
import { logger } from "@/utils/logger";
import SvgIcon from "@/components/SvgIcon.vue";
import CustomTabBar from "@/components/CustomTabBar.vue";
import PermissionSheet from "@/components/PermissionSheet.vue";

const auth = useAuthStore();
const { user, isLoggedIn } = storeToRefs(auth);

// 当前用户的 id 集合（含绑定的 legacy_user_id）——用于判定章节是不是我写的
// 后端所有按 user_id 过滤查询都会 union legacy_user_id（README「合并查询」小节），
// 前端展示层判定也要 union，避免微信新账号绑定旧账号后看不到"我写的"标记
const myUserIds = computed<Set<string>>(() => {
  const s = new Set<string>();
  const u = user.value;
  if (u?.user_id) s.add(u.user_id);
  if (u?.linked_legacy_user_id) s.add(u.linked_legacy_user_id);
  return s;
});
function isMineChapter(m: GroupMemory) {
  return !!m.author_user_id && myUserIds.value.has(m.author_user_id);
}

const groupId = ref("");
const groupName = ref("");
const memories = ref<GroupMemory[]>([]);
const loading = ref(true);
const errorMsg = ref("");

// 展示用名字：与 GroupFolderCard 保持一致的兜底规则 —— 后端在标题空时回落到 group_id
// （形如 "zHRGlyhA…"），用户看到觉得是乱码；此时统一显示「画匣子合集」
const displayedGroupName = computed(() => {
  if (!groupName.value || groupName.value === groupId.value) return "合集";
  return groupName.value;
});

onLoad((opt) => {
  groupId.value = (opt?.id as string) || "";
  // navigateTo 时手动 encodeURIComponent 过；onLoad 在 mp-weixin 不会自动解码，
  // 不解会显示 %E7%AA%97... 这种字面值。decode 失败兜底原值。
  const rawName = (opt?.name as string) || "";
  try { groupName.value = decodeURIComponent(rawName); }
  catch { groupName.value = rawName; }
});

onMounted(async () => {
  try { uni.hideTabBar({ animation: false, fail: () => {} }); } catch { /* h5 fallback */ }
  if (!groupId.value) {
    errorMsg.value = "缺少 id 参数";
    loading.value = false;
    return;
  }
  try {
    const r = await fetchGroupMemories(groupId.value);
    memories.value = r.memories || [];
  } catch (e) {
    errorMsg.value = e instanceof ApiError ? e.message : "加载失败";
    logger.warn("[group] load failed", e);
  } finally {
    loading.value = false;
  }
});

function resolveCover(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${STATIC_BASE}${url}`;
  return url;
}

function openMemory(m: GroupMemory) {
  if (!m.share_id) return;
  // 带上 gid：play.vue 检测到 gid 即拉 group memories，展示「上一章 / 下一章 / 回集合」
  logger.info("[group] openMemory", { share_id: m.share_id, gid: groupId.value });
  uni.navigateTo({
    url: `/pages/share/play?id=${encodeURIComponent(m.share_id)}&gid=${encodeURIComponent(groupId.value)}`,
  });
}

// 单章删除：只允许删除自己写的章节
// 后端 DELETE /group/<gid>/my-share?share_id=<sid> 精确匹配（2026-07-09 加的 share_id 参数）
// creator 删原始章 = 级联清空整个合集，会给二次确认里提示
async function onDeleteChapter(m: GroupMemory, ev?: Event) {
  // 卡片外层有 @click=openMemory，删除按钮点击必须阻断冒泡；mp-weixin 里 .stop 修饰符已足够
  // 但传入 ev 作为兜底保险（有些 uni 版本 @click.stop 会漏 pass event 参数）
  ev && (ev as unknown as { stopPropagation?: () => void }).stopPropagation?.();
  if (!isLoggedIn.value) {
    uni.showToast({ title: "请先登录", icon: "none" });
    return;
  }
  if (!isMineChapter(m)) return;

  const isOrigin = m.share_id === groupId.value;
  const warn = isOrigin
    ? "这是合集的原始章节，删除后整个合集会一起消失（其他成员的章节将回落成独立画匣子）。确定删除？"
    : `确定删除「${m.title || "未命名"}」这一章吗？删除后无法恢复`;

  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: "删除章节",
      content: warn,
      confirmText: "删除",
      confirmColor: "#C13939",
      cancelText: "取消",
      success: (r) => resolve(r.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;

  uni.showLoading({ title: "删除中…" });
  try {
    await deleteMyShareInGroup(groupId.value, m.share_id);
    // 本地摘掉这一章 → 立即反馈；如果是 origin 删除，重拉 backend 也会返 404
    memories.value = memories.value.filter((it) => it.share_id !== m.share_id);
    uni.hideLoading();
    uni.showToast({ title: "已删除", icon: "success" });
    // 如果删了原始章（origin），整个合集已被后端清空 → 回首页
    if (isOrigin) {
      setTimeout(() => uni.reLaunch({ url: "/pages/index/index" }), 700);
      return;
    }
    // 如果本合集只剩 0 章，也回首页（避免留在空页）
    if (memories.value.length === 0) {
      setTimeout(() => uni.reLaunch({ url: "/pages/index/index" }), 700);
    }
  } catch (e) {
    uni.hideLoading();
    const msg = e instanceof ApiError ? e.message : "删除失败";
    uni.showToast({ title: msg, icon: "none", duration: 2500 });
    logger.warn("[group] delete chapter failed", e);
  }
}

function onAddChapter() {
  if (!groupId.value) return;
  try {
    uni.setStorageSync(STORAGE_KEYS.PENDING_GROUP_ID, groupId.value);
    uni.setStorageSync(STORAGE_KEYS.PENDING_GROUP_NAME, groupName.value || "");
  } catch { /* ignore */ }
  uni.switchTab({ url: "/pages/upload/index" });
}

function onBack() {
  // 微信分享卡片直入本页时页面栈只有 1 → navigateBack 会静默失败
  // 兜底：无栈时 reLaunch 到主页，避免出现"点了没反应"的死路
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.reLaunch({ url: "/pages/index/index" });
}

// 合集封面：取第一章的 cover_url，回退 STATIC 空
const groupCover = computed(() => {
  const first = memories.value.find((m) => m.cover_url);
  return first?.cover_url ? resolveCover(first.cover_url) : "";
});

// —— 权限底部弹出栏（合并「分享」+「权限」+「邀请」）——
// 合集内还没有独立的 owner/editor 权限模型，暂用「是不是我创建的」推断 canManage
// 判定规则：memories 数组里第一个（origin 章节）是我写的 → 我是合集 owner
const isGroupOwner = computed(() => {
  const origin = memories.value.find((m) => m.share_id === groupId.value);
  return origin ? isMineChapter(origin) : false;
});
const permissionSheetOpen = ref(false);
const localScope = ref<0 | 1 | 2 | 3>(1);
const localLevel = ref<0 | 1 | 2>(0);
function openPermissionSheet() { permissionSheetOpen.value = true; }
function onSavePermissions(payload: { scope: 0 | 1 | 2 | 3; level: 0 | 1 | 2 }) {
  // 下一轮 backend 落地后：调 PUT /group/<id>/permissions
  localScope.value = payload.scope;
  localLevel.value = payload.level;
  permissionSheetOpen.value = false;
  uni.showToast({ title: "权限已更新（本地）", icon: "none", duration: 2500 });
}
function onInviteGroup() {
  uni.showToast({ title: "合集邀请共创即将开放", icon: "none", duration: 2000 });
}
function onCopyGroupLink() {
  const link = `${STATIC_BASE}/group/${groupId.value}`;
  uni.setClipboardData({ data: link, success: () => uni.showToast({ title: "链接已复制", icon: "success" }) });
}

// 微信原生分享：分享整个合集（跳转到本页）而非某一章
onShareAppMessage(() => {
  const name = displayedGroupName.value;
  logger.info("[group] onShareAppMessage", { gid: groupId.value, name });
  return {
    title: `「${name}」· 一份共同回忆`,
    path: `/pages/group/index?id=${encodeURIComponent(groupId.value)}&name=${encodeURIComponent(name)}`,
    imageUrl: groupCover.value,
  };
});
</script>

<template>
  <view class="page">
    <view class="topbar">
      <view class="back-btn" @click="onBack">
        <SvgIcon name="chevron-left" size="36rpx" />
      </view>
      <view class="topbar-info">
        <text class="topbar-title">{{ displayedGroupName }}</text>
        <text class="topbar-sub">{{ memories.length }} {{ uiText("个章节") }}</text>
      </view>
      <view class="topbar-placeholder" />
    </view>

    <view v-if="loading" class="state"><text>{{ uiText("加载中…") }}</text></view>

    <view v-else-if="errorMsg" class="state state-err">
      <text class="state-title">{{ uiText("加载失败") }}</text>
      <text>{{ uiText(errorMsg) }}</text>
    </view>

    <view v-else-if="memories.length === 0" class="state">
      <text>{{ uiText("合集内还没有章节") }}</text>
      <view class="btn-primary" @click="onAddChapter"><text>{{ uiText("追加章节") }}</text></view>
    </view>

    <scroll-view v-else scroll-y class="scroll">
      <view class="list">
        <view
          v-for="m in memories"
          :key="m.share_id"
          class="card"
          hover-class="card-hover"
          :hover-stay-time="80"
          @click="openMemory(m)"
        >
          <view v-if="m.cover_url" class="card-bg">
            <image :src="resolveCover(m.cover_url)" mode="aspectFill" class="bg-img" />
          </view>
          <view v-else class="card-bg-fallback" />
          <view class="card-mask" />
          <view class="card-content">
            <view class="card-text">
              <text class="card-title">{{ m.title || uiText("未命名") }}</text>
              <text v-if="m.chapter_index || m.author_name" class="card-sub">
                {{ uiText("第") }} {{ m.chapter_index || 1 }} {{ uiText("节") }}<text v-if="m.author_name"> · {{ m.author_name }}</text>
              </text>
            </view>
            <!-- 单章删除：仅"这章是我写的"时显示；@click.stop 防止冒泡到 openMemory -->
            <view
              v-if="isMineChapter(m)"
              class="card-delete"
              hover-class="card-delete-hover"
              catchtap="true"
              @click.stop="onDeleteChapter(m, $event)"
            >
              <SvgIcon name="trash" size="28rpx" color="#F7F3EE" />
            </view>
          </view>
        </view>
      </view>

      <view class="actions">
        <view class="btn-primary" @click="onAddChapter">
          <SvgIcon name="plus" size="28rpx" color="#F7F3EE" />
          <text>{{ uiText("追加章节") }}</text>
        </view>
        <!-- 合集整体分享：合并「分享 / 权限 / 邀请」入 PermissionSheet；
             真正的微信卡片分享由 sheet 里的 <button open-type="share"> + 本页 onShareAppMessage 完成 -->
        <view class="btn-secondary" @click="openPermissionSheet">
          <SvgIcon name="share" size="28rpx" color="#3D2E1F" />
          <text>{{ uiText("分享合集") }}</text>
        </view>
      </view>

      <view class="bottom-spacer" />
    </scroll-view>

    <CustomTabBar active="home" />

    <PermissionSheet
      :open="permissionSheetOpen"
      :can-manage="isGroupOwner"
      :can-invite="isGroupOwner"
      :scope="localScope"
      :level="localLevel"
      :subject-title="displayedGroupName"
      @update:open="(v) => (permissionSheetOpen = v)"
      @save="onSavePermissions"
      @invite="onInviteGroup"
      @copy-link="onCopyGroupLink"
    />
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.page {
  height: 100vh;
  background: t.$color-bg;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: t.$spacing-3 t.$spacing-4;
  border-bottom: 2rpx solid t.$color-border;
  background: t.$color-bg;
}
.topbar-info {
  flex: 1;
  display: flex; flex-direction: column; align-items: center;
  min-width: 0;
}
.topbar-title {
  font-size: t.$font-md; font-weight: t.$weight-bold; color: t.$color-text;
  max-width: 60vw;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.topbar-sub { font-size: t.$font-xs; color: t.$color-text-mute; }
.topbar-placeholder { width: 64rpx; }
.back-btn {
  width: 64rpx; height: 64rpx; border-radius: 50%;
  background: t.$color-surface;
  display: flex; align-items: center; justify-content: center;
}

.state {
  padding: t.$spacing-6 t.$spacing-4;
  display: flex; flex-direction: column;
  align-items: center; gap: t.$spacing-3;
  color: t.$color-text-soft;
  font-size: t.$font-sm;
  text-align: center;
  &.state-err .state-title {
    color: t.$color-danger;
    font-size: t.$font-lg;
    font-weight: t.$weight-bold;
  }
}

.scroll { flex: 1 1 0; }

.list {
  display: flex; flex-direction: column;
  gap: t.$spacing-4;
  padding: t.$spacing-4;
}

.card {
  position: relative;
  width: 100%;
  height: 224rpx;
  border-radius: 40rpx;
  overflow: hidden;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.10);
}
.card-hover { opacity: 0.85; }

.card-bg { position: absolute; inset: 0; z-index: 1; }
.bg-img { width: 100%; height: 100%; }
.card-bg-fallback { position: absolute; inset: 0; z-index: 1; background: t.$color-surface-2; }

.card-mask {
  position: absolute; inset: 0; z-index: 2;
  background: linear-gradient(to right,
    rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.45) 50%, transparent 100%);
}
.card-content {
  position: relative; z-index: 3;
  display: flex; align-items: center; justify-content: space-between; height: 100%;
  padding: 0 48rpx;
  gap: t.$spacing-3;
}
.card-text {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 8rpx;
  max-width: 70%;
  color: #F7F3EE;
}
.card-delete {
  flex-shrink: 0;
  width: 64rpx; height: 64rpx;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  display: flex; align-items: center; justify-content: center;
  border: 2rpx solid rgba(247, 243, 238, 0.4);
}
.card-delete-hover { background: rgba(193, 57, 57, 0.75); }
.card-title {
  font-size: 36rpx; font-weight: t.$weight-bold;
  text-shadow: 0 4rpx 8rpx rgba(0,0,0,0.30);
  overflow: hidden; text-overflow: ellipsis;
}
.card-sub {
  font-size: 24rpx; opacity: 0.9;
  text-shadow: 0 2rpx 4rpx rgba(0,0,0,0.20);
}

.actions {
  padding: 0 t.$spacing-4;
  display: flex; justify-content: center;
  gap: t.$spacing-3;
  flex-wrap: wrap;
}
.btn-primary {
  display: inline-flex; align-items: center; gap: 8rpx;
  padding: 20rpx 48rpx;
  border-radius: 999rpx;
  background: t.$color-accent;
  color: t.$color-text-invert;
  font-size: t.$font-md;
}
.btn-secondary {
  display: inline-flex; align-items: center; gap: 8rpx;
  padding: 20rpx 48rpx;
  border-radius: 999rpx;
  background: t.$color-surface;
  border: 2rpx solid t.$color-border;
  color: t.$color-text;
  font-size: t.$font-md;
  line-height: normal;
}

.bottom-spacer { height: calc(200rpx + env(safe-area-inset-bottom)); }
</style>
