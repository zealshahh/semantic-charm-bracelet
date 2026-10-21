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
  slideAnchor: Matter.Vector | null
  delay: number // ms before this charm starts falling in
}

/** Distance from the charm centre up to its jump ring (ring sits ~6/64 down from the top of the SVG). */
export const ringOffset = (size: number) => size * 0.406 + 4
export const charmDetachDistance = (size: number) => Math.max(64, size * .9)

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
  return { charm, img, body, link, attachment: null, grip: null, slideAnchor: null, state: animate ? 'wait' : 'fly', delay: animate ? index * 600 + 200 : 0 }
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

export function startCharmDrag(item: CharmItem, world: Matter.World, point = item.body.position, stayAttached = false) {
  if (!stayAttached) {
    if (item.attachment) Composite.remove(world, item.attachment)
    item.attachment = null
  }
  if (item.attachment) beginSlide(item)
  Body.setStatic(item.body, false)
  item.grip = Constraint.create({
    pointA: { ...point }, bodyB: item.body,
    pointB: { x: point.x - item.body.position.x, y: point.y - item.body.position.y },
    length: 0, stiffness: 0.18, damping: 0.2,
  })
  Composite.add(world, item.grip)
  item.state = 'drag'
}

function beginSlide(item: CharmItem, position?: Matter.Vector) {
  const attachment = item.attachment!
  item.slideAnchor = position ? { ...position } : {
    x: (attachment.bodyA?.position.x ?? 0) + attachment.pointA.x,
    y: (attachment.bodyA?.position.y ?? 0) + attachment.pointA.y,
  }
  // The hand carries the weight while sliding. A continuous world anchor
  // avoids transferring the pendant abruptly between tiny physics bodies.
  attachment.bodyA = null
  attachment.pointA = { ...item.slideAnchor }
}

function projectOnChain(links: Matter.Body[], point: Matter.Vector): Matter.Vector {
  let best = links[2].position, bestDistance = Infinity
  for (let i = 2; i < links.length - 3; i++) {
    const a = links[i].position, b = links[i + 1].position
    const dx = b.x - a.x, dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    const projected = { x: a.x + t * dx, y: a.y + t * dy }
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y)
    if (distance < bestDistance) { best = projected; bestDistance = distance }
  }
  return best
}

/** Slide along the chain; deliberate outward pulls release the clasp. */
export function updateCharmDrag(item: CharmItem, world: Matter.World, links: Matter.Body[], items: CharmItem[], point: Matter.Vector, size: number, deltaMs = 1000 / 60) {
  if (!item.grip) return 0
  const offset = ringOffset(size) - 4
  const ring = { x: Math.sin(item.body.angle) * offset, y: -Math.cos(item.body.angle) * offset }
  const desiredRing = { x: point.x - item.grip.pointB.x + ring.x, y: point.y - item.grip.pointB.y + ring.y }
  const projected = projectOnChain(links, desiredRing)
  const distance = Math.hypot(projected.x - desiredRing.x, projected.y - desiredRing.y)
  // Separate release/recapture distances avoid flickering at the boundary.
  if (item.attachment && distance > charmDetachDistance(size)) {
    Composite.remove(world, item.attachment)
    item.attachment = null
    item.slideAnchor = null
  } else if (!item.attachment && distance < Math.max(20, size * .35)) {
    attach(item, world, size, true)
    item.state = 'drag'
    beginSlide(item, projected)
  }
  if (item.attachment) {
    const anchor = item.slideAnchor!
    const dt = Math.max(0, Math.min(deltaMs, 32))
    const dx = projected.x - anchor.x, dy = projected.y - anchor.y
    const gap = Math.hypot(dx, dy)
    const ease = Math.min(1 - Math.exp(-dt / 45), gap ? dt * .9 / gap : 1)
    anchor.x += dx * ease
    anchor.y += dy * ease
    item.attachment.pointA = { ...anchor }
    const available = links.slice(2, -2).filter(link => !items.some(other => other !== item && other.link === link))
    // A quick release still lands at the hand's destination; the settle
    // animation covers any remaining distance instead of stopping short.
    const landing = deltaMs === 0 ? projected : anchor
    const target = available.reduce((best, link) =>
      Math.hypot(link.position.x - landing.x, link.position.y - landing.y) <
      Math.hypot(best.position.x - landing.x, best.position.y - landing.y) ? link : best)
    item.link = target
    // Keep the grip at its natural hanging distance until the user unclips it.
    // This prevents an ordinary downward drag from stretching the chain.
    item.grip.pointA = {
      x: anchor.x + item.grip.pointB.x - ring.x,
      y: anchor.y + item.grip.pointB.y - ring.y + 5,
    }
  } else {
    item.grip.pointA = { ...point }
  }
  return distance
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
    charm.slideAnchor = null
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
