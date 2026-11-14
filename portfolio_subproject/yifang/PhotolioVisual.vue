<script setup lang="ts">
import { ref } from 'vue'
defineEmits<{ navigate: [id: string] }>()
const active = ref(false)
</script>
<template>
  <div class="photolio-construction" :class="{ 'is-active': active }">
    <p class="construction-meta">01 / Physical objects. Digital memories.</p>
    <h3 class="construction-title">FUTURE<br /><em>MEDIA.</em></h3>
    <div class="construction-diagram" aria-hidden="true"><svg viewBox="0 0 300 450" preserveAspectRatio="none"><g fill="none" stroke="currentColor" stroke-width="1"><path d="M300 10A215 215 0 0 0 300 440M0 110h300M0 220h300M0 330h300M75 0v450M150 0v450M225 0v450"/><circle cx="150" cy="110" r="70"/><circle cx="150" cy="110" r="40"/><path d="m0 220 300-110L0 330l300 110M150 185v70M115 220h70"/><ellipse cx="150" cy="355" rx="100" ry="35"/><ellipse cx="150" cy="355" rx="38" ry="35"/></g></svg></div>
    <div class="construction-grid" aria-hidden="true"><span>TECH.<small>Systems &amp; interaction</small></span><span>ART.<small>Form &amp; expression</small></span><span>SOUND.<small>Timing &amp; rhythm</small></span><span>PLAY.<small>Rules &amp; possibilities</small></span></div>
    <svg class="construction-line" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><path d="M270 365 C480 365 470 190 750 190 M270 365 C440 365 480 520 800 520"/><circle cx="270" cy="365" r="5"/><circle cx="750" cy="190" r="5"/><circle cx="800" cy="520" r="5"/></svg>
    <component :is="'button'" type="button" class="construction-object" data-folio-cursor="dot" aria-label="Explore the NFC keepsake" :aria-pressed="active" @mouseenter="active = true" @mouseleave="active = false" @focus="active = true" @blur="active = false" @click="active = !active">
      <img :src="'/folio-photolio/product.png'" alt="Photolio's open ring-bound memory book" />
      <span>THE OBJECT / NFC KEEPSAKE</span>
    </component>
    <a class="construction-phone" data-folio-cursor="dot" href="/#/pages/index/index" target="_blank" rel="noopener" aria-label="Open the Photolio web app"><img :src="'/folio-photolio/p1.jpg'" alt="Photolio home screen with personal memory collections" /></a>
    <component :is="'button'" type="button" class="construction-banner" @click="$emit('navigate','photolio-theme-1')"><span class="construction-light"></span> A keepsake opens a living collection <span aria-hidden="true">↗</span></component>
    <p class="construction-foot">A physical home for photographs, voices &amp; shared stories.</p>
  </div>
</template>

<style scoped>
.photolio-construction { position:relative; min-height:var(--folio-view); width:100%; overflow:hidden; color:var(--ground); background:var(--tone); background-image:linear-gradient(#2c282228 1px,transparent 1px),linear-gradient(90deg,#2c282228 1px,transparent 1px); background-size:12.5% 12.5%; isolation:isolate; }
.photolio-construction::before { content:""; position:absolute; inset:0; pointer-events:none; opacity:.4; background:linear-gradient(125deg,transparent 18%,#fff4 18.3%,transparent 19%),linear-gradient(35deg,transparent 48%,#6b8c7814 48.3%,transparent 49%),linear-gradient(160deg,transparent 70%,#fff5 70.5%,transparent 71%); background-size:47% 73%,63% 51%,81% 87%; }
.construction-meta { position:absolute; left:var(--gutter); top:4%; font:600 11px/1.4 'Courier New',monospace; letter-spacing:.12em; text-transform:uppercase; }
.construction-title { position:absolute; top:10%; left:var(--gutter); font:900 clamp(44px,min(11vw,14dvh),150px)/.83 'Arial Black','Segoe UI',sans-serif; letter-spacing:-.065em; z-index:1; }
.construction-title em { display:block; margin-left:16%; font-family:Georgia,serif; font-weight:900; }
.construction-diagram { position:absolute; inset:36% 51% 11% 4%; border:1px solid #2c282280; color:#2c2822; opacity:.65; }
.construction-diagram svg { width:100%; height:100%; }
.construction-grid { position:absolute; inset:38% 4% 13% 45%; border:1px solid #2c282240; display:grid; grid-template-rows:repeat(4,1fr); z-index:-1; }
.construction-grid span { border-bottom:1px solid #2c282240; padding:5px 12px; font:700 clamp(18px,3vw,42px)/1 Georgia,serif; }
.construction-grid span:last-child { border:0; }
.construction-grid small { display:block; font:9px/1.8 'Courier New',monospace; letter-spacing:.08em; }
.construction-line { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; z-index:2; }
.construction-line path { fill:none; stroke:#997346; stroke-width:1.2; vector-effect:non-scaling-stroke; transition:stroke .4s; }
.construction-line circle { fill:#997346; }
.folio-site .construction-object { position:absolute; top:35%; left:5%; width:40%; height:48%; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:3; }
.construction-object img { width:100%; height:90%; object-fit:contain; filter:drop-shadow(0 15px 12px #4c382526); transition:transform .65s cubic-bezier(.2,.7,.2,1); }
.construction-object span { font:10px/1.5 'Courier New',monospace; letter-spacing:.12em; padding-top:12px; }
.is-active .construction-object img { transform:rotate(-7deg) scale(1.09); }
.construction-phone { position:absolute; top:10%; right:10%; height:68%; max-width:29%; aspect-ratio: .46; border:7px solid #302921; border-radius:clamp(20px,3vw,42px); background:#302921; box-shadow:0 18px 30px #3f2f2426,inset 0 0 0 1px #a49886; overflow:hidden; z-index:3; transform:rotate(8deg); transition:transform .65s; }
.construction-phone img { width:100%; height:100%; object-fit:cover; display:block; }
.construction-phone:hover { transform:rotate(3deg) scale(1.03); }
.folio-site .photolio-construction .construction-banner { position:absolute; right:5%; bottom:9%; max-width:56%; padding:12px 16px; background:#e9cda0; border:1px solid #a38458; display:flex; align-items:center; gap:12px; font:12px/1.4 'Courier New',monospace; z-index:4; transition:box-shadow .4s,background .4s; }
.construction-light { width:7px; height:7px; border-radius:50%; background:#9a6c29; flex-shrink:0; }
.folio-site .photolio-construction.is-active .construction-banner,.folio-site .photolio-construction .construction-banner:hover { background:#ffe5ac; box-shadow:0 0 34px #d6ad6b99; }
.is-active .construction-light { box-shadow:0 0 14px 4px #f5bf51; }
.construction-foot { position:absolute; bottom:3%; left:var(--gutter); max-width:85%; font:10px/1.5 'Courier New',monospace; }
@media (orientation:portrait) {
 .construction-title { top:12%; font-size:clamp(40px,13vw,95px); }
 .construction-meta { max-width:80%; }
 .construction-phone { top:36%; right:9%; height:42%; max-width:37%; border-width:5px; transform:rotate(7deg); }
 .folio-site .construction-object { top:39%; left:2%; width:51%; height:31%; }
 .construction-object span { max-width:85%; font-size:8px; text-align:center; }
 .construction-grid { inset:32% 5% 17%; opacity:.45; }
 .construction-grid span { font-size:24px; }
 .folio-site .photolio-construction .construction-banner { bottom:10%; right:5%; max-width:90%; font-size:11px; }
 .construction-line path { d:path('M270 330 C480 330 470 340 750 340 M270 330 C440 330 480 510 600 510'); }
 .construction-line circle { display:none; }
}
</style>
