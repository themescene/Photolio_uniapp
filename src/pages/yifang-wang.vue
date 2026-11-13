<script setup lang="ts">
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import YifangPortfolio from '../../portfolio_subproject/yifang/YifangPortfolio.vue'

function toggle(active: boolean) { document.documentElement.classList.toggle('folio-page-active', active) }
onShow(() => toggle(true))
onHide(() => toggle(false))
onUnload(() => toggle(false))
</script>

<template><YifangPortfolio /></template>
