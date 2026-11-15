import { useState } from 'react'
import { supabase } from '../supabase'
import { TYPES } from '../lib/format'
import { Sheet, Switch, useAction, useToast } from './ui'

export default function NewPlanSheet({ ctx, groupId, onClose }) {
  const [run, busy] = useAction()
  const toast = useToast()
  const [g, setG] = useState(groupId)
  const [type, setType] = useState('soiree')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [place, setPlace] = useState('')
  const [desc, setDesc] = useState('')
  const [bring, setBring] = useState(false)
  const [poll, setPoll] = useState(false)
  const [dates, setDates] = useState(['', ''])

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    const picked = [...new Set(dates.filter(Boolean))]
    if (poll && picked.length < 2) return toast('Propose au moins 2 dates pour le sondage')
    const r = await run(async () => {
      const res = await supabase.from('plans').insert({
        group_id: g, type, title: title.trim(), starts_at: !poll && date ? new Date(date).toISOString() : null,
        place: place.trim(), description: desc.trim(), bring_enabled: bring,
      }).select().single()
      if (res.error) return res
      await supabase.from('plan_responses').insert({ plan_id: res.data.id, status: 'go' })
      if (poll) {
        const o = await supabase.from('plan_date_options').insert(picked.map((d) => ({ plan_id: res.data.id, starts_at: new Date(d).toISOString() })))
        if (o.error) return o
      }
      return res
    }, 'Plan publié, le groupe le voit')
    if (r) { ctx.reload(); onClose() }
  }

  return (
    <Sheet onClose={onClose}>
      <h3 className="sheet-title">Proposer un plan</h3>
      <form onSubmit={submit}>
        <label htmlFor="np-g">Groupe</label>
        <select id="np-g" value={g} onChange={(e) => setG(e.target.value)}>{ctx.data.groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <label>Type</label>
        <div className="types">{Object.entries(TYPES).map(([k, l]) => <button type="button" key={k} aria-pressed={type === k} onClick={() => setType(k)}>{l}</button>)}</div>
        <label htmlFor="np-t">Titre</label>
        <input id="np-t" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} placeholder={type === 'resto' ? 'Ex. Resto libanais' : 'Ex. Soirée chez Hugo'} />
        <div className="toggle" style={{ marginTop: 8 }}>
          <span>Sondage de dates<br /><span className="meta">Pas encore de date ? Propose-en plusieurs, chacun vote</span></span>
          <Switch checked={poll} onChange={setPoll} label="Sondage de dates" />
        </div>
        {!poll ? (
          <>
            <label htmlFor="np-d">Date et heure</label>
            <input id="np-d" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </>
        ) : (
          <>
            <label>Dates proposées</label>
            {dates.map((d, i) => (
              <div className="inputrow" key={i} style={{ marginTop: i ? 6 : 0 }}>
                <input type="datetime-local" value={d} aria-label={'Date ' + (i + 1)} onChange={(e) => setDates(dates.map((x, k) => (k === i ? e.target.value : x)))} />
                {dates.length > 2 && <button type="button" className="link small" onClick={() => setDates(dates.filter((_, k) => k !== i))}>Retirer</button>}
              </div>
            ))}
            {dates.length < 6 && <button type="button" className="link strong" onClick={() => setDates([...dates, ''])}>+ Ajouter une date</button>}
          </>
        )}
        <label htmlFor="np-p">Lieu</label>
        <input id="np-p" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Adresse ou nom du lieu" />
        <label htmlFor="np-x">Détails</label>
        <input id="np-x" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex. on se retrouve devant" />
        <div className="toggle" style={{ marginTop: 8 }}>
          <span>Chacun ramène quelque chose<br /><span className="meta">Utile pour une soirée chez quelqu'un</span></span>
          <Switch checked={bring} onChange={setBring} label="Liste de choses à ramener" />
        </div>
        <button className="btn wide" disabled={busy} style={{ marginTop: 14 }}>Publier le plan</button>
      </form>
    </Sheet>
  )
}
