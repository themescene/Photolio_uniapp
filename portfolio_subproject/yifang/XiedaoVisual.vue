<template>
 <div class="xiedao-poster">
  <p class="xd-meta">03 / Xiedao Renaissance · Interaction studies, 2025</p>
  <h2><span>MAKE ROOM</span><span>FOR THE</span><em>writer.</em></h2>
  <svg viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true"><path d="M55 190Q410 135 830 205M350 360Q610 330 940 365M270 560C170 405 880 395 880 560S250 720 270 560M880 560l45-40m-45 40 53 22" /></svg>
  <span class="xd-note">keep the human in the edit.</span>
  <footer><span>01 / Revision</span><span>02 / Voice</span><span>03 / Relationships</span></footer>
 </div>
</template>
<style scoped>
.xiedao-poster{position:relative;isolation:isolate;min-height:var(--folio-view);width:100%;padding:32px var(--gutter);display:flex;flex-direction:column;justify-content:space-between;background:#edece7;color:#252b36;overflow:hidden;}
.xd-meta,.xiedao-poster footer{font:11px/1.5 'Courier New',monospace;letter-spacing:.08em;text-transform:uppercase;}
.folio-site .xiedao-poster h2{font:850 clamp(48px,min(9vw,15dvh),145px)/.95 'Segoe UI',sans-serif;letter-spacing:-.065em;margin:30px 0;}
.xiedao-poster h2 span{display:block;}.xiedao-poster h2 span:nth-child(2){text-align:right;}.xiedao-poster h2 em{display:block;margin-left:22%;font:italic 1.4em/1 Georgia,serif;letter-spacing:-.07em;}
.xiedao-poster svg{position:absolute;inset:10% 0 8%;width:100%;height:82%;pointer-events:none;z-index:-0;}.xiedao-poster path{fill:none;stroke:#a3443a;stroke-width:3;vector-effect:non-scaling-stroke;}
.xd-note{align-self:flex-end;font:italic clamp(18px,2vw,28px) Georgia,serif;transform:rotate(-6deg);color:#a3443a;}.xiedao-poster footer{display:flex;justify-content:space-between;gap:16px;margin-top:40px;border-top:1px solid #252b3640;padding-top:16px;}
@media(orientation:portrait){.folio-site .xiedao-poster h2{font-size:clamp(44px,12vw,100px);}.xiedao-poster footer{flex-wrap:wrap;}.xiedao-poster svg{inset:20% 0 15%;height:65%;}}
</style>
