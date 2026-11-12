import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { DRINKS, PRESET_DEFAULTS, units, fmtU } from '../lib/format'
import { DrinkIcon, Sheet, Switch, useAction } from '../components/ui'

const STARTERS = [
  { name: 'Demi', kind: 'biere', cl: 25, deg: 5 },
  { name: 'Pinte', kind: 'biere', cl: 50, deg: 5 },
  { name: 'Verre de vin', kind: 'vin', cl: 12, deg: 12.5 },
  { name: 'Spritz', kind: 'cocktail', cl: 15, deg: 11 },
]

// « Ce soir » commence à 6 h du matin (une soirée qui finit à 3 h compte pour la veille)
const nightStart = () => {
  const d = new Date()
  if (d.getHours() < 6) d.setDate(d.getDate() - 1)
  d.setHours(6, 0, 0, 0)
  return d
}

export default function Conso({ ctx }) {
  const { data, me } = ctx
  const [run, busy] = useAction()
  const [presets, setPresets] = useState([])
  const [tonight, setTonight] = useState([])
  const [edit, setEdit] = useState(false)
  const [adding, setAdding] = useState(false)

  const load = async () => {
    const [p, t] = await Promise.all([
      supabase.from('drink_presets').select('*').eq('user_id', me.id).order('created_at'),
      supabase.from('drinks').select('*').eq('user_id', me.id).gte('drunk_at', nightStart().toISOString()).order('drunk_at'),
    ])
    setPresets(p.data || [])
    setTonight(t.data || [])
  }
  useEffect(() => { load() }, [])

  const add = async (d) => { const r = await run(() => supabase.from('drinks').insert(d), `${d.name} ajouté`); if (r) load() }
  const undo = async (id) => { const r = await run(() => supabase.from('drinks').delete().eq('id', id)); if (r) load() }
  const delPreset = async (id) => { const r = await run(() => supabase.from('drink_presets').delete().eq('id', id)); if (r) load() }
  const setShare = async (gid, v) => { const r = await run(() => supabase.from('group_members').update({ share_conso: v }).eq('group_id', gid).eq('user_id', me.id)); if (r) ctx.reload() }

  const alc = tonight.reduce((a, d) => a + Number(d.units), 0)
  const water = tonight.filter((d) => d.kind === 'eau').length

  return (
    <>
      <div className="top"><div><div className="sub">Ce soir</div><h2>Conso</h2></div></div>

      <div className="row between" style={{ margin: '4px 0 10px' }}>
        <span className="section-label" style={{ margin: 0 }}>Mes verres</span>
        {presets.length > 0 && <button className="link strong" onClick={() => setEdit(!edit)}>{edit ? 'Terminé' : 'Modifier'}</button>}
      </div>
      <div className="favs">
        {presets.map((p) => {
          const u = units(p.cl, p.deg)
          return (
            <button key={p.id} className="fav" disabled={busy} onClick={() => edit ? delPreset(p.id) : add({ kind: p.kind, name: p.name, units: u })}>
              <DrinkIcon k={p.kind} />
              <span className="plan-body"><b>{p.name}</b><small>{fmtU(p.cl)} cl · {fmtU(p.deg)} % · {fmtU(u)} verre{u > 1 ? 's' : ''} std</small></span>
              {edit && <span className="del">Supprimer</span>}
            </button>
          )
        })}
        <button className="fav addfav" onClick={() => setAdding(true)}>+ Ajouter un verre habituel</button>
      </div>
      {presets.length === 0 && (
        <button className="link strong" disabled={busy} onClick={async () => {
          const r = await run(() => supabase.from('drink_presets').insert(STARTERS), 'Les classiques sont ajoutés')
          if (r) load()
        }}>Ajouter les classiques (demi, pinte, verre de vin, spritz)</button>
      )}

      <div className="section-label">Ajout rapide</div>
      <div className="drinks">
        {DRINKS.map((d) => (
          <button key={d.k} className="drink" disabled={busy} onClick={() => add({ kind: d.k, name: d.n, units: d.std })}>
            <DrinkIcon k={d.k} size={24} /><b>{d.n}</b><small>{d.u}</small>
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="row between">
          <div><div className="big">{fmtU(alc)}</div><div className="meta">verre{alc > 1 ? 's' : ''} standard ce soir</div></div>
          <div style={{ textAlign: 'right' }}><div className="big" style={{ color: 'var(--go)' }}>{water}</div><div className="meta">verres d'eau</div></div>
        </div>
        {tonight.length ? (
          <ul className="log">
            {tonight.map((d) => <li key={d.id}><span>{d.name}{Number(d.units) > 0 && <span className="meta"> · {fmtU(d.units)} std</span>}</span><button className="link small" onClick={() => undo(d.id)}>Retirer</button></li>)}
          </ul>
        ) : <p className="note">Tape sur un de tes verres pour l'ajouter.</p>}
        {alc >= 4 && <p className="note warn">Pense à boire de l'eau entre deux verres, et à rentrer sans conduire.</p>}
      </div>

      <div className="section-label">Qui voit ma conso</div>
      <div className="card" style={{ marginTop: 0 }}>
        {data.groups.map((g) => (
          <div className="toggle" key={g.id}><span>{g.name}</span><Switch checked={!!g.shareConso} onChange={(v) => setShare(g.id, v)} label={'Partager avec ' + g.name} /></div>
        ))}
        {!data.groups.length && <p className="meta">Rejoins un groupe pour pouvoir partager.</p>}
        <p className="note" style={{ marginTop: 4 }}>Privé par défaut. Tu choisis groupe par groupe.</p>
      </div>
      <p className="note">Repères de Santé publique France : pas plus de 10 verres standard par semaine, pas plus de 2 par jour, et pas tous les jours. Besoin d'en parler : Alcool Info Service, 0 980 980 930 (gratuit, 7j/7).</p>

      {adding && <NewPreset onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
    </>
  )
}

function NewPreset({ onClose, onSaved }) {
  const [run, busy] = useAction()
  const [name, setName] = useState('')
  const [kind, setKind] = useState('biere')
  const [cl, setCl] = useState(50)
  const [deg, setDeg] = useState(5)
  const u = units(cl || 0, deg || 0)
  const pick = (k) => { setKind(k); setCl(PRESET_DEFAULTS[k][0]); setDeg(PRESET_DEFAULTS[k][1]) }
  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    const r = await run(() => supabase.from('drink_presets').insert({ name: name.trim(), kind, cl: Number(cl), deg: Number(deg) }), `${name.trim()} ajouté à tes verres`)
    if (r) onSaved()
  }
  return (
    <Sheet onClose={onClose}>
      <h3 className="sheet-title">Nouveau verre habituel</h3>
      <p className="meta" style={{ margin: 0 }}>Crée-le une fois, ensuite un clic suffit.</p>
      <form onSubmit={save}>
        <label htmlFor="nf-n">Nom</label>
        <input id="nf-n" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required placeholder="Ex. Pinte de blonde, Spritz" />
        <label>Type</label>
        <div className="types">{DRINKS.map((d) => <button type="button" key={d.k} aria-pressed={kind === d.k} onClick={() => pick(d.k)}>{d.n}</button>)}</div>
        <div className="row nowrap">
          <div style={{ flex: 1, minWidth: 0 }}><label htmlFor="nf-cl">Contenance (cl)</label><input id="nf-cl" type="number" inputMode="decimal" min="1" max="200" step="0.5" value={cl} onChange={(e) => setCl(e.target.value)} /></div>
          <div style={{ flex: 1, minWidth: 0 }}><label htmlFor="nf-deg">Degré (%)</label><input id="nf-deg" type="number" inputMode="decimal" min="0" max="80" step="0.5" value={deg} onChange={(e) => setDeg(e.target.value)} /></div>
        </div>
        <p className="note">Compte pour {fmtU(u)} verre{u > 1 ? 's' : ''} standard (10 g d'alcool pur chacun).</p>
        <button className="btn wide" disabled={busy}>Ajouter à mes verres</button>
      </form>
    </Sheet>
  )
}
