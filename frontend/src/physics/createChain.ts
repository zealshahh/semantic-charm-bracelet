import Matter from 'matter-js'

const { Bodies, Composite, Constraint } = Matter

/** Charms, links and the mouse all share this negative group, so they never collide with each other. */
export const NO_COLLIDE = -1

export interface Chain {
  links: Matter.Body[]
  linkCount: number
}

/** A hanging chain of small rigid links, pinned at both ends and slightly longer than its span. */
export function createChain(world: Matter.World, w: number, h: number, segments = 26): Chain {
  const x0 = w * 0.07, x1 = w * 0.93, span = x1 - x0, y0 = h * 0.2
  const sag = Math.min(h * 0.3, span * 0.22)
  const length = span + (8 * sag * sag) / (3 * span) // parabola arc length
  const seg = length / segments
  const links: Matter.Body[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    links.push(
      Bodies.circle(x0 + span * t, y0 + 4 * sag * t * (1 - t), 3.5, {
        frictionAir: 0.03,
        density: 0.002,
        isStatic: i === 0 || i === segments,
        collisionFilter: { group: NO_COLLIDE },
      }),
    )
  }
  Composite.add(world, links)
  for (let i = 0; i < segments; i++) {
    Composite.add(world, Constraint.create({ bodyA: links[i], bodyB: links[i + 1], length: seg, stiffness: 0.95, damping: 0.05 }))
  }
  return { links, linkCount: segments }
}
