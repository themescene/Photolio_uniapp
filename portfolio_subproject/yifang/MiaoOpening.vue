<script setup lang="ts">
import MiaoPhones from './MiaoPhones.vue'
defineProps<{ lead:string }>()
const emit=defineEmits<{image:[url:string]}>()
</script>
<template>
 <section class="mz-opening folio-page folio-pad" data-label="MIAOZER / Broken rhythm">
  <header><span>02 / MIAOZER</span><span>Product design & engineering</span></header>
  <div class="mz-opening__body"><div class="mz-opening__type"><p class="mz-opening__overline">A home takes shape.</p><h2>ROOM<br />BY<br /><em>ROOM.</em></h2><p class="mz-opening__lead">{{lead}}</p></div><div class="mz-opening__phone"><MiaoPhones :screens="[1]" @image="emit('image',$event)" /></div></div>
  <div class="mz-opening__rhythm" aria-hidden="true"><i v-for="n in 14" :key="n" :class="{'is-break':n===10}"></i></div>
  <footer><span>Plan / Record / Connect</span><span>iOS · Android · WeChat</span></footer>
 </section>
</template>
<style scoped>
.mz-opening{position:relative;isolation:isolate;display:flex;flex-direction:column;justify-content:space-between;gap:24px;background:#3b2115;color:#ffe4cf;padding-block:30px;overflow:hidden;}
.mz-opening header,.mz-opening footer{display:flex;justify-content:space-between;gap:18px;font:11px/1.5 'Courier New',monospace;letter-spacing:.06em;text-transform:uppercase;}
.mz-opening__body{display:grid;grid-template-columns:1.05fr .95fr;align-items:center;gap:5%;flex:1;min-height:0;}.mz-opening__overline{font:italic 20px Georgia,serif;color:#ff9a48;}
.folio-site .mz-opening h2{font:850 clamp(50px,min(8vw,12dvh),120px)/.9 'Segoe UI',sans-serif;letter-spacing:-.065em;margin:20px 0;}.mz-opening h2 em{font:italic 1em Georgia,serif;color:#ff9a48;}.mz-opening__lead{font-size:clamp(15px,1.4vw,20px);line-height:1.55;max-width:42ch;}
.mz-opening__phone{width:100%;height:100%;min-height:0;}.mz-opening__phone :deep(.miao-phones){height:100%;}.mz-opening__phone :deep(.miao-phone-item figcaption){color:#ffe4cf;}
.mz-opening__phone :deep(.miao-phones--single .miao-phone-item){width:min(70%,calc((var(--folio-view) - 235px)*.49));}
.mz-opening__rhythm{height:38px;display:flex;gap:2.8%;align-items:stretch;margin-top:26px;}.mz-opening__rhythm i{flex:1;background:#ff9a48;}.mz-opening__rhythm .is-break{transform:translateY(-30px) rotate(-27deg) scale(1.3);background:#fff5e9;box-shadow:0 0 0 5px #3b2115;}
@media(orientation:portrait){.mz-opening{padding-block:28px;gap:25px;}.mz-opening__body{grid-template-columns:1fr;gap:32px;}.folio-site .mz-opening h2{font-size:clamp(55px,13vw,95px);}.mz-opening__phone{height:auto;max-width:360px;margin:auto;}.mz-opening__phone :deep(.miao-phones--single .miao-phone-item){width:min(65%,220px);}.mz-opening header,.mz-opening footer{flex-wrap:wrap;}.mz-opening__rhythm{height:25px;}.mz-opening__lead{font-size:16px;}}
@media(orientation:landscape) and (max-height:540px){.mz-opening{min-height:650px;}}
</style>
