<script setup lang="ts">
import {ref,watch} from 'vue'
import type { PortfolioImage } from './media'
import DeviceImage from './DeviceImage.vue'
const props=defineProps<{ item: PortfolioImage; reveal?: boolean }>()
const ratio=ref(props.item.width/props.item.height)
watch(()=>props.item,item=>{ratio.value=item.width/item.height})
</script>
<template>
 <span class="project-image" :class="['project-image--'+item.treatment,{'project-image--reveal':reveal}]" :style="{'--image-ratio':ratio}">
  <DeviceImage class="project-image__mount" :src="item.url" :alt="reveal?'':item.title" :kind="item.treatment" :width="item.width" :height="item.height" @loaded="ratio=$event" />
 </span>
</template>
<style scoped>
.project-image{container-type:size;display:flex;width:100%;height:100%;align-items:center;justify-content:center;background:transparent;padding:0;overflow:hidden;}
.project-image__mount{flex:none;width:min(100cqw,calc((100cqh - 6px)*var(--image-ratio) + 6px));min-width:0;}
.project-image--photo .project-image__mount,.project-image--screen .project-image__mount{width:min(100cqw,calc((100cqh - 2px)*var(--image-ratio) + 2px));}
.project-image--reveal{justify-content:flex-end;}
.project-image--reveal.project-image--photo .project-image__mount{width:58%;}
.project-image--reveal.project-image--phone .project-image__mount{width:15%;margin-right:18%;transform:rotate(9deg);}
.project-image--reveal.project-image--screen .project-image__mount{width:58%;transform:rotate(-5deg);margin-right:2%;}
</style>
