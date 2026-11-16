<script setup lang="ts">
defineProps<{ lead:string }>()
</script>
<template>
 <div class="xiedao-poster">
  <div class="folio-eyebrow xd-identity"><span class="folio-case__identity"><span class="folio-case__number">03 /</span><img class="xd-wordmark" :src="'/folio-xiedao/wordmark.svg'" alt="Xiedao Renaissance" /></span><span class="folio-case__counter">Case 3 of 4</span></div>
  <div class="xd-composition"><div class="xd-type"><h2><span>MAKE ROOM</span><span>FOR THE</span><em>writer.</em></h2>
  <svg viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true"><path d="M0 125Q400 90 940 145M320 265Q630 235 1000 260M205 390C145 280 830 270 830 390S220 510 205 390" /></svg></div></div>
  <div class="xd-intro"><p>{{ lead }}</p><span class="xd-note">keep the human in the edit.</span></div>
  <footer><span>01 / Revision</span><span>02 / Voice</span><span>03 / Relationships</span></footer>
 </div>
</template>
<style scoped>
.xiedao-poster{position:relative;isolation:isolate;min-height:var(--folio-view);width:100%;padding:32px var(--gutter);display:flex;flex-direction:column;justify-content:space-between;background:#e6e9ee;color:#252b36;overflow:hidden;}
.xd-meta,.xiedao-poster footer{font:11px/1.5 'Courier New',monospace;letter-spacing:.08em;text-transform:uppercase;}
.xd-wordmark{display:block;width:clamp(150px,18vw,240px);height:auto;}.xd-identity .folio-case__identity{align-items:center;}
.xd-composition{position:relative;isolation:isolate;flex:1;display:flex;align-items:center;margin:20px 0 35px;min-height:0;}
.xd-type{position:relative;width:100%;}
.folio-site .xiedao-poster h2{width:100%;font:850 clamp(48px,min(9vw,15dvh),145px)/.95 'Segoe UI',sans-serif;letter-spacing:-.045em;margin:0;position:relative;z-index:1;}
.xiedao-poster h2 span{display:block;}.xiedao-poster h2 span:nth-child(2){text-align:right;}.xiedao-poster h2 em{display:block;margin-left:22%;font:italic 1.4em/1 Georgia,serif;letter-spacing:-.07em;}
.xiedao-poster svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;}.xiedao-poster path{fill:none;stroke:#687789;stroke-width:2;vector-effect:non-scaling-stroke;}
.xd-intro{display:flex;justify-content:space-between;align-items:end;gap:24px;position:relative;z-index:1;} .xd-intro p{max-width:48ch;font:clamp(15px,1.45vw,20px)/1.45 'Segoe UI',Arial,sans-serif;} .xd-note{flex-shrink:0;font:italic clamp(18px,2vw,28px) Georgia,serif;transform:rotate(-4deg);color:#687789;}.xiedao-poster footer{display:flex;justify-content:space-between;gap:16px;margin-top:26px;border-top:1px solid #252b3640;padding-top:16px;}
@media(orientation:portrait){.folio-site .xiedao-poster h2{font-size:clamp(40px,11.7vw,100px);}.xiedao-poster footer{flex-wrap:wrap;} .xd-intro{flex-direction:column;align-items:start;gap:20px;} .xd-note{align-self:flex-end;}.xd-composition{min-height:260px;margin-block:24px 36px;}}
</style>
