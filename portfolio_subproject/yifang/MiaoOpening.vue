<script setup lang="ts">
import MiaoPhones from './MiaoPhones.vue'
defineProps<{ lead:string }>()
const emit=defineEmits<{image:[url:string]}>()
</script>
<template>
 <section class="mz-opening folio-page folio-pad" data-label="MIAOZER / Broken rhythm">
  <header class="folio-eyebrow"><span class="folio-case__identity"><span class="folio-case__number">02 /</span><strong>MIAOZER</strong></span><span class="folio-case__counter">Case 2 of 4</span></header>
  <div class="mz-opening__body">
   <div class="mz-opening__type">
    <div class="mz-opening__copy"><p class="mz-opening__overline">A home takes shape.</p><h2>ROOM<br /><span>BY <em>ROOM.</em></span></h2><p class="mz-opening__lead">{{lead}}</p></div>
    <div class="mz-opening__rhythm" aria-hidden="true"><i v-for="n in 8" :key="n" :class="{'is-break':n===6}"></i></div>
    <footer><span>Plan / Record / Connect</span><span>iOS · Android · WeChat</span></footer>
   </div>
   <div class="mz-opening__phone"><p class="mz-opening__sequence"><span>01 / Advice</span><span>02 / Progress</span></p><MiaoPhones :screens="[2,9]" @image="emit('image',$event)" /></div>
  </div>
 </section>
</template>
<style scoped>
.mz-opening{position:relative;display:flex;flex-direction:column;gap:18px;background:#3b2115;color:#ffe4cf;padding-block:24px 18px;padding-right:clamp(16px,2vw,32px);overflow:hidden;}
.mz-opening>header{flex-shrink:0;align-items:baseline;}
.mz-opening__body{display:grid;grid-template-columns:minmax(0,.43fr) minmax(0,.57fr);gap:clamp(24px,3.5vw,56px);flex:1;min-height:0;}
.mz-opening__type{display:flex;flex-direction:column;min-width:0;justify-content:center;}
.mz-opening__copy{margin-block:auto;padding-block:24px 36px;}
.mz-opening__overline{font:italic clamp(18px,1.7vw,25px) Georgia,serif;color:#ff9a48;}
.folio-site .mz-opening h2{font:850 clamp(40px,min(5.6vw,10dvh),90px)/.96 'Segoe UI',sans-serif;letter-spacing:-.04em;margin:22px 0 28px;}
.mz-opening h2>span{white-space:nowrap;}.mz-opening h2 em{font:italic 1em Georgia,serif;color:#ff9a48;}
.mz-opening__lead{font-size:clamp(15px,1.35vw,20px);line-height:1.55;max-width:35ch;}
.mz-opening__rhythm{height:23px;display:flex;gap:4%;flex-shrink:0;margin-top:24px;}.mz-opening__rhythm i{flex:1;background:#ff9a48;}.mz-opening__rhythm .is-break{transform:translateY(-15px) rotate(-24deg) scale(1.15);background:#fff5e9;}
.mz-opening footer{display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px 16px;margin-top:24px;font:10px/1.5 'Courier New',monospace;letter-spacing:.04em;text-transform:uppercase;}
.mz-opening__phone{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;}
.mz-opening__sequence{display:flex;justify-content:space-around;gap:16px;flex-shrink:0;padding-bottom:8px;font:11px/1.5 'Courier New',monospace;color:#ffb473;}
.mz-opening__phone :deep(.miao-phones){flex:1;height:100%;gap:clamp(12px,1.6vw,26px);align-items:center;}
.mz-opening__phone :deep(.miao-phone-item){width:min(calc((100% - clamp(12px,1.6vw,26px))/2),calc((var(--folio-view) - 145px)*.48));}
.mz-opening__phone :deep(.miao-phone-item figcaption){display:none;}
@media(orientation:portrait){
 .mz-opening{padding:20px var(--gutter);gap:16px;}
 .mz-opening__body{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr);gap:24px;}
 .mz-opening__copy{margin:0;padding:0;}
 .folio-site .mz-opening h2{font-size:clamp(38px,11vw,72px);margin:10px 0 16px;}
 .mz-opening__lead{font-size:15px;line-height:1.45;max-width:42ch;}
 .mz-opening__rhythm{height:14px;margin-top:22px;}.mz-opening__rhythm .is-break{transform:translateY(-8px) rotate(-24deg) scale(1.15);}
 .mz-opening footer{font-size:9px;margin-top:14px;}
 .mz-opening__phone{align-self:stretch;}
 .mz-opening__phone :deep(.miao-phone-item){width:min(44%,calc((var(--folio-view) - 415px)*.46));}
 .mz-opening__sequence{font-size:10px;}
}
@media(orientation:portrait) and (max-height:760px){
 .mz-opening{padding-block:14px;gap:12px;}.mz-opening__body{gap:16px;}
 .folio-site .mz-opening h2{font-size:clamp(33px,10.2vw,48px);margin:8px 0 12px;}
 .mz-opening__lead{font-size:14px;}.mz-opening__overline{font-size:18px;}
 .mz-opening__rhythm{height:12px;margin-top:18px;}.mz-opening footer{margin-top:12px;}
 .mz-opening__phone :deep(.miao-phone-item){width:min(44%,calc((var(--folio-view) - 390px)*.43));}
}
@media(orientation:landscape) and (max-height:540px){.mz-opening{min-height:600px;}.mz-opening__phone :deep(.miao-phone-item){width:min(44%,210px);}}
</style>
