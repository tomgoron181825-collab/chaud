import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { TYPES, when, isPast, euro, settle, icsFor, compressImage } from '../lib/format'
import { Sheet, Face, Faces, useAction, useToast } from './ui'

const STATUS = [['go', 'Je viens'], ['maybe', 'Peut-être'], ['no', 'Pas dispo']]
const DOT = { go: 'var(--go)', maybe: 'var(--maybe)', no: 'var(--no)' }

export default function PlanSheet({ ctx, plan, onClose }) {
  const { data, me } = ctx
  const [run, busy] = useAction()
  const toast = useToast()
  const group = data.groups.find((g) => g.id === plan.group_id)
  const guests = data.guests[plan.id] || []
  const members = [...(data.members[plan.group_id] || []).map((m) => m.user_id), ...guests.map((g) => g.user_id)]
  const guestOf = (u) => guests.find((g) => g.user_id === u)
  const resp = data.responses[plan.id] || []
  const statusOf = (u) => resp.find((r) => r.user_id === u)?.status
  const mine = statusOf(me.id)
  const past = isPast(plan)
  const name = (u) => (u === me.id ? 'toi' : data.profiles[u]?.pseudo || 'Quelqu’un')
  const after = (r) => r && ctx.reload()

  const answer = async (status) => {
    const r = await run(() => supabase.from('plan_responses').upsert({ plan_id: plan.id, user_id: me.id, status, updated_at: new Date().toISOString() }))
    after(r)
    if (r && status === 'go' && plan.starts_at) toast('Noté ! Ajoute-le à ton agenda juste en dessous')
  }

  const addToCalendar = () => {
    const blob = new Blob([icsFor(plan, group?.name)], { type: 'text/calendar' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = plan.title.replace(/[^\w\d -]/g, '') + '.ics'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }

  const del = async () => {
    if (!window.confirm('Supprimer ce plan pour tout le groupe ?')) return
    const r = await run(() => supabase.from('plans').delete().eq('id', plan.id), 'Plan supprimé')
    if (r) { onClose(); ctx.reload() }
  }

  const goers = resp.filter((r) => r.status === 'go').map((r) => r.user_id)
  const noAnswer = members.filter((u) => !statusOf(u))

  return (
    <Sheet onClose={onClose}>
      <div className="row">{group ? <span className="chip grp">{group.name}</span> : <span className="chip plus">Tu es le +1 de {name(guestOf(me.id)?.invited_by)}</span>}<span className="chip">{TYPES[plan.type]}</span></div>
      <h3 className="sheet-title">{plan.title}</h3>
      <div className="meta">{when(plan.starts_at)}{plan.place && <><br />{plan.place}</>}</div>
      {plan.description && <p className="desc">{plan.description}</p>}
      <div className="meta" style={{ marginTop: 6 }}>Proposé par {name(plan.created_by)}</div>

      {!past && (
        <>
          <div className="rsvp">
            {STATUS.map(([k, l]) => <button key={k} className={mine === k ? 'on-' + k : ''} disabled={busy} onClick={() => answer(k)}>{l}</button>)}
          </div>
          {mine === 'go' && plan.starts_at && <button className="link" onClick={addToCalendar}>Ajouter à mon agenda (avec rappel)</button>}
        </>
      )}

      {past && <Photos ctx={ctx} plan={plan} />}
      {past && (data.rides[plan.id] || []).length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>SAM de la soirée : <b>{(data.rides[plan.id] || []).map((r) => data.profiles[r.driver_id]?.pseudo).join(', ')}</b>. Merci !</div>
      )}

      <div className="section-label">Qui vient</div>
      <div className="who">
        {['go', 'maybe', 'no'].flatMap((s) => resp.filter((r) => r.status === s).map((r) => (
          <span key={r.user_id}><i className="dot" style={{ background: DOT[s] }} />{data.profiles[r.user_id]?.pseudo}{guestOf(r.user_id) && <small className="plus-tag">+1</small>}</span>
        )))}
        {!past && noAnswer.map((u) => <span key={u} className="meta"><i className="dot" style={{ background: 'var(--line)' }} />{data.profiles[u]?.pseudo}{guestOf(u) && ' +1'} (pas répondu)</span>)}
      </div>
      {!past && <PlusOne ctx={ctx} plan={plan} members={members} run={run} after={after} />}

      {!past && <Rides ctx={ctx} plan={plan} run={run} busy={busy} after={after} name={name} />}
      {!past && plan.bring_enabled && <Bring ctx={ctx} plan={plan} run={run} after={after} />}
      {(past || plan.type === 'resto') && <Expenses ctx={ctx} plan={plan} run={run} after={after} goers={goers} name={name} />}
      <Comments ctx={ctx} plan={plan} run={run} after={after} />

      {(plan.created_by === me.id || group?.myRole === 'admin') && (
        <button className="link danger" onClick={del} style={{ marginTop: 18 }}>Supprimer ce plan</button>
      )}
    </Sheet>
  )
}

// Inviter un ami qui n'est pas dans le groupe
function PlusOne({ ctx, plan, members, run, after }) {
  const { data, me } = ctx
  const [open, setOpen] = useState(false)
  const friends = data.friends.filter((f) => f.status === 'accepted' && !members.includes(f.id))
  const myGuests = (data.guests[plan.id] || []).filter((g) => g.invited_by === me.id)
  const invite = async (id) => after(await run(() => supabase.from('plan_guests').insert({ plan_id: plan.id, user_id: id }), `${data.profiles[id]?.pseudo} est invité`))
  const remove = async (id) => after(await run(() => supabase.from('plan_guests').delete().eq('plan_id', plan.id).eq('user_id', id)))
  return (
    <div style={{ marginTop: 10 }}>
      {myGuests.length > 0 && <p className="meta">Tes +1 : {myGuests.map((g) => (
        <span key={g.user_id}>{data.profiles[g.user_id]?.pseudo} <button className="link small" onClick={() => remove(g.user_id)}>retirer</button> </span>
      ))}</p>}
      {!open ? <button className="link strong" onClick={() => setOpen(true)}>+1 : inviter un ami</button> : (
        <div className="card">
          <div className="row between"><b>Inviter un ami</b><button className="link small" onClick={() => setOpen(false)}>fermer</button></div>
          {friends.length ? friends.map((f) => (
            <div className="row between" key={f.id} style={{ padding: '6px 0' }}>
              <span className="row" style={{ gap: 8 }}><Face p={data.profiles[f.id]} /> {data.profiles[f.id]?.pseudo}</span>
              <button className="btn small" onClick={() => invite(f.id)}>Inviter</button>
            </div>
          )) : <p className="note" style={{ marginTop: 6 }}>Aucun ami à inviter. Ajoute des amis depuis l'onglet Groupes, avec leur code ami.</p>}
          <p className="note">Ton +1 voit ce plan et peut répondre, mais pas le reste du groupe.</p>
        </div>
      )}
    </div>
  )
}

function Rides({ ctx, plan, run, busy, after, name }) {
  const { data, me } = ctx
  const rides = data.rides[plan.id] || []
  const needs = (data.needs[plan.id] || []).map((n) => n.user_id)
  const [form, setForm] = useState(false)
  const [seats, setSeats] = useState(4)
  const [dep, setDep] = useState('')
  const iDrive = rides.some((r) => r.driver_id === me.id)
  const myRide = rides.find((r) => r.ride_passengers.some((p) => p.user_id === me.id))

  const leaveAll = async () => {
    if (myRide) await supabase.from('ride_passengers').delete().eq('ride_id', myRide.id).eq('user_id', me.id)
    await supabase.from('ride_needs').delete().eq('plan_id', plan.id).eq('user_id', me.id)
  }
  const drive = async (e) => {
    e.preventDefault()
    const r = await run(async () => {
      await leaveAll()
      const res = await supabase.from('rides').insert({ plan_id: plan.id, seats, departure: dep.trim() })
      if (!res.error) await supabase.from('plan_responses').upsert({ plan_id: plan.id, user_id: me.id, status: 'go' })
      return res
    }, 'Tu es le SAM de ce plan, merci !')
    if (r) setForm(false)
    after(r)
  }
  const board = async (ride) => after(await run(async () => { await leaveAll(); return supabase.from('ride_passengers').insert({ ride_id: ride.id }) }, 'Place réservée'))
  const leave = async () => after(await run(leaveAll))
  const cancel = async (ride) => after(await run(() => supabase.from('rides').delete().eq('id', ride.id), 'Voiture retirée'))
  const need = async () => after(await run(() => needs.includes(me.id)
    ? supabase.from('ride_needs').delete().eq('plan_id', plan.id).eq('user_id', me.id)
    : supabase.from('ride_needs').insert({ plan_id: plan.id })))

  return (
    <>
      <div className="section-label">Trajets</div>
      {rides.map((r) => {
        const pax = r.ride_passengers.map((p) => p.user_id)
        const free = r.seats - 1 - pax.length
        const inIt = pax.includes(me.id)
        return (
          <div className="car" key={r.id}>
            <Face p={data.profiles[r.driver_id]} size={34} />
            <div className="plan-body" style={{ flex: 1 }}>
              <b>Voiture de {data.profiles[r.driver_id]?.pseudo}</b> <span className="chip sam">SAM</span>
              <div className="meta">{r.departure ? 'Départ : ' + r.departure + ' · ' : ''}{free} place{free > 1 ? 's' : ''} libre{free > 1 ? 's' : ''}</div>
              {pax.length > 0 && <Faces ids={pax} profiles={data.profiles} />}
            </div>
            {r.driver_id === me.id ? <button className="btn small ghost" disabled={busy} onClick={() => cancel(r)}>Annuler</button>
              : inIt ? <button className="btn small ghost" disabled={busy} onClick={leave}>Descendre</button>
              : free <= 0 ? <span className="meta">Complet</span>
              : <button className="btn small" disabled={busy} onClick={() => board(r)}>Monter</button>}
          </div>
        )
      })}
      {!rides.length && <p className="note" style={{ marginTop: 0 }}>Personne ne conduit pour l'instant.</p>}
      {needs.length > 0 && <p className="meta">Cherche{needs.length > 1 ? 'nt' : ''} un trajet : {needs.map(name).join(', ')}</p>}
      {form ? (
        <form className="card" onSubmit={drive}>
          <div className="row nowrap">
            <div style={{ flex: 1, minWidth: 0 }}><label htmlFor="r-seats">Places (toi compris)</label><input id="r-seats" type="number" min="2" max="9" value={seats} onChange={(e) => setSeats(+e.target.value)} /></div>
            <div style={{ flex: 2, minWidth: 0 }}><label htmlFor="r-dep">Départ</label><input id="r-dep" value={dep} onChange={(e) => setDep(e.target.value)} placeholder="Ex. gare, 20h30" /></div>
          </div>
          <div className="row" style={{ marginTop: 10 }}><button className="btn small" disabled={busy}>Je conduis</button><button type="button" className="btn small ghost" onClick={() => setForm(false)}>Annuler</button></div>
        </form>
      ) : (
        <div className="row" style={{ marginTop: 8 }}>
          {!iDrive && <button className="btn small" onClick={() => setForm(true)}>Je prends ma voiture (SAM)</button>}
          {!iDrive && !myRide && <button className="btn small ghost" disabled={busy} onClick={need}>{needs.includes(me.id) ? "Je n'ai plus besoin de trajet" : "J'ai besoin d'un trajet"}</button>}
        </div>
      )}
    </>
  )
}

function Bring({ ctx, plan, run, after }) {
  const { data, me } = ctx
  const items = data.bring[plan.id] || []
  const [label, setLabel] = useState('')
  const take = async (it) => after(await run(() => supabase.from('bring_items').update({ taken_by: it.taken_by ? null : me.id }).eq('id', it.id)))
  const add = async (e) => {
    e.preventDefault()
    if (!label.trim()) return
    const r = await run(() => supabase.from('bring_items').insert({ plan_id: plan.id, label: label.trim() }))
    if (r) setLabel('')
    after(r)
  }
  return (
    <>
      <div className="section-label">Qui ramène quoi</div>
      <div className="bring">
        {items.map((it) => {
          const mineIt = it.taken_by === me.id
          const other = it.taken_by && !mineIt
          return (
            <button key={it.id} className={it.taken_by ? 'taken' : ''} disabled={other} onClick={() => take(it)}>
              <span>{it.label}</span>
              <span className="meta">{mineIt ? 'Toi' : other ? data.profiles[it.taken_by]?.pseudo : 'Je prends'}</span>
            </button>
          )
        })}
      </div>
      <form className="inputrow" onSubmit={add}><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ajouter un truc à ramener" aria-label="Truc à ramener" maxLength={60} /><button className="btn small ghost">Ajouter</button></form>
    </>
  )
}

function Expenses({ ctx, plan, run, after, goers, name }) {
  const { data, me } = ctx
  const list = data.expenses[plan.id] || []
  const [amount, setAmount] = useState('')
  const [label, setLabel] = useState('')
  const debts = settle(list, goers)
  const add = async (e) => {
    e.preventDefault()
    const a = parseFloat(String(amount).replace(',', '.'))
    if (!(a > 0)) return
    const r = await run(() => supabase.from('expenses').insert({ plan_id: plan.id, amount: a, label: label.trim() || 'Dépense' }), 'Dépense ajoutée, les comptes sont à jour')
    if (r) { setAmount(''); setLabel('') }
    after(r)
  }
  const remove = async (x) => after(await run(() => supabase.from('expenses').delete().eq('id', x.id)))
  return (
    <>
      <div className="section-label">Dépenses</div>
      {list.length ? (
        <>
          <ul className="log">
            {list.map((x) => (
              <li key={x.id}><span>{x.label} <span className="meta">· payé par {name(x.paid_by)}</span>{x.paid_by === me.id && <button className="link small" onClick={() => remove(x)}>retirer</button>}</span><b>{euro(x.amount)}</b></li>
            ))}
          </ul>
          <div className="card">
            {debts.length ? debts.map((t, i) => (
              <div className="row between" key={i} style={{ padding: '3px 0' }}>
                <span>{t.from === me.id ? <b>Tu dois</b> : `${name(t.from)} doit`} à {name(t.to)}</span><b>{euro(t.amt)}</b>
              </div>
            )) : <span className="meta">Tout le monde est quitte.</span>}
            <p className="note" style={{ marginTop: 6 }}>Partagé entre les {goers.length} qui sont venus.</p>
          </div>
        </>
      ) : <p className="note" style={{ marginTop: 0 }}>Note ce que tu as payé, l'app fait les comptes.</p>}
      <form className="inputrow" onSubmit={add}>
        <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Montant €" aria-label="Montant" style={{ maxWidth: 110 }} />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Pour quoi ?" aria-label="Pour quoi" maxLength={60} />
        <button className="btn small">J'ai payé</button>
      </form>
    </>
  )
}

function Comments({ ctx, plan, run, after }) {
  const { data } = ctx
  const list = data.comments[plan.id] || []
  const [body, setBody] = useState('')
  const send = async (e) => {
    e.preventDefault()
    if (!body.trim()) return
    const r = await run(() => supabase.from('plan_comments').insert({ plan_id: plan.id, body: body.trim() }))
    if (r) setBody('')
    after(r)
  }
  return (
    <>
      <div className="section-label">Discussion du plan</div>
      {list.map((c) => (
        <div className="comment" key={c.id}><Face p={data.profiles[c.user_id]} /><div className="bubble"><b>{data.profiles[c.user_id]?.pseudo}</b>{c.body}</div></div>
      ))}
      {!list.length && <p className="note" style={{ marginTop: 0 }}>Pas encore de message.</p>}
      <form className="inputrow" onSubmit={send}><input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Écrire sur ce plan…" aria-label="Message" maxLength={1000} /><button className="btn small">Envoyer</button></form>
    </>
  )
}

function Photos({ ctx, plan }) {
  const { data, me } = ctx
  const photos = data.photos[plan.id] || []
  const [urls, setUrls] = useState({})
  const [uploading, setUploading] = useState(0)
  const [reel, setReel] = useState(false)
  const toast = useToast()

  useEffect(() => {
    const missing = photos.filter((p) => !urls[p.path]).map((p) => p.path)
    if (!missing.length) return
    supabase.storage.from('photos').createSignedUrls(missing, 3600).then(({ data: d }) => {
      if (!d) return
      setUrls((u) => { const n = { ...u }; d.forEach((x) => { if (x.signedUrl) n[x.path] = x.signedUrl }); return n })
    })
  }, [photos.map((p) => p.path).join()])

  const upload = async (files) => {
    files = [...files]
    if (!files.length) return
    setUploading(files.length)
    let ok = 0
    for (const f of files) {
      try {
        const blob = await compressImage(f)
        const path = `${plan.group_id}/${plan.id}/${crypto.randomUUID()}.jpg`
        const { error } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' })
        if (error) throw error
        const { error: e2 } = await supabase.from('photos').insert({ plan_id: plan.id, path })
        if (e2) throw e2
        ok++
      } catch (e) {
        toast("Une photo n'a pas pu être envoyée")
      }
      setUploading((n) => n - 1)
    }
    if (ok) toast(`${ok} photo${ok > 1 ? 's' : ''} ajoutée${ok > 1 ? 's' : ''}`)
    ctx.reload()
  }

  const remove = async (p) => {
    if (!window.confirm('Retirer cette photo ?')) return
    await supabase.storage.from('photos').remove([p.path])
    await supabase.from('photos').delete().eq('id', p.id)
    ctx.reload()
  }

  return (
    <>
      <div className="section-label">Photos de la soirée · {photos.length}</div>
      <div className="photos">
        {photos.map((p) => (
          <div key={p.id} className="ph" style={{ backgroundImage: urls[p.path] ? `url("${urls[p.path]}")` : undefined }}>
            <span>{data.profiles[p.user_id]?.pseudo}</span>
            {p.user_id === me.id && <button className="ph-del" onClick={() => remove(p)} aria-label="Retirer la photo">✕</button>}
          </div>
        ))}
        <label className="addph">
          {uploading ? `Envoi… (${uploading})` : '+ Ajouter mes photos'}
          <input type="file" accept="image/*" multiple onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
        </label>
      </div>
      <p className="note">Visibles seulement par les membres du groupe.</p>
      {photos.length >= 3 && <button className="btn ghost wide" onClick={() => setReel(true)}>Voir la vidéo souvenir</button>}
      {reel && <Reel plan={plan} photos={photos} urls={urls} profiles={data.profiles} onClose={() => setReel(false)} />}
    </>
  )
}

function Reel({ plan, photos, urls, profiles, onClose }) {
  const [i, setI] = useState(0)
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % photos.length), 2000); return () => clearInterval(t) }, [photos.length])
  const p = photos[i]
  const d = new Date(plan.starts_at)
  return (
    <div className="reel" onClick={onClose}>
      <div key={i} className="reel-img" style={{ backgroundImage: urls[p.path] ? `url("${urls[p.path]}")` : undefined }} />
      <div className="reel-bar">{photos.map((_, k) => <i key={k} className={k <= i ? 'on' : ''} />)}</div>
      <div className="reel-cap"><div className="reel-title">{plan.title}</div><div>{d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} · photo de {profiles[p.user_id]?.pseudo}</div></div>
      <button className="btn small reel-close" onClick={onClose}>Fermer</button>
    </div>
  )
}
