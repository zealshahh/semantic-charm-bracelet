import { useRef, useState } from 'react'
import PromptInput from './components/PromptInput'
import BraceletCanvas from './components/BraceletCanvas'
import { generateBracelet, type Bracelet } from './services/api'
import { goldCharmUrl } from './components/CharmRenderer'
import CharmPicker from './components/CharmPicker'

export default function App() {
  const [bracelet, setBracelet] = useState<Bracelet | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [isError, setIsError] = useState(false)
  const abort = useRef<AbortController | null>(null)

  async function onSubmit(memory: string, count: number) {
    abort.current?.abort() // a newer request supersedes any in-flight one
    const ctl = (abort.current = new AbortController())
    setBusy(true); setIsError(false); setStatus('finding charms…')
    try {
      const b = await generateBracelet(memory, count, ctl.signal)
      setBracelet(b)
      setStatus('')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setBracelet(null); setIsError(true); setStatus((e as Error).message)
    } finally {
      if (abort.current === ctl) setBusy(false)
    }
  }

  return (
    <main>
      <h1>semantic charm bracelet</h1>
      <p className="lede">write a memory and create a charm bracelet for it ❤️ </p>
      {isError && <p className="err" role="alert">{status.toLowerCase()}</p>}
      <PromptInput busy={busy} onSubmit={onSubmit} />
      <p id="status">a new little keepsake.</p>
      <BraceletCanvas charms={bracelet?.charms ?? null} braceletId={bracelet?.bracelet_id}
        onRemove={id => setBracelet(current => current ? { ...current, charms: current.charms.filter(charm => charm.id !== id) } : current)} />
      {bracelet && <CharmPicker selected={bracelet.charms} onToggle={charm => {
        setBracelet(current => {
          if (!current) return current
          const added = current.charms.some(item => item.id === charm.id)
          if (!added && current.charms.length >= 10) return current
          return { ...current, charms: added
            ? current.charms.filter(item => item.id !== charm.id)
            : [...current.charms, charm] }
        })
      }} />}
      {bracelet && (
        <>
          <h2 className="theme">{bracelet.theme.toLowerCase()}</h2>
          <ol id="legend">
            {bracelet.charms.map((c) => (
              <li key={c.id}>
                <img alt="" src={goldCharmUrl(c.asset_url)} />
                <div><b>{c.name.toLowerCase()}</b><span>for “{c.concept.toLowerCase()}”</span></div>
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  )
}
