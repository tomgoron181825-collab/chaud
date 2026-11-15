import { useState } from 'react'
import { MONTHS_LONG, isoDay, todayIso } from '../lib/format'
import PlanCard, { visiblePlans, sortPlans } from './PlanCard'

const WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

// Vue calendrier : un point par plan (marine) et par « chaud » (jaune), on touche un jour pour voir le détail
export default function Calendar({ ctx }) {
  const { data, me } = ctx
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [day, setDay] = useState(todayIso())

  const plans = visiblePlans(data, me).filter((p) => p.starts_at)
  const byDay = {}
  for (const p of plans) (byDay[isoDay(new Date(p.starts_at))] ||= { plans: [], chauds: [] }).plans.push(p)
  for (const c of data.chauds) (byDay[c.day] ||= { plans: [], chauds: [] }).chauds.push(c)

  const first = (month.getDay() + 6) % 7 // lundi = 0
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))]
  const move = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const sel = byDay[day] || { plans: [], chauds: [] }
  const selDate = new Date(day + 'T12:00:00')
  const undated = visiblePlans(data, me).filter((p) => !p.starts_at)

  return (
    <>
      <div className="cal">
        <div className="cal-head">
          <button className="cal-nav" onClick={() => move(-1)} aria-label="Mois précédent">‹</button>
          <b>{MONTHS_LONG[month.getMonth()]} {month.getFullYear()}</b>
          <button className="cal-nav" onClick={() => move(1)} aria-label="Mois suivant">›</button>
        </div>
        <div className="cal-grid">
          {WEEK.map((w, i) => <span key={i} className="cal-w">{w}</span>)}
          {cells.map((d, i) => {
            if (!d) return <span key={i} />
            const k = isoDay(d)
            const e = byDay[k]
            return (
              <button key={i} className={'cal-d' + (k === todayIso() ? ' today' : '') + (k === day ? ' sel' : '')} onClick={() => setDay(k)}>
                {d.getDate()}
                <span className="cal-dots">
                  {e?.plans.slice(0, 3).map((p) => <i key={p.id} />)}
                  {e?.chauds.length > 0 && <i className="ch" />}
                </span>
              </button>
            )
          })}
        </div>
        <div className="cal-legend"><span><i /> Plan</span><span><i className="ch" /> Quelqu'un est chaud</span></div>
      </div>

      <div className="section-label">{selDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      {sel.chauds.map((c) => (
        <div className="chaud" key={c.id}><b>{c.user_id === me.id ? 'Tu es' : `${data.profiles[c.user_id]?.pseudo || 'Quelqu’un'} est`} chaud : {c.what}</b>
          <div className="meta">{data.groups.find((g) => g.id === c.group_id)?.name}</div></div>
      ))}
      {sortPlans(sel.plans, data, me).map((p) => <PlanCard key={p.id} plan={p} ctx={ctx} showGroup />)}
      {!sel.plans.length && !sel.chauds.length && <div className="empty">Rien ce jour-là. <button className="link strong" onClick={() => ctx.newPlan()}>Proposer un plan</button></div>}
      {undated.length > 0 && (
        <>
          <div className="section-label">Date pas encore fixée</div>
          {undated.map((p) => <PlanCard key={p.id} plan={p} ctx={ctx} showGroup />)}
        </>
      )}
    </>
  )
}
