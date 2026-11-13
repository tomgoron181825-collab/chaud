import { supabase } from '../supabase'
import { DAYS, MONTHS, isPast, todayIso } from '../lib/format'
import PlanCard, { visiblePlans, sortPlans } from '../components/PlanCard'
import { Face, Faces, useAction } from '../components/ui'
import { NotifCard } from '../components/Notifs'

export default function Home({ ctx }) {
  const { data, me } = ctx
  const now = new Date()
  const today = `${DAYS[now.getDay()].replace('.', '')} ${now.getDate()} ${MONTHS[now.getMonth()]}`

  if (!data.groups.length && !data.plans.length) {
    return (
      <>
        <Header ctx={ctx} today={today} />
        <div className="empty-big">
          <h3>Bienvenue {me.pseudo} !</h3>
          <p>Crée le groupe de ta bande ou rejoins celui d'un pote avec son code d'invitation.</p>
          <button className="btn" onClick={() => ctx.openGroup(null)}>Aller aux groupes</button>
        </div>
      </>
    )
  }

  const plans = visiblePlans(data, me)
  const upcoming = sortPlans(plans.filter((p) => !isPast(p)), data, me)
  const mine = (p) => (data.responses[p.id] || []).some((r) => r.user_id === me.id)
  const todo = upcoming.filter((p) => !mine(p))
  const rest = upcoming.filter(mine)
  const past = plans.filter(isPast).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)).slice(0, 5)

  return (
    <>
      <Header ctx={ctx} today={today} />
      {data.groups.length > 0 && <NotifCard me={me} />}
      {data.groups.length > 0 && <Chauds ctx={ctx} />}
      {todo.length > 0 && <><div className="section-label">En attente de ta réponse</div>{todo.map((p) => <PlanCard key={p.id} plan={p} ctx={ctx} showGroup />)}</>}
      <div className="section-label">Tes prochains plans</div>
      {rest.length ? rest.map((p) => <PlanCard key={p.id} plan={p} ctx={ctx} showGroup />) : <div className="empty">Rien de prévu. Lance un plan avec le +</div>}
      {past.length > 0 && (
        <>
          <div className="section-label">Souvenirs récents</div>
          {past.map((p) => {
            const n = (data.photos[p.id] || []).length
            const d = new Date(p.starts_at)
            return (
              <button key={p.id} className="mem" onClick={() => ctx.openPlan(p.id)}>
                <div className="mem-date"><b>{d.getDate()}</b><span>{MONTHS[d.getMonth()]}</span></div>
                <div className="plan-body"><b>{p.title}</b><div className="meta">{n} photo{n > 1 ? 's' : ''}{data.groups.find((g) => g.id === p.group_id) ? ' · ' + data.groups.find((g) => g.id === p.group_id).name : ''}</div></div>
              </button>
            )
          })}
        </>
      )}
    </>
  )
}

function Header({ ctx, today }) {
  return (
    <div className="top">
      <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
        <button className="avatar-btn" onClick={ctx.openProfile} aria-label="Mon profil"><Face p={ctx.me} size={38} /></button>
        <div><div className="sub">{today}</div><h2>À venir</h2></div>
      </div>
      {ctx.data.groups.length > 0 && <button className="round" onClick={() => ctx.newPlan()} aria-label="Proposer un plan">+</button>}
    </div>
  )
}

function Chauds({ ctx }) {
  const { data, me } = ctx
  const [run, busy] = useAction()
  const list = data.chauds.filter((c) => c.day >= todayIso())
  const toggle = async (c, inIt) => {
    const all = 1 + (data.joins[c.id] || []).length
    const msg = inIt ? null : c.plan_id ? 'Tu es ajouté au plan' : all + 1 >= 3 ? "3 chauds : c'est devenu un plan !" : 'Ton pote sait que tu es chaud aussi'
    const r = await run(() => inIt
      ? supabase.from('chaud_joins').delete().eq('chaud_id', c.id).eq('user_id', me.id)
      : supabase.from('chaud_joins').insert({ chaud_id: c.id }), msg)
    if (r) ctx.reload()
  }
  const remove = (c) => run(() => supabase.from('chauds').delete().eq('id', c.id)).then((r) => r && ctx.reload())

  return (
    <>
      <div className="row between" style={{ margin: '2px 0 8px' }}>
        <span className="section-label" style={{ margin: 0 }}>Qui est chaud ?</span>
        <button className="link strong" onClick={ctx.newChaud}>+ Je suis chaud</button>
      </div>
      {list.length === 0 && <p className="note" style={{ marginTop: 0 }}>Personne pour l'instant. Une envie pour aujourd'hui ou demain ? Lance-la.</p>}
      {list.map((c) => {
        const all = [c.user_id, ...(data.joins[c.id] || []).map((j) => j.user_id)]
        const inIt = all.includes(me.id)
        const author = c.user_id === me.id ? 'Tu es' : `${data.profiles[c.user_id]?.pseudo || 'Quelqu’un'} est`
        const isToday = c.day === todayIso()
        return (
          <div className="chaud" key={c.id}>
            <div className="row between nowrap">
              <div className="plan-body"><b>{author} chaud : {c.what}</b><div className="meta">{c.detail ? c.detail + ' · ' : ''}{data.groups.find((g) => g.id === c.group_id)?.name}</div></div>
              <span className={'chip ' + (isToday ? 'todo' : 'maybe')}>{isToday ? "Aujourd'hui" : 'Demain'}</span>
            </div>
            <div className="row between" style={{ marginTop: 8 }}>
              <div className="row" style={{ gap: 6 }}>
                <Faces ids={all} profiles={data.profiles} max={6} />
                <span className="meta">{all.length} chaud{all.length > 1 ? 's' : ''}{c.plan_id ? " · c'est parti !" : all.length === 2 ? " · encore 1 et c'est un plan" : ''}</span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {c.plan_id && inIt && <button className="btn small ghost" onClick={() => ctx.openPlan(c.plan_id)}>Voir le plan</button>}
                {c.user_id === me.id
                  ? <button className="btn small ghost" disabled={busy} onClick={() => remove(c)}>Retirer</button>
                  : <button className={'btn small' + (inIt ? ' ghost' : '')} disabled={busy} onClick={() => toggle(c, inIt)}>{inIt ? 'Finalement non' : 'Moi aussi'}</button>}
              </div>
            </div>
          </div>
        )
      })}
      {list.length > 0 && <p className="note" style={{ margin: '2px 0 0' }}>À 3 chauds, ça devient un plan. Ça disparaît tout seul à la fin de la journée prévue.</p>}
    </>
  )
}
