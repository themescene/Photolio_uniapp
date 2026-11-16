<script setup lang="ts">
withDefaults(defineProps<{src:string;alt:string;kind?:'phone'|'screen'|'photo';width?:number;height?:number}>(),{kind:'phone'})
const emit=defineEmits<{loaded:[ratio:number]}>()
function loaded(event:Event){const image=event.target as HTMLImageElement;if(image.naturalHeight)emit('loaded',image.naturalWidth/image.naturalHeight)}
</script>
<template>
 <span class="device-image" :class="'device-image--'+kind"><span class="device-image__glass"><img :src="src" :alt="alt" :width="width" :height="height" draggable="false" loading="lazy" @load="loaded" /></span></span>
</template>
<style scoped>
/* The screenshot supplies its own height. One inset and one clipping surface keep
   all four bezel edges equal, including screenshots with different aspect ratios. */
.device-image{--device-bezel:3px;--device-radius:clamp(9px,7cqw,25px);display:block;box-sizing:border-box;width:100%;padding:var(--device-bezel);border:0;border-radius:var(--device-radius);background:#292b29;}
.device-image__glass{display:block;overflow:hidden;border-radius:calc(var(--device-radius) - var(--device-bezel));}
.device-image img{position:static;inset:auto;display:block;width:100%;height:auto;max-width:none;border:0;border-radius:0;object-fit:unset;}
.device-image--screen{--device-bezel:1px;--device-radius:3px;background:#73766f;}
.device-image--photo{--device-bezel:0px;--device-radius:0px;background:transparent;}
</style>
