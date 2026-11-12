import { DAYS, MONTHS, TYPES, when, isPast } from '../lib/format'
import { Faces } from './ui'

export function visiblePlans(data, me) {
  // Un plan né d'un « chaud » n'apparaît que pour ceux qui y ont dit oui
  return data.plans.filter((p) => !p.from_chaud || (data.responses[p.id] || []).some((r) => r.user_id === me.id))
}

export function sortPlans(plans, data, me) {
  const mine = (p) => (data.responses[p.id] || []).find((r) => r.user_id === me.id)
  return plans.slice().sort((a, b) => (!!mine(a) - !!mine(b)) || ((a.starts_at ? new Date(a.starts_at) : 9e15) - (b.starts_at ? new Date(b.starts_at) : 9e15)))
}

export default function PlanCard({ plan, ctx, showGroup }) {
  const { data, me } = ctx
  const resp = data.responses[plan.id] || []
  const mine = resp.find((r) => r.user_id === me.id)?.status
  const going = resp.filter((r) => r.status === 'go').map((r) => r.user_id)
  const rides = data.rides[plan.id] || []
  const comments = (data.comments[plan.id] || []).length
  const d = plan.starts_at ? new Date(plan.starts_at) : null
  const group = data.groups.find((g) => g.id === plan.group_id)
  const past = isPast(plan)
  const drivers = rides.map((r) => data.profiles[r.driver_id]?.pseudo).filter(Boolean)
  return (
    <button className={'plan' + (!mine && !past ? ' todo' : '')} onClick={() => ctx.openPlan(plan.id)}>
      <div className="date">
        {d ? <><span>{DAYS[d.getDay()]}</span><b>{d.getDate()}</b><span>{MONTHS[d.getMonth()]}</span></> : <><span>date</span><b>?</b><span>à voir</span></>}
      </div>
      <div className="plan-body">
        <h3>{plan.title}</h3>
        <div className="meta">{TYPES[plan.type]} · {when(plan.starts_at)}</div>
        <div className="row chips">
          {!past && (!mine ? <span className="chip todo">À toi de répondre</span> : mine === 'go' ? <span className="chip go">Je viens</span> : mine === 'maybe' ? <span className="chip maybe">Peut-être</span> : <span className="chip">Pas dispo</span>)}
          {!past && (drivers.length ? <span className="chip sam">SAM : {drivers.join(', ')}</span> : plan.type === 'soiree' ? <span className="chip nosam">Pas encore de SAM</span> : null)}
          {showGroup && group && <span className="chip grp">{group.name}</span>}
        </div>
        <div className="row">
          <Faces ids={going} profiles={data.profiles} max={5} />
          <span className="meta">{going.length} vien{going.length > 1 ? 'nent' : 't'}{comments ? ` · ${comments} message${comments > 1 ? 's' : ''}` : ''}</span>
        </div>
      </div>
    </button>
  )
}
