<script setup lang="ts">
import DeviceImage from './DeviceImage.vue'
const props = defineProps<{ screens: number[] }>()
const emit = defineEmits<{ image: [url:string] }>()
const labels: Record<number,string> = {1:'Platform home',2:'Assistant product results',3:'Search results',4:'Traditional results and intelligent recommendations',5:'Nearby provider recommendations',6:'Context-aware renovation advice',7:'Renovation requirements',8:'Assistant-generated plan',9:'Renovation diary',10:'Plan with nearby resources',11:'Task progress status',12:'Budget and expenses',13:'Photo and voice progress record',14:'Video and text progress record',15:'Craftsperson’s completed work',16:'Craftsperson profile',17:'Visual material recognition'}
const url = (n:number) => `/folio-miaozer/m${n}.jpg`
const widths=[654,653,654,655,653,653,654,654,654,653,655,653,654,655,654,653,651]
</script>
<template>
 <div class="miao-phones" :class="{'miao-phones--single':screens.length===1}">
  <figure v-for="n in screens" :key="n" class="miao-phone-item">
   <component :is="'button'" type="button" class="miao-phone" data-folio-cursor="dot" :aria-label="'Enlarge '+labels[n]" @click="emit('image',url(n))"><DeviceImage :src="url(n)" :alt="labels[n]" :width="widths[n-1]" :height="1354" /></component>
   <figcaption>{{String(n).padStart(2,'0')}} / {{labels[n]}}</figcaption>
  </figure>
 </div>
</template>
<style scoped>
.miao-phones {display:flex; align-items:center; justify-content:center; gap:clamp(12px,3vw,40px); min-width:0; height:100%;}
.miao-phone-item {container-type:inline-size; min-width:0; width:min(46%,calc((var(--folio-view) - 155px)*.49)); display:flex; flex-direction:column; gap:9px;}
.folio-site .miao-phone[type="button"] {display:block; width:100%; padding:0; border:0; border-radius:0; background:transparent; overflow:visible; box-shadow:none;}
.miao-phone-item figcaption {font:10px/1.35 'Courier New',monospace; text-transform:uppercase; letter-spacing:.04em;}
.miao-phones--single .miao-phone-item {width:min(70%,calc((var(--folio-view) - 140px)*.49));}
@media (orientation:portrait) {.miao-phones {height:auto; align-items:start;} .miao-phone-item {width:min(46%, 210px);} .miao-phones--single .miao-phone-item {width:min(50%,180px);} }
</style>
