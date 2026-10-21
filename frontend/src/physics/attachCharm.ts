import Matter from 'matter-js'
import type { Charm } from '../services/api'
import { NO_COLLIDE } from './createChain'

const { Bodies, Body, Composite, Constraint } = Matter

export interface CharmItem {
  charm: Charm
  img: HTMLImageElement | null
  body: Matter.Body
  link: Matter.Body
  state: 'wait' | 'fly' | 'on' | 'drag' | 'settle'
  attachment: Matter.Constraint | null
  grip: Matter.Constraint | null
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
  return { charm, img, body, link, attachment: null, grip: null, state: animate ? 'wait' : 'fly', delay: animate ? index * 600 + 200 : 0 }
}

function attach(item: CharmItem, world: Matter.World, size: number, keepMotion = false) {
  Body.setStatic(item.body, false)
  if (!keepMotion) Body.setAngle(item.body, 0)
  const offset = -ringOffset(size) + 4
  item.attachment = Constraint.create({
    bodyA: item.link, bodyB: item.body,
    pointB: { x: -Math.sin(item.body.angle) * offset, y: Math.cos(item.body.angle) * offset },
    length: 5, stiffness: 0.9, damping: 0.08,
  })
  Composite.add(world, item.attachment)
  if (!keepMotion) Body.setVelocity(item.body, { x: (Math.random() - 0.5) * 2, y: 1 })
  item.state = 'on'
}

export function startCharmDrag(item: CharmItem, world: Matter.World, point = item.body.position) {
  if (item.attachment) Composite.remove(world, item.attachment)
  item.attachment = null
  Body.setStatic(item.body, false)
  item.grip = Constraint.create({
    pointA: { ...point }, bodyB: item.body,
    pointB: { x: point.x - item.body.position.x, y: point.y - item.body.position.y },
    length: 0, stiffness: 0.18, damping: 0.2,
  })
  Composite.add(world, item.grip)
  item.state = 'drag'
}

/** An occupied destination swaps with the original slot, keeping every charm reachable. */
export function finishCharmDrag(item: CharmItem, target: Matter.Body, items: CharmItem[], world: Matter.World, size: number) {
  const original = item.link
  const occupant = items.find(other => other !== item && other.link === target)
  const place = (charm: CharmItem, link: Matter.Body) => {
    charm.link = link
    if (charm.state === 'wait' || charm.state === 'fly') return
    if (charm.attachment) Composite.remove(world, charm.attachment)
    if (charm.grip) Composite.remove(world, charm.grip)
    charm.attachment = null
    charm.grip = null
    // The hand lets go; ease the jump ring back to the new link before
    // releasing the pendant's weight. Neither pendant teleports during swaps.
    Body.setStatic(charm.body, true)
    charm.state = 'settle'
  }
  if (occupant) place(occupant, original)
  place(item, target)
}

export function nearestCharmLink(links: Matter.Body[], point: Matter.Vector): Matter.Body {
  return links.slice(2, -2).reduce((best, link) =>
    Math.hypot(link.position.x - point.x, link.position.y - point.y)
      < Math.hypot(best.position.x - point.x, best.position.y - point.y) ? link : best)
}

/** Call once per physics tick. Eases a charm toward its slot, then pins it with a constraint. */
export function stepCharm(item: CharmItem, elapsedMs: number, world: Matter.World, size: number, reduceMotion: boolean) {
  if (item.state === 'on' || item.state === 'drag' || (item.state === 'wait' && elapsedMs < item.delay)) return
  if (item.state === 'settle') {
    const offset = ringOffset(size) - 4
    const angle = item.body.angle * (reduceMotion ? 0 : 0.88)
    Body.setAngle(item.body, angle)
    const target = { x: item.link.position.x - Math.sin(angle) * offset, y: item.link.position.y + Math.cos(angle) * offset + 5 }
    const p = item.body.position, ease = reduceMotion ? 1 : 0.2
    Body.setPosition(item.body, { x: p.x + (target.x - p.x) * ease, y: p.y + (target.y - p.y) * ease })
    if (Math.hypot(target.x - p.x, target.y - p.y) < 1 || reduceMotion) {
      attach(item, world, size, true)
      Body.setVelocity(item.body, { x: 0, y: 0 })
      Body.setAngularVelocity(item.body, reduceMotion ? 0 : Math.max(-0.045, Math.min(0.045, angle * 0.1 + 0.012)))
    }
    return
  }
  item.state = 'fly'
  const tx = item.link.position.x, ty = item.link.position.y + ringOffset(size) + 2
  const p = item.body.position
  if (reduceMotion) { Body.setPosition(item.body, { x: tx, y: ty }); attach(item, world, size); return }
  const dx = tx - p.x, dy = ty - p.y
  Body.setPosition(item.body, { x: p.x + dx * 0.1, y: p.y + dy * 0.1 })
  if (Math.hypot(dx, dy) < 5) attach(item, world, size)
}
