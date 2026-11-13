<script setup lang="ts">
import { displayContentTitle, mediaKind } from "@/features/nfc/content";
import { t as uiText } from "@/i18n";
/**
 * 好友页 —— 我的 tab 里的入口跳过来
 *
 * 三段：
 *   1. 加好友输入（user_id 或 username 精确搜）
 *   2. 收到的请求（可接受 / 拒绝）
 *   3. 我的好友（可解除）
 *   4. 我发出去的请求（可撤回）
 *
 * 参考 backend：F:\xiedao\vue\demo\arbackend\src\presentation\controllers\friend_controller.py
 */
import { ref, onMounted, computed } from "vue";
import { onShow } from "@dcloudio/uni-app";
import {
  fetchFriendList,
  searchUserForAdd,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriendship,
  type FriendListResp,
  type UserProfileLite,
} from "@/api/friend";
import { fetchFriendsFeed, type FriendFeedItem } from "@/api/share";
import { ApiError } from "@/api/request";
import { logger } from "@/utils/logger";
import SvgIcon from "@/components/SvgIcon.vue";
import MasonryFeed, { type MasonryItem } from "@/components/MasonryFeed.vue";

const loading = ref(true);
const listData = ref<FriendListResp>({ friends: [], incoming: [], outgoing: [] });

const searchQuery = ref("");
const searchLoading = ref(false);
const searched = ref<UserProfileLite | null>(null);
const searchNotFound = ref(false);
const sending = ref(false);

const friendsCount = computed(() => listData.value.friends.length);
const incomingCount = computed(() => listData.value.incoming.length);

// 2026-07-13：好友画匣子流（发现流）—— 画匣子好友 + 互相看过 share 的微信用户
const feedItems = ref<FriendFeedItem[]>([]);
const feedLoading = ref(false);
const feedMasonry = computed<MasonryItem[]>(() =>
  feedItems.value.map((it) => ({
    id: `feed:${it.share_id}`,
    cover_url: it.cover_image || "",
    title: displayContentTitle(it.report_title || uiText("未命名")),
    subtitle: (it.created_at || "").slice(0, 10),
    badge: it.share_type === "album" ? "相册" : "",
    badge_tone: it.share_type === "album" ? "primary" : undefined,
  })),
);
async function loadFeed() {
  feedLoading.value = true;
  try {
    feedItems.value = await fetchFriendsFeed(60);
  } catch (e) {
    logger.info("[friends] feed fetch failed (silent)", e);
    feedItems.value = [];
  } finally {
    feedLoading.value = false;
  }
}
function onPickFeed(it: MasonryItem) {
  const sid = it.id.slice("feed:".length);
  const target = feedItems.value.find((x) => x.share_id === sid);
  if (!target) return;
  const url = target.share_type === "album"
    ? `/pages/album/index?id=${encodeURIComponent(sid)}`
    : `/pages/share/play?id=${encodeURIComponent(sid)}`;
  uni.navigateTo({ url });
}

async function refresh() {
  loading.value = true;
  try {
    listData.value = await fetchFriendList();
    void loadFeed();  // 并行拉发现流；静默失败
  } catch (e) {
    logger.warn("[friends] load failed", e);
    if (e instanceof ApiError && (e.httpCode === 401 || e.bizCode === "NO_TOKEN")) {
      uni.showModal({
        title: "需要登录",
        content: "查看好友需要先登录",
        confirmText: "去登录",
        cancelText: "返回",
        success: (r) => {
          if (r.confirm) uni.navigateTo({ url: "/pages/auth/login" });
          else uni.navigateBack();
        },
      });
      return;
    }
    uni.showToast({
      title: e instanceof ApiError ? e.message : "加载失败",
      icon: "none",
    });
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
onShow(() => {
  if (!loading.value) refresh();
});

async function onSearch() {
  const q = searchQuery.value.trim();
  if (!q) return;
  searchLoading.value = true;
  searched.value = null;
  searchNotFound.value = false;
  try {
    const p = await searchUserForAdd(q);
    if (p) searched.value = p;
    else searchNotFound.value = true;
  } catch (e) {
    logger.warn("[friends] search failed", e);
    uni.showToast({
      title: e instanceof ApiError ? e.message : "搜索失败",
      icon: "none",
    });
  } finally {
    searchLoading.value = false;
  }
}

async function onSendRequest() {
  const target = searched.value;
  if (!target || sending.value) return;
  sending.value = true;
  try {
    await sendFriendRequest(target.user_id);
    uni.showToast({ title: "已发送请求", icon: "success" });
    searched.value = null;
    searchQuery.value = "";
    await refresh();
  } catch (e) {
    logger.warn("[friends] send request failed", e);
    uni.showToast({
      title: e instanceof ApiError ? e.message : "发送失败",
      icon: "none", duration: 3000,
    });
  } finally {
    sending.value = false;
  }
}

async function onAcceptRequest(friendshipId: string) {
  try {
    await acceptFriendRequest(friendshipId);
    uni.showToast({ title: "已接受", icon: "success" });
    await refresh();
  } catch (e) {
    uni.showToast({
      title: e instanceof ApiError ? e.message : "接受失败",
      icon: "none", duration: 3000,
    });
  }
}

async function onRejectRequest(friendshipId: string, name: string) {
  const ok = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: "拒绝好友请求？",
      content: `确认拒绝「${name}」的好友请求？`,
      confirmText: "拒绝",
      confirmColor: "#C13939",
      success: (r) => resolve(r.confirm),
      fail: () => resolve(false),
    });
  });
  if (!ok) return;
  try {
    await removeFriendship(friendshipId);
    uni.showToast({ title: "已拒绝", icon: "none" });
    await refresh();
  } catch (e) {
    uni.showToast({
      title: e instanceof ApiError ? e.message : "拒绝失败",
      icon: "none",
    });
  }
}

async function onCancelOutgoing(friendshipId: string, name: string) {
  const ok = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: "撤回请求？",
      content: `撤回给「${name}」发出的好友请求？`,
      success: (r) => resolve(r.confirm),
      fail: () => resolve(false),
    });
  });
  if (!ok) return;
  try {
    await removeFriendship(friendshipId);
    uni.showToast({ title: "已撤回", icon: "none" });
    await refresh();
  } catch (e) {
    uni.showToast({
      title: e instanceof ApiError ? e.message : "撤回失败",
      icon: "none",
    });
  }
}

async function onRemoveFriend(friendshipId: string, name: string) {
  const ok = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: "解除好友？",
      content: `解除与「${name}」的好友关系？对方之前分享给「所有好友」的画匣子将对你不可见。`,
      confirmText: "解除",
      confirmColor: "#C13939",
      success: (r) => resolve(r.confirm),
      fail: () => resolve(false),
    });
  });
  if (!ok) return;
  try {
    await removeFriendship(friendshipId);
    uni.showToast({ title: "已解除", icon: "none" });
    await refresh();
  } catch (e) {
    uni.showToast({
      title: e instanceof ApiError ? e.message : "解除失败",
      icon: "none",
    });
  }
}

function goBack() {
  uni.navigateBack();
}
</script>

<template>
  <view class="page">
    <view class="topbar">
      <view class="back-btn" @click="goBack">
        <SvgIcon name="chevron-left" size="36rpx" />
      </view>
      <view class="topbar-title">
        <text>{{ uiText("好友") }}</text>
        <text v-if="friendsCount > 0" class="topbar-count">· {{ friendsCount }}</text>
      </view>
      <view class="topbar-placeholder" />
    </view>

    <scroll-view scroll-y class="scroll">
      <!-- 加好友 -->
      <view class="section">
        <text class="section-label">{{ uiText("加好友") }}</text>
        <text class="section-sub">{{ uiText("输入对方的用户名或 user_id 精确搜") }}</text>
        <view class="search-row">
          <input
            class="search-input"
            v-model="searchQuery"
            :placeholder='uiText("用户名 / user_id")'
            confirm-type="search"
            @confirm="onSearch"
          />
          <view class="search-btn" :class="{ loading: searchLoading }" @click="onSearch">
            <text>{{ searchLoading ? uiText("搜索中…") : uiText("搜索") }}</text>
          </view>
        </view>

        <view v-if="searched" class="search-result">
          <image v-if="searched.avatar_url" :src="searched.avatar_url" mode="aspectFill" class="avatar" />
          <view v-else class="avatar avatar-placeholder">
            <text>{{ searched.nickname.charAt(0) }}</text>
          </view>
          <view class="search-info">
            <text class="search-nick">{{ searched.nickname }}</text>
            <text class="search-uid">{{ searched.user_id }}</text>
          </view>
          <view
            class="add-btn"
            :class="{ disabled: sending }"
            @click="onSendRequest"
          >
            <text>{{ sending ? uiText("发送中…") : uiText("加为好友") }}</text>
          </view>
        </view>
        <view v-else-if="searchNotFound" class="search-empty">
          <text>{{ uiText("没找到这个用户。请核对用户名或 user_id。") }}</text>
        </view>
      </view>

      <!-- 收到的请求 -->
      <view v-if="incomingCount > 0" class="section">
        <text class="section-label">{{ uiText("收到的请求 ·") }} {{ incomingCount }}</text>
        <view v-for="r in listData.incoming" :key="r.friendship_id" class="row">
          <image
            v-if="r.from_avatar_url"
            :src="r.from_avatar_url"
            mode="aspectFill"
            class="avatar avatar-sm"
          />
          <view v-else class="avatar avatar-sm avatar-placeholder">
            <text>{{ r.from_nickname.charAt(0) }}</text>
          </view>
          <view class="row-info">
            <text class="row-name">{{ r.from_nickname }}</text>
            <text class="row-sub">{{ uiText("想加你为好友") }}</text>
          </view>
          <view class="row-actions">
            <view class="row-btn ghost" @click="onRejectRequest(r.friendship_id, r.from_nickname)">
              <text>{{ uiText("拒绝") }}</text>
            </view>
            <view class="row-btn primary" @click="onAcceptRequest(r.friendship_id)">
              <text>{{ uiText("接受") }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 我的好友 -->
      <view class="section">
        <text class="section-label">{{ uiText("我的好友 ·") }} {{ friendsCount }}</text>
        <view v-if="friendsCount === 0 && !loading" class="empty">
          <text>{{ uiText("还没有好友。上面搜一个用户加为好友吧。") }}</text>
        </view>
        <view v-for="f in listData.friends" :key="f.friendship_id" class="row">
          <image
            v-if="f.avatar_url"
            :src="f.avatar_url"
            mode="aspectFill"
            class="avatar avatar-sm"
          />
          <view v-else class="avatar avatar-sm avatar-placeholder">
            <text>{{ f.nickname.charAt(0) }}</text>
          </view>
          <view class="row-info">
            <text class="row-name">{{ f.nickname }}</text>
            <text class="row-sub">{{ f.user_id }}</text>
          </view>
          <view class="row-actions">
            <view class="row-btn ghost" @click="onRemoveFriend(f.friendship_id, f.nickname)">
              <text>{{ uiText("解除") }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 2026-07-13：好友的画匣子（发现流） -->
      <view class="section">
        <text class="section-label">{{ uiText("好友的画匣子") }}</text>
        <text class="section-sub">{{ uiText("画匣子好友 + 你打开过其画匣子的微信用户最近发布的") }}</text>
        <view v-if="feedLoading && feedItems.length === 0" class="empty">
          <text>{{ uiText("加载中…") }}</text>
        </view>
        <MasonryFeed
          v-else
          :items="feedMasonry"
          empty_hint="还没有好友的画匣子。加好友或分享给他们后，他们的画匣子会出现在这里。"
          @pick="onPickFeed"
        />
      </view>

      <!-- 我发出的请求 -->
      <view v-if="listData.outgoing.length > 0" class="section">
        <text class="section-label">{{ uiText("我发出的请求 ·") }} {{ listData.outgoing.length }}</text>
        <view v-for="r in listData.outgoing" :key="r.friendship_id" class="row">
          <image
            v-if="r.to_avatar_url"
            :src="r.to_avatar_url"
            mode="aspectFill"
            class="avatar avatar-sm"
          />
          <view v-else class="avatar avatar-sm avatar-placeholder">
            <text>{{ r.to_nickname.charAt(0) }}</text>
          </view>
          <view class="row-info">
            <text class="row-name">{{ r.to_nickname }}</text>
            <text class="row-sub">{{ uiText("等待接受…") }}</text>
          </view>
          <view class="row-actions">
            <view class="row-btn ghost" @click="onCancelOutgoing(r.friendship_id, r.to_nickname)">
              <text>{{ uiText("撤回") }}</text>
            </view>
          </view>
        </view>
      </view>

      <view class="bottom-spacer" />
    </scroll-view>
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
.back-btn {
  width: 64rpx; height: 64rpx; border-radius: 50%;
  background: t.$color-surface;
  display: flex; align-items: center; justify-content: center;
}
.topbar-title {
  font-size: t.$font-lg;
  font-weight: t.$weight-bold;
  color: t.$color-text;
  display: flex; align-items: baseline; gap: 8rpx;
}
.topbar-count {
  font-size: t.$font-sm;
  color: t.$color-text-mute;
  font-weight: normal;
}
.topbar-placeholder { width: 64rpx; }

.scroll { flex: 1 1 0; padding: t.$spacing-4; box-sizing: border-box; }

.section {
  display: flex; flex-direction: column;
  gap: t.$spacing-2;
  margin-bottom: t.$spacing-5;
}
.section-label {
  font-size: t.$font-sm;
  font-weight: t.$weight-bold;
  color: t.$color-text;
}
.section-sub {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
}

.search-row {
  display: flex;
  gap: t.$spacing-2;
  align-items: center;
}
.search-input {
  flex: 1;
  height: 80rpx;
  padding: 0 t.$spacing-3;
  border-radius: t.$radius-md;
  border: 2rpx solid t.$color-border;
  background: t.$color-surface;
  color: t.$color-text;
  font-size: t.$font-md;
}
.search-btn {
  padding: 0 t.$spacing-4;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: t.$radius-md;
  background: t.$color-accent;
  color: t.$color-text-invert;
  font-size: t.$font-sm;
  font-weight: t.$weight-bold;
}
.search-btn.loading { opacity: 0.55; }

.search-result {
  display: flex; align-items: center;
  gap: t.$spacing-3;
  padding: t.$spacing-3;
  border-radius: t.$radius-md;
  background: t.$color-surface;
  border: 2rpx solid t.$color-border;
}
.search-info { flex: 1; display: flex; flex-direction: column; gap: 4rpx; min-width: 0; }
.search-nick {
  font-size: t.$font-md;
  font-weight: t.$weight-bold;
  color: t.$color-text;
}
.search-uid {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
}
.add-btn {
  padding: 12rpx 24rpx;
  border-radius: 999rpx;
  background: t.$color-accent;
  color: t.$color-text-invert;
  font-size: t.$font-sm;
  font-weight: t.$weight-bold;
}
.add-btn.disabled { opacity: 0.55; }
.search-empty {
  padding: t.$spacing-3;
  color: t.$color-text-mute;
  font-size: t.$font-sm;
}

.row {
  display: flex; align-items: center;
  gap: t.$spacing-3;
  padding: t.$spacing-2 4rpx;
}
.row-info { flex: 1; display: flex; flex-direction: column; gap: 4rpx; min-width: 0; }
.row-name {
  font-size: t.$font-md;
  color: t.$color-text;
  font-weight: t.$weight-bold;
}
.row-sub {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
}
.row-actions {
  display: flex; gap: t.$spacing-2;
}
.row-btn {
  padding: 10rpx 20rpx;
  border-radius: 999rpx;
  font-size: t.$font-xs;
  border: 2rpx solid t.$color-border;
  background: t.$color-surface;
  color: t.$color-text-soft;
}
.row-btn.primary {
  background: t.$color-accent;
  color: t.$color-text-invert;
  border-color: t.$color-accent;
  font-weight: t.$weight-bold;
}

.avatar {
  width: 88rpx; height: 88rpx;
  border-radius: 50%;
  background: t.$color-surface;
  flex: 0 0 auto;
}
.avatar-sm { width: 72rpx; height: 72rpx; }
.avatar-placeholder {
  display: flex; align-items: center; justify-content: center;
  color: t.$color-text-soft;
  font-size: t.$font-lg;
  font-weight: t.$weight-bold;
}

.empty {
  padding: t.$spacing-3;
  color: t.$color-text-mute;
  font-size: t.$font-sm;
  text-align: center;
}

.bottom-spacer { height: 200rpx; }
</style>
