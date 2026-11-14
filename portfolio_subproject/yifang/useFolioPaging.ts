import { onMounted, onUnmounted, ref, type Ref } from 'vue'

export function useFolioPaging(root: Ref<HTMLElement | null>) {
  const progress = ref(0)
  const activeLabel = ref('Home')
  const activeProject = ref('')
  let frame = 0
  let suspended = false
  let destination: number | undefined
  let anchor: { panel: HTMLElement; offset: number; atEnd: boolean } | undefined
  let layoutWidth = 0
  let layoutHeight = 0
  let observer: ResizeObserver | undefined
  let nextWheelAt = 0
  let touch: { id: number; x: number; y: number } | undefined
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
  const portrait = () => matchMedia('(orientation: portrait)').matches
  const pages = () => Array.from(root.value?.querySelectorAll<HTMLElement>('.folio-page') || []).filter(page => {
    const opening = page.closest('.folio-case__opening')
    return !opening || (portrait() ? page === opening : page !== opening)
  })
  const headerHeight = () => root.value?.querySelector('.folio-bar')?.getBoundingClientRect().height || 0
  function topOf(page: HTMLElement, scroller: HTMLElement) {
    return scroller.scrollTop + page.getBoundingClientRect().top - scroller.getBoundingClientRect().top - headerHeight()
  }
  function go(scroller: HTMLElement, top: number, instant = false) {
    destination = Math.max(0, Math.min(top, scroller.scrollHeight - scroller.clientHeight))
    remember(scroller, destination)
    scroller.scrollTo({ top: destination, behavior: reduced() || instant ? 'instant' : 'smooth' })
  }
  function remember(scroller: HTMLElement, position: number) {
    const panel = pages().filter(page => topOf(page, scroller) <= position + 2).at(-1)
    if (panel) anchor = { panel, offset: Math.max(0, position - topOf(panel, scroller)), atEnd: scroller.scrollHeight - scroller.clientHeight - position < 2 }
  }
  function resize() {
    const scroller = root.value
    if (!scroller) return
    const height = scroller.clientHeight - headerHeight()
    if (height <= 0 || (layoutWidth === scroller.clientWidth && layoutHeight === height)) return
    layoutWidth = scroller.clientWidth
    layoutHeight = height
    scroller.style.setProperty('--folio-view', `${height}px`)
    if (anchor) {
      if (anchor.atEnd) {
        go(scroller, scroller.scrollHeight - scroller.clientHeight, true)
        onScroll()
        return
      }
      const previous = anchor.panel
      const opening = previous.closest<HTMLElement>('.folio-case__opening')
      const panel = portrait() ? opening ?? previous : previous.matches('.folio-case__opening')
        ? previous.querySelector<HTMLElement>('.folio-case__cover') ?? previous : previous
      const offset = panel === previous ? anchor.offset : 0
      const maxOffset = Math.max(0, panel.getBoundingClientRect().height - 1)
      go(scroller, topOf(panel, scroller) + Math.min(offset, maxOffset), true)
    }
    onScroll()
  }
  function step(direction: number) {
    const scroller = root.value
    if (!scroller) return
    const position = destination ?? scroller.scrollTop
    const viewport = scroller.clientHeight - headerHeight()
    if (viewport <= 0) return
    const panels = pages()
    const stops = panels.flatMap((page, index) => {
      const start = topOf(page, scroller)
      const end = Math.max(start, (panels[index + 1] ? topOf(panels[index + 1], scroller) : scroller.scrollHeight - headerHeight()) - viewport)
      const points = [start]
      const heading = portrait() && page.closest('.folio-case--photolio')
        ? page.querySelector<HTMLElement>('.folio-theme__heading, .folio-details > h3') : null
      const interval = Math.max(viewport * .5, viewport - (heading?.offsetHeight || 0))
      for (let top = start + interval; top < end - interval * .25; top += interval) points.push(top)
      const contentBottom = page.closest('.folio-case--photolio') && !portrait()
        ? Math.max(start, ...Array.from(page.querySelectorAll<HTMLElement>('h2,h3,p,dl,img,video,button,a,summary')).filter(node => node.getClientRects().length).map(node => scroller.scrollTop + node.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top - headerHeight())) : end
      const threshold = portrait() || contentBottom > start + viewport + 2 ? 2 : viewport * .2
      if (end > points[points.length - 1] + threshold) points.push(end)
      return points
    })
    const next = direction > 0 ? stops.find(top => top > position + 2) : stops.reverse().find(top => top < position - 2)
    if (next !== undefined) go(scroller, next)
  }
  function wheel(event: WheelEvent) {
    if (suspended || event.ctrlKey || event.deltaY === 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
    event.preventDefault()
    const now = performance.now()
    if (now < nextWheelAt) return
    nextWheelAt = now + 300
    step(Math.sign(event.deltaY))
  }
  function touchStart(event: TouchEvent) {
    const point = event.touches[0]
    touch = !suspended && event.touches.length === 1 && !(event.target instanceof Element && event.target.closest('.folio-wheel__face'))
      ? { id: point.identifier, x: point.clientX, y: point.clientY } : undefined
  }
  function touchMove(event: TouchEvent) {
    if (touch && event.touches.length === 1 && event.cancelable) event.preventDefault()
  }
  function touchEnd(event: TouchEvent) {
    const start = touch
    touch = undefined
    if (!start || suspended || event.type === 'touchcancel') return
    const point = Array.from(event.changedTouches).find(item => item.identifier === start.id)
    if (!point) return
    const dy = start.y - point.clientY
    if (Math.abs(dy) >= 32 && Math.abs(dy) > Math.abs(start.x - point.clientX)) step(Math.sign(dy))
  }
  function onScroll() {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      const scroller = root.value
      if (!scroller) return
      if (destination !== undefined && Math.abs(destination - scroller.scrollTop) < 2) destination = undefined
      if (destination === undefined && layoutHeight === scroller.clientHeight - headerHeight() && layoutWidth === scroller.clientWidth) remember(scroller, scroller.scrollTop)
      progress.value = scroller.scrollTop / Math.max(1, scroller.scrollHeight - scroller.clientHeight)
      const panels = pages()
      const atEnd = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 2
      const current = atEnd ? panels.at(-1) : panels.filter(page => topOf(page, scroller) <= scroller.scrollTop + Math.min(96, (scroller.clientHeight - headerHeight()) * .12)).at(-1)
      activeLabel.value = current?.dataset.label || 'Home'
      activeProject.value = current?.closest<HTMLElement>('.folio-case')?.id || ''
    })
  }
  function jump(id: string, updateAddress = true) {
    const scroller = root.value
    const target = scroller?.querySelector<HTMLElement>('#' + CSS.escape(id))
    if (!scroller || !target) return
    const panel = pages().find(page => page === target || target.contains(page))
    if (!panel) return
    if (updateAddress) {
      const url = new URL(location.href)
      const [path] = url.hash.split('?')
      url.hash = id === 'top' ? path : path + '?work=' + encodeURIComponent(id)
      history.replaceState(history.state, '', url)
    }
    target.focus({ preventScroll: true })
    go(scroller, topOf(panel, scroller), !updateAddress)
  }
  function pause(value: boolean) {
    suspended = value
    touch = undefined
    destination = undefined
  }
  let scroller: HTMLElement | null
  onMounted(() => {
    scroller = root.value
    scroller?.addEventListener('wheel', wheel, { passive: false })
    scroller?.addEventListener('touchstart', touchStart, { passive: true })
    scroller?.addEventListener('touchmove', touchMove, { passive: false })
    scroller?.addEventListener('touchend', touchEnd, { passive: true })
    scroller?.addEventListener('touchcancel', touchEnd)
    if (scroller && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize)
      observer.observe(scroller)
      const header = scroller.querySelector('.folio-bar')
      if (header) observer.observe(header)
    }
    window.addEventListener('resize', resize)
    resize()
    onScroll()
    const requested = new URLSearchParams(location.hash.split('?')[1]).get('work')
    if (requested) requestAnimationFrame(() => jump(requested, false))
  })
  onUnmounted(() => {
    scroller?.removeEventListener('wheel', wheel)
    scroller?.removeEventListener('touchstart', touchStart)
    scroller?.removeEventListener('touchmove', touchMove)
    scroller?.removeEventListener('touchend', touchEnd)
    scroller?.removeEventListener('touchcancel', touchEnd)
    observer?.disconnect()
    window.removeEventListener('resize', resize)
    cancelAnimationFrame(frame)
  })
  return { progress, activeLabel, activeProject, jump, onScroll, pause }
}
