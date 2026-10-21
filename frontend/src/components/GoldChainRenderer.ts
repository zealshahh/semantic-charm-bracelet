import type Matter from 'matter-js'

/** Draw a polished oval link, with a dark inner edge and a narrow light reflection. */
function link(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, edgeOn: boolean) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  const ry = edgeOn ? 2.2 : 4.2
  const metal = ctx.createLinearGradient(0, -6, 0, 6)
  metal.addColorStop(0, '#fff0b4')
  metal.addColorStop(0.22, '#d8ae51')
  metal.addColorStop(0.48, '#fff1b8')
  metal.addColorStop(0.65, '#b2802c')
  metal.addColorStop(1, '#75501b')
  ctx.beginPath()
  ctx.ellipse(0, 0, 7, ry, 0, 0, Math.PI * 2)
  ctx.strokeStyle = '#825b24'
  ctx.lineWidth = 3.7
  ctx.stroke()
  ctx.strokeStyle = metal
  ctx.lineWidth = 2.6
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(0, -0.5, 7, ry, 0, Math.PI * 1.08, Math.PI * 1.83)
  ctx.lineWidth = 0.7
  ctx.strokeStyle = '#fff8db'
  ctx.stroke()
  ctx.restore()
}

export function drawGoldChain(ctx: CanvasRenderingContext2D, bodies: Matter.Body[]) {
  ctx.save()
  ctx.shadowColor = 'rgba(79, 49, 15, .23)'
  ctx.shadowBlur = 5
  ctx.shadowOffsetY = 4
  // Sample by distance, independently of the physics segments, to keep every
  // jewelry link the same size while the chain bends or swings.
  let carry = 0, index = 0
  for (let i = 1; i < bodies.length; i++) {
    const a = bodies[i - 1].position, b = bodies[i].position
    const dx = b.x - a.x, dy = b.y - a.y
    const distance = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)
    for (; carry < distance; carry += 9) {
      const t = carry / distance
      link(ctx, a.x + dx * t, a.y + dy * t, angle, index++ % 2 === 1)
    }
    carry -= distance
  }
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  const first = bodies[0].position, last = bodies[bodies.length - 1].position
  // Lobster clasp at one end and a receiving ring at the other.
  ctx.save()
  ctx.translate(first.x - 10, first.y - 3)
  ctx.rotate(0.45)
  const gold = ctx.createLinearGradient(-8, -10, 8, 10)
  gold.addColorStop(0, '#986720'); gold.addColorStop(.4, '#ffe9a2'); gold.addColorStop(1, '#bc903e')
  ctx.strokeStyle = '#8f6428'; ctx.lineWidth = 6
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 14, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = gold; ctx.lineWidth = 4.5; ctx.stroke()
  ctx.fillStyle = gold; ctx.fillRect(5, -3, 6, 8)
  ctx.strokeStyle = '#fff2c8'; ctx.lineWidth = .8
  ctx.beginPath(); ctx.ellipse(-1, -1, 8, 13, 0, Math.PI, Math.PI * 1.8); ctx.stroke()
  ctx.restore()
  link(ctx, last.x + 4, last.y, -0.5, false)
  ctx.restore()
}
