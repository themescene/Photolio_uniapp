<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 法律文档通用渲染组件（隐私协议 / 用户协议 / 关于 / FAQ 都用它）。
 *
 * 用法:
 *   <LegalArticle
 *     title="..."
 *     updated="2026 年 3 月"
 *     :intro="['第一段', '第二段']"
 *     :sections="[{ title: '一、...', paragraphs: [...], list: [...] }, ...]"
 *   />
 */
export interface LegalSection {
  title: string;
  paragraphs?: string[];
  list?: string[];
}

/**
 * 运营主体信息（备案号 / 公司全称等）。
 * 《个人信息保护法》要求隐私政策明示个人信息处理者身份；
 * 备案号在小程序里只能是纯文本 —— 跳 beian.miit.gov.cn 需要它在业务域名白名单里，不值当。
 */
export interface LegalEntityRow {
  k: string;
  v: string;
}

defineProps<{
  title: string;
  updated?: string;
  intro?: string[];
  entity?: LegalEntityRow[];
  sections: LegalSection[];
}>();
</script>

<template>
  <view class="article">
    <text class="h1">{{ title }}</text>
    <text v-if="updated" class="updated">{{ uiText("最后更新：") }}{{ uiText(updated) }}</text>

    <view v-if="entity && entity.length" class="entity">
      <view v-for="(row, i) in entity" :key="`e-${i}`" class="entity-row">
        <text class="entity-k">{{ uiText(row.k) }}</text>
        <text class="entity-v">{{ uiText(row.v) }}</text>
      </view>
    </view>

    <view v-if="intro && intro.length" class="intro">
      <text v-for="(p, i) in intro" :key="`i-${i}`" class="p">{{ uiText(p) }}</text>
    </view>

    <view v-for="(sec, idx) in sections" :key="idx" class="section">
      <text class="h2">{{ uiText(sec.title) }}</text>
      <text v-for="(p, i) in (sec.paragraphs || [])" :key="`p-${i}`" class="p">{{ uiText(p) }}</text>
      <view v-if="sec.list && sec.list.length" class="list">
        <view v-for="(item, i) in sec.list" :key="`l-${i}`" class="li">
          <text class="bullet">·</text>
          <text class="li-text">{{ uiText(item) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.article {
  padding: t.$spacing-4;
  display: flex;
  flex-direction: column;
  gap: t.$spacing-3;
}
.h1 {
  font-size: t.$font-xl;
  font-weight: 700;
  color: t.$color-text;
}
.updated {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
  margin-bottom: t.$spacing-2;
}
.intro {
  display: flex;
  flex-direction: column;
  gap: t.$spacing-2;
}
.entity {
  display: flex;
  flex-direction: column;
  gap: t.$spacing-1;
  padding: t.$spacing-3;
  margin-bottom: t.$spacing-2;
  background: t.$color-surface-2;
  border-radius: t.$radius-md;
}
.entity-row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: t.$spacing-2;
}
.entity-k {
  flex: 0 0 180rpx;
  font-size: t.$font-sm;
  color: t.$color-text-mute;
  line-height: 1.6;
}
.entity-v {
  flex: 1;
  font-size: t.$font-sm;
  color: t.$color-text;
  line-height: 1.6;
}
.section {
  display: flex;
  flex-direction: column;
  gap: t.$spacing-2;
  margin-top: t.$spacing-3;
}
.h2 {
  font-size: t.$font-lg;
  font-weight: 600;
  color: t.$color-text;
  margin-bottom: t.$spacing-1;
}
.p {
  font-size: t.$font-md;
  color: t.$color-text-soft;
  line-height: 1.7;
}
.list {
  display: flex;
  flex-direction: column;
  gap: t.$spacing-1;
  padding-left: t.$spacing-3;
}
.li {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: t.$spacing-2;
}
.bullet {
  color: t.$color-accent;
  font-size: t.$font-lg;
  line-height: 1.4;
}
.li-text {
  flex: 1;
  font-size: t.$font-md;
  color: t.$color-text-soft;
  line-height: 1.7;
}
</style>
