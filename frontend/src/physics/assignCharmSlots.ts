/** Evenly spread `count` charms over the middle 68% of the chain; returns unique, in-bounds link indices. */
export function assignCharmSlots(count: number, linkCount: number): number[] {
  const slots: number[] = []
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1)
    let idx = Math.round(linkCount * (0.16 + 0.68 * t))
    while (slots.includes(idx)) idx++
    slots.push(Math.min(Math.max(idx, 1), linkCount - 1))
  }
  return slots
}
