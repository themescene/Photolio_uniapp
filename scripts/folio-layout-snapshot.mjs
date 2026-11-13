// Read-only browser snapshot. Positions are local to each page, so footer navigation cannot mask a body-layout regression.
export default function snapshot(root) {
  const viewport = root.ownerDocument.documentElement
  const portrait = viewport.clientWidth <= root.clientHeight
  const header = root.querySelector('.folio-bar').getBoundingClientRect().height
  const pages = [...root.querySelectorAll('.folio-page')].filter(page => {
    const opening = page.closest('.folio-case__opening')
    return !opening || (portrait ? page === opening : page !== opening)
  })
  const round = value => Math.round(value * 100) / 100
  const geometry = (node, parent) => {
    const r = node.getBoundingClientRect(), p = parent.getBoundingClientRect()
    const style = getComputedStyle(node)
    // The demo's entrance translates its copy briefly; lock its layout position, not a sampled animation frame.
    const animatedCopy = node.closest('.folio-demo__text')
    const transform = animatedCopy && getComputedStyle(animatedCopy).transform
    const matrix = transform?.startsWith('matrix(') ? transform.slice(7, -1).split(',').map(Number) : null
    return {
      x: round(r.x - p.x - (matrix?.[4] || 0)), y: round(r.y - p.y - (matrix?.[5] || 0)), width: round(r.width), height: round(r.height),
      font: style.fontSize, lineHeight: style.lineHeight, weight: style.fontWeight,
      color: style.color, background: style.backgroundColor,
      fit: style.objectFit,
    }
  }
  return {
    viewport: [viewport.clientWidth, root.clientHeight], width: root.clientWidth,
    available: round(root.clientHeight - header), overflow: root.scrollWidth - root.clientWidth,
    pages: pages.map(page => ({
      id: page.id || page.dataset.label,
      label: page.dataset.label,
      height: round(page.getBoundingClientRect().height),
      nodes: [...page.querySelectorAll('h1,h2,h3,p,dl,img,.folio-theme__visual,.folio-stage__photo,.folio-video-cover,.folio-sample-open,.document-preview,.folio-demo,.folio-affiliations,.folio-hero__label,.folio-hero__composition,.folio-hero__bottom,.folio-wheel__face')]
        .filter(node => !node.closest('.folio-next,.folio-page-actions,.lab-exit') && !node.closest('.folio-wheel__orbit,.folio-wheel__arc') && !(node.matches('img') && node.closest('.document-preview')) && !(page.id === 'study-split' && node.matches('.lab-note')))
        .map(node => ({ key: node.tagName + ':' + node.className, ...geometry(node, page) })),
    })),
  }
}
