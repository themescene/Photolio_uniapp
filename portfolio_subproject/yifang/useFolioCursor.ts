import { onUnmounted, type Ref } from 'vue'

const controls = 'button:not(:disabled), a[href], summary, input, [role="button"]:not([aria-disabled="true"])'

export function useFolioCursor(cursor: Ref<HTMLElement | null>) {
  type Shape = { x: number; y: number; width: number; height: number; radius: number }
  let position: { x: number; y: number } | undefined
  let current: Shape | undefined
  let target: Shape | undefined
  let frame = 0
  let previousTime = 0

  function paint() {
    const node = cursor.value
    if (!node || !current) return
    node.style.transform = `translate3d(${current.x}px,${current.y}px,0)`
    node.style.width = `${current.width}px`
    node.style.height = `${current.height}px`
    node.style.borderRadius = `${current.radius}px`
  }

  function tick(now: number) {
    frame = 0
    if (!target || !current) return
    // A single clock advances center, dimensions and radius together. Retarget from the live
    // shape, never a stale start/end rectangle. The convex step cannot overshoot a fixed target.
    const dt = previousTime ? Math.min(32, now - previousTime) : 16
    previousTime = now
    const amount = 1 - Math.exp(-dt / 55)
    let unsettled = false
    for (const key of ['x', 'y', 'width', 'height', 'radius'] as const) {
      const distance = target[key] - current[key]
      current[key] = Math.abs(distance) < .1 ? target[key] : current[key] + distance * amount
      if (current[key] !== target[key]) unsettled = true
    }
    paint()
    if (unsettled) frame = requestAnimationFrame(tick)
    else previousTime = 0
  }

  function stop() {
    cancelAnimationFrame(frame)
    frame = 0
    previousTime = 0
    current = target = undefined
    cursor.value?.classList.remove('folio-cursor--visible')
  }

  function hideCursor() {
    position = undefined
    stop()
  }

  function updateCursor() {
    const node = cursor.value
    if (!position || !node) return
    const { x, y } = position
    const hit = document.elementFromPoint(x, y)
    if (!hit?.closest('.folio-site')) return hideCursor()
    if (hit.closest('.folio-index__row, .folio-archive__row')) {
      stop()
      return
    }
    const control = hit.closest<HTMLElement>(controls)
    const button = control?.matches('.folio-wheel__face') || (control?.closest('.folio-image-trigger') && !control.matches('.gif-control')) ? null : control
    const outline = !!button?.matches('.folio-sample-open, .folio-video-cover')
    const bounds = button?.getBoundingClientRect()
    const outset = outline ? 0 : 3
    const width = bounds ? bounds.width + outset * 2 : 16
    const height = bounds ? bounds.height + outset * 2 : 16
    const radius = button ? parseFloat(getComputedStyle(button).borderRadius) || 3 : 8
    // In dot mode, pointer travel is immediate. Carry any remaining exit-morph offset along
    // with the pointer; the existing clock still resolves that offset and all shape changes.
    if (!button && node.dataset.mode === 'dot' && current && target) {
      current.x += x - target.x
      current.y += y - target.y
      paint()
    }
    target = { x: bounds ? bounds.left + bounds.width / 2 : x, y: bounds ? bounds.top + bounds.height / 2 : y,
      width, height, radius: Math.min(radius, width / 2, height / 2) }
    if (!current || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cancelAnimationFrame(frame)
      frame = 0
      previousTime = 0
      current = { ...target }
      paint()
    } else if (!frame) frame = requestAnimationFrame(tick)
    node.dataset.mode = button ? outline ? 'outline' : 'solid' : 'dot'
    node.classList.toggle('folio-cursor--control', !!button)
    node.classList.toggle('folio-cursor--outline', outline)
    node.classList.add('folio-cursor--visible')
  }

  function pointerMove(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return
    position = { x: event.clientX, y: event.clientY }
    updateCursor()
  }

  onUnmounted(stop)

  return { pointerMove, updateCursor, hideCursor }
}
