import { useState } from 'react'
import { supabase } from '../supabase'
import { todayIso, tomorrowIso } from '../lib/format'
import { Sheet, useAction } from './ui'

const IDEAS = ['Bar', 'Resto', 'Sortie bateau', 'Foot', 'Ciné', 'Balade', 'Apéro']

export default function NewChaudSheet({ ctx, onClose }) {
  const [run, busy] = useAction()
  const [what, setWhat] = useState('')
  const [day, setDay] = useState('today')
  const [detail, setDetail] = useState('')
  const [g, setG] = useState(ctx.data.groups[0]?.id)

  const submit = async (e) => {
    e.preventDefault()
    if (!what.trim()) return
    const r = await run(() => supabase.from('chauds').insert({
      group_id: g, what: what.trim(), day: day === 'today' ? todayIso() : tomorrowIso(), detail: detail.trim(),
    }), 'Ton groupe est prévenu')
    if (r) { ctx.reload(); onClose() }
  }

  return (
    <Sheet onClose={onClose}>
      <h3 className="sheet-title">Je suis chaud pour…</h3>
      <p className="meta" style={{ margin: 0 }}>Seulement pour aujourd'hui ou demain. Pour plus tard, crée un plan.</p>
      <form onSubmit={submit}>
        <div className="row ideas">{IDEAS.map((x) => <button type="button" key={x} className="chip grp" onClick={() => setWhat(x)}>{x}</button>)}</div>
        <label htmlFor="cf-w">Quoi</label>
        <input id="cf-w" value={what} onChange={(e) => setWhat(e.target.value)} required maxLength={60} placeholder="Ex. sortie bateau" />
        <label>Quand</label>
        <div className="types two">
          <button type="button" aria-pressed={day === 'today'} onClick={() => setDay('today')}>Aujourd'hui</button>
          <button type="button" aria-pressed={day === 'tomorrow'} onClick={() => setDay('tomorrow')}>Demain</button>
        </div>
        <label htmlFor="cf-t">Heure ou détail (facultatif)</label>
        <input id="cf-t" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Ex. vers 18h, départ du port" />
        <label htmlFor="cf-g">Groupe</label>
        <select id="cf-g" value={g} onChange={(e) => setG(e.target.value)}>{ctx.data.groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <button className="btn wide" disabled={busy} style={{ marginTop: 16 }}>Prévenir le groupe</button>
      </form>
    </Sheet>
  )
}
