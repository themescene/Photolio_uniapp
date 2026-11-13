<script setup lang="ts">
/**
 * 通用「设置项」行：左标签 + 右值（或自定义 slot）+ 右箭头。
 * 所有需要列「项」的页面（账号设置、隐私设置、关于等）都用它，**不要复制粘贴行样式**。
 *
 * 用法:
 *   <AppRow label="昵称" :value="nickname" @click="open" />
 *   <AppRow label="兑换码" arrow @click="redeem" />
 *   <AppRow label="退出登录" tone="danger" @click="logout" :arrow="false" />
 */
import { computed } from "vue";

const props = withDefaults(defineProps<{
  /** 左侧标签 */
  label: string;
  /** 右侧只读值；用 value slot 可覆盖 */
  value?: string | number | null;
  /** 是否显示右箭头（默认显示） */
  arrow?: boolean;
  /** 配色：default / muted / danger */
  tone?: "default" | "muted" | "danger";
  /** 禁用态 */
  disabled?: boolean;
}>(), {
  arrow: true,
  tone: "default",
  value: "",
});

defineEmits<{
  (e: "click"): void;
}>();

const valueText = computed(() => {
  if (props.value === null || props.value === undefined || props.value === "") return "";
  return String(props.value);
});
</script>

<template>
  <view
    class="row"
    :class="[`tone-${tone}`, { disabled }]"
    hover-class="row-hover"
    :hover-stay-time="80"
    @click="!disabled && $emit('click')"
  >
    <text class="row-label">{{ label }}</text>
    <view class="row-right">
      <slot name="value">
        <text v-if="valueText" class="row-value">{{ valueText }}</text>
      </slot>
      <text v-if="arrow" class="row-arrow">›</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: t.$color-surface;
  padding: t.$spacing-3 t.$spacing-4;
  min-height: 96rpx;
  border-bottom: 2rpx solid t.$color-border;
  &:last-child { border-bottom: none; }
}
.row-hover { background: t.$color-surface-2; }
.disabled { opacity: 0.5; }

.row-label {
  flex: 0 0 auto;
  font-size: t.$font-md;
  color: t.$color-text;
}

.row-right {
  display: flex;
  align-items: center;
  gap: t.$spacing-2;
  flex: 1 1 auto;
  justify-content: flex-end;
  min-width: 0;
}
.row-value {
  font-size: t.$font-sm;
  color: t.$color-text-soft;
  // 长值省略
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  max-width: 360rpx;
}
.row-arrow {
  color: t.$color-text-mute;
  font-size: t.$font-lg;
  line-height: 1;
}

// tone 变体
.tone-danger .row-label { color: t.$color-danger; }
.tone-muted  .row-label { color: t.$color-text-soft; }
</style>
