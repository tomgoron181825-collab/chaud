// Fonction serveur « notify » : envoie les notifications, selon les choix de chacun (table notif_prefs).
// Activées par défaut (les utiles) :
//   - plans    : un pote propose un nouveau plan dans ton groupe
//   - chauds   : un pote est chaud (aujourd'hui ou demain)
//   - joins    : quelqu'un dit « Moi aussi » à TON chaud
//   - guests   : un ami t'invite en +1 à un plan
//   - game     : rappel du jeu de la semaine à 9 h, seulement si tu n'as pas encore voté
// Désactivées par défaut (à activer dans « Mon profil ») :
//   - responses : quelqu'un répond à un plan que tu as proposé
//   - messages  : un message sur un plan où tu vas
//   - photos    : de nouvelles photos d'une soirée où tu étais
//
// Secrets à créer dans Supabase > Edge Functions > Secrets : VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY.
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const APP_URL = 'https://tomgoron181825-collab.github.io/chaud/'
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})
webpush.setVapidDetails(APP_URL, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)

type Msg = { title: string; body: string; url: string; tag: string }
type Pref = 'plans' | 'chauds' | 'joins' | 'guests' | 'game' | 'responses' | 'messages' | 'photos'
const DEFAULTS: Record<Pref, boolean> = { plans: true, chauds: true, joins: true, guests: true, game: true, responses: false, messages: false, photos: false }

// Ceux qui participent à un plan : ceux qui viennent (ou peut-être), le créateur et les +1
async function participants(planId: string, createdBy: string, statuses = ['go', 'maybe']) {
  const [{ data: r }, { data: g }] = await Promise.all([
    db.from('plan_responses').select('user_id').eq('plan_id', planId).in('status', statuses),
    db.from('plan_guests').select('user_id').eq('plan_id', planId),
  ])
  return [...new Set([createdBy, ...(r || []).map((x) => x.user_id), ...(g || []).map((x) => x.user_id)])] as string[]
}
const cut = (t: string, n = 120) => (t.length > n ? t.slice(0, n - 1) + '…' : t)

const pseudo = async (id: string) =>
  (await db.from('profiles').select('pseudo').eq('id', id).maybeSingle()).data?.pseudo || 'Un pote'

async function group(id: string) {
  const [{ data: g }, { data: m }] = await Promise.all([
    db.from('groups').select('name').eq('id', id).maybeSingle(),
    db.from('group_members').select('user_id').eq('group_id', id),
  ])
  return { name: g?.name || 'ton groupe', members: (m || []).map((x) => x.user_id as string) }
}

function when(iso: string | null) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

// Une seule notification par événement, même si la base prévient deux fois
async function once(key: string) {
  const { error } = await db.from('push_log').insert({ key })
  return !error
}

// Jeu de la semaine : mêmes questions que dans l'app (src/components/Game.jsx)
const QUESTIONS = [
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
]
const questionOf = (week: string) => {
  const n = Math.round(Date.parse(week + 'T12:00:00Z') / (7 * 864e5))
  return QUESTIONS[((n % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length]
}

async function build(table: string, k: Record<string, string>): Promise<{ to: string[]; msg: Msg; pref: Pref } | null> {
  // Rappel du jeu, lancé chaque matin par la base (pg_cron) : seulement à 9 h heure de Paris,
  // une fois par jour, et seulement pour ceux qui n'ont pas encore voté dans un de leurs groupes
  if (table === 'game') {
    const paris = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
    if (paris.getHours() !== 9) return null
    const today = `${paris.getFullYear()}-${String(paris.getMonth() + 1).padStart(2, '0')}-${String(paris.getDate()).padStart(2, '0')}`
    if (!(await once('game:' + today))) return null
    const m = new Date(today + 'T12:00:00Z')
    m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7))
    const week = m.toISOString().slice(0, 10)
    const [{ data: mem }, { data: votes }] = await Promise.all([
      db.from('group_members').select('group_id, user_id'),
      db.from('game_votes').select('group_id, voter').eq('week', week),
    ])
    const size = new Map<string, number>()
    for (const r of mem || []) size.set(r.group_id, (size.get(r.group_id) || 0) + 1)
    const voted = new Set((votes || []).map((v) => v.group_id + ':' + v.voter))
    const to = [...new Set((mem || []).filter((r) => (size.get(r.group_id) || 0) >= 2 && !voted.has(r.group_id + ':' + r.user_id)).map((r) => r.user_id as string))]
    const last = paris.getDay() === 0
    return {
      to,
      msg: {
        title: last ? 'Dernier jour pour voter !' : 'Jeu de la semaine',
        body: `Qui de nous est le plus susceptible ${questionOf(week)} ?`,
        url: APP_URL,
        tag: 'game-' + week,
      },
      pref: 'game',
    }
  }

  if (table === 'plans') {
    const { data: p } = await db.from('plans').select('*').eq('id', k.id).maybeSingle()
    // Un plan né d'un « chaud » : ceux qui ont dit oui le savent déjà
    if (!p || p.from_chaud || !(await once('plan:' + p.id))) return null
    const g = await group(p.group_id)
    const d = when(p.starts_at)
    return {
      to: g.members.filter((id) => id !== p.created_by),
      msg: {
        title: `${await pseudo(p.created_by)} propose un plan`,
        body: `${p.title}${d ? ' · ' + d : ''} · ${g.name}`,
        url: APP_URL + '?plan=' + p.id,
        tag: 'plan-' + p.id,
      },
      pref: 'plans',
    }
  }

  if (table === 'chauds') {
    const { data: c } = await db.from('chauds').select('*').eq('id', k.id).maybeSingle()
    if (!c || !(await once('chaud:' + c.id))) return null
    const g = await group(c.group_id)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
    return {
      to: g.members.filter((id) => id !== c.user_id),
      msg: {
        title: `${await pseudo(c.user_id)} est chaud : ${c.what}`,
        body: `${c.day === today ? "Aujourd'hui" : 'Demain'} · ${g.name}. Dis « Moi aussi » si t'es partant.`,
        url: APP_URL,
        tag: 'chaud-' + c.id,
      },
      pref: 'chauds',
    }
  }

  if (table === 'chaud_joins') {
    if (!(await once(`join:${k.chaud_id}:${k.user_id}`))) return null
    const { data: c } = await db.from('chauds').select('*').eq('id', k.chaud_id).maybeSingle()
    if (!c || c.user_id === k.user_id) return null
    const { count } = await db.from('chaud_joins').select('*', { count: 'exact', head: true }).eq('chaud_id', c.id)
    const n = (count || 0) + 1
    return {
      to: [c.user_id],
      msg: {
        title: `${await pseudo(k.user_id)} est chaud aussi`,
        body: c.plan_id ? `${c.what} : ${n} chauds, c'est devenu un plan !` : `${c.what} · ${n} chauds pour l'instant`,
        url: c.plan_id ? APP_URL + '?plan=' + c.plan_id : APP_URL,
        tag: 'chaud-' + c.id,
      },
      pref: 'joins',
    }
  }

  if (table === 'plan_guests') {
    if (!(await once(`guest:${k.plan_id}:${k.user_id}`))) return null
    const [{ data: p }, { data: gu }] = await Promise.all([
      db.from('plans').select('*').eq('id', k.plan_id).maybeSingle(),
      db.from('plan_guests').select('invited_by').eq('plan_id', k.plan_id).eq('user_id', k.user_id).maybeSingle(),
    ])
    if (!p || !gu) return null
    const d = when(p.starts_at)
    return {
      to: [k.user_id],
      msg: {
        title: `${await pseudo(gu.invited_by)} t'invite en +1`,
        body: `${p.title}${d ? ' · ' + d : ''}`,
        url: APP_URL + '?plan=' + p.id,
        tag: 'plan-' + p.id,
      },
      pref: 'guests',
    }
  }

  if (table === 'plan_responses') {
    if (k.status === 'no') return null
    const { data: p } = await db.from('plans').select('*').eq('id', k.plan_id).maybeSingle()
    // Pas pour son propre plan, ni pour les plans nés d'un chaud (les réponses y sont automatiques)
    if (!p || p.from_chaud || p.created_by === k.user_id) return null
    if (!(await once(`resp:${k.plan_id}:${k.user_id}:${k.status}`))) return null
    return {
      to: [p.created_by],
      msg: {
        title: `${await pseudo(k.user_id)} ${k.status === 'go' ? 'vient' : 'viendra peut-être'}`,
        body: p.title,
        url: APP_URL + '?plan=' + p.id,
        tag: 'resp-' + p.id,
      },
      pref: 'responses',
    }
  }

  if (table === 'plan_comments') {
    const { data: m } = await db.from('plan_comments').select('*').eq('id', k.id).maybeSingle()
    if (!m || !(await once('msg:' + m.id))) return null
    const { data: p } = await db.from('plans').select('*').eq('id', m.plan_id).maybeSingle()
    if (!p) return null
    return {
      to: (await participants(p.id, p.created_by)).filter((id) => id !== m.user_id),
      msg: { title: `${await pseudo(m.user_id)} · ${p.title}`, body: cut(m.body), url: APP_URL + '?plan=' + p.id, tag: 'msg-' + p.id },
      pref: 'messages',
    }
  }

  if (table === 'photos') {
    const { data: ph } = await db.from('photos').select('*').eq('id', k.id).maybeSingle()
    if (!ph) return null
    // Une seule notif quand quelqu'un ajoute plusieurs photos d'un coup (par heure)
    const hour = new Date().toISOString().slice(0, 13)
    if (!(await once(`photo:${ph.plan_id}:${ph.user_id}:${hour}`))) return null
    const { data: p } = await db.from('plans').select('*').eq('id', ph.plan_id).maybeSingle()
    if (!p) return null
    return {
      to: (await participants(p.id, p.created_by, ['go'])).filter((id) => id !== ph.user_id),
      msg: { title: `${await pseudo(ph.user_id)} a ajouté des photos`, body: p.title, url: APP_URL + '?plan=' + p.id, tag: 'photos-' + p.id },
      pref: 'photos',
    }
  }
  return null
}

// Garde seulement ceux qui ont choisi ce type de notif (sinon le réglage par défaut)
async function wanted(to: string[], pref: Pref) {
  if (!to.length) return []
  const { data } = await db.from('notif_prefs').select('*').in('user_id', to)
  const byUser = new Map((data || []).map((r) => [r.user_id as string, r]))
  return to.filter((id) => {
    const r = byUser.get(id)
    return r && typeof r[pref] === 'boolean' ? r[pref] : DEFAULTS[pref]
  })
}

async function send(to: string[], msg: Msg) {
  if (!to.length) return 0
  const { data: subs } = await db.from('push_subscriptions').select('*').in('user_id', to)
  let sent = 0
  await Promise.all(
    (subs || []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(msg),
          { TTL: 12 * 3600, urgency: 'high' },
        )
        sent++
      } catch (e) {
        // Téléphone désabonné ou app supprimée : on oublie cet abonnement
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      }
    }),
  )
  return sent
}

Deno.serve(async (req) => {
  try {
    const { table, keys } = await req.json()
    const r = await build(String(table), keys || {})
    const sent = r ? await send(await wanted(r.to, r.pref), r.msg) : 0
    return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
