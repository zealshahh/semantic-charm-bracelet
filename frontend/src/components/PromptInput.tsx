import { useState } from 'react'

const EXAMPLES = [
  'drinking matcha in the library with my best friend on a rainy afternoon',
  'camping by the lake with my dog',
  'baking a birthday cake at home while snow fell outside',
]

interface Props { busy: boolean; onSubmit: (memory: string, count: number) => void }

export default function PromptInput({ busy, onSubmit }: Props) {
  const [memory, setMemory] = useState('')
  const [count, setCount] = useState(5)
  const [error, setError] = useState('')

  const submit = (text = memory) => {
    if (!text.trim()) { setError('write a memory first, even a single sentence.'); return }
    setError('')
    onSubmit(text.trim(), count)
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit() }}>
      <label htmlFor="mem" className="lede" style={{ margin: 0 }}>your memory</label>
      <textarea id="mem" value={memory} maxLength={400} onChange={(e) => setMemory(e.target.value)}
        placeholder={EXAMPLES[0]} />
      <div className="row">
        <button className="go" type="submit" disabled={busy}>{busy ? 'finding charms…' : 'make bracelet'}</button>
        <label htmlFor="n" className="small">Charms</label>
        <select id="n" value={count} onChange={(e) => setCount(+e.target.value)}>
          {[3, 4, 5, 6, 7].map((n) => <option key={n}>{n}</option>)}
        </select>
        <span className="count">{memory.length} / 400</span>
      </div>
      <div className="row">
        {EXAMPLES.map((t) => (
          <button key={t} type="button" className="chip" disabled={busy}
            onClick={() => { setMemory(t); submit(t) }}>{t}</button>
        ))}
      </div>
      {error && <p className="err" role="alert">{error}</p>}
    </form>
  )
}
