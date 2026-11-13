<script setup lang="ts">
import { locale, setLocale } from '@/i18n'
</script>
<template><view class="language-switch" role="group" aria-label="Language"><text role="button" :class="{ active: locale === 'zh' }" @click="setLocale('zh')">中文</text><text class="language-divider">/</text><text role="button" :class="{ active: locale === 'en' }" @click="setLocale('en')">English</text></view></template>
<style scoped>.language-switch{display:flex;justify-content:center;align-items:center;gap:10px;padding:12px;font-size:13px;color:inherit}.language-switch text[role=button]{cursor:pointer;opacity:.55}.language-switch text.active{opacity:1;text-decoration:underline;text-underline-offset:4px}.language-divider{opacity:.35}</style>
