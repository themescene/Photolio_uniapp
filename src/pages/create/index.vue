<script setup lang="ts">
/**
 * 新建画匣子（独立页）—— 包装 CreationFlow，mode=page。
 * 从主页 "+新建画匣子" CTA 跳过来，取消按钮 navigateBack。
 */
import CreationFlow from "@/components/CreationFlow.vue";
</script>

<template>
  <CreationFlow mode="page" />
</template>
