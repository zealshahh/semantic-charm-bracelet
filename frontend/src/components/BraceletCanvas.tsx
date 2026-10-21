import { useEffect, useRef, useState } from 'react'
import Matter from 'matter-js'
import type { Charm } from '../services/api'
import { createChain } from '../physics/createChain'
import { addCharms, type CharmCollection } from '../physics/addCharms'
import { stepCharm, startCharmDrag, finishCharmDrag, nearestCharmLink, ringOffset, type CharmItem } from '../physics/attachCharm'
import { drawCharm, loadCharmImage } from './CharmRenderer'
import { drawGoldChain } from './GoldChainRenderer'

const { Engine, Runner, Events, Composite, Query } = Matter

export default function BraceletCanvas({ charms, braceletId }: { charms: Charm[] | null; braceletId?: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const savedSlots = useRef(new Map<string, number>())
  const previousBracelet = useRef<string | undefined>(undefined)
  const simulation = useRef<(CharmCollection & { startedAt: number }) | null>(null)
  const hasCharms = charms !== null
  const [size, setSize] = useState({ w: 0, h: 0 })

  // Track container size; a resize rebuilds the bracelet (without replaying the drop).
  useEffect(() => {
    const el = wrap.current!
    let t: number
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight
      setSize(current => current.w === w && current.h === h ? current : { w, h })
    }
    const ro = new ResizeObserver(() => {
      clearTimeout(t)
      t = window.setTimeout(measure, 200)
    })
    ro.observe(el)
    measure()
    return () => { ro.disconnect(); clearTimeout(t) }
  }, [])

  // Build one simulation per bracelet. Cleanup tears down engine, runner, listeners and the draw loop.
  useEffect(() => {
    const cv = canvas.current!
    if (!hasCharms || !size.w || !size.h) return
    const animate = previousBracelet.current !== braceletId
    if (animate) savedSlots.current.clear()
    previousBracelet.current = braceletId
    let raf = 0
    let engine: Matter.Engine | null = null
    let runner: Matter.Runner | null = null
    let removeDragListeners = () => {}

    {
      const { w, h } = size
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      cv.width = w * dpr; cv.height = h * dpr
      const eng = (engine = Engine.create({ positionIterations: 10, constraintIterations: 6 }))
      const chain = createChain(eng.world, w, h)
      const charmSize = Math.max(44, Math.min(88, w * 0.095))
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const items: CharmItem[] = []
      const t0 = performance.now()
      simulation.current = { world: eng.world, links: chain.links, items, size: charmSize, initialized: false, startedAt: t0 }
      let drag: { item: CharmItem; pointerId: number } | null = null
      let destination: Matter.Body | null = null
      const point = (event: PointerEvent) => {
        const rect = cv.getBoundingClientRect()
        return { x: (event.clientX - rect.left) * w / rect.width, y: (event.clientY - rect.top) * h / rect.height }
      }
      const hit = (p: Matter.Vector) => items.find(it => it.state === 'on' && Query.point([it.body], p).length)
      const down = (event: PointerEvent) => {
        if (drag || event.button !== 0) return
        const p = point(event), item = hit(p)
        if (!item) return
        event.preventDefault()
        drag = { item, pointerId: event.pointerId }
        destination = item.link
        startCharmDrag(item, eng.world, p)
        cv.setPointerCapture(event.pointerId)
        cv.style.cursor = 'grabbing'
      }
      const move = (event: PointerEvent) => {
        const p = point(event)
        if (!drag) { cv.style.cursor = hit(p) ? 'grab' : 'default'; return }
        if (event.pointerId !== drag.pointerId) return
        const grip = drag.item.grip
        if (grip) grip.pointA = {
          x: Math.max(charmSize / 2, Math.min(w - charmSize / 2, p.x)),
          y: Math.max(charmSize / 2, Math.min(h - charmSize / 2, p.y)),
        }
      }
      const end = (event: PointerEvent) => {
        if (!drag || event.pointerId !== drag.pointerId) return
        const { item, pointerId } = drag
        const target = event.type === 'pointerup' ? destination ?? item.link : item.link
        finishCharmDrag(item, target, items, eng.world, charmSize)
        for (const it of items) savedSlots.current.set(it.charm.id, chain.links.indexOf(it.link))
        drag = null; destination = null
        if (cv.hasPointerCapture(pointerId)) cv.releasePointerCapture(pointerId)
        cv.style.cursor = 'grab'
      }
      cv.addEventListener('pointerdown', down)
      cv.addEventListener('pointermove', move)
      cv.addEventListener('pointerup', end)
      cv.addEventListener('pointercancel', end)
      cv.addEventListener('lostpointercapture', end)
      removeDragListeners = () => {
        cv.removeEventListener('pointerdown', down)
        cv.removeEventListener('pointermove', move)
        cv.removeEventListener('pointerup', end)
        cv.removeEventListener('pointercancel', end)
        cv.removeEventListener('lostpointercapture', end)
        if (drag && cv.hasPointerCapture(drag.pointerId)) cv.releasePointerCapture(drag.pointerId)
        cv.style.cursor = 'default'
      }

      Events.on(eng, 'beforeUpdate', () => {
        if (drag) {
          const body = drag.item.body
          const offset = ringOffset(charmSize) - 4
          destination = nearestCharmLink(chain.links, {
            x: body.position.x + Math.sin(body.angle) * offset,
            y: body.position.y - Math.cos(body.angle) * offset,
          })
        }
        const elapsed = performance.now() - t0
        for (const it of items) stepCharm(it, elapsed, eng.world, charmSize, reduce)
      })
      runner = Runner.create()
      Runner.run(runner, eng)

      const ctx = cv.getContext('2d')!
      const draw = () => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, w, h)
        ctx.lineCap = ctx.lineJoin = 'round'
        drawGoldChain(ctx, chain.links, dpr)
        if (drag && destination) {
          ctx.beginPath()
          ctx.arc(destination.position.x, destination.position.y, 10, 0, Math.PI * 2)
          ctx.strokeStyle = '#98712f'; ctx.lineWidth = 2; ctx.stroke()
          ctx.fillStyle = '#e2ba6440'; ctx.fill()
          ctx.save()
          ctx.globalAlpha = 0.18
          ctx.translate(drag.item.link.position.x, drag.item.link.position.y + ringOffset(charmSize))
          drawCharm(ctx, drag.item.img, charmSize)
          ctx.restore()
          ctx.font = "18px Gaegu, cursive"
          ctx.textAlign = 'center'
          ctx.fillStyle = '#806a46'
          ctx.fillText('clip here', destination.position.x, destination.position.y - 20)
        }
        for (const it of [...items.filter(it => it !== drag?.item), ...(drag ? [drag.item] : [])]) {
          if (it.body.position.y < -charmSize) continue
          if (it.state === 'on') {
            const offset = charmSize * 0.406
            const ringX = it.body.position.x + Math.sin(it.body.angle) * offset
            const ringY = it.body.position.y - Math.cos(it.body.angle) * offset
            const dx = ringX - it.link.position.x, dy = ringY - it.link.position.y
            ctx.save()
            ctx.translate((ringX + it.link.position.x) / 2, (ringY + it.link.position.y) / 2)
            ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2)
            ctx.beginPath()
            ctx.ellipse(0, 0, 3, Math.max(4, Math.hypot(dx, dy) / 2 + 2), 0, 0, Math.PI * 2)
            ctx.strokeStyle = '#916322'; ctx.lineWidth = 2.5; ctx.stroke()
            ctx.strokeStyle = '#f5d98b'; ctx.lineWidth = 1.3; ctx.stroke()
            ctx.restore()
          }
          ctx.save()
          ctx.translate(it.body.position.x, it.body.position.y)
          ctx.rotate(it.body.angle)
          if (it.state === 'drag') ctx.scale(1.06, 1.06)
          drawCharm(ctx, it.img, charmSize, it.state === 'drag')
          ctx.restore()
        }
        raf = requestAnimationFrame(draw)
      }
      draw()
    }

    return () => {
      simulation.current = null
      cancelAnimationFrame(raf)
      removeDragListeners()
      if (runner) Runner.stop(runner)
      if (engine) { Events.off(engine, 'beforeUpdate'); Composite.clear(engine.world, false); Engine.clear(engine) }
      cv.getContext('2d')?.clearRect(0, 0, cv.width, cv.height)
    }
  }, [hasCharms, size, braceletId])

  // Loading a new image does not restart the engine, runner or pointer handlers.
  // Ignore stale image loads after another update, resize or bracelet replacement.
  useEffect(() => {
    const current = simulation.current
    if (!current || !charms) return
    let cancelled = false
    const existingIds = new Set(current.items.map(item => item.charm.id))
    const missing = charms.filter(charm => !existingIds.has(charm.id))
    if (!missing.length) return
    Promise.all(missing.map(async charm => [charm.id, await loadCharmImage(charm.asset_url)] as const))
      .then(entries => {
        if (cancelled || simulation.current !== current) return
        addCharms(current, charms, new Map(entries), savedSlots.current, performance.now() - current.startedAt)
      })
    return () => { cancelled = true }
  }, [charms, size, braceletId])

  return (
    <div id="stage" ref={wrap}>
      <canvas ref={canvas} aria-label="Bracelet. Pick up a charm, move it, and release to clip it onto the chain." />
      {charms && <p className="drag-hint">pick up a charm · move it · let go to clip it on</p>}
      {!charms && <div id="hint">your bracelet will hang here</div>}
    </div>
  )
}
