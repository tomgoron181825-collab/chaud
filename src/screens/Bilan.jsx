import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { DRINKS, MONTHS_LONG, MONTHS, fmtU } from '../lib/format'
import { loadYearStats } from '../data'
import { DrinkIcon, Face } from '../components/ui'

export default function Bilan({ ctx }) {
  const { data, me } = ctx
  const year = new Date().getFullYear()
  const [drinks, setDrinks] = useState(null)
  const [gid, setGid] = useState(data.groups[0]?.id)
  const [stats, setStats] = useState(null)
  const [samTotal, setSamTotal] = useState(0)

  useEffect(() => {
    supabase.from('drinks').select('kind, name, units, drunk_at').eq('user_id', me.id).gte('drunk_at', new Date(year, 0, 1).toISOString())
      .then(({ data: d }) => setDrinks(d || []))
    Promise.all(data.groups.map((g) => loadYearStats(g.id).catch(() => null))).then((all) => {
      setSamTotal(all.reduce((a, s) => a + ((s && s.sam[me.id]) || 0), 0))
    })
  }, [])
  useEffect(() => { if (gid) loadYearStats(gid).then(setStats).catch(() => setStats(null)) }, [gid])

  if (!drinks) return <div className="empty">Chargement…</div>

  const alc = drinks.filter((d) => Number(d.units) > 0)
  const total = alc.reduce((a, d) => a + Number(d.units), 0)
  const nightKey = (d) => { const x = new Date(d.drunk_at); if (x.getHours() < 6) x.setDate(x.getDate() - 1); return x.toDateString() }
  const nights = new Set(alc.map(nightKey)).size
  const months = Array(12).fill(0)
  alc.forEach((d) => (months[new Date(d.drunk_at).getMonth()] += Number(d.units)))
  const max = Math.max(1, ...months)
  const topM = months.indexOf(Math.max(...months))
  const counts = {}
  alc.forEach((d) => (counts[d.name] = (counts[d.name] || 0) + 1))
  const fav = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  const favKind = fav && alc.find((d) => d.name === fav[0])?.kind
  const water = drinks.filter((d) => d.kind === 'eau').length
  const weeks = Math.max(1, (Date.now() - new Date(year, 0, 1)) / 6048e5)
  const perWeek = (total / weeks).toFixed(1).replace('.', ',')
  const nowM = new Date().getMonth()
  const mostOf = (m) => { const e = Object.entries(m || {}).sort((a, b) => b[1] - a[1])[0]; return e ? { id: e[0], n: e[1] } : null }

  const trophies = stats ? [
    ['Toujours là', mostOf(stats.presence), (n) => `${n} plan${n > 1 ? 's' : ''} sur ${stats.pastPlans}`],
    ['Meilleur SAM', mostOf(stats.sam), (n) => `${n} fois`],
    ['Organisateur en chef', mostOf(stats.organizer), (n) => `${n} plan${n > 1 ? 's' : ''} proposé${n > 1 ? 's' : ''}`],
  ].filter((t) => t[1]) : []

  return (
    <>
      <div className="top"><div><div className="sub">Depuis le 1er janvier {year}</div><h2>Ton année</h2></div></div>
      <div className="wrapped">
        <div className="k">Soirées en {year}</div>
        <div className="huge">{nights}</div>
        <div className="wrapped-sub">{nights ? `Ton mois le plus festif : ${MONTHS_LONG[topM]}.` : "Ajoute tes verres dans l'onglet Conso pour remplir ton bilan."}</div>
      </div>
      <div className="tiles">
        <div className="tile">{fav ? <><div className="row" style={{ gap: 6 }}><DrinkIcon k={favKind} size={22} /><span className="v">{fav[0]}</span></div><div className="l">ta boisson n°1 ({fav[1]} fois)</div></> : <><div className="v">–</div><div className="l">ta boisson n°1</div></>}</div>
        <div className="tile"><div className="v">{fmtU(total)}</div><div className="l">verres standard au total</div></div>
        <div className="tile"><div className="v" style={{ color: 'var(--go)' }}>{water}</div><div className="l">verres d'eau notés</div></div>
        <div className="tile"><div className="v">{samTotal}</div><div className="l">fois SAM cette année</div></div>
      </div>
      <div className="tile">
        <div className="row between"><b>Verres par mois</b><span className="meta">{perWeek} par semaine en moyenne</span></div>
        <div className="bars">
          {months.map((v, i) => <div key={i} className={i === topM && v > 0 ? 'peak' : i > nowM ? 'future' : ''} style={{ height: i > nowM ? '6%' : `${Math.max(4, (v / max) * 100)}%` }} title={`${MONTHS[i]} : ${fmtU(v)} verres`} />)}
        </div>
        <div className="months">{'JFMAMJJASOND'.split('').map((m, i) => <span key={i}>{m}</span>)}</div>
      </div>

      {data.groups.length > 0 && (
        <>
          <div className="row between" style={{ marginTop: 20 }}>
            <span className="section-label" style={{ margin: 0 }}>Trophées {year}</span>
            {data.groups.length > 1 && <select value={gid} onChange={(e) => setGid(e.target.value)} aria-label="Groupe" className="mini-select">{data.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>}
          </div>
          {trophies.length ? (
            <div className="tiles" style={{ marginTop: 10 }}>
              {trophies.map(([t, w, f]) => (
                <div className="tile" key={t}><div className="l">{t}</div><div className="row" style={{ gap: 6, margin: '6px 0 2px' }}><Face p={data.profiles[w.id]} /><b>{data.profiles[w.id]?.pseudo || '?'}</b></div><div className="l">{f(w.n)}</div></div>
              ))}
            </div>
          ) : <p className="note">Les trophées apparaissent après vos premiers plans passés.</p>}
        </>
      )}
      <p className="note">Repères de Santé publique France : pas plus de 10 verres standard par semaine, pas plus de 2 par jour, et pas tous les jours. Besoin d'en parler : Alcool Info Service, 0 980 980 930 (gratuit, 7j/7).</p>
    </>
  )
}
