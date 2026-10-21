import Matter from 'matter-js'
import type { Charm } from '../services/api'
import { assignCharmSlots } from './assignCharmSlots'
import { createCharmItem, ringOffset, stepCharm, type CharmItem } from './attachCharm'

export interface CharmCollection {
  world: Matter.World
  links: Matter.Body[]
  items: CharmItem[]
  size: number
  initialized: boolean
}

/** Remove bodies and both kinds of constraints without restarting the world. */
export function removeCharms(collection: CharmCollection, charms: Charm[], savedSlots: Map<string, number>) {
  const keep = new Set(charms.map(charm => charm.id))
  for (let i = collection.items.length - 1; i >= 0; i--) {
    const item = collection.items[i]
    if (keep.has(item.charm.id)) continue
    if (item.attachment) Matter.Composite.remove(collection.world, item.attachment)
    if (item.grip) Matter.Composite.remove(collection.world, item.grip)
    Matter.Composite.remove(collection.world, item.body)
    item.attachment = item.grip = null
    savedSlots.delete(item.charm.id)
    collection.items.splice(i, 1)
  }
}

/** Append new bodies without touching existing positions, velocities or grips. */
export function addCharms(
  collection: CharmCollection,
  charms: Charm[],
  images: Map<string, HTMLImageElement | null>,
  savedSlots: Map<string, number>,
  elapsed: number,
) {
  const { world, links, items, size } = collection
  const existingIds = new Set(items.map(item => item.charm.id))
  const occupied = new Set([...savedSlots.values(), ...items.map(item => links.indexOf(item.link))])
  const slots = assignCharmSlots(charms.length, links.length - 1)
  let added = 0
  for (const [index, charm] of charms.entries()) {
    if (existingIds.has(charm.id)) continue
    const restored = savedSlots.get(charm.id)
    let slot = restored ?? slots[index]
    if (restored === undefined && occupied.has(slot)) {
      const free = links.map((_, i) => i).slice(3, -3).filter(i => !occupied.has(i))
      if (!free.length) continue
      const gap = (i: number) => Math.min(...Array.from(occupied, taken => Math.abs(i - taken)))
      slot = free.reduce((best, i) => gap(i) > gap(best) ? i : best)
    }
    const item = createCharmItem(charm, images.get(charm.id) ?? null, links[slot], size, index, restored === undefined)
    // Delays use the running simulation's clock, even when a charm is added
    // several minutes after the original bracelet has settled.
    item.delay = elapsed + (collection.initialized ? added * 120 + 150 : index * 600 + 200)
    if (restored !== undefined) {
      Matter.Body.setPosition(item.body, { x: item.link.position.x, y: item.link.position.y + ringOffset(size) })
      stepCharm(item, elapsed, world, size, true)
    }
    Matter.Composite.add(world, item.body)
    items.push(item)
    occupied.add(slot)
    existingIds.add(charm.id)
    savedSlots.set(charm.id, slot)
    added++
  }
  collection.initialized = true
  return added
}
