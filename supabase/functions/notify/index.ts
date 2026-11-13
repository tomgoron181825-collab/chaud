// Fonction serveur « notify » : envoie les notifications utiles, et seulement celles-là.
//   - un pote propose un nouveau plan dans ton groupe
//   - un pote est chaud (aujourd'hui ou demain)
//   - quelqu'un dit « Moi aussi » à TON chaud
//   - un ami t'invite en +1 à un plan
// Pas de notif pour les messages, les photos, les dépenses, etc.
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

async function build(table: string, k: Record<string, string>): Promise<{ to: string[]; msg: Msg } | null> {
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
    }
  }
  return null
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
    const sent = r ? await send(r.to, r.msg) : 0
    return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
