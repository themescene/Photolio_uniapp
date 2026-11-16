<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
const player=ref<HTMLVideoElement|null>(null)
const selectedFilm=ref('')
const emit=defineEmits<{video:[value:{url:string;title:string}]}>()
const films=[{id:'jIp08KVBUcA',title:'Juneteenth 2025 | Brookline for the Culture',url:'https://www.youtube.com/watch?v=jIp08KVBUcA&t=119s'}, {id:'utavFhmSAXs',title:'The Gift Cart Guardian',subtitle:'A story of service, community, and resilience',url:'https://www.youtube.com/watch?v=utavFhmSAXs'}]
let observer:IntersectionObserver|undefined
function stopHidden(){if(document.hidden) player.value?.pause()}
onMounted(()=>{observer=new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)player.value?.pause()},{threshold:0});if(player.value)observer.observe(player.value);document.addEventListener('visibilitychange',stopHidden)})
onUnmounted(()=>{observer?.disconnect();document.removeEventListener('visibilitychange',stopHidden)})
</script>
<template>
 <section class="big-opening folio-page folio-pad" data-label="BIG / On site. On air.">
  <header class="folio-eyebrow"><span class="folio-case__identity"><span class="folio-case__number">04 /</span><strong>Brookline Interactive Group</strong></span><span class="folio-case__counter">Case 4 of 4</span></header>
  <div class="big-opening__frame"><span class="big-opening__edge big-opening__edge--left" aria-hidden="true">B</span><span class="big-opening__edge big-opening__edge--middle" aria-hidden="true">I</span><span class="big-opening__edge big-opening__edge--right" aria-hidden="true">G</span><div class="big-opening__center"><p>Brookline, Massachusetts</p><h2>On site.<br /><em>On air.</em></h2><p>Camera operation, live production, editing, and a small automation tool—learning how community media reaches its audience.</p></div></div>
  <footer><span>Capture / Edit / Publish</span><img class="big-opening__logo" :src="'/folio-big/logo.webp'" alt="Brookline Interactive Group" /><span>June–August 2025</span></footer>
 </section>
 <section id="brookline-workflow" class="big-workflow folio-page folio-pad" data-label="BIG / A small tool in the workflow">
  <div class="big-section-heading"><span>04.01 / Workflow automation</span><h3>A small tool.<br />A recurring task.</h3><p>I developed Python and Selenium scripts to download municipal meeting recordings, process them with FFmpeg, and upload them to Cablecast.tv. Local history records help avoid repeating work.</p></div>
  <div class="big-player" data-folio-cursor="dot"><component :is="'video'" class="big-demo-video" ref="player" :src="'/folio-big/workflow-demo.mp4'" :poster="'/folio-big/demo-poster.jpg'" controls playsinline preload="none" data-media-autoplay="false" data-playback-owner="component" aria-label="Brookline meeting download and processing demonstration" /></div>
  <div class="big-workflow__foot"><span>2025 recording · Download & processing demo · 2:29</span><component :is="'button'" type="button" @click="player?.pause(); emit('video',{url:'/folio-big/workflow-demo.mp4',title:'Brookline workflow demonstration'})">Fullscreen ↗</component><a href="https://github.com/themescene/brookline-media-workflow" target="_blank" rel="noopener noreferrer">Read the code ↗</a></div>
 </section>
 <section id="brookline-production" class="big-production folio-page folio-pad" data-label="BIG / Production & editing">
  <div class="big-section-heading"><span>04.02 / Production & editing</span><h3>Beyond the script.</h3><p>I supported more than ten on-location shoots and edited two video projects. Live work included multi-camera PTZ operation, real-time CG compositing in Broadcast Pix, and resolving autofocus issues. At Brookline Town Meeting, I supported multi-monitor voting displays for 255 onsite voters.</p></div>
  <div class="big-films"><article v-for="(film,i) in films" :key="film.id"><div class="big-film-frame"><iframe v-if="selectedFilm===film.id" :src="'https://www.youtube-nocookie.com/embed/'+film.id+'?autoplay=1'+(i===0?'&start=119':'')" :title="film.title" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe><component v-else :is="'button'" type="button" class="big-film-play" data-folio-cursor="dot" @click="selectedFilm=film.id" :aria-label="'Play '+film.title"><span class="big-film-number">0{{i+1}}</span><span>Play film <span aria-hidden="true">↗</span></span></component></div><p>Editing / Published by Brookline Interactive Group</p><h4>{{film.title}}</h4><p v-if="film.subtitle">{{film.subtitle}}</p><a :href="film.url" target="_blank" rel="noopener noreferrer">Watch on YouTube ↗</a></article></div>
 </section>
</template>
<style scoped>
.big-opening,.big-workflow,.big-production{padding-block:30px;color:var(--ground);background:var(--case-paper);display:flex;flex-direction:column;gap:24px;}
.big-opening{background:var(--ground);color:var(--tone);justify-content:space-between;overflow:hidden;}.big-opening header,.big-opening footer{display:flex;justify-content:space-between;gap:20px;font:11px/1.5 'Courier New',monospace;letter-spacing:.06em;text-transform:uppercase;position:relative;z-index:1;}
.big-opening__frame{position:relative;flex:1;min-height:470px;display:grid;place-items:center;border:1px solid #acdae050;isolation:isolate;}.big-opening__center{width:52%;padding:35px 0;}.big-opening__center>p:first-child{font:11px 'Courier New',monospace;}.folio-site .big-opening h2{font:800 clamp(55px,7vw,112px)/.98 'Segoe UI',sans-serif;letter-spacing:-.055em;margin:25px 0;}.big-opening h2 em{font:italic 1em Georgia,serif;}.big-opening__center>p:last-child{font-size:clamp(16px,1.6vw,23px);line-height:1.55;max-width:40ch;}.big-opening__edge{position:absolute;top:50%;transform:translateY(-50%);font:900 clamp(180px,32vw,550px)/1 'Segoe UI',sans-serif;color:#acdae020;z-index:-1;}.big-opening__edge--left{left:-12%;}.big-opening__edge--right{right:-12%;}
.big-section-heading{display:grid;grid-template-columns:.9fr 1.1fr;gap:16px 6%;align-items:start;}.big-section-heading>span{grid-column:1/-1;font:11px/1.5 'Courier New',monospace;letter-spacing:.06em;text-transform:uppercase;border-top:1px solid currentColor;padding-top:12px;}.folio-site .big-section-heading h3{font-size:clamp(30px,4vw,62px);line-height:1.03;letter-spacing:-.045em;}.big-section-heading>p{font-size:clamp(15px,1.35vw,19px);line-height:1.55;}
.big-opening__edge--middle{left:65%;color:#acdae020;}
.big-opening__logo{display:block;width:105px;height:auto;object-fit:contain;filter:brightness(0) invert(1);opacity:.85;}.big-opening footer{align-items:center;}
@media(orientation:portrait){.big-opening{padding-block:24px;gap:16px;}.big-opening .big-opening__frame{min-height:min(500px,calc(var(--folio-view) - 190px));}.big-opening footer{font-size:10px;gap:8px;}.big-opening__logo{width:85px;}}
@media(orientation:portrait){
 .big-opening .big-opening__edge--left{left:0;transform:translate(-50%,-50%);}
 .big-opening .big-opening__edge--middle{left:50%;transform:translate(-50%,-50%);}
 .big-opening .big-opening__edge--right{right:0;transform:translate(50%,-50%);}
}
.big-player{width:min(100%,1050px,calc((100dvh - 310px)*1.7778));margin:auto;background:#091f26;}.big-demo-video{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:contain;}.big-workflow__foot{display:flex;justify-content:space-between;flex-wrap:wrap;gap:14px;font:12px/1.5 'Courier New',monospace;}.big-workflow__foot a,.big-films a{color:inherit;text-underline-offset:4px;}
.big-production{justify-content:center;gap:35px;}.big-films{display:grid;grid-template-columns:1fr 1fr;gap:35px;}.big-film-frame{aspect-ratio:16/9;background:var(--ground);color:var(--tone);}.big-film-frame iframe{width:100%;height:100%;border:0;}.folio-site .big-film-play[type="button"]{position:relative;display:flex;align-items:flex-end;justify-content:space-between;width:100%;height:100%;padding:25px;color:inherit;border:1px solid currentColor;}.big-film-number{font:italic clamp(50px,7vw,100px) Georgia,serif;}.big-films article>p{font:11px/1.5 'Courier New',monospace;margin:15px 0 8px;}.big-films h4{font-size:clamp(20px,2vw,29px);line-height:1.2;margin-bottom:14px;}.big-films a{font-size:13px;}
@media(orientation:portrait){.big-opening header,.big-opening footer{flex-wrap:wrap;}.big-opening__center{width:76%;}.big-opening__edge{font-size:65vw;}.big-opening__frame{min-height:500px;}.folio-site .big-opening h2{font-size:clamp(53px,13vw,100px);}.big-section-heading{grid-template-columns:1fr;gap:22px;}.big-section-heading>p{font-size:16px;}.big-player{width:100%;margin:15px auto;}.big-workflow{justify-content:center;}.big-films{grid-template-columns:1fr;gap:35px;}.big-film-number{font-size:70px;}}
@media(orientation:landscape) and (max-height:600px){.big-opening,.big-workflow,.big-production{min-height:720px;}.big-player{width:min(100%,850px);}}
</style>
