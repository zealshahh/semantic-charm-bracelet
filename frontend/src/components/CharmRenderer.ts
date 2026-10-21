const cache = new Map<string, Promise<HTMLImageElement | null>>()

/** Jewelry artwork follows the catalog IDs, keeping the API asset contract stable. */
export function goldCharmUrl(url: string): string {
  return /^\/assets\/charms\/[a-z]+\.svg$/.test(url)
    ? url.replace('/charms/', '/charms/gold/').replace('.svg', '.png')
    : url
}

/** Loads a trusted catalog SVG. Resolves null on failure so the renderer can draw a fallback. */
export function loadCharmImage(url: string): Promise<HTMLImageElement | null> {
  if (!url.startsWith('/assets/charms/')) return Promise.resolve(null) // only approved asset paths
  let p = cache.get(url)
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = goldCharmUrl(url)
    })
    cache.set(url, p)
  }
  return p
}

export function drawCharm(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, size: number) {
  ctx.shadowColor = 'rgba(77,49,18,.27)'
  ctx.shadowBlur = 5
  ctx.shadowOffsetX = 1
  ctx.shadowOffsetY = 5
  if (img) {
    ctx.drawImage(img, -size / 2, -size / 2, size, size)
  } else {
    ctx.fillStyle = '#d5ac54' // fallback visual for a missing asset
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2)
    ctx.fill()
  }
}
