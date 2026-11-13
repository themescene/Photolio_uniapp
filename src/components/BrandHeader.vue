<script setup lang="ts">
import LanguageSwitcher from "./LanguageSwitcher.vue";
import { t as uiText, locale } from "@/i18n";
/**
 * 品牌头部 —— 直接移植自 [annualreport/src/components/globals/PageHeader.vue]
 * + 样式来自 [annualreport/src/styles/globals/header.css]
 *
 * 关键修复（之前版本的 bug）：
 *   - 之前光标一直 blink，输入完整后整段在闪
 *   - 正解：用 `isTyping` flag 控制光标可见性（网页端原版做法）
 *     未在打字 → 光标 opacity 0（完全隐藏）
 *     正在打字 → 光标可见 + blink 动画
 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

// 与网页端 PageHeader.vue 完全一致的文案
const subtitlesZh = [
  "三两笔着墨，存成温情的诗",
  "把生活碎片，寄给想念的人",
  "记录此刻，温暖彼岸",
  "一张图，一段话，一封家书",
  "把平凡日子，过成电影画面",
];

const currentSubtitleIndex = ref(0);
const fullSubtitle = computed(() => uiText(subtitlesZh[currentSubtitleIndex.value] ?? ""));
const displayedText = ref("");
const isTyping = ref(true);

let typewriterTimer: ReturnType<typeof setInterval> | null = null;
let rotateTimer: ReturnType<typeof setInterval> | null = null;

function startTypewriter() {
  const fullText = uiText(subtitlesZh[currentSubtitleIndex.value] ?? "");
  let charIndex = 0;
  isTyping.value = true;
  displayedText.value = "";

  typewriterTimer = setInterval(() => {
    if (charIndex < fullText.length) {
      displayedText.value = fullText.slice(0, charIndex + 1);
      charIndex++;
    } else {
      isTyping.value = false;
      if (typewriterTimer) clearInterval(typewriterTimer);
      typewriterTimer = null;
    }
  }, 80);
}

function rotateStart() {
  rotateTimer = setInterval(() => {
    if (typewriterTimer) clearInterval(typewriterTimer);
    currentSubtitleIndex.value = (currentSubtitleIndex.value + 1) % subtitlesZh.length;
    startTypewriter();
  }, 7000);
}

watch(locale, () => { if (typewriterTimer) clearInterval(typewriterTimer); startTypewriter() });
onMounted(() => {
  startTypewriter();
  rotateStart();
});

onUnmounted(() => {
  if (typewriterTimer) clearInterval(typewriterTimer);
  if (rotateTimer) clearInterval(rotateTimer);
});
</script>

<template>
  <view class="page-header-group">
    <view class="brand-title-row"><text class="main-title">{{ locale === 'en' ? 'PHOTOLIO' : '画匣子' }}</text><LanguageSwitcher /></view>
    <view class="sub-title-line">
      <text class="sub-title-reserve" aria-hidden="true">{{ fullSubtitle }}</text>
      <text class="sub-title-text">{{ displayedText }}<text class="cursor-blink" :class="{ 'is-typing': isTyping }">&#8203;</text></text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

// 严格按 header.css 比例：网页端 2.25rem 标题、1rem 副标题；rpx 等价转换
.page-header-group {
  // 不自带左右 padding；左右间距由上层 container 给定（页面通常把它放在 .container 内）
  margin: t.$spacing-5 0;
  padding: 0;
}

.brand-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.brand-title-row :deep(.language-switch) { flex-shrink: 0; padding: 0; }
.main-title {
  display: block;
  font-size: 72rpx;          // 2.25rem ≈ 36px
  font-weight: t.$weight-extrabold;
  color: t.$color-text;
  letter-spacing: 4rpx;
  margin-bottom: 8rpx;       // 0.2rem
  line-height: 1.2;
}

.sub-title-line {
  display: grid;
  align-items: start;
  min-height: 48rpx;             // 1.5rem
  opacity: 0.5;
}
.sub-title-reserve { visibility: hidden; }
.sub-title-text, .sub-title-reserve {
  grid-area: 1 / 1;
  overflow-wrap: anywhere;
  font-size: 32rpx;          // 1rem ≈ 16px
  color: t.$color-text;
  line-height: 1.5;
}
.cursor-blink {
  display: inline;
  border-right: 1px solid currentColor;
  margin-left: 4rpx;

  opacity: 0;                // 默认隐藏（关键修复）
}
.cursor-blink.is-typing {
  opacity: 1;
  animation: blink 0.8s infinite;
}
@keyframes blink {
  50% { opacity: 1; }
  0%, 100% { opacity: 0; }
}
/* 参考：annualreport/src/styles/globals/header.css；字幕按完整译文占位，打字时不挤压后续内容。 */
@media (max-width: 600px) {
  .page-header-group { margin: 28px 0 16px; }
  .brand-title-row { gap: 10px; margin-bottom: 8px; }
  .main-title { font-size: clamp(26px, 8vw, 34px); letter-spacing: 1px; margin-bottom: 0; }
  .sub-title-text, .sub-title-reserve { font-size: 14px; line-height: 1.5; }
  .sub-title-line { min-height: 42px; }
}
</style>
