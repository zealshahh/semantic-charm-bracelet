import Matter from 'matter-js'
import type { Charm } from '../services/api'
import { NO_COLLIDE } from './createChain'

const { Bodies, Body, Composite, Constraint } = Matter

export interface CharmItem {
  charm: Charm
  img: HTMLImageElement | null
  body: Matter.Body
  link: Matter.Body
  state: 'wait' | 'fly' | 'on'
  delay: number // ms before this charm starts falling in
}

/** Distance from the charm centre up to its jump ring (ring sits ~6/64 down from the top of the SVG). */
export const ringOffset = (size: number) => size * 0.406 + 4

export function createCharmItem(charm: Charm, img: HTMLImageElement | null, link: Matter.Body, size: number, index: number, animate: boolean): CharmItem {
  const body = Bodies.circle(link.position.x, -size * 1.5 - index * 20, size * 0.4, {
    density: charm.physics.density,
    friction: charm.physics.friction,
    restitution: charm.physics.restitution,
    frictionAir: 0.025,
    collisionFilter: { group: NO_COLLIDE },
  })
  // Freeze only after creation so Matter saves the finite mass and inertia
  // that it must restore when the charm attaches to the chain.
  Body.setStatic(body, true)
  return { charm, img, body, link, state: animate ? 'wait' : 'fly', delay: animate ? index * 600 + 200 : 0 }
}

function attach(item: CharmItem, world: Matter.World, size: number) {
  Body.setStatic(item.body, false)
  Body.setAngle(item.body, 0)
  Composite.add(world, Constraint.create({
    bodyA: item.link, bodyB: item.body, pointB: { x: 0, y: -ringOffset(size) + 4 }, length: 5, stiffness: 0.9, damping: 0.08,
  }))
  Body.setVelocity(item.body, { x: (Math.random() - 0.5) * 2, y: 1 })
  item.state = 'on'
}

/** Call once per physics tick. Eases a charm toward its slot, then pins it with a constraint. */
export function stepCharm(item: CharmItem, elapsedMs: number, world: Matter.World, size: number, reduceMotion: boolean) {
  if (item.state === 'on' || (item.state === 'wait' && elapsedMs < item.delay)) return
  item.state = 'fly'
  const tx = item.link.position.x, ty = item.link.position.y + ringOffset(size) + 2
  const p = item.body.position
  if (reduceMotion) { Body.setPosition(item.body, { x: tx, y: ty }); attach(item, world, size); return }
  const dx = tx - p.x, dy = ty - p.y
  Body.setPosition(item.body, { x: p.x + dx * 0.1, y: p.y + dy * 0.1 })
  if (Math.hypot(dx, dy) < 5) attach(item, world, size)
}
