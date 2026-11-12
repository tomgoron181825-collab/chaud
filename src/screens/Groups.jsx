import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { COLORS, isPast, fmtDay, fmtU } from '../lib/format'
import { loadYearStats } from '../data'
import PlanCard, { visiblePlans, sortPlans } from '../components/PlanCard'
import { Face, useAction, useToast } from '../components/ui'

export default function Groups({ ctx, groupView, setGroupView }) {
  const group = groupView && ctx.data.groups.find((g) => g.id === groupView)
  if (group) return <Group ctx={ctx} group={group} back={() => setGroupView(null)} />
  return <GroupList ctx={ctx} open={setGroupView} />
}

function GroupList({ ctx, open }) {
  const { data, me } = ctx
  const [run, busy] = useAction()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [creating, setCreating] = useState(false)

  const create = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    const color = COLORS[(data.groups.length + 1) % COLORS.length]
    const r = await run(() => supabase.from('groups').insert({ name: name.trim(), color }).select().single(), 'Groupe créé, invite tes potes')
    if (r?.data) { setName(''); setCreating(false); await ctx.reload(); open(r.data.id) }
  }
  const join = async (e) => {
    e.preventDefault()
    if (!code.trim()) return
    const r = await run(() => supabase.rpc('join_group', { code: code.trim() }), 'Bienvenue dans le groupe !')
    if (r?.data) { setCode(''); await ctx.reload(); open(r.data) }
  }

  return (
    <>
      <div className="top"><h2>Groupes</h2><button className="btn small" onClick={() => setCreating(!creating)}>Créer</button></div>
      {creating && (
        <form className="card" onSubmit={create} style={{ marginBottom: 12 }}>
          <label htmlFor="g-name" style={{ marginTop: 0 }}>Nom du groupe</label>
          <div className="inputrow" style={{ marginTop: 0 }}><input id="g-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Ex. Les potes du lycée" autoFocus /><button className="btn small" disabled={busy}>Créer</button></div>
        </form>
      )}
      {data.groups.map((g) => {
        const n = visiblePlans(data, me).filter((p) => p.group_id === g.id && !isPast(p)).length
        const m = (data.members[g.id] || []).length
        return (
          <button className="group" key={g.id} onClick={() => open(g.id)}>
            <span className="gav" style={{ background: g.color }}>{g.name[0]?.toUpperCase()}</span>
            <div className="plan-body"><b>{g.name}</b><span className="meta">{m} membre{m > 1 ? 's' : ''} · {n} plan{n > 1 ? 's' : ''} à venir</span></div>
          </button>
        )
      })}
      {!data.groups.length && <p className="note">Tu n'as pas encore de groupe. Crée celui de ta bande, ou entre le code qu'un pote t'a envoyé.</p>}
      <div className="section-label">Rejoindre un groupe</div>
      <form className="inputrow" onSubmit={join}>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Code d'invitation, ex. 4F9A2C" aria-label="Code d'invitation" maxLength={12} autoCapitalize="characters" />
        <button className="btn small" disabled={busy}>Rejoindre</button>
      </form>
      <Friends ctx={ctx} />
    </>
  )
}

function Friends({ ctx }) {
  const { data, me } = ctx
  const [run, busy] = useAction()
  const toast = useToast()
  const [code, setCode] = useState('')
  const accepted = data.friends.filter((f) => f.status === 'accepted')
  const incoming = data.friends.filter((f) => f.status === 'pending' && f.incoming)
  const outgoing = data.friends.filter((f) => f.status === 'pending' && !f.incoming)
  const pseudo = (id) => data.profiles[id]?.pseudo || 'Quelqu’un'

  const add = async (e) => {
    e.preventDefault()
    if (!code.trim()) return
    const r = await run(() => supabase.rpc('add_friend', { code: code.trim() }), 'Demande envoyée')
    if (r) { setCode(''); ctx.reload() }
  }
  const accept = async (id) => { const r = await run(() => supabase.from('friendships').update({ status: 'accepted' }).eq('requester', id).eq('addressee', me.id), `${pseudo(id)} est ton ami`); if (r) ctx.reload() }
  const remove = async (id, ask) => {
    if (ask && !window.confirm(`Retirer ${pseudo(id)} de tes amis ?`)) return
    const r = await run(() => supabase.from('friendships').delete().or(`and(requester.eq.${me.id},addressee.eq.${id}),and(requester.eq.${id},addressee.eq.${me.id})`))
    if (r) ctx.reload()
  }
  const shareCode = async () => {
    const text = `Ajoute-moi en ami sur l'app avec mon code : ${me.friend_code}`
    if (navigator.share) { try { await navigator.share({ text }); return } catch { return } }
    try { await navigator.clipboard.writeText(me.friend_code); toast('Code copié') } catch { toast(me.friend_code) }
  }

  return (
    <>
      <div className="section-label">Mes amis</div>
      <div className="card" style={{ marginTop: 0 }}>
        <div className="row between">
          <div><div className="meta">Mon code ami</div><div className="big" style={{ fontSize: 24, letterSpacing: '.08em' }}>{me.friend_code}</div></div>
          <button className="btn small ghost" onClick={shareCode}>Envoyer</button>
        </div>
        <p className="note" style={{ marginTop: 6 }}>Tes amis peuvent t'inviter en +1 à leurs soirées, même si tu n'es pas dans leur groupe.</p>
      </div>
      <form className="inputrow" onSubmit={add}>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Code ami d'un pote" aria-label="Code ami" maxLength={12} autoCapitalize="characters" />
        <button className="btn small" disabled={busy}>Ajouter</button>
      </form>
      {incoming.length > 0 && (
        <ul className="rank" style={{ marginTop: 10 }}>
          {incoming.map((f) => (
            <li key={f.id}><span className="row" style={{ gap: 8 }}><Face p={data.profiles[f.id]} /> {pseudo(f.id)} <span className="meta">veut être ton ami</span></span>
              <span className="row" style={{ gap: 6 }}><button className="btn small" disabled={busy} onClick={() => accept(f.id)}>Accepter</button><button className="link small" onClick={() => remove(f.id)}>Refuser</button></span></li>
          ))}
        </ul>
      )}
      <ul className="rank" style={{ marginTop: 10 }}>
        {accepted.map((f) => (
          <li key={f.id}><span className="row" style={{ gap: 8 }}><Face p={data.profiles[f.id]} /> {pseudo(f.id)}</span><button className="link small" onClick={() => remove(f.id, true)}>Retirer</button></li>
        ))}
        {outgoing.map((f) => (
          <li key={f.id}><span className="row" style={{ gap: 8 }}><Face p={data.profiles[f.id]} /> {pseudo(f.id)} <span className="meta">en attente</span></span><button className="link small" onClick={() => remove(f.id)}>Annuler</button></li>
        ))}
        {!data.friends.length && <li><span className="meta">Pas encore d'amis. Envoie ton code ou entre celui d'un pote.</span></li>}
      </ul>
    </>
  )
}

function Group({ ctx, group, back }) {
  const { data, me } = ctx
  const [seg, setSeg] = useState('plans')
  const members = data.members[group.id] || []
  const plans = sortPlans(visiblePlans(data, me).filter((p) => p.group_id === group.id && !isPast(p)), data, me)

  return (
    <>
      <button className="link strong" onClick={back} style={{ marginBottom: 10 }}>‹ Groupes</button>
      <div className="top">
        <div className="row nowrap" style={{ gap: 10 }}>
          <span className="gav" style={{ background: group.color }}>{group.name[0]?.toUpperCase()}</span>
          <div className="plan-body"><h2 style={{ fontSize: 22 }}>{group.name}</h2><span className="sub">{members.length} membre{members.length > 1 ? 's' : ''}</span></div>
        </div>
        <button className="round" onClick={() => ctx.newPlan(group.id)} aria-label="Proposer un plan">+</button>
      </div>
      <div className="seg">
        {[['plans', 'Plans'], ['sam', 'SAM'], ['membres', 'Membres'], ['conso', 'Conso']].map(([k, l]) => <button key={k} aria-pressed={seg === k} onClick={() => setSeg(k)}>{l}</button>)}
      </div>
      {seg === 'plans' && (plans.length ? plans.map((p) => <PlanCard key={p.id} plan={p} ctx={ctx} />) : <div className="empty">Aucun plan pour l'instant.</div>)}
      {seg === 'sam' && <Sam ctx={ctx} group={group} members={members} />}
      {seg === 'membres' && <Members ctx={ctx} group={group} members={members} back={back} />}
      {seg === 'conso' && <GroupConso ctx={ctx} group={group} members={members} />}
    </>
  )
}

function Sam({ ctx, group, members }) {
  const { data, me } = ctx
  const [stats, setStats] = useState(null)
  useEffect(() => { loadYearStats(group.id).then(setStats).catch(() => setStats({ sam: {}, samUpcoming: [] })) }, [group.id, data])
  if (!stats) return <div className="empty">Chargement…</div>
  const rows = members.map((m) => ({ id: m.user_id, c: stats.sam[m.user_id] || 0, next: stats.samUpcoming.filter((r) => r.driver_id === m.user_id) }))
    .sort((a, b) => b.c - a.c)
  const minC = Math.min(...rows.map((r) => r.c))
  const due = rows.filter((r) => r.c === minC).map((r) => data.profiles[r.id]?.pseudo)
  const nextPlan = (r) => data.plans.find((p) => p.id === r.next[0]?.plan_id)
  return (
    <>
      <div className="wrapped small">
        <div className="k">Prochain SAM tout désigné</div>
        <div className="wrapped-name">{due.slice(0, 3).join(' ou ')}</div>
        <div className="wrapped-sub">{minC === 0 ? 'Jamais fait cette année' : `Seulement ${minC} fois cette année`}</div>
      </div>
      <ul className="rank">
        {rows.map((r) => {
          const np = nextPlan(r)
          return (
            <li key={r.id}>
              <span className="row" style={{ gap: 8 }}><Face p={data.profiles[r.id]} /> {data.profiles[r.id]?.pseudo}{r.id === me.id ? ' (toi)' : ''}
                {np?.starts_at && <span className="chip sam">SAM le {fmtDay(new Date(np.starts_at))}</span>}</span>
              <span>{r.c ? <><b>{r.c}</b> <span className="meta">fois</span></> : <span className="chip nosam">Jamais fait</span>}</span>
            </li>
          )
        })}
      </ul>
      <p className="note">Compté automatiquement : celui qui prend sa voiture pour un plan devient le SAM de la soirée.</p>
    </>
  )
}

function Members({ ctx, group, members, back }) {
  const { data, me } = ctx
  const toast = useToast()
  const [run] = useAction()
  const link = `${location.origin}${location.pathname}?join=${group.invite_code}`
  const share = async () => {
    const text = `Rejoins « ${group.name} » sur l'app : ${link}`
    if (navigator.share) { try { await navigator.share({ title: group.name, text, url: link }); return } catch { return } }
    try { await navigator.clipboard.writeText(link); toast('Lien copié, envoie-le à tes potes') } catch { toast(link) }
  }
  const leave = async () => {
    if (!window.confirm(`Quitter « ${group.name} » ?`)) return
    const r = await run(() => supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', me.id), 'Tu as quitté le groupe')
    if (r) { back(); ctx.reload() }
  }
  const befriend = async (uid) => {
    const r = await run(() => supabase.from('friendships').insert({ addressee: uid }), `Demande envoyée à ${data.profiles[uid]?.pseudo}`)
    if (r) ctx.reload()
  }
  const kick = async (uid) => {
    if (!window.confirm(`Retirer ${data.profiles[uid]?.pseudo} du groupe ?`)) return
    const r = await run(() => supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', uid))
    if (r) ctx.reload()
  }
  return (
    <>
      <ul className="rank">
        {members.map((m) => (
          <li key={m.user_id}>
            <span className="row" style={{ gap: 8 }}><Face p={data.profiles[m.user_id]} /> {data.profiles[m.user_id]?.pseudo}{m.user_id === me.id ? ' (toi)' : ''}</span>
            <span className="row" style={{ gap: 8 }}>{m.role === 'admin' && <span className="meta">Admin</span>}
              {m.user_id !== me.id && !data.friends.some((f) => f.id === m.user_id) && <button className="link small" style={{ color: 'var(--accent)' }} onClick={() => befriend(m.user_id)}>+ Ami</button>}
              {group.myRole === 'admin' && m.user_id !== me.id && <button className="link small danger" onClick={() => kick(m.user_id)}>Retirer</button>}</span>
          </li>
        ))}
      </ul>
      <div className="section-label">Inviter des potes</div>
      <div className="card">
        <div className="meta">Code du groupe</div>
        <div className="big" style={{ fontSize: 28, letterSpacing: '.08em' }}>{group.invite_code}</div>
        <button className="btn small" style={{ marginTop: 10 }} onClick={share}>Envoyer le lien d'invitation</button>
      </div>
      <button className="link danger" style={{ marginTop: 18 }} onClick={leave}>Quitter le groupe</button>
    </>
  )
}

function GroupConso({ ctx, group, members }) {
  const { data, me } = ctx
  const [rows, setRows] = useState(null)
  const sharing = members.filter((m) => m.share_conso).map((m) => m.user_id)
  useEffect(() => {
    const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0)
    if (!sharing.length) return setRows([])
    supabase.from('drinks').select('user_id, kind, units').in('user_id', sharing).gte('drunk_at', start.toISOString())
      .then(({ data: d }) => setRows(d || []))
  }, [group.id, sharing.join()])
  const mine = members.find((m) => m.user_id === me.id)
  return (
    <>
      <p className="meta" style={{ marginTop: 0 }}>Seuls ceux qui ont choisi de partager apparaissent ici. Ce mois-ci :</p>
      {rows === null ? <div className="empty">Chargement…</div> : (
        <ul className="rank">
          {members.filter((m) => m.share_conso).map((m) => {
            const mineRows = rows.filter((r) => r.user_id === m.user_id)
            const u = mineRows.reduce((a, r) => a + Number(r.units), 0)
            const w = mineRows.filter((r) => r.kind === 'eau').length
            return <li key={m.user_id}><span className="row" style={{ gap: 8 }}><Face p={data.profiles[m.user_id]} /> {data.profiles[m.user_id]?.pseudo}</span><span className="meta">{fmtU(u)} verres std · {w} d'eau</span></li>
          })}
          {!sharing.length && <li><span className="meta">Personne ne partage sa conso dans ce groupe.</span></li>}
        </ul>
      )}
      <p className="note">Pas de classement du plus gros buveur : la liste suit l'ordre des membres.</p>
      {!mine?.share_conso && <p className="note">Tu ne partages pas ta conso avec ce groupe. Tu peux l'activer dans l'onglet Conso.</p>}
    </>
  )
}
