<script setup lang="ts">
import PageActions from './ui/PageActions.vue'
const emit = defineEmits<{ navigate: [id: string] }>()
const studies = [
  ['scale', 'Scale & punctuation', 'A large mark and a small reading voice.'],
  ['direction', 'Opposing directions', 'Two arrows share a body and disagree.'],
  ['gesture', 'Order & gesture', 'Rigid typography interrupted by loose ink.'],
  ['edge', 'Edge tension', 'The frame becomes part of the composition.'],
  ['rhythm', 'Broken rhythm', 'A repeated sequence with one deliberate interruption.'],
  ['grid', 'Visible construction', 'The grid and geometric scaffolding remain visible.'],
  ['split', 'Cut & contrast', 'A continuous word crosses two opposing fields.'],
]
</script>

<template>
  <section id="design-lab" class="design-lab" tabindex="-1" aria-label="Experimental layout drafts">
    <header class="lab-index folio-pad folio-page" data-label="Layout studies">
      <p class="lab-meta">Layout studies / Drafts / 01–07</p>
      <h2 class="lab-heading">A little<br /><em>out of line.</em></h2>
      <p class="lab-intro">Seven composition studies after the portfolio. Select a study to compare its visual language before applying it to a project.</p>
      <div class="lab-menu">
        <component :is="'button'" v-for="(study, i) in studies" :key="study[0]" type="button" @click="emit('navigate', 'study-' + study[0])">
          <span>0{{ i + 1 }}</span><strong>{{ study[1] }}</strong><span aria-hidden="true">↗</span>
        </component>
      </div>
    </header>

    <section id="study-scale" class="lab-sheet lab-scale folio-page" tabindex="-1" data-label="Study 01 / Scale">
      <p class="lab-meta">01 / Scale & punctuation</p>
      <div class="lab-scale__marks" aria-hidden="true"><span>M</span><span>,</span></div>
      <h2 class="lab-small-title">A small voice.<br />An enormous presence.</h2>
      <p class="lab-note">A small block of text becomes a focal point when it stands beside an oversized mark.</p>
      <span class="lab-registration" aria-hidden="true">+</span>
    </section>

    <section id="study-direction" class="lab-sheet lab-direction folio-page" tabindex="-1" data-label="Study 02 / Direction">
      <p class="lab-meta">02 / Opposing directions</p>
      <h2 class="lab-direction__label">Where do<br />we go next?</h2>
      <svg class="lab-arrows" viewBox="0 0 600 700" aria-hidden="true">
        <path d="M20 280 300 20 580 280v150L365 230v320H235V230L20 430Z" fill="currentColor" />
        <path d="M125 415 245 525V360h110v165l120-110v155L300 690 125 570Z" fill="currentColor" />
      </svg>
      <p class="lab-note">One axis. Two directions. The eye has to choose a route.</p>
    </section>

    <section id="study-gesture" class="lab-sheet lab-gesture folio-page" tabindex="-1" data-label="Study 03 / Gesture">
      <p class="lab-meta">03 / Order & gesture</p>
      <h2 class="lab-gesture__type"><span>MAKE</span><span>ROOM FOR</span><span>THE</span><span>UNEXPECTED.</span></h2>
      <svg class="lab-ink" viewBox="0 0 900 700" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M40 155Q95 5 110 100L70 310 215 74 160 270Q255 230 295 45" />
          <path d="M430 125C755-70 920 150 625 175S410 260 805 287L755 255M805 287 764 314" />
          <path d="M40 400C375 275 420 500 115 480L80 590Q155 635 280 518" />
          <path d="M570 490Q810 325 720 500L540 640Q650 570 865 570M540 640 550 580" />
        </g>
      </svg>
      <span class="lab-handwritten" aria-hidden="true">what if?</span>
      <p class="lab-note">Stable type holds the structure. The gestures refuse to sit still.</p>
    </section>

    <section id="study-edge" class="lab-sheet lab-edge folio-page" tabindex="-1" data-label="Study 04 / Edge">
      <p class="lab-meta">04 / Edge tension</p>
      <div class="lab-edge__corners" aria-hidden="true"><span>M</span><span>M</span><span>Y</span><span>S</span></div>
      <h2 class="lab-edge__title">The space<br /><em>between</em><br />the edges.</h2>
      <span class="lab-edge__side" aria-hidden="true">VISUAL COMMUNICATION</span>
      <span class="lab-edge__side lab-edge__side--right" aria-hidden="true">FORM / FRAME / FIELD</span>
      <p class="lab-note">Cropped letters press against the frame while the centre stays quiet.</p>
    </section>

    <section id="study-rhythm" class="lab-sheet lab-rhythm folio-page" tabindex="-1" data-label="Study 05 / Rhythm">
      <p class="lab-meta">05 / Broken rhythm</p>
      <div class="lab-bars lab-bars--top" aria-hidden="true"><i v-for="i in 9" :key="i" :style="{ '--i': i }"></i></div>
      <div class="lab-bars lab-bars--bottom" aria-hidden="true"><i v-for="i in 9" :key="i" :style="{ '--i': i }"></i></div>
      <h2 class="lab-rhythm__title">Everything<br />in order<span aria-hidden="true">.</span><em>Almost.</em></h2>
      <span class="lab-rhythm__exception" aria-hidden="true">?</span>
      <p class="lab-note">A sequence establishes a rule. One interruption gives it a pulse.</p>
    </section>

    <section id="study-grid" class="lab-sheet lab-grid folio-page" tabindex="-1" data-label="Study 06 / Construction">
      <p class="lab-meta">06 / Visible construction</p>
      <h2 class="lab-grid__headline">FUTURE<br /><em>MEDIA.</em></h2>
      <div class="lab-grid__body">
        <div class="lab-grid__diagram" aria-hidden="true">
          <svg viewBox="0 0 300 450">
            <g fill="none" stroke="currentColor" stroke-width="1">
              <path d="M300 10A215 215 0 0 0 300 440M0 110h300M0 220h300M0 330h300M75 0v450M150 0v450M225 0v450" />
              <circle cx="150" cy="110" r="70" /><circle cx="150" cy="110" r="40" />
              <path d="m0 220 300-110L0 330l300 110M150 185v70M115 220h70" />
              <ellipse cx="150" cy="355" rx="100" ry="35" /><ellipse cx="150" cy="355" rx="38" ry="35" />
            </g>
          </svg>
        </div>
        <div class="lab-grid__departments">
          <div><strong>TECH.</strong><span>Systems & interaction</span></div>
          <div><strong>ART.</strong><span>Form & expression</span></div>
          <div><strong>SOUND.</strong><span>Timing & rhythm</span></div>
          <div><strong>PLAY.</strong><span>Rules & possibilities</span></div>
        </div>
      </div>
      <p class="lab-note">The construction lines become part of the finished page.</p>
    </section>

    <section id="study-split" class="lab-sheet lab-split folio-page" tabindex="-1" data-label="Study 07 / Cut">
      <p class="lab-meta">07 / Cut & contrast</p>
      <h2 class="lab-split__title"><span>MAKE</span><span>SPACE</span></h2>
      <span class="lab-split__vertical" aria-hidden="true">FOR THE UNEXPECTED</span>
      <div class="lab-split__cut" aria-hidden="true"></div>
      <p class="lab-note">The word continues across a cut. Weight, direction and contrast change on either side.</p>
      <PageActions class="lab-exit" variant="compact" :actions="[
        { target: 'design-lab', title: 'Back to layout studies', arrow: '↑' },
        { target: 'archive', title: 'Continue to archive', arrow: '↗' },
      ]" @navigate="target => emit('navigate', target)" />
    </section>
  </section>
</template>

<style scoped>
.design-lab { --lab-ink:#111813; --lab-paper:#d8e4e1; color:var(--lab-ink); background:var(--lab-paper); }
.lab-index { display:grid; align-content:center; gap:20px; padding-block:var(--folio-section-pad); background:#e3e9df; }
.design-lab .lab-heading { font:800 clamp(45px,7.4vw,116px)/.94 'Segoe UI',sans-serif; letter-spacing:-.055em; }
.lab-heading em { font:italic .88em/1 Georgia,serif; }
.lab-intro { max-width:48ch; font-size:clamp(14px,1.7vw,20px); }
.lab-meta { position:relative; z-index:3; font:600 11px/1.4 'Courier New',monospace; letter-spacing:.1em; text-transform:uppercase; }
.lab-menu { display:grid; grid-template-columns:1fr 1fr; gap:0 32px; margin-top:12px; }
.design-lab .lab-menu [type="button"] { display:grid; grid-template-columns:24px 1fr 18px; gap:9px; align-items:center; width:100%; padding:13px 0; border-top:1px solid #11181340; }
.lab-menu strong { font-weight:600; }
.lab-menu [type="button"] > span { font:11px 'Courier New',monospace; }
@media (orientation:landscape) and (max-height:900px) {
 .lab-index { padding-block:clamp(20px,3dvh,30px); gap:clamp(12px,2dvh,18px); }
 .design-lab .lab-heading { font-size:clamp(45px,min(7.4vw,14dvh),116px); }
}
.lab-sheet { position:relative; isolation:isolate; min-height:var(--folio-view); height:var(--folio-view); overflow:clip; padding:24px var(--gutter); background:var(--lab-paper); }
.lab-sheet::before { content:""; position:absolute; inset:0; z-index:-1; pointer-events:none; opacity:.4; background:linear-gradient(125deg,transparent 18%,#fff4 18.3%,transparent 19%),linear-gradient(35deg,transparent 48%,#6b8c7814 48.3%,transparent 49%),linear-gradient(160deg,transparent 70%,#fff5 70.5%,transparent 71%); background-size:47% 73%,63% 51%,81% 87%; }
.design-lab .lab-note { position:absolute; z-index:3; bottom:24px; left:var(--gutter); right:var(--gutter); max-width:58ch; font:12px/1.4 'Segoe UI',sans-serif; }
.lab-registration { position:absolute; right:4%; bottom:10%; font:40px/1 monospace; }
.lab-scale__marks { position:absolute; inset:12% 1% 6%; display:grid; grid-template-columns:1.2fr .8fr; align-items:start; font:900 min(60vw,90dvh)/.8 'Arial Black','Segoe UI',sans-serif; letter-spacing:-.1em; pointer-events:none; }
.lab-scale__marks span:last-child { font-size:1.25em; translate:0 -9%; }
.design-lab .lab-small-title { position:absolute; top:64%; left:7%; max-width:20ch; font:400 clamp(15px,1.7vw,23px)/1.1 'Segoe UI',sans-serif; }
.lab-arrows { position:absolute; left:50%; top:49%; translate:-50% -50%; height:84%; max-width:92%; }
.design-lab .lab-direction__label { position:absolute; z-index:2; top:43%; right:6%; padding:9px; color:var(--lab-paper); background:var(--lab-ink); font:500 clamp(13px,2vw,24px)/1.15 'Segoe UI',sans-serif; }
.lab-gesture__type { position:absolute; inset:17% 3% 12%; display:flex; flex-direction:column; justify-content:space-between; font:900 clamp(26px,min(9vw,13dvh),130px)/.88 'Arial Black','Segoe UI',sans-serif; letter-spacing:-.055em; }
.lab-gesture__type span:nth-child(2) { align-self:end; }
.lab-gesture__type span:nth-child(3) { margin-left:18%; }
.lab-ink { position:absolute; z-index:2; inset:5% 1% 8%; width:98%; height:87%; color:#111813; pointer-events:none; }
.lab-handwritten { position:absolute; right:6%; top:42%; z-index:3; font:italic clamp(30px,7vw,80px)/1 'Segoe Print','Comic Sans MS',cursive; rotate:-14deg; color:#536d19; }
.lab-edge__corners { position:absolute; inset:-4% -2%; display:grid; grid-template-columns:1fr 1fr; align-content:space-between; font:900 clamp(120px,min(24vw,31dvh),370px)/.7 'Arial Black',sans-serif; }
.lab-edge__corners span:nth-child(even) { text-align:right; }
.lab-edge .lab-meta { margin-top:8%; text-align:center; }
.design-lab .lab-edge__title { position:absolute; top:46%; left:50%; translate:-50% -50%; width:80%; text-align:center; font:400 clamp(25px,4.6vw,65px)/1.04 'Segoe UI',sans-serif; letter-spacing:-.04em; }
.lab-edge__title em { display:inline-block; margin-left:12%; font-family:Georgia,serif; }
.lab-edge__side { position:absolute; left:4%; top:38%; writing-mode:vertical-rl; font:11px/1 monospace; }
.lab-edge__side--right { left:auto; right:4%; top:54%; }
.lab-edge .lab-note { left:25%; bottom:16%; max-width:50%; font-size:11px; }
.lab-bars { position:absolute; display:flex; width:49%; height:61%; gap:clamp(3px,.8vw,13px); }
.lab-bars i { display:block; flex:1; height:calc(100% - var(--i) * 8%); background:var(--lab-ink); }
.lab-bars i:nth-child(6) { height:87%; background:#648029; }
.lab-bars--top { top:0; left:0; }
.lab-bars--bottom { right:0; bottom:0; rotate:180deg; }
.lab-rhythm .lab-meta { text-align:right; }
.design-lab .lab-rhythm__title { position:absolute; z-index:2; top:48%; left:50%; translate:-50% -50%; width:65%; text-align:center; font:600 clamp(22px,4vw,62px)/1.03 'Segoe UI',sans-serif; background:var(--lab-paper); padding:10px; }
.lab-rhythm__title em { display:block; margin-top:8px; font:italic .7em Georgia,serif; }
.lab-rhythm__exception { position:absolute; left:16%; bottom:13%; rotate:-17deg; font:italic 900 clamp(55px,12vw,170px)/1 Georgia,serif; color:#648029; }
.lab-rhythm .lab-note { width:39%; max-width:none; bottom:8%; left:4%; }
.lab-grid { background:#f7f5eb; padding-inline:4%; background-image:linear-gradient(#18241828 1px,transparent 1px),linear-gradient(90deg,#18241828 1px,transparent 1px); background-size:12.5% 12.5%; }
.design-lab .lab-grid__headline { margin-top:12px; font:900 clamp(44px,min(11vw,14dvh),150px)/.83 'Arial Black','Segoe UI',sans-serif; letter-spacing:-.065em; }
.lab-grid__headline em { margin-left:16%; font-family:Georgia,serif; font-weight:900; }
.lab-grid__body { position:absolute; inset:36% 4% 11%; display:grid; grid-template-columns:1fr 1.15fr; border:1px solid #11181380; }
.lab-grid__diagram { overflow:hidden; border-right:1px solid #11181380; }
.lab-grid__diagram svg { width:100%; height:100%; }
.lab-grid__departments { display:grid; grid-template-rows:repeat(4,1fr); }
.lab-grid__departments > div { display:flex; justify-content:center; flex-direction:column; padding:6px 12px; border-bottom:1px solid #11181380; }
.lab-grid__departments strong { font:800 clamp(17px,3.6vw,52px)/1 Georgia,serif; }
.lab-grid__departments span { margin-top:5px; font:10px/1.2 'Courier New',monospace; }
.lab-split { background:linear-gradient(#b10813 0 49%,#f5eee2 49% 100%); color:#f5eee2; }
.lab-split::before { display:none; }
.design-lab .lab-split__title { position:absolute; inset:0 2%; font:500 clamp(60px,min(18vw,29dvh),300px)/.8 Georgia,serif; letter-spacing:-.06em; color:#f5eee2; }
.lab-split__title span { position:absolute; top:20%; left:0; }
.lab-split__title span:last-child { top:54%; left:-.08em; color:#b10813; }
.lab-split__vertical { position:absolute; right:2%; top:15%; writing-mode:vertical-rl; font:700 clamp(11px,2.8vw,32px)/1 'Segoe UI',sans-serif; letter-spacing:.12em; }
.lab-split__cut { position:absolute; z-index:2; top:49%; left:0; width:100%; height:8%; background:#f5eee2; }
.lab-split .lab-note { color:#b10813; font-family:'Courier New',monospace; letter-spacing:.02em; }
.lab-split { --folio-actions-height:clamp(80px,10dvh,112px); }
.design-lab .lab-exit { position:absolute; z-index:5; inset:auto 0 0; color:var(--lab-ink); }
.design-lab .lab-split .lab-note { bottom:calc(var(--folio-actions-height) + 20px); }
@media (orientation:portrait) {
 .lab-index { padding-block:30px; gap:15px; }
 .lab-menu { grid-template-columns:1fr; }
 .design-lab .lab-heading { font-size:clamp(39px,12vw,88px); }
 .lab-sheet { padding-top:18px; }
 .lab-gesture__type { font-size:clamp(26px,10.5vw,90px); inset-block:20% 18%; }
 .lab-scale__marks { inset-block-start:22%; font-size:72vw; }
 .lab-scale__marks span:last-child { translate:-4% 6%; }
 .lab-grid__body { inset-block-start:31%; }
 .design-lab .lab-split__title { font-size:25vw; }
 .lab-split__title span:first-child { top:29%; }
 .lab-split__vertical { font-size:14px; }
 .lab-exit { font-size:11px; }
}
@media (max-height:600px) { .design-lab .lab-note { bottom:12px; font-size:10px; } .lab-meta { font-size:10px; } }
@media (orientation:landscape) and (max-height:600px) {
 .lab-split { --folio-actions-height:clamp(36px,10dvh,56px); }
 .design-lab .lab-split .lab-note { left:auto; right:var(--gutter); width:32%; bottom:calc(var(--folio-actions-height) + 8px); }
 .design-lab .lab-exit :deep(.folio-page-actions__button[type="button"]) { padding-block:6px; }
}
</style>
