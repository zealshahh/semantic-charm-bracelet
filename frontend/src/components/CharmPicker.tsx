import { useEffect, useState } from 'react'
import type { Charm } from '../services/api'
import { goldCharmUrl } from './CharmRenderer'

type CatalogCharm = Pick<Charm, 'id' | 'name' | 'asset_url'> & { description: string }

export default function CharmPicker({ selected, onAdd }: { selected: Charm[]; onAdd: (charm: Charm) => void }) {
  const [catalog, setCatalog] = useState<CatalogCharm[]>([])
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/v1/charms', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('catalog unavailable')
        const data = await response.json()
        setCatalog(data.charms)
      }).catch(error => { if (error.name !== 'AbortError') setError(true) })
    return () => controller.abort()
  }, [])
  return (
    <details className="charm-picker">
      <summary>add a little something +</summary>
      <p>pick a charm, then drag it wherever you like. up to 10 on your bracelet.</p>
      <input type="search" aria-label="Find a charm" placeholder="a butterfly? a cherry?" value={query} onChange={e => setQuery(e.target.value)} />
      {error && <p role="alert">couldn’t load the charms. refresh to try again.</p>}
      <div className="charm-tray">
        {catalog.filter(charm => `${charm.name} ${charm.description}`.toLowerCase().includes(query.toLowerCase())).map(charm => {
          const added = selected.some(item => item.id === charm.id)
          return <button type="button" key={charm.id} disabled={added || selected.length >= 10}
            aria-label={`${added ? 'Already added' : 'Add'} ${charm.name}`}
            onClick={() => onAdd({ ...charm, concept: 'picked by you', match_score: 1, position: selected.length,
              physics: { density: 0.001, friction: 0.3, restitution: 0.2 } })}>
            <img alt="" src={goldCharmUrl(charm.asset_url)} loading="lazy" />
            <span>{charm.name}</span><small>{added ? 'on your bracelet' : '+ add'}</small>
          </button>
        })}
      </div>
    </details>
  )
}
