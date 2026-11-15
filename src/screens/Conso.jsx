import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { DRINKS, PRESET_DEFAULTS, units, fmtU } from '../lib/format'
import { DrinkIcon, Sheet, Switch, useAction, useToast } from '../components/ui'
import { estimateBac, fmtBac, preventionMessage, thresholdToast } from '../lib/prevention'
import { fmtTime } from '../lib/format'
import { cacheGet, cacheSet, queue, queueAdd, queueDel, flushDrinks, newId, withTimeout } from '../lib/offline'

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
  const [settings, setSettings] = useState(undefined)
  const [local, setLocal] = useState(false)
  const [, tick] = useState(0)
  const toast = useToast()
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 60000); return () => clearInterval(t) }, [])

  // Verres de ce soir = ceux du serveur + ceux pas encore envoyés (sans réseau), triés par heure
  const merge = (server) => {
    const q = queue(me.id)
    const since = nightStart().toISOString()
    const ids = new Set(server.map((d) => d.id))
    return [...server.filter((d) => !q.del.includes(d.id)), ...q.add.filter((d) => !ids.has(d.id) && d.drunk_at >= since)]
      .sort((a, b) => a.drunk_at.localeCompare(b.drunk_at))
  }
  const load = async () => {
    const K = 'conso:' + me.id
    try {
      await withTimeout(flushDrinks(me.id))
      const [p, t, st] = await withTimeout(Promise.all([
        supabase.from('drink_presets').select('*').eq('user_id', me.id).order('created_at'),
        supabase.from('drinks').select('*').eq('user_id', me.id).gte('drunk_at', nightStart().toISOString()).order('drunk_at'),
        supabase.from('private_settings').select('*').eq('user_id', me.id).maybeSingle(),
      ]))
      if (p.error || t.error || st.error) throw p.error || t.error || st.error
      cacheSet(K, { presets: p.data || [], tonight: t.data || [], settings: st.data || null })
      setPresets(p.data || []); setTonight(merge(t.data || [])); setSettings(st.data || null); setLocal(false)
    } catch {
      // Hors connexion : dernière copie gardée sur le téléphone
      const c = cacheGet(K) || { presets: [], tonight: [], settings: null }
      setPresets(c.presets); setTonight(merge(c.tonight)); setSettings(c.settings); setLocal(true)
    }
  }
  useEffect(() => {
    load()
    window.addEventListener('online', load)
    return () => window.removeEventListener('online', load)
  }, [])

  // Un verre est d'abord noté sur le téléphone (marche sans réseau), puis envoyé
  const add = async (d) => {
    const before = tonight.reduce((a, x) => a + Number(x.units), 0)
    const row = { id: newId(), user_id: me.id, kind: d.kind, name: d.name, units: d.units, drunk_at: new Date().toISOString() }
    queueAdd(me.id, row)
    setTonight((l) => [...l, row])
    toast(thresholdToast(before, before + Number(d.units)) || `${d.name} ajouté`)
    if (await flushDrinks(me.id)) setLocal(false)
  }
  const undo = async (id) => {
    queueDel(me.id, id)
    setTonight((l) => l.filter((d) => d.id !== id))
    flushDrinks(me.id)
  }
  const delPreset = async (id) => { const r = await run(() => supabase.from('drink_presets').delete().eq('id', id)); if (r) load() }
  const setShare = async (gid, v) => { const r = await run(() => supabase.from('group_members').update({ share_conso: v }).eq('group_id', gid).eq('user_id', me.id)); if (r) ctx.reload() }

  const alc = tonight.reduce((a, d) => a + Number(d.units), 0)
  const water = tonight.filter((d) => d.kind === 'eau').length
  const prev = preventionMessage(alc)

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
        {(local || queue(me.id).add.length > 0) && <p className="note">Pas de réseau ? Pas de souci : tes verres sont gardés sur ton téléphone et partent tout seuls quand ça revient.</p>}
        {prev && <p className={'prev ' + prev.level}>{prev.text}</p>}
      </div>

      <Bac drinks={tonight} settings={settings} onSaved={setSettings} me={me} alc={alc} />

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

function Bac({ drinks, settings, onSaved, me, alc }) {
  const [run, busy] = useAction()
  const [editing, setEditing] = useState(false)
  const [weight, setWeight] = useState('')
  const [sex, setSex] = useState('h')
  if (settings === undefined) return null

  const save = async (e) => {
    e.preventDefault()
    const w = parseFloat(String(weight).replace(',', '.'))
    if (!(w >= 30 && w <= 250)) return
    const r = await run(() => supabase.from('private_settings').upsert({ user_id: me.id, weight_kg: w, sex, updated_at: new Date().toISOString() }).select().single(), 'Enregistré, visible par toi seul')
    if (r?.data) { onSaved(r.data); setEditing(false) }
  }

  if (!settings || editing) {
    return (
      <form className="card" onSubmit={save}>
        <b>Estimer mon taux d'alcool</b>
        <p className="note" style={{ marginTop: 4 }}>Indique ton poids pour avoir une estimation pendant la soirée. Visible par toi seul.</p>
        <div className="row nowrap" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 0 }}><label htmlFor="bac-w">Poids (kg)</label><input id="bac-w" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={settings?.weight_kg ? String(settings.weight_kg) : 'Ex. 70'} /></div>
          <div className="types two" style={{ flex: 1.4 }}>
            <button type="button" aria-pressed={sex === 'h'} onClick={() => setSex('h')}>Homme</button>
            <button type="button" aria-pressed={sex === 'f'} onClick={() => setSex('f')}>Femme</button>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}><button className="btn small" disabled={busy}>Enregistrer</button>{settings && <button type="button" className="btn small ghost" onClick={() => setEditing(false)}>Annuler</button>}</div>
      </form>
    )
  }

  const est = estimateBac(drinks, settings)
  const b = est?.bac || 0
  return (
    <div className="card bac">
      <div className="row between">
        <div>
          <div className="meta">Taux estimé maintenant</div>
          <div className="big" style={{ color: b >= 0.5 ? 'var(--danger)' : b > 0.2 ? 'var(--maybe)' : 'var(--fg)' }}>≈ {fmtBac(b)} g/L</div>
          {est?.soberAt && <div className="meta">Retour à 0 estimé vers {fmtTime(est.soberAt)}</div>}
        </div>
        <button className="link small" onClick={() => { setWeight(String(settings.weight_kg)); setSex(settings.sex); setEditing(true) }}>Modifier mon poids</button>
      </div>
      {alc > 0 && <p className="prev high" style={{ marginBottom: 0 }}>Tu as bu : ne prends pas le volant, même si l'estimation est basse. Le SAM est là pour ça.</p>}
      <p className="note">Estimation très approximative : elle dépend de ce que tu as mangé, de ta fatigue, de la vitesse à laquelle tu as bu. Elle ne remplace jamais un éthylotest. Limite pour conduire : 0,5 g/L, et 0,2 g/L pour les jeunes conducteurs.</p>
    </div>
  )
}
