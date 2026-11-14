export interface MediaSlot {
  kind: 'image' | 'video' | 'pdf'
  url: string
  blockId?: string
}

// Optional published space. A slot may point to one of its publicly resolved blocks.
export const spaceId = ''
export const assets: Record<string, MediaSlot> = {
  resume: { kind: 'pdf', url: '' },
  archive: { kind: 'pdf', url: '' },
  photolio: { kind: 'image', url: '' },
  miaozhuang: { kind: 'video', url: '' },
  'xiedao-renaissance': { kind: 'image', url: '' },
  brookline: { kind: 'image', url: '' },
}
export const demoImages = {
  photolio: '/folio-demo/photolio.svg',
  miaozhuang: '/folio-demo/miaozhuang.svg',
  'xiedao-renaissance': '/folio-demo/xiedao.svg',
  brookline: '/folio-demo/brookline.svg',
}
const local = Object.values(import.meta.glob<{ images: string[]; resume: string; archive: string }>('./local/media.json', { eager: true, import: 'default' }))[0]
export const localImages = local?.images || []
export const localDocuments = local ? { resume: local.resume, archive: local.archive } : undefined
export const sampleDocument = localDocuments?.resume || '/folio-demo/reader-sample.pdf'
export const sampleVideo = '/folio-demo/flower.webm'

export const affiliations: Record<string, { name: string; logo?: string }[]> = {
  photolio: [{ name: 'World Culture Festival', logo: '/about/svg/worldculturefestival.svg' }, { name: 'MiraclePlus', logo: '/about/svg/miracleplus.svg' }, { name: 'Beijing Language University', logo: '/about/svg/beijinglanguageuniversity.svg' }, { name: 'Photolio', logo: '/folio-photolio/photolio-logo.svg' }],
  miaozhuang: [{ name: 'MIAOZER / 秒装同城' }],
  'xiedao-renaissance': [{ name: 'Xiedao Renaissance' }, { name: 'MiraclePlus' }],
  brookline: [{ name: 'Brookline Interactive Group' }],
}
