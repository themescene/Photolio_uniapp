<script setup lang="ts">
const props = defineProps<{ screens: number[] }>()
const emit = defineEmits<{ image: [url:string] }>()
const labels: Record<number,string> = {1:'Platform home',2:'Assistant product results',3:'Search results',4:'Traditional results and intelligent recommendations',5:'Nearby provider recommendations',6:'Context-aware renovation advice',7:'Renovation requirements',8:'Assistant-generated plan',9:'Renovation diary',10:'Plan with nearby resources',11:'Task progress status',12:'Budget and expenses',13:'Photo and voice progress record',14:'Video and text progress record',15:'Craftsperson’s completed work',16:'Craftsperson profile',17:'Visual material recognition'}
const url = (n:number) => `/folio-miaozer/m${n}.jpg`
</script>
<template>
 <div class="miao-phones" :class="{'miao-phones--single':screens.length===1}">
  <figure v-for="n in screens" :key="n" class="miao-phone-item">
   <component :is="'button'" type="button" class="miao-phone" data-folio-cursor="dot" :aria-label="'Enlarge '+labels[n]" @click="emit('image',url(n))"><img :src="url(n)" :alt="labels[n]" width="654" height="1354" loading="lazy" /></component>
   <figcaption>{{String(n).padStart(2,'0')}} / {{labels[n]}}</figcaption>
  </figure>
 </div>
</template>
<style scoped>
.miao-phones {display:flex; align-items:center; justify-content:center; gap:clamp(12px,3vw,40px); min-width:0; height:100%;}
.miao-phone-item {min-width:0; width:min(46%,calc((var(--folio-view) - 155px)*.49)); display:flex; flex-direction:column; gap:9px;}
.folio-site .miao-phone[type="button"] {display:block; width:100%; padding:4px; border:1px solid #a49886; border-radius:12% / 6%; background:#302921; overflow:hidden; box-shadow:0 14px 24px #0004;}
.miao-phone img {display:block; width:100%; height:auto; border-radius:9.4% / 4.6%;}
.miao-phone-item figcaption {font:10px/1.35 'Courier New',monospace; text-transform:uppercase; letter-spacing:.04em;}
.miao-phones--single .miao-phone-item {width:min(70%,calc((var(--folio-view) - 140px)*.49));}
@media (orientation:portrait) {.miao-phones {height:auto; align-items:start;} .miao-phone-item {width:min(46%, 210px);} .miao-phones--single .miao-phone-item {width:min(50%,180px);} }
</style>
