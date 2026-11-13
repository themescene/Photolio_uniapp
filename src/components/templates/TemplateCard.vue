<script setup lang="ts">
/**
 * 模板分发器 —— 按 episode.template_id 选择对应组件。
 *
 * 参考网页端 [annualreport/src/components/ShareCard.vue:25-36] 的 THEMES 映射对齐。
 *
 * 注意：mp-weixin 不支持 <component :is="..."/>（编译期 wxml 不允许动态组件），
 * 所以这里用 v-if/v-else 静态分发；任何未知 template_id 都 fallback 到 wooden_box。
 */
import { computed } from "vue";
import type { ReportEpisode } from "@/types";
import WoodenBoxCard from "./WoodenBoxCard.vue";
import FoodCard from "./FoodCard.vue";
import WorkCard from "./WorkCard.vue";
import SportsCard from "./SportsCard.vue";
import EntertainmentCard from "./EntertainmentCard.vue";
import HobbyCard from "./HobbyCard.vue";
import ReflectionCard from "./ReflectionCard.vue";
import PixelSurfCard from "./PixelSurfCard.vue";
import ValentineCard from "./ValentineCard.vue";
import TravelVlogCard from "./TravelVlogCard.vue";

const props = defineProps<{ episode: ReportEpisode }>();

const tpl = computed(() => (props.episode?.template_id as string) || "wooden_box");
</script>

<template>
  <FoodCard v-if="tpl === 'food'" :episode="episode" />
  <WorkCard v-else-if="tpl === 'work'" :episode="episode" />
  <SportsCard v-else-if="tpl === 'sports'" :episode="episode" />
  <EntertainmentCard v-else-if="tpl === 'entertainment'" :episode="episode" />
  <HobbyCard v-else-if="tpl === 'hobby'" :episode="episode" />
  <ReflectionCard v-else-if="tpl === 'reflection'" :episode="episode" />
  <PixelSurfCard v-else-if="tpl === 'pixel_surf'" :episode="episode" />
  <ValentineCard v-else-if="tpl === 'valentine'" :episode="episode" />
  <TravelVlogCard v-else-if="tpl === 'travel_vlog'" :episode="episode" />
  <WoodenBoxCard v-else :episode="episode" />
</template>
