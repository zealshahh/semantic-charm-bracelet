export interface Charm {
  id: string
  name: string
  concept: string
  asset_url: string
  match_score: number
  position: number
  physics: { density: number; friction: number; restitution: number }
}
export interface Bracelet {
  bracelet_id: string
  theme: string
  charms: Charm[]
}

export async function generateBracelet(memory: string, charmCount: number, signal?: AbortSignal): Promise<Bracelet> {
  let res: Response
  try {
    res = await fetch('/api/v1/bracelets/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memory, charm_count: charmCount }),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new Error('Can’t reach the server. Check that the backend is running on port 8000.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.success) throw new Error(data?.error?.message ?? 'Something went wrong. Try again.')
  return data as Bracelet
}
