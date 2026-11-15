<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { previewLocaleKey } from '@/i18n'
import DocumentPreview from '../reading/DocumentPreview.vue'
import SpaceDialog from '../ui/SpaceDialog.vue'
import H5ImagePreview from '@/components/H5ImagePreview.vue'
import H5AnimatedImage from '@/components/H5AnimatedImage.vue'
import { fetchSpace } from '../api'
import { blockContent, contentUrl } from '../reading/content'
import copy from './copy.json'
import { affiliations, assets, demoImages, localImages, localDocuments, sampleDocument, sampleVideo, spaceId, type MediaSlot } from './media'
import ImageWheel from './ImageWheel.vue'
import FolioEntrance from './FolioEntrance.vue'
import DesignLab from './DesignLab.vue'
import PhotolioVisual from './PhotolioVisual.vue'
import PhotolioMedia from './PhotolioMedia.vue'
import MiaoPhones from './MiaoPhones.vue'
import MiaoFeatures from './MiaoFeatures.vue'
import XiedaoVisual from './XiedaoVisual.vue'
import XiedaoFeatures from './XiedaoFeatures.vue'
import './styles/photolio.css'
import './styles/miaozer.css'
import { useFolioPaging } from './useFolioPaging'
import { useFolioCursor } from './useFolioCursor'
import PageActions from './ui/PageActions.vue'
import './folio.css'

provide(previewLocaleKey, 'en')

const root = ref<HTMLElement | null>(null)
const { progress, activeLabel, activeProject, jump, onScroll, pause } = useFolioPaging(root)
const entering = ref(!new URLSearchParams(location.hash.split('?')[1]).has('work') && !matchMedia('(prefers-reduced-motion: reduce)').matches)
const wheelArriving = ref(false)
const step = ref(0)
const media = ref<Record<string, MediaSlot>>({})
const reading = ref<'resume' | 'archive' | 'sample' | null>(null)
const video = ref<{ url: string; title: string } | null>(null)
const openPhotolio = ref(false)
const cursor = ref<HTMLElement | null>(null)
const { pointerMove, updateCursor, hideCursor } = useFolioCursor(cursor)
const image = ref('')
const sampleImage = localImages.at(-1) || demoImages.photolio
function themeImage(project: string, index: number) {
  const projectIndex = copy.projects.findIndex(item => item.id === project)
  return localImages[(4 + projectIndex * 3 + index) % localImages.length] || projectCover(project)
}
const wheelImages = computed(() => {
  const images = new Map<string, string>()
  for (const project of copy.projects) {
    const slot = media.value[project.id]
    images.set(slot?.kind === 'image' ? slot.url : projectCover(project.id), project.name)
  }
  for (const [key, slot] of Object.entries(media.value)) if (slot.kind === 'image' && !images.has(slot.url)) {
    const project = copy.projects.find(item => key.startsWith(item.id + '-'))
    images.set(slot.url, project?.name || 'Portfolio image')
  }
  for (const url of localImages) if (!images.has(url)) images.set(url, 'Photolio photo archive')
  if (!images.has(sampleImage)) images.set(sampleImage, 'Reader sample')
  return Array.from(images, ([url, title]) => ({ url, title }))
})
const gallery = computed(() => {
  const images = wheelImages.value.map(item => item.url)
  return image.value && !images.includes(image.value) ? [image.value] : images
})
const readingSlot = computed(() => {
  if (reading.value === 'sample') return { url: sampleDocument }
  if (!reading.value) return
  const url = media.value[reading.value]?.url || localDocuments?.[reading.value]
  return url ? { url } : undefined
})
const readingTitle = computed(() => reading.value === 'sample' ? 'Sample PDF' : reading.value === 'resume' ? 'Résumé' : 'Work Collection 2020–2024')
watch(() => !!(entering.value || reading.value || image.value || video.value || openPhotolio.value), open => {
  pause(open)
  if (open) hideCursor()
}, { immediate: true })
function projectCover(id: string) {
  const slot = media.value[id]
  return slot?.kind === 'image' ? slot.url : localImages[copy.projects.findIndex(item => item.id === id)] || demoImages[id as keyof typeof demoImages] || demoImages.photolio
}
const demos = [
  { label: 'Select', title: 'Choose a memory', note: 'Start with something already in the collection.' },
  { label: 'Preview', title: 'See what will appear', note: 'Review the selected piece before adding it.' },
  { label: 'Arrange', title: 'Give the story an order', note: 'Place the selected piece alongside the rest.' },
  { label: 'Publish', title: 'Share the finished page', note: 'The public page is separate from the editor.' },
]
const composition = ['Emphasis / proportion', 'Repetition / contrast', 'Symmetry / negative space', 'Proximity / grouping']
let observer: IntersectionObserver | undefined
let mounted = false

onMounted(async () => {
  mounted = true
  media.value = Object.fromEntries(Object.entries(assets).flatMap(([key, slot]) => {
    const url = contentUrl(slot.url)
    return url ? [[key, { ...slot, url }]] : []
  }))
  if (root.value && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) entry.target.classList.toggle('is-revealed', entry.isIntersecting)
    }, { threshold: .1 })
    root.value.querySelectorAll('[data-reveal]').forEach(node => observer?.observe(node))
  }
  if (!spaceId) return
  try {
    const space = await fetchSpace(spaceId)
    if (!mounted) return
    const blocks = space.sections.flatMap(group => group.blocks)
    for (const [key, slot] of Object.entries(assets)) {
      if (!slot.blockId || media.value[key]) continue
      const block = blocks.find(item => item.id === slot.blockId)
      const item = block && blockContent(block)
      const url = contentUrl(item?.url)
      const matches = slot.kind === 'pdf' ? item?.type === 'file'
        : slot.kind === 'image' ? item?.type === 'image' || item?.type === 'gif' : item?.type === 'video'
      if (matches && url) media.value[key] = { ...slot, url }
    }
  } catch { /* The composition and its placeholders remain available independently. */ }
})
onUnmounted(() => {
  mounted = false
  observer?.disconnect()
})
</script>

<template>
  <FolioEntrance v-if="entering" @arrive="wheelArriving = true" @complete="entering = false" />
  <main ref="root" class="folio-site" :class="{ 'folio-site--entering': entering, 'folio-site--arriving': wheelArriving }" :inert="entering" lang="en" @scroll.passive="onScroll(); updateCursor()" @pointermove="pointerMove" @pointerleave="hideCursor">
    <Teleport to="body"><span ref="cursor" class="folio-cursor" aria-hidden="true"></span></Teleport>
    <a class="folio-skip" href="#work" @click.prevent="jump('work')">Skip to selected work</a>
    <header class="folio-bar" :class="[activeProject ? 'folio-case--' + activeProject : '', { 'folio-bar--paper': activeLabel === 'Home' || activeLabel === 'Selected work' }]">
      <component :is="'button'" type="button" class="folio-mark" aria-label="Yifang Wang, back to top" @click="jump('top')">YW<span>.</span></component>
      <nav aria-label="Portfolio">
        <component :is="'button'" v-if="activeProject" type="button" class="folio-back-work" aria-label="Back to selected work" @click="jump('work')">← Work</component>
        <component :is="'button'" v-else type="button" @click="jump('work')">Work</component><component :is="'button'" type="button" @click="jump('archive')">Archive</component><component :is="'button'" type="button" @click="jump('about')">About</component>
        <component :is="'button'" type="button" class="folio-resume" @click="reading = 'resume'">Résumé <span aria-hidden="true">↗</span></component>
      </nav>
      <div class="folio-progress" aria-hidden="true" :style="{ transform: 'scaleX(' + progress + ')' }"></div>
    </header>

    <section id="top" tabindex="-1" class="folio-hero folio-page" data-label="Home">
      <div class="folio-hero__label"><span class="folio-dot"></span> Independent portfolio <span class="folio-hero__year">Image gallery · drag to browse</span></div>
      <div class="folio-hero__composition">
        <ImageWheel :images="wheelImages">
          <div class="folio-cover-type">
            <p class="folio-cover-type__credit">{{ copy.name }}</p>
            <h1><span><strong>Work</strong></span><span><strong>Collection</strong></span></h1>
            <div class="folio-cover-type__echo" aria-hidden="true"><span>Work Collection</span><span>Work Collection</span><span>Work Collection</span></div>
          </div>
        </ImageWheel>
      </div>
      <div class="folio-hero__bottom">
        <div><p>{{ copy.discipline }}</p><p>{{ copy.statement }}</p></div>
        <component :is="'button'" type="button" class="folio-down" @click="jump('work')"><span>Explore work</span><span aria-hidden="true">↓</span></component>
      </div>
    </section>

    <section id="work" tabindex="-1" class="folio-index folio-pad folio-page" data-label="Selected work">
      <div class="folio-eyebrow"><span>Index</span><span>01 — 04</span></div>
      <h2>Selected work<span>.</span></h2>
      <div class="folio-index__rows">
        <component :is="'button'" type="button" v-for="(project, i) in copy.projects" :key="project.id" class="folio-index__row" @click="jump(project.id)">
          <span class="folio-index__ink"><span class="folio-code">0{{ i + 1 }}</span><strong>{{ project.name }}</strong><span>{{ project.summary }}</span><span aria-hidden="true">↘</span></span>
          <span class="folio-index__reveal" aria-hidden="true">
            <img :src="projectCover(project.id)" alt="" />
          </span>
        </component>
      </div>
    </section>

    <article v-for="(project, i) in copy.projects" :id="project.id" :key="project.id" tabindex="-1" class="folio-case"
      :class="'folio-case--' + project.id" :data-chapter="'0' + (i + 1)">
      <div v-if="project.id === 'xiedao-renaissance'" class="xiedao-opening folio-page" :data-label="project.name"><XiedaoVisual :lead="project.lead" /></div>
      <div v-else :class="project.id === 'photolio' ? 'photolio-opening' : 'folio-case__opening folio-page'" :data-label="project.name">
      <div class="folio-case__cover folio-pad folio-page" :data-label="project.name">
        <div class="folio-eyebrow"><span class="folio-case__identity"><span class="folio-case__number">0{{ i + 1 }} /</span> <strong>{{ project.name }}</strong></span><span class="folio-case__counter">Case {{ i + 1 }} of {{ copy.projects.length }}</span></div>
        <img v-if="project.id === 'photolio'" class="photolio-cover-logo" :src="'/folio-photolio/brand.jpg'" alt="Photolio brand artwork" /><h2>{{ project.title }}</h2><p>{{ project.lead }}</p>
      </div>
      <figure class="folio-stage folio-page" :data-label="project.name + ' / Visual'" :class="'folio-stage--' + project.id" data-reveal>
        <PhotolioVisual v-if="project.id === 'photolio'" @navigate="jump" />
        <MiaoPhones v-else-if="project.id === 'miaozhuang'" :screens="[1]" @image="image = $event" />
        <H5AnimatedImage v-else-if="media[project.id]?.kind === 'image'" class="folio-image-trigger" :src="media[project.id].url" :alt="project.name"
          fit="contain" cropped @click="image = media[project.id].url" />
        <component v-else-if="media[project.id]?.kind === 'video'" :is="'button'" type="button" class="folio-video-cover"
          :aria-label="'Fullscreen preview: ' + project.name" @click="video = { url: media[project.id].url, title: project.name }">
          <component :is="'video'" class="folio-cover-video" :src="media[project.id].url" muted playsinline preload="metadata" data-media-autoplay="false" />
          <span>Fullscreen preview ↗</span>
        </component>
        <component v-else :is="'button'" type="button" class="folio-stage__photo folio-image-trigger" :aria-label="'View image: ' + project.name" @click="image = projectCover(project.id)">
          <img :src="projectCover(project.id)" alt="" loading="lazy" />
        </component>
        <figcaption v-if="project.id !== 'photolio' && project.id !== 'miaozhuang' && project.id !== 'xiedao-renaissance'">
          <span>0{{ i + 1 }} / {{ project.name }}</span>
          <component :is="'button'" type="button" v-if="media[project.id]?.kind === 'image'" @click="image = media[project.id].url">View image ↗</component>
          <component :is="'button'" type="button" v-else-if="media[project.id]?.kind === 'video'" @click="video = { url: media[project.id].url, title: project.name }">View video ↗</component>
          <a v-else-if="media[project.id]" :href="media[project.id].url" target="_blank" rel="noopener noreferrer">Open original ↗</a>
          <span v-else>Composition study · {{ composition[i] }}</span>
        </figcaption>
      </figure>
      </div>
      <div :id="project.id + '-brief'" class="folio-brief folio-pad folio-page" :data-label="project.name + ' / Brief'">
        <div><h3>Brief</h3><p v-for="p in project.brief" :key="p">{{ p }}</p></div>
        <div><h3>{{ project.responseLabel }}</h3><p v-for="p in project.response" :key="p">{{ p }}</p><p v-if="project.caption" class="folio-caption">{{ project.caption }}</p></div>
      </div>
      <section v-for="(theme, j) in (project.id === 'xiedao-renaissance' ? [] : project.themes)" :id="project.id + '-theme-' + (j + 1)" :key="theme.heading" class="folio-theme folio-pad folio-page" :class="{ 'folio-theme--dark': j % 2 === 1 }" :data-label="theme.heading">
        <div class="folio-theme__copy">
          <div class="folio-theme__heading"><span class="folio-code">0{{ i + 1 }}.0{{ j + 1 }}</span><h3>{{ theme.heading }}</h3></div>
          <div class="folio-theme__text">
          <p v-for="p in theme.text" :key="p">{{ p }}</p>
          <p class="folio-caption">{{ theme.caption }}</p>
          <a v-if="project.id === 'photolio' && j === 2" class="photolio-link" href="/about.html?lang=en#about" target="_blank" rel="noopener">Explore the product website <span aria-hidden="true">↗</span></a>
          <component :is="'button'" v-if="project.id === 'photolio' && j === 3" type="button" class="photolio-link" @click="openPhotolio = true">Open Photolio <span aria-hidden="true">↗</span></component>
          </div>
        </div>
        <PhotolioMedia v-if="project.id === 'photolio'" :section="j" @image="image = $event" />
        <MiaoPhones v-else-if="project.id === 'miaozhuang'" :screens="[[2,6],[7,8],[9]][j]" @image="image = $event" />
        <div v-else class="folio-theme__visual" data-reveal>
          <H5AnimatedImage v-if="media[project.id + '-' + (j + 1)]?.kind === 'image'" class="folio-image-trigger"
            :src="media[project.id + '-' + (j + 1)].url" :alt="theme.heading" fit="contain" cropped
            @click="image = media[project.id + '-' + (j + 1)].url" />
          <component v-else-if="media[project.id + '-' + (j + 1)]?.kind === 'video'" :is="'button'" type="button" class="folio-video-cover"
            :aria-label="'Fullscreen preview: ' + theme.heading" @click="video = { url: media[project.id + '-' + (j + 1)].url, title: theme.heading }">
            <component :is="'video'" class="folio-cover-video" :src="media[project.id + '-' + (j + 1)].url" muted playsinline preload="metadata" data-media-autoplay="false" />
            <span>Fullscreen preview ↗</span>
          </component>
          <component v-else :is="'button'" type="button" class="folio-theme__photo folio-image-trigger" :aria-label="'View image: ' + theme.heading" @click="image = themeImage(project.id, j)">
            <img :src="themeImage(project.id, j)" alt="" loading="lazy" />
          </component>
        </div>
      </section>
      <XiedaoFeatures v-if="project.id === 'xiedao-renaissance'" :research="project.themes" @image="image = $event" />
      <MiaoFeatures v-if="project.id === 'miaozhuang'" @image="image = $event" />
      <div :id="project.id + '-details'" class="folio-details folio-pad folio-page" :data-label="project.name + ' / Details'"><h3>Project details</h3>
        <dl><div v-for="detail in project.details" :key="detail[0]"><dt>{{ detail[0] }}</dt><dd>{{ detail[1] }}</dd></div></dl>
        <div v-if="project.id === 'photolio'" class="photolio-destinations"><a href="/about.html?lang=en#about" target="_blank" rel="noopener">Product website ↗</a><component :is="'button'" type="button" @click="openPhotolio = true">Open Photolio ↗</component><a href="/#/pages/personal/index" target="_blank" rel="noopener">Create a personal space ↗</a></div>
        <div v-if="project.id === 'miaozhuang'" class="miao-brand"><img :src="'/folio-miaozer/logo.jpg'" alt="MIAOZER 秒装同城" /></div>
        <div v-if="project.id !== 'miaozhuang'" class="folio-affiliations" aria-label="Related organizations">
          <span>Related organizations</span>
          <strong v-for="organization in affiliations[project.id]" :key="organization.name">
            <img v-if="organization.logo" :src="organization.logo" :alt="organization.name" loading="lazy" />
            <span v-if="organization.logo" class="photolio-organization-name">{{ organization.name }}</span>
            <template v-else>{{ organization.name }}</template>
          </strong>
        </div>
      <PageActions :actions="[{ target: copy.projects[i + 1]?.id || 'media-samples', title: copy.projects[i + 1]?.name || 'Media previews', eyebrow: 'Continue', arrow: '↘' }]" @navigate="jump" />
      </div>
    </article>

    <section id="media-samples" tabindex="-1" class="folio-samples folio-pad folio-page" data-label="Media samples">
      <div class="folio-eyebrow"><span>Reader test</span><span>Sample media</span></div>
      <h2>Media previews</h2>
      <div class="folio-samples__grid">
        <article>
          <component :is="'button'" type="button" class="folio-sample-open folio-image-trigger" @click="image = sampleImage">
            <img :src="sampleImage" alt="" /><span>Fullscreen preview · Image ↗</span>
          </component>
          <a :href="sampleImage" download aria-label="Download sample image">↓</a>
        </article>
        <article>
          <component :is="'button'" type="button" class="folio-sample-open" @click="video = { url: sampleVideo, title: 'Sample video' }">
            <component :is="'video'" class="folio-cover-video" :src="sampleVideo" preload="metadata" muted playsinline data-media-autoplay="false" />
            <span>Fullscreen preview · Video ↗</span>
          </component>
          <a :href="sampleVideo" download aria-label="Download sample video">↓</a>
        </article>
        <article>
          <component :is="'button'" type="button" class="folio-sample-open" @click="reading = 'sample'">
            <DocumentPreview :src="sampleDocument" kind="pdf" title="Sample PDF" cover aria-hidden="true" />
            <span>Fullscreen preview · PDF ↗</span>
          </component>
          <a :href="sampleDocument" download aria-label="Download sample PDF">↓</a>
        </article>
      </div>
    </section>
    <DesignLab @navigate="jump" />
    <section id="archive" tabindex="-1" class="folio-archive folio-pad folio-page" data-label="Archive">
      <div class="folio-eyebrow"><span>05 / Archive</span><span>2020 — 2024</span></div>
      <h2>Selected media and communication</h2><p>{{ copy.archiveLead }}</p>
      <div class="folio-archive__entries">
        <details v-for="(item, i) in copy.archive" :key="item.title">
          <summary class="folio-archive__row">
            <span class="folio-archive__ink"><span class="folio-code">0{{ i + 1 }}</span>{{ item.title }}<span class="folio-archive__toggle" aria-hidden="true"></span></span>
            <span class="folio-archive__reveal" aria-hidden="true"><img :src="localImages[12 + i] || projectCover(copy.projects[i].id)" alt="" loading="lazy" /></span>
          </summary>
          <p>{{ item.body }}</p>
        </details>
      </div>
      <component :is="'button'" type="button" class="folio-outline" @click="reading = 'archive'">Work Collection 2020–2024 <span aria-hidden="true">↗</span></component>
    </section>

    <section id="about" tabindex="-1" class="folio-about folio-pad folio-page" data-label="About">
      <div class="folio-eyebrow"><span>06 / About</span><span>Yifang Wang</span></div>
      <h2>About<span>.</span></h2>
      <div><p v-for="p in copy.about" :key="p">{{ p }}</p><component :is="'button'" type="button" class="folio-outline" @click="reading = 'resume'">Open résumé <span aria-hidden="true">↗</span></component></div>
      <footer><span>{{ copy.credit }}</span><component :is="'button'" type="button" @click="jump('top')">Back to top ↑</component></footer>
    </section>
    <div v-show="!activeLabel.endsWith(' / Details') && activeLabel !== 'Study 07 / Cut'" class="folio-chapter" aria-hidden="true">{{ activeLabel }}</div>

    <Transition name="folio-dialog">
      <SpaceDialog v-if="reading" :class="{ 'folio-fullscreen-dialog': reading === 'sample' }" :title="readingTitle" reader @close="reading = null">
        <DocumentPreview v-if="readingSlot" :src="readingSlot.url" kind="pdf" :title="readingTitle" @escape="reading = null" />
        <p v-else class="folio-document-empty">{{ reading === 'resume' ? 'The résumé PDF has not been added to this preview.' : 'The original PDF will be available here when its public file is connected.' }}</p>
        <template v-if="readingSlot" #footer>
          <a v-if="reading === 'sample'" :href="readingSlot.url" download>Download sample PDF ↓</a>
          <a v-else :href="readingSlot.url" target="_blank" rel="noopener noreferrer">Open original PDF ↗</a>
        </template>
      </SpaceDialog>
    </Transition>
    <div v-if="video" class="folio-video-dialog">
      <SpaceDialog :title="video.title" wide class="folio-fullscreen-dialog" @close="video = null">
        <component :is="'video'" class="folio-player" :src="video.url" controls controlslist="nofullscreen" playsinline autoplay muted data-media-autoplay="false" />
        <template #footer><a :href="video.url" download target="_blank" rel="noopener noreferrer">Download video ↓</a></template>
      </SpaceDialog>
    </div>
    <Teleport v-if="image" to="body">
      <H5ImagePreview :visible="true" :urls="gallery" :initial-idx="gallery.indexOf(image)" @close="image = ''" />
    </Teleport>
    <SpaceDialog v-if="openPhotolio" title="Open Photolio" @close="openPhotolio = false">
      <div class="photolio-open-options"><div><strong>WeChat mini program</strong><p>Scan with WeChat, or press and hold to recognize the code.</p><img :src="'/about/miniprogram-qr.png'" alt="Photolio WeChat mini program code" /></div><a href="/#/pages/index/index" target="_blank" rel="noopener">Open the web app <span aria-hidden="true">↗</span></a></div>
    </SpaceDialog>
  </main>
</template>
