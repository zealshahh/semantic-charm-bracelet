import { useRef, useState } from 'react'
import PromptInput from './components/PromptInput'
import BraceletCanvas from './components/BraceletCanvas'
import { generateBracelet, type Bracelet } from './services/api'
import { goldCharmUrl } from './components/CharmRenderer'

export default function App() {
  const [bracelet, setBracelet] = useState<Bracelet | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [isError, setIsError] = useState(false)
  const abort = useRef<AbortController | null>(null)

  async function onSubmit(memory: string, count: number) {
    abort.current?.abort() // a newer request supersedes any in-flight one
    const ctl = (abort.current = new AbortController())
    setBusy(true); setIsError(false); setStatus('Finding charms…')
    try {
      const b = await generateBracelet(memory, count, ctl.signal)
      setBracelet(b)
      setStatus(b.charms.length < count
        ? `${b.charms.length} charms: that’s all the memory supports. Drag any charm to swing it.`
        : `${b.charms.length} charms hung. Drag any charm to swing it.`)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setBracelet(null); setIsError(true); setStatus((e as Error).message)
    } finally {
      if (abort.current === ctl) setBusy(false)
    }
  }

  return (
    <main>
      <h1>Semantic charm bracelet</h1>
      <p className="lede">write a memory and create a charm bracelet for it ❤️ </p>
      <PromptInput busy={busy} onSubmit={onSubmit} />
      <p id="status" className={isError ? 'err' : ''} role="status" aria-live="polite">{status}</p>
      <BraceletCanvas charms={bracelet?.charms ?? null} />
      {bracelet && (
        <>
          <h2 className="theme">{bracelet.theme}</h2>
          <ol id="legend">
            {bracelet.charms.map((c) => (
              <li key={c.id}>
                <img alt="" src={goldCharmUrl(c.asset_url)} />
                <div><b>{c.name}</b><span>for “{c.concept}”</span></div>
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  )
}
