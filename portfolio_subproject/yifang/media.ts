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

// Editorial selection: actual evidence from each case, never the old random archive.
export type PortfolioImage = { url: string; title: string; project: string; treatment: 'photo' | 'phone' | 'screen';width:number;height:number }
export const portfolioImages: PortfolioImage[] = [
  {url:'/about/main product with hand and phone touching NFC.jpg',title:'Photolio · The object and the memory',project:'photolio',treatment:'photo',width:1008,height:1236},
  {url:'/folio-miaozer/m2.jpg',title:'MIAOZER · Advice with somewhere to go',project:'miaozhuang',treatment:'phone',width:653,height:1354},
  {url:'/folio-xiedao/x1.png',title:'Xiedao · Research and revision',project:'xiedao-renaissance',treatment:'screen',width:2271,height:1439},
  {url:'/folio-big/demo-poster.jpg',title:'BIG · A recurring publishing workflow',project:'brookline',treatment:'screen',width:1920,height:1080},
  {url:'/about/users loves and are taking pictures of booklets and posting in social media.jpg',title:'Photolio · A collection in everyday life',project:'photolio',treatment:'photo',width:959,height:1706},
  {url:'/folio-miaozer/m9.jpg',title:'MIAOZER · Renovation diary',project:'miaozhuang',treatment:'phone',width:654,height:1354},
  {url:'/folio-xiedao/x3.png',title:'Xiedao · See how the story connects',project:'xiedao-renaissance',treatment:'screen',width:2193,height:1373},
  {url:'/folio-photolio/p1.jpg',title:'Photolio · Personal publishing',project:'photolio',treatment:'phone',width:652,height:1439},
]
export const projectImages = Object.fromEntries(portfolioImages.slice(0,4).map(item=>[item.project,item])) as Record<string,PortfolioImage>

export const affiliations: Record<string, { name: string; logo?: string }[]> = {
  photolio: [{ name: 'World Culture Festival', logo: '/about/svg/worldculturefestival.svg' }, { name: 'MiraclePlus', logo: '/about/svg/miracleplus.svg' }, { name: 'Beijing Language University', logo: '/about/svg/beijinglanguageuniversity.svg' }, { name: 'Photolio', logo: '/folio-photolio/photolio-logo.svg' }],
  miaozhuang: [{ name: 'MIAOZER / 秒装同城', logo:'/folio-miaozer/logo.jpg' }],
  'xiedao-renaissance': [{ name: 'Xiedao Renaissance', logo:'/folio-xiedao/wordmark.svg' }, { name: 'MiraclePlus', logo:'/about/svg/miracleplus.svg' }],
  brookline: [{ name: 'Brookline Interactive Group', logo:'/folio-big/logo.webp' }],
}
