<script setup lang="ts">
defineProps<{ research: {heading:string; text:string[]; caption:string}[] }>()
const emit=defineEmits<{image:[url:string]}>()
const pages=[
 {title:'Assistance that stays open to revision',body:'The writing agent connects research and revision within the editor. Proposed changes appear alongside the original text, while the conversation keeps requests and follow-up feedback in view. Writers can review the differences, accept or discard changes, and ask for another revision.',steps:'Research → Propose → Review',label:'Revision / Author control',alt:'Writing editor with red and green proposed revisions, assistant feedback, and accept or discard controls.',note:'Suggested changes remain visible before they become part of the draft.'},
 {title:'A voice to return to',body:'A writing-style library lets writers save a description and sample text, then select that reference when working with the assistant. Personal writing or a literary reference becomes a reusable starting point for exploring tone and expression.',steps:'Describe → Save → Reuse',label:'Voice / Style references',alt:'Writing-style library with a saved reference and an editable sample text.',note:'A saved reference connects a writing preference to the next conversation.'},
 {title:'See how the story connects',body:'The assistant turns a writer’s premise into a character relationship diagram within the editor. The conversation remains alongside the visual result, allowing the writer to move between a written request and an overview of the story’s connections.',steps:'Describe → Map → Explore',label:'Structure / Character relationships',alt:'Character relationship diagram displayed next to the conversation that requested it.',note:'The request and its visual result share the same workspace.'}
]
</script>
<template>
 <section v-for="(page,i) in pages" :id="'xiedao-renaissance-theme-'+(i+1)" :key="page.title" class="xd-feature folio-pad folio-page" :data-label="'Xiedao / '+page.title">
  <header class="xd-feature__header"><span>03.0{{i+1}} / {{page.label}}</span><span>2025 · Archived interface</span></header>
  <div class="xd-feature__intro"><h3>{{page.title}}</h3><p>{{page.body}}</p></div>
  <figure class="xd-feature__figure" data-reveal>
   <component :is="'button'" type="button" class="xd-screen" data-folio-cursor="dot" :aria-label="'Enlarge: '+page.title" @click="emit('image','/folio-xiedao/x'+(i+1)+'.png')"><img :src="'/folio-xiedao/x'+(i+1)+'.png'" :alt="page.alt" :width="[2271,2174,2193][i]" :height="[1439,1376,1373][i]" loading="lazy" /></component>
   <figcaption><span>{{page.steps}}</span><span>Explore the interface ↗</span></figcaption>
  </figure>
  <p class="xd-feature__note">{{page.note}}</p>
 </section>
 <section id="xiedao-renaissance-research" class="xd-research folio-pad folio-page" data-label="Xiedao / Model exploration">
  <p class="xd-feature__header">03 / Behind the interface</p><h3>From interaction to model exploration.</h3>
  <div class="xd-research__columns"><div v-for="(item,i) in research" :key="item.heading"><span>0{{i+1}}</span><h4>{{item.heading}}</h4><p v-for="p in item.text" :key="p">{{p}}</p></div></div>
  <p class="xd-research__archive">The interfaces above document the 2025 product exploration. The former website is no longer available; the venture has since changed direction.</p>
 </section>
</template>
<style scoped>
.xd-feature{background:#e6e9ee;color:#252b36;display:flex;flex-direction:column;gap:20px;padding-block:30px;}.xd-feature:nth-of-type(even){background:#dce2e8;}
.xd-feature__header{display:flex;justify-content:space-between;gap:16px;font:11px/1.5 'Courier New',monospace;text-transform:uppercase;letter-spacing:.06em;border-top:1px solid #252b3655;padding-top:12px;}
.xd-feature__intro{display:grid;grid-template-columns:1fr 1fr;gap:7%;align-items:start;}.folio-site .xd-feature h3{font-size:clamp(28px,3.6vw,56px);line-height:1.05;letter-spacing:-.04em;max-width:18ch;}.xd-feature__intro p{font-size:clamp(14px,1.2vw,18px);line-height:1.55;max-width:58ch;}
.xd-feature__figure{width:min(100%,1000px,calc((100dvh - 350px) * 1.74));margin:auto;}.folio-site .xd-screen{display:block;width:100%;overflow:hidden;border:1px solid #252b3630;box-shadow:0 12px 32px #252b3610;background:white;cursor:zoom-in;}.xd-screen img{width:100%;height:auto;display:block;margin-top:-5.8%;}.xd-feature__figure figcaption{display:flex;justify-content:space-between;gap:12px;font:11px/1.5 'Courier New',monospace;padding-top:12px;}.xd-feature__note{font:italic 15px/1.4 Georgia,serif;color:#526477;}
.xd-research{display:flex;flex-direction:column;justify-content:center;gap:40px;background:#252b36;color:#edece7;padding-block:45px;}.folio-site .xd-research h3{font-size:clamp(32px,4vw,64px);line-height:1.05;max-width:22ch;letter-spacing:-.04em;}.xd-research__columns{display:grid;grid-template-columns:repeat(3,1fr);gap:35px;}.xd-research__columns h4{font-size:23px;line-height:1.2;margin:18px 0;}.xd-research__columns p{font-size:16px;line-height:1.6;}.xd-research__columns span,.xd-research__archive{font:12px/1.6 'Courier New',monospace;}.xd-research__archive{border-top:1px solid #edece740;padding-top:20px;max-width:85ch;}
@media(orientation:portrait){.xd-feature{justify-content:center;gap:26px;padding-block:32px;}.xd-feature__intro{grid-template-columns:1fr;gap:20px;}.folio-site .xd-feature h3{font-size:clamp(32px,8vw,62px);}.xd-feature__intro p{font-size:16px;}.xd-feature__figure{width:100%;margin:10px auto;}.xd-feature__header{flex-wrap:wrap;}.xd-feature__figure figcaption{flex-wrap:wrap;}.xd-research__columns{grid-template-columns:1fr;gap:26px;}.xd-research__columns h4{margin:12px 0;}}
@media(orientation:landscape) and (max-height:650px){.xd-feature{min-height:850px;}.xd-feature__figure{width:min(100%,850px);}}
</style>
