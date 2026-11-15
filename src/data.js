import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { todayIso } from './lib/format'
import { cacheGet, cacheSet, withTimeout } from './lib/offline'

const by = (rows, key) => {
  const m = {}
  for (const r of rows || []) (m[r[key]] ||= []).push(r)
  return m
}

async function q(promise) {
  const { data, error } = await promise
  if (error) throw error
  return data || []
}

// Charge tout ce dont l'app a besoin pour les groupes de l'utilisateur.
// À l'échelle d'une bande de potes, tout recharger reste rapide et simple.
export async function loadAll(userId) {
  const [memberships, guestRows, friendships] = await Promise.all([
    q(supabase.from('group_members').select('group_id, role, share_conso, groups(*)').eq('user_id', userId)),
    q(supabase.from('plan_guests').select('plan_id').eq('user_id', userId)),
    q(supabase.from('friendships').select('*').or(`requester.eq.${userId},addressee.eq.${userId}`)),
  ])
  const groups = memberships.map((m) => ({ ...m.groups, myRole: m.role, shareConso: m.share_conso }))
  const groupIds = groups.map((g) => g.id)
  const guestPlanIds = guestRows.map((r) => r.plan_id)
  const none = Promise.resolve([])

  const since = new Date(Date.now() - 45 * 864e5).toISOString()
  const [members, groupPlans, guestPlans, chauds] = await Promise.all([
    groupIds.length ? q(supabase.from('group_members').select('group_id, user_id, role, share_conso, profiles(*)').in('group_id', groupIds)) : none,
    groupIds.length ? q(supabase.from('plans').select('*').in('group_id', groupIds).or(`starts_at.is.null,starts_at.gte.${since}`).order('starts_at', { ascending: true, nullsFirst: false })) : none,
    guestPlanIds.length ? q(supabase.from('plans').select('*').in('id', guestPlanIds).or(`starts_at.is.null,starts_at.gte.${since}`)) : none,
    groupIds.length ? q(supabase.from('chauds').select('*').in('group_id', groupIds).gte('day', todayIso()).order('created_at', { ascending: false })) : none,
  ])
  const seen = new Set(groupPlans.map((p) => p.id))
  const plans = [...groupPlans, ...guestPlans.filter((p) => !seen.has(p.id))]
  const planIds = plans.map((p) => p.id)
  const chaudIds = chauds.map((c) => c.id)
  const [responses, comments, rides, needs, bring, expenses, joins, guests] = await Promise.all([
    planIds.length ? q(supabase.from('plan_responses').select('*').in('plan_id', planIds)) : none,
    planIds.length ? q(supabase.from('plan_comments').select('*').in('plan_id', planIds).order('created_at')) : none,
    planIds.length ? q(supabase.from('rides').select('*, ride_passengers(user_id)').in('plan_id', planIds).order('created_at')) : none,
    planIds.length ? q(supabase.from('ride_needs').select('*').in('plan_id', planIds)) : none,
    planIds.length ? q(supabase.from('bring_items').select('*').in('plan_id', planIds).order('created_at')) : none,
    planIds.length ? q(supabase.from('expenses').select('*').in('plan_id', planIds).order('created_at')) : none,
    chaudIds.length ? q(supabase.from('chaud_joins').select('*').in('chaud_id', chaudIds)) : none,
    planIds.length ? q(supabase.from('plan_guests').select('*').in('plan_id', planIds)) : none,
  ])

  // Profils : membres de mes groupes, amis, +1 et participants des plans où je suis invité
  const profiles = {}
  members.forEach((m) => { if (m.profiles) profiles[m.user_id] = m.profiles })
  const wanted = new Set()
  friendships.forEach((f) => { wanted.add(f.requester); wanted.add(f.addressee) })
  ;[...responses, ...comments, ...guests].forEach((r) => wanted.add(r.user_id))
  guests.forEach((g) => wanted.add(g.invited_by))
  rides.forEach((r) => { wanted.add(r.driver_id); r.ride_passengers.forEach((p) => wanted.add(p.user_id)) })
  expenses.forEach((e) => wanted.add(e.paid_by))
  plans.forEach((p) => wanted.add(p.created_by))
  const missing = [...wanted].filter((id) => id && !profiles[id])
  if (missing.length) {
    const extra = await q(supabase.from('profiles').select('*').in('id', missing))
    extra.forEach((p) => (profiles[p.id] = p))
  }

  const friends = friendships.map((f) => ({
    id: f.requester === userId ? f.addressee : f.requester,
    status: f.status,
    incoming: f.addressee === userId,
  }))

  return {
    groups,
    members: by(members, 'group_id'),
    profiles,
    plans,
    responses: by(responses, 'plan_id'),
    comments: by(comments, 'plan_id'),
    rides: by(rides, 'plan_id'),
    needs: by(needs, 'plan_id'),
    bring: by(bring, 'plan_id'),
    expenses: by(expenses, 'plan_id'),
    guests: by(guests, 'plan_id'),
    chauds,
    joins: by(joins, 'chaud_id'),
    friends,
  }
}

export function useAppData(userId) {
  const [data, setData] = useState(() => (userId ? cacheGet('data:' + userId) : null))
  const [error, setError] = useState(null)
  const [offline, setOffline] = useState(false)
  const timer = useRef(null)

  const reload = useCallback(async () => {
    if (!userId) return
    try {
      const d = await withTimeout(loadAll(userId), 10000)
      setData(d)
      cacheSet('data:' + userId, d)
      setError(null)
      setOffline(false)
    } catch (e) {
      // Pas de réseau : on garde la dernière copie enregistrée sur le téléphone
      const cached = cacheGet('data:' + userId)
      if (cached) { setData((x) => x || cached); setOffline(true) }
      else setError(e.message || String(e))
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    reload()
    // Mise à jour en direct quand un pote répond, commente, propose un plan…
    const channel = supabase
      .channel('changes-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        clearTimeout(timer.current)
        timer.current = setTimeout(reload, 400)
      })
      .subscribe()
    const onFocus = () => reload()
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onFocus)
    return () => {
      window.removeEventListener('online', onFocus)
      supabase.removeChannel(channel)
      window.removeEventListener('focus', onFocus)
      clearTimeout(timer.current)
    }
  }, [userId, reload])

  return { data, error, reload, offline }
}

// Statistiques de l'année pour un groupe (SAM, trophées)
export async function loadYearStats(groupId) {
  const start = new Date(new Date().getFullYear(), 0, 1).toISOString()
  const now = new Date().toISOString()
  const plans = await q(supabase.from('plans').select('id, created_by, starts_at').eq('group_id', groupId).gte('starts_at', start))
  const past = plans.filter((p) => p.starts_at < now)
  const pastIds = past.map((p) => p.id)
  const allIds = plans.map((p) => p.id)
  const [rides, responses] = await Promise.all([
    allIds.length ? q(supabase.from('rides').select('plan_id, driver_id').in('plan_id', allIds)) : [],
    pastIds.length ? q(supabase.from('plan_responses').select('user_id').eq('status', 'go').in('plan_id', pastIds)) : [],
  ])
  const count = (rows, k) => rows.reduce((m, r) => ((m[r[k]] = (m[r[k]] || 0) + 1), m), {})
  const pastSet = new Set(pastIds)
  return {
    pastPlans: past.length,
    sam: count(rides.filter((r) => pastSet.has(r.plan_id)), 'driver_id'),
    samUpcoming: rides.filter((r) => !pastSet.has(r.plan_id)),
    presence: count(responses, 'user_id'),
    organizer: count(past, 'created_by'),
  }
}
