<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
const props = defineProps<{ section: number }>()
const emit = defineEmits<{ image: [url:string] }>()
const root = ref<HTMLElement|null>(null)
const player = ref<HTMLVideoElement|null>(null)
const slide = ref(0)
const playing = ref(false)
const paused = ref(false)
const compactTrust = ref(false)
const photos = ['/about/users loves and are taking pictures of booklets and posting in social media.jpg','/about/Users are selecting and buying fridge magnets and keychains.jpg']
let observer:IntersectionObserver|undefined
let timer:ReturnType<typeof setInterval>|undefined
let visible=false
function updatePlayback() { if(!player.value) return; if(visible&&!paused.value&&!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches) player.value.play().catch(()=>{}); else player.value.pause(); }
function toggleVideo() { if (!player.value) return; paused.value=!player.value.paused; if(paused.value) player.value.pause(); else player.value.play().catch(()=>{}); }
async function fitTrust() {
 if (props.section !== 2 || !root.value) return
 compactTrust.value = false
 await nextTick()
 const page = root.value.closest<HTMLElement>('.folio-theme')
 const scroller = root.value.closest<HTMLElement>('.folio-site')
 if (page && scroller) compactTrust.value = page.offsetHeight > scroller.clientHeight - (scroller.querySelector('.folio-bar')?.getBoundingClientRect().height || 0) + 2
}
onMounted(()=>{
 observer=new IntersectionObserver(entries=>{ visible=entries[0].isIntersecting && entries[0].intersectionRatio>=.25; updatePlayback() },{threshold:[0,.25]})
 document.addEventListener('visibilitychange',updatePlayback)
 if(root.value) observer.observe(root.value)
 window.addEventListener('resize', fitTrust)
 void fitTrust()
 void document.fonts.ready.then(fitTrust)
 timer=setInterval(()=>{if(props.section===1&&visible&&!paused.value&&!document.hidden) slide.value=(slide.value+1)%2},5000)
})
onUnmounted(()=>{observer?.disconnect();clearInterval(timer);document.removeEventListener('visibilitychange',updatePlayback);window.removeEventListener('resize',fitTrust)})
</script>
<template>
 <div ref="root" class="photolio-media" :class="'photolio-media--'+section" data-reveal>
  <template v-if="section===0">
   <div class="tap-video"><component :is="'video'" ref="player" class="tap-video__screen" data-playback-owner="component" :src="'/folio-photolio/tap-demo.mp4'" muted loop playsinline preload="metadata" @play="playing=true" @pause="playing=false" /></div>
   <component :is="'button'" type="button" class="photolio-media-control" @click="toggleVideo">{{playing?'Pause film':'Play film'}} <span aria-hidden="true">↗</span></component>
  </template>
  <template v-else-if="section===1">
   <component :is="'button'" type="button" class="photolio-photo" data-folio-cursor="dot" :aria-label="'View community photograph '+(slide+1)" @click="emit('image',photos[slide])"><img v-for="(photo,k) in photos" :key="photo" :src="photo" :class="{active:slide===k}" :alt="k===0?'Visitors photographing Photolio memory books':'Visitors choosing NFC magnets and keychains'" /></component>
   <div class="photolio-carousel-controls"><component :is="'button'" type="button" @click="slide=(slide+1)%2">{{slide+1}} / 2 — Next photograph</component><component :is="'button'" type="button" @click="paused=!paused">{{paused?'Resume':'Pause'}}</component></div>
  </template>
  <template v-else-if="section===2">
   <div class="photolio-trust"><p class="trust-kicker">Designed for continuity</p><img class="trust-diagram" :src="'/folio-photolio/storage.svg'" alt="Memories connected to cloud storage and a separate encrypted local backup" @load="fitTrust" /><details v-if="compactTrust" class="trust-details"><summary>Storage details</summary><div class="trust-labels"><span>01 / Cloud + local</span><span>02 / Encrypted transfer</span><span>03 / Portable originals</span></div></details><div v-else class="trust-labels"><span>01 / Cloud + local</span><span>02 / Encrypted transfer</span><span>03 / Portable originals</span></div></div>
  </template>
  <template v-else>
   <div class="photolio-screens"><component :is="'button'" v-for="n in 3" :key="n" type="button" data-folio-cursor="dot" :aria-label="'Enlarge Photolio interface '+n" @click="emit('image','/folio-photolio/p'+n+'.jpg')"><img :src="'/folio-photolio/p'+n+'.jpg'" :alt="'Photolio application screen '+n" /></component></div>
   <p class="screen-caption">A real collection. Your own way to publish.</p>
  </template>
 </div>
</template>
<style scoped>
.photolio-media { position:relative; min-width:0; height:100%; min-height:280px; display:flex; flex-direction:column; justify-content:center; overflow:hidden; }
.photolio-media.is-revealed { animation:photolio-arrive .75s cubic-bezier(.2,.7,.2,1) both; }
@keyframes photolio-arrive { from {transform:scale(.95);opacity:.55} to {transform:scale(1);opacity:1} }
.tap-video { width:min(100%, calc((var(--folio-view) - 75px) * .5625 + 16px)); flex-shrink:0; margin-inline:auto; padding:6px; border:2px solid #a49886; border-radius:36px; background:#302921; box-shadow:0 18px 30px #3f2f2426; overflow:hidden; }
.tap-video__screen { display:block; width:100%; height:auto; aspect-ratio:9/16; object-fit:contain; border-radius:28px; background:#201c18; }
.folio-site .photolio-media-control { align-self:center; display:flex;gap:32px; font:11px 'Courier New',monospace;padding:15px; }
.photolio-photo { position:relative; flex:1; min-height:300px; width:100%; }
.photolio-photo img { position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .7s; }
.photolio-photo img.active { opacity:1; }
.photolio-carousel-controls { display:flex;justify-content:space-between;gap:15px;padding-top:14px;font:11px/1.5 'Courier New',monospace; }
.photolio-trust { background:var(--tone);color:var(--ground);padding:clamp(20px,3vw,45px);border:1px solid var(--case-line); }
.trust-kicker { font:11px 'Courier New',monospace;text-transform:uppercase;letter-spacing:.12em; }
.trust-diagram { width:100%;display:block;margin-block:15px; }
.trust-labels { display:grid;gap:8px;font:11px/1.6 'Courier New',monospace; }
.trust-labels span { border-top:1px solid var(--case-line);padding-top:8px; }
.trust-details { border-top:1px solid var(--case-line); padding-top:8px; font:11px/1.6 'Courier New',monospace; }
.trust-details summary { cursor:pointer; }
.trust-details .trust-labels { margin-top:8px; }
.photolio-screens { display:flex;align-items:center;justify-content:center;gap:3%;padding:30px 8px; }
.folio-site .photolio-screens button { width:31%;border:4px solid #302921;border-radius:18px;overflow:hidden;box-shadow:0 14px 20px #0002; }
.photolio-screens button:nth-child(2) { transform:translateY(-20px); }
.photolio-screens img { width:100%;display:block; }
.screen-caption { text-align:center;font:11px/1.5 'Courier New',monospace!important; }
@media(orientation:portrait) { .photolio-media {min-height:300px;height:auto;} .tap-video {width:min(76vw, calc((var(--folio-view) - 85px) * .5625 + 16px));} .photolio-photo{min-height:340px;} }
@media(orientation:landscape) and (max-height:850px) { .trust-diagram { max-height:42dvh; object-fit:contain; } }
@media(max-width:400px) { .photolio-screens{gap:2%;} .folio-site .photolio-screens button{border-width:3px;border-radius:12px;} }
</style>
