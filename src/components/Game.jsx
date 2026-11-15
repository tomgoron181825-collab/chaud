import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { Face, useToast } from './ui'

// Question du jour « Qui de nous ? » : une question par jour (la même pour tous les groupes),
// chacun vote pour un membre. Votes secrets, on ne voit que les totaux.
export const QUESTIONS = [
  "d'arriver en retard à sa propre soirée",
  'de proposer un plan à 2 h du matin',
  'de répondre sur le groupe 3 jours après',
  'de lancer un karaoké sans prévenir',
  'de devenir célèbre',
  'de mettre une heure à choisir un resto',
  'de se perdre même avec un GPS',
  "d'avoir 12 alarmes le matin",
  'de partir en voyage sur un coup de tête',
  "d'oublier un anniversaire",
  "de connaître les paroles de toutes les chansons",
  'de ramener un nouveau pote à chaque soirée',
  "de s'endormir en premier en soirée",
  'de devenir millionnaire',
  "d'être le premier sur la piste de danse",
  'de tomber amoureux en vacances',
  'de survivre à une apocalypse zombie',
  "d'arriver les mains vides",
  'de faire une blague nulle et de rire tout seul',
  'de rater son train',
  "d'organiser le prochain voyage du groupe",
  'de prendre 200 photos pour une story',
  'de commander toujours la même chose',
  'de garder un secret jusqu\'au bout',
  "de se faire des potes avec des inconnus",
  "de dire « on part dans 5 minutes » et rester 2 heures",
  'de changer de coupe de cheveux sur un coup de tête',
  'de se vexer à un jeu de société',
  'de faire le SAM sans qu\'on lui demande',
  'de raconter la même anecdote pour la dixième fois',
  "de pleurer devant un dessin animé",
  'de se faire tatouer sur un coup de tête',
  "d'ouvrir un resto un jour",
  'de finir dans une émission de télé-réalité',
  "d'avoir le plus d'applis de rencontre",
  "de se lever à 5 h pour aller courir",
  "d'adopter un chien sans prévenir personne",
  'de se perdre dans un aéroport',
  "d'envoyer un message à la mauvaise personne",
  'de partir vivre à l\'étranger',
  "d'oublier ses clés en partant",
  'de lancer un débat à 3 h du matin',
  "de commander à manger à minuit",
  'de gagner à un quiz de culture G',
  "d'être en retard à son propre mariage",
  'de dépenser tout son salaire en un week-end',
  'de faire la fête jusqu\'au lever du soleil',
  "d'avoir un fou rire au mauvais moment",
  'de se faire passer pour quelqu\'un d\'autre au téléphone',
  'de devenir prof',
  'de garder ses tickets de concert pendant 10 ans',
  "de s'inscrire à la salle et de ne jamais y aller",
  'de mettre trois tenues avant de sortir',
  'de connaître tous les potins',
  'de chanter sous la douche à fond',
  'de réussir dans la vie sans jamais réviser',
  "d'oublier le prénom de quelqu'un juste après l'avoir entendu",
  'de rester ami avec tous ses ex',
  'de proposer un jeu de société à chaque soirée',
  'de faire un road trip sans rien prévoir',
]

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// Le jour (aujourd'hui, ou décalé : -1 = hier)
export function weekOf(shift = 0) {
  const d = new Date(); d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + shift)
  return iso(d)
}
export function questionOf(day) {
  const n = Math.round(Date.parse(day + 'T12:00:00Z') / 864e5)
  return QUESTIONS[((n % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length]
}

async function results(groupId, week) {
  const { data, error } = await supabase.rpc('game_results', { g: groupId, wk: week })
  if (error) throw error
  return data
}

export default function Game({ ctx, group, members }) {
  const { data } = ctx
  const toast = useToast()
  const week = weekOf(), last = weekOf(-1)
  const [now, setNow] = useState(null)
  const [prev, setPrev] = useState(null)
  const [changing, setChanging] = useState(false)
  const [err, setErr] = useState(false)
  const load = () => Promise.all([results(group.id, week), results(group.id, last)])
    .then(([a, b]) => { setNow(a); setPrev(b); setErr(false) }, () => setErr(true))
  useEffect(() => { load() }, [group.id])

  const vote = async (uid) => {
    const { error } = await supabase.rpc('game_vote', { g: group.id, wk: week, t: uid })
    if (error) return toast("Le vote n'est pas passé, réessaie")
    setChanging(false); load()
  }
  const name = (id) => data.profiles[id]?.pseudo || '?'
  const winners = (r) => {
    const e = Object.entries(r?.counts || {})
    if (!e.length) return null
    const max = Math.max(...e.map(([, n]) => n))
    return { ids: e.filter(([, n]) => n === max).map(([id]) => id), n: max }
  }
  const w = winners(prev)

  if (err) return <div className="empty">Le jeu arrive bientôt.</div>
  if (!now) return <div className="empty">Chargement…</div>
  const voted = now.mine && !changing
  const rows = members.map((m) => ({ id: m.user_id, n: now.counts?.[m.user_id] || 0 })).sort((a, b) => b.n - a.n)
  const top = Math.max(1, ...rows.map((r) => r.n))

  return (
    <>
      <div className="wrapped small game">
        <div className="k">Question du jour · Qui de nous…</div>
        <div className="game-q">…est le plus susceptible {questionOf(week)} ?</div>
        <div className="wrapped-sub">{now.voters}/{members.length} ont voté · nouvelle question demain</div>
      </div>
      {!voted ? (
        <>
          <p className="meta" style={{ marginTop: 0 }}>Touche la personne de ton choix. Ton vote reste secret.</p>
          <div className="game-pick">
            {members.map((m) => (
              <button key={m.user_id} className={'game-who' + (now.mine === m.user_id ? ' on' : '')} onClick={() => vote(m.user_id)}>
                <Face p={data.profiles[m.user_id]} size={44} /><span>{name(m.user_id)}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <ul className="rank">
            {rows.map((r) => (
              <li key={r.id}>
                <span className="row nowrap" style={{ gap: 8, flex: 1 }}><Face p={data.profiles[r.id]} /> {name(r.id)}
                  <span className="game-bar"><i style={{ width: (r.n / top) * 100 + '%' }} /></span></span>
                <b>{r.n}</b>
              </li>
            ))}
          </ul>
          <p className="note">Tu as voté pour {name(now.mine)}. <button className="link small" style={{ padding: 0 }} onClick={() => setChanging(true)}>Changer mon vote</button></p>
        </>
      )}
      {w && (
        <div className="card">
          <div className="meta">Hier, le plus susceptible {questionOf(last)} :</div>
          <div className="row" style={{ gap: 8, marginTop: 6 }}>{w.ids.map((id) => <span key={id} className="row" style={{ gap: 6 }}><Face p={data.profiles[id]} /> <b>{name(id)}</b></span>)}<span className="meta">{w.n} vote{w.n > 1 ? 's' : ''}</span></div>
        </div>
      )}
    </>
  )
}

// Petite carte sur l'accueil tant que tu n'as pas répondu dans un de tes groupes
export function GameCard({ ctx }) {
  const { data } = ctx
  const week = weekOf()
  const [todo, setTodo] = useState(null)
  const ids = data.groups.filter((g) => (data.members[g.id] || []).length >= 2).map((g) => g.id)
  useEffect(() => {
    let alive = true
    Promise.all(ids.map((id) => results(id, week).then((r) => (r.mine ? null : id), () => null)))
      .then((l) => alive && setTodo(l.find(Boolean) || null))
    return () => { alive = false }
  }, [ids.join(), week])
  if (!todo) return null
  const g = data.groups.find((x) => x.id === todo)
  return (
    <button className="card game-card" onClick={() => ctx.openGroup(todo, 'jeu')}>
      <div className="k">Question du jour · {g?.name}</div>
      <b>Qui de nous est le plus susceptible {questionOf(week)} ?</b>
      <span className="chip todo" style={{ alignSelf: 'flex-start', marginTop: 8 }}>Voter</span>
    </button>
  )
}
