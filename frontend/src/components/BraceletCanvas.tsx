import { useEffect, useRef, useState } from 'react'
import Matter from 'matter-js'
import type { Charm } from '../services/api'
import { createChain } from '../physics/createChain'
import { assignCharmSlots } from '../physics/assignCharmSlots'
import { createCharmItem, stepCharm, type CharmItem } from '../physics/attachCharm'
import { drawCharm, loadCharmImage } from './CharmRenderer'
import { drawGoldChain } from './GoldChainRenderer'

const { Engine, Runner, Events, Composite, Mouse, MouseConstraint } = Matter

export default function BraceletCanvas({ charms }: { charms: Charm[] | null }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const mouse = useRef<Matter.Mouse | null>(null)
  const prevCharms = useRef<Charm[] | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  // Track container size; a resize rebuilds the bracelet (without replaying the drop).
  useEffect(() => {
    const el = wrap.current!
    let t: number
    const ro = new ResizeObserver(() => {
      clearTimeout(t)
      t = window.setTimeout(() => setSize({ w: el.clientWidth, h: el.clientHeight }), 200)
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => { ro.disconnect(); clearTimeout(t) }
  }, [])

  // One Matter mouse per canvas; remove its listeners on unmount.
  useEffect(() => {
    const el = canvas.current!
    const m = Mouse.create(el)
    el.removeEventListener('wheel', (m as any).mousewheel)
    el.removeEventListener('mousewheel', (m as any).mousewheel)
    el.removeEventListener('DOMMouseScroll', (m as any).mousewheel)
    mouse.current = m
    return () => {
      const a = m as any
      el.removeEventListener('mousemove', a.mousemove); el.removeEventListener('mousedown', a.mousedown)
      el.removeEventListener('mouseup', a.mouseup); el.removeEventListener('touchmove', a.mousemove)
      el.removeEventListener('touchstart', a.mousedown); el.removeEventListener('touchend', a.mouseup)
    }
  }, [])

  // Build one simulation per bracelet. Cleanup tears down engine, runner, listeners and the draw loop.
  useEffect(() => {
    const cv = canvas.current!, m = mouse.current!
    if (!charms || !size.w || !size.h) return
    const animate = prevCharms.current !== charms
    prevCharms.current = charms
    let cancelled = false, raf = 0
    let engine: Matter.Engine | null = null
    let runner: Matter.Runner | null = null

    ;(async () => {
      const imgs = await Promise.all(charms.map((c) => loadCharmImage(c.asset_url)))
      if (cancelled) return
      const { w, h } = size
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      cv.width = w * dpr; cv.height = h * dpr
      ;(m as any).pixelRatio = dpr
      const eng = (engine = Engine.create({ positionIterations: 10, constraintIterations: 6 }))
      const chain = createChain(eng.world, w, h)
      const charmSize = Math.max(44, Math.min(88, w * 0.095))
      const slots = assignCharmSlots(charms.length, chain.linkCount)
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const items: CharmItem[] = charms.map((c, i) => createCharmItem(c, imgs[i], chain.links[slots[i]], charmSize, i, animate))
      Composite.add(eng.world, items.map((i) => i.body))
      Composite.add(eng.world, MouseConstraint.create(eng, { mouse: m, constraint: { stiffness: 0.12, damping: 0.1 } }))

      const t0 = performance.now()
      Events.on(eng, 'beforeUpdate', () => {
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
        drawGoldChain(ctx, chain.links)
        for (const it of items) {
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
          drawCharm(ctx, it.img, charmSize)
          ctx.restore()
        }
        raf = requestAnimationFrame(draw)
      }
      draw()
    })()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (runner) Runner.stop(runner)
      if (engine) { Events.off(engine, 'beforeUpdate'); Composite.clear(engine.world, false); Engine.clear(engine) }
      cv.getContext('2d')?.clearRect(0, 0, cv.width, cv.height)
    }
  }, [charms, size])

  return (
    <div id="stage" ref={wrap}>
      <canvas ref={canvas} aria-label="Bracelet. Drag a charm to swing it." />
      {!charms && <div id="hint">your bracelet will hang here</div>}
    </div>
  )
}
