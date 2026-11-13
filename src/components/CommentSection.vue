<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 评论区 —— 移植自 annualreport/src/components/CommentSection.vue
 *
 * 行为对齐：
 * - 进入加载评论列表
 * - 默认折叠表单，点「写评论」展开
 * - 必须登录才能写
 * - 草稿持久化（uni.setStorageSync）
 * - 提交后插入列表 + 清空草稿
 */
import { ref, computed, watch, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { fetchComments, postComment } from "@/api/comment";
import { ApiError } from "@/api/request";
import { logger } from "@/utils/logger";
import type { Comment } from "@/types";

const props = defineProps<{ shareId: string }>();

const authStore = useAuthStore();
const { isLoggedIn, user } = storeToRefs(authStore);

const comments = ref<Comment[]>([]);
const isLoading = ref(false);
const isSubmitting = ref(false);
const submitError = ref("");

const inputContent = ref("");
const inputAuthorName = ref("");
const showForm = ref(false);

const draftKey = computed(() => `comment_draft_${props.shareId}`);
const defaultAuthorName = computed(() => user.value?.default_display_name || user.value?.username || "");

async function loadComments() {
  if (!props.shareId) return;
  isLoading.value = true;
  try {
    const r = await fetchComments(props.shareId);
    comments.value = r.comments || [];
  } catch (e) {
    logger.warn("[comment] load failed", e);
  } finally {
    isLoading.value = false;
  }
}

function openForm() {
  if (!isLoggedIn.value) {
    uni.showToast({ title: "请先登录", icon: "none" });
    return;
  }
  inputAuthorName.value = defaultAuthorName.value;
  showForm.value = true;
}

function clearDraft() {
  try { uni.removeStorageSync(draftKey.value); } catch { /* ignore */ }
}

async function submit() {
  const content = inputContent.value.trim();
  if (!content) {
    submitError.value = "请输入评论内容";
    return;
  }
  isSubmitting.value = true;
  submitError.value = "";
  try {
    const r = await postComment(props.shareId, {
      content,
      author_display_name: inputAuthorName.value.trim() || defaultAuthorName.value,
      media_urls: [],
    });
    comments.value.push(r.comment);
    inputContent.value = "";
    showForm.value = false;
    clearDraft();
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : "发送失败";
    submitError.value = msg;
    // 2026-07-25 hotfix12h：内容违规也弹一次 toast，让用户看得见（inline error 太不显眼）
    if (/违规|安全/i.test(msg)) {
      uni.showToast({ title: msg, icon: "none", duration: 3000 });
    }
  } finally {
    isSubmitting.value = false;
  }
}

function formatTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}小时前`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}天前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

watch(inputContent, (val) => {
  if (val.trim()) {
    try {
      uni.setStorageSync(draftKey.value, JSON.stringify({
        content: val,
        authorName: inputAuthorName.value,
      }));
    } catch { /* ignore */ }
  } else {
    clearDraft();
  }
});

onMounted(() => {
  loadComments();
  try {
    const raw = uni.getStorageSync(draftKey.value);
    if (raw) {
      const obj = JSON.parse(raw as string);
      if (obj.content) inputContent.value = obj.content;
      if (obj.authorName) inputAuthorName.value = obj.authorName;
    }
  } catch { /* ignore */ }
});
</script>

<template>
  <view class="comment-section">
    <view class="comment-header">
      <text class="comment-title">{{ uiText("评论") }} {{ comments.length > 0 ? `(${comments.length})` : '' }}</text>
      <view class="comment-add-btn" @click="showForm ? (showForm = false) : openForm()">
        <text>{{ showForm ? uiText("收起") : uiText("写评论") }}</text>
      </view>
    </view>

    <view v-if="showForm" class="comment-form">
      <input
        v-model="inputAuthorName"
        class="form-input name-input"
        :placeholder='uiText("你的名字")'
        maxlength="20"
      />
      <textarea
        v-model="inputContent"
        class="form-input content-input"
        :placeholder='uiText("说点什么…")'
        maxlength="500"
        auto-height
      />
      <view class="form-actions">
        <text v-if="submitError" class="submit-error">{{ submitError }}</text>
        <view class="submit-btn" :class="{ disabled: isSubmitting }" @click="submit">
          <text>{{ isSubmitting ? uiText("发送中…") : uiText("发送") }}</text>
        </view>
      </view>
    </view>

    <view v-if="isLoading" class="comment-loading"><text>{{ uiText("加载中…") }}</text></view>
    <view v-else-if="comments.length === 0 && !showForm" class="comment-empty">
      <text>{{ uiText("还没有评论，做第一个留言的人吧") }}</text>
    </view>
    <view v-else class="comment-list">
      <view v-for="c in comments" :key="c.comment_id" class="comment-item">
        <view class="comment-meta">
          <text class="comment-author">{{ c.author_display_name }}</text>
          <text class="comment-time">{{ formatTime(c.created_at) }}</text>
        </view>
        <text v-if="c.content" class="comment-content">{{ c.content }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.comment-section {
  background: t.$color-surface;
  border-top: 2rpx solid t.$color-border;
  padding: t.$spacing-3;
}

.comment-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: t.$spacing-3;
}
.comment-title {
  font-size: t.$font-sm; font-weight: t.$weight-bold; color: t.$color-text;
  letter-spacing: 2rpx;
}
.comment-add-btn {
  font-size: t.$font-xs;
  padding: 8rpx 24rpx;
  background: rgba(61, 46, 31, 0.08);
  border: 2rpx solid t.$color-border;
  color: t.$color-accent;
  border-radius: t.$radius-pill;
}

.comment-form {
  background: t.$color-bg;
  border: 2rpx solid t.$color-border;
  border-radius: t.$radius-md;
  padding: t.$spacing-3;
  margin-bottom: t.$spacing-3;
  display: flex;
  flex-direction: column;
  gap: t.$spacing-2;
}
.form-input {
  background: t.$color-surface;
  border: 2rpx solid t.$color-border;
  border-radius: t.$radius-sm;
  color: t.$color-text;
  font-size: t.$font-sm;
  padding: 14rpx 20rpx;
}
.name-input { font-size: t.$font-xs; }
.content-input { min-height: 144rpx; line-height: 1.6; }

.form-actions {
  display: flex; align-items: center; gap: 16rpx;
}
.submit-error { flex: 1; font-size: t.$font-xs; color: t.$color-danger; }
.submit-btn {
  margin-left: auto;
  padding: 12rpx 32rpx;
  background: t.$color-accent;
  color: t.$color-text-invert;
  font-size: t.$font-sm; font-weight: t.$weight-bold;
  border-radius: t.$radius-sm;
}
.submit-btn.disabled { opacity: 0.4; }

.comment-loading, .comment-empty {
  text-align: center; color: t.$color-text-mute;
  font-size: t.$font-sm; padding: t.$spacing-3 0;
}
.comment-list { display: flex; flex-direction: column; gap: t.$spacing-2; }
.comment-item {
  background: t.$color-bg;
  border: 2rpx solid t.$color-border;
  border-radius: t.$radius-md;
  padding: 20rpx 24rpx;
}
.comment-meta {
  display: flex; align-items: baseline; gap: 16rpx;
  margin-bottom: 8rpx;
}
.comment-author {
  font-size: t.$font-sm; font-weight: t.$weight-bold; color: t.$color-accent;
}
.comment-time { font-size: t.$font-xs; color: t.$color-text-mute; }
.comment-content {
  font-size: t.$font-sm; color: t.$color-text-soft;
  line-height: 1.55; white-space: pre-wrap; word-break: break-word;
}
</style>
