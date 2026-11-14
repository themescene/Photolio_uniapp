<script setup lang="ts">
import MiaoPhones from './MiaoPhones.vue'
const emit = defineEmits<{ image: [url:string] }>()
const pages = [
 {title:'Finding the right result', text:'Traditional search and intelligent recommendations appear together, making the difference visible. The RAG-based intelligent search was developed by my co-founder; I integrated its results into the client experience.', screens:[3,4], label:'Search / retrieval'},
 {title:'A local network, in context', text:'A location-aware query brings nearby craftspeople into the results. In the generated plan, relevant professionals and materials are connected to individual renovation steps.', screens:[5,10], label:'Location / resources'},
 {title:'Progress and budget', text:'A room is broken into stages with status controls. Expenses can be recorded against the work and compared with the project budget.', screens:[11,12], label:'Diary / budget'},
 {title:'A record made on site', text:'Photos, video, voice and text give workers and homeowners ways to document progress against a specific task.', screens:[13,14], label:'Media / progress'},
 {title:'The people behind the work', text:'Craftspeople can present their profile and completed renovation work, connecting a recommendation to the person and their portfolio.', screens:[15,16], label:'Profiles / work'},
 {title:'From material to product', text:'Visual search identifies a photographed material and connects the result to a product on the platform. The screen shows a paint product recognized from a site record.', screens:[17], label:'Vision / product'}
]
</script>
<template>
 <section v-for="(page,i) in pages" :id="'miaozer-feature-'+(i+1)" :key="page.title" class="miao-feature folio-pad folio-page" :data-label="'MIAOZER / '+page.title">
  <div class="miao-feature__copy"><div class="miao-feature__meta"><span>02 / MIAOZER</span><span>{{page.label}}</span></div><h3>{{page.title}}</h3><p>{{page.text}}</p><span class="miao-feature__number">0{{i+1}} / 06</span></div>
  <MiaoPhones :screens="page.screens" @image="emit('image',$event)" />
 </section>
</template>
<style scoped>
.miao-feature {display:grid; grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr); align-items:center; gap:clamp(28px,5vw,90px); padding-block:clamp(30px,5vh,65px); background:#f7eee3; color:#342216; border-top:1px solid #bfa797;}
.miao-feature:nth-of-type(even){background:#3b2115;color:#ffe4cf;}
.miao-feature__copy {align-self:stretch; display:flex; flex-direction:column; justify-content:center;}
.miao-feature__meta {display:flex; justify-content:space-between; gap:20px; border-top:1px solid currentColor; padding-top:10px; font:11px/1.4 'Courier New',monospace; text-transform:uppercase;}
.miao-feature h3 {font-size:clamp(30px,4.8vw,70px); line-height:1.02; letter-spacing:-.04em; margin:clamp(25px,5vh,65px) 0 24px;}
.miao-feature p {font-size:clamp(16px,1.5vw,21px); max-width:48ch;}
.miao-feature__number {margin-top:clamp(30px,7vh,90px); font:11px 'Courier New',monospace;}
@media(orientation:portrait) {.miao-feature {grid-template-columns:1fr; align-content:start; gap:28px; padding-block:34px;} .miao-feature h3 {font-size:clamp(30px,8vw,60px); margin:24px 0 16px;} .miao-feature__number {margin-top:22px;} }
</style>
