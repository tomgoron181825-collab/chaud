import { useEffect, useState } from 'react'
import { supabase, configured } from './supabase'
import { APP_NAME } from './config'
import { useAppData } from './data'
import { TabIcon, useToast, frError } from './components/ui'
import Auth, { Onboarding } from './screens/Auth'
import Home from './screens/Home'
import Groups, { openSeg } from './screens/Groups'
import Conso from './screens/Conso'
import Bilan from './screens/Bilan'
import PlanSheet from './components/PlanSheet'
import NewPlanSheet from './components/NewPlanSheet'
import NewChaudSheet from './components/NewChaudSheet'
import ProfileSheet from './components/ProfileSheet'
import { isStandalone, refreshPush } from './lib/push'
import { captureInvite, pendingInvite, clearInvite } from './lib/invite'
import { cacheGet, cacheSet, flushDrinks, withTimeout } from './lib/offline'

const TABS = [['home', 'À venir'], ['groups', 'Groupes'], ['conso', 'Conso'], ['bilan', 'Bilan']]

// Invitation d'un pote (?ami=CODE), gardée jusqu'à l'inscription
captureInvite()
// Code d'invitation reçu par lien (?join=CODE), gardé jusqu'à la connexion
const params = new URLSearchParams(location.search)
if (params.get('join')) {
  try { sessionStorage.setItem('pendingJoin', params.get('join')) } catch {}
  history.replaceState(null, '', location.pathname)
}
// Plan à ouvrir directement (?plan=ID), par exemple en touchant une notification
let pendingPlan = params.get('plan')
if (pendingPlan) history.replaceState(null, '', location.pathname)

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(undefined)

  useEffect(() => {
    if (!configured) return
    // Sans réseau, Supabase peut ne pas réussir à renouveler la connexion : on garde celle du téléphone
    const stored = () => {
      try {
        const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x))
        const s = k && JSON.parse(localStorage.getItem(k))
        return s?.user ? s : null
      } catch { return null }
    }
    const offlineSession = () => (navigator.onLine ? null : stored())
    withTimeout(supabase.auth.getSession(), 5000)
      .then(({ data }) => setSession(data.session || offlineSession()), () => setSession((x) => (x === undefined ? stored() : x)))
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => setSession(s || (e === 'SIGNED_OUT' ? null : offlineSession())))
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id
  useEffect(() => {
    if (!userId) { setProfile(undefined); return }
    withTimeout(supabase.from('profiles').select('*').eq('id', userId).maybeSingle()).then(({ data, error }) => {
      // Hors connexion : on reprend le profil gardé sur le téléphone
      if (error) return setProfile(cacheGet('profile:' + userId) || null)
      if (data) cacheSet('profile:' + userId, data)
      setProfile(data || null)
    }, () => setProfile(cacheGet('profile:' + userId) || null))
  }, [userId])

  if (!configured) return <Setup />
  if (session === undefined || (session && profile === undefined)) return <Splash />
  if (!session) return <Auth />
  if (!profile) return <Onboarding user={session.user} onDone={setProfile} />
  return <Main me={profile} setMe={(p) => { if (p) cacheSet('profile:' + p.id, p); setProfile(p) }} />
}

function Main({ me, setMe }) {
  const { data, error, reload, offline } = useAppData(me.id)
  const [tab, setTab] = useState('home')
  const [groupView, setGroupView] = useState(null)
  const [planId, setPlanId] = useState(null)
  const [newPlan, setNewPlan] = useState(null)
  const [newChaud, setNewChaud] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const toast = useToast()

  // Statistiques de base (dernière visite, app installée) et abonnement aux notifs à jour
  useEffect(() => {
    const up = { last_seen_at: new Date().toISOString() }
    if (isStandalone()) up.installed = true
    supabase.from('profiles').update(up).eq('id', me.id).then(() => {}, () => {})
    refreshPush(me.id)
    // Verres ajoutés sans réseau : envoyés dès que ça revient
    const flush = () => flushDrinks(me.id)
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [])

  // Ouvrir le plan d'une notification
  useEffect(() => {
    const open = () => { const id = new URLSearchParams(location.search).get('plan'); if (id) { setTab('home'); setPlanId(id); history.replaceState(null, '', location.pathname) } }
    if (pendingPlan) { setPlanId(pendingPlan); pendingPlan = null }
    window.addEventListener('popstate', open)
    return () => window.removeEventListener('popstate', open)
  }, [])

  // Rejoindre un groupe via un lien d'invitation
  useEffect(() => {
    let code = null
    try { code = sessionStorage.getItem('pendingJoin') } catch {}
    if (!code) return
    try { sessionStorage.removeItem('pendingJoin') } catch {}
    supabase.rpc('join_group', { code }).then(({ data: gid, error: e }) => {
      if (e) return toast(frError(e))
      toast('Bienvenue dans le groupe !')
      reload(); setTab('groups'); setGroupView(gid)
    })
  }, [])

  // Devenir ami avec le pote qui a envoyé le lien d'invitation
  useEffect(() => {
    const inv = pendingInvite()
    if (!inv) return
    supabase.rpc('accept_invite', { code: inv.code }).then(({ data: id, error: e }) => {
      if (e) return
      clearInvite()
      if (id) { toast(`Toi et ${inv.de || 'ton pote'} êtes maintenant amis`); reload() }
    })
  }, [])

  if (!data) return error ? <div className="center"><p className="error">{error}</p><button className="btn" onClick={reload}>Réessayer</button></div> : <Splash />

  const ctx = {
    me, data, reload,
    openPlan: setPlanId,
    newPlan: (groupId) => setNewPlan({ groupId: groupId || groupView || data.groups[0]?.id }),
    newChaud: () => setNewChaud(true),
    openProfile: () => setProfileOpen(true),
    openGroup: (id, seg) => { if (seg) openSeg(seg); setTab('groups'); setGroupView(id) },
  }
  const plan = planId && data.plans.find((p) => p.id === planId)

  return (
    <div className="app">
      {offline && <div className="offline-bar">Hors connexion · tu peux quand même noter tes verres</div>}
      <main className="screen" key={tab}>
        {tab === 'home' && <Home ctx={ctx} />}
        {tab === 'groups' && <Groups ctx={ctx} groupView={groupView} setGroupView={setGroupView} />}
        {tab === 'conso' && <Conso ctx={ctx} />}
        {tab === 'bilan' && <Bilan ctx={ctx} />}
      </main>
      <nav className="tabbar">
        {TABS.map(([k, l]) => (
          <button key={k} aria-current={tab === k} onClick={() => { setTab(k); if (k !== 'groups') setGroupView(null) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{TabIcon[k]}</svg>{l}
          </button>
        ))}
      </nav>
      {plan && <PlanSheet ctx={ctx} plan={plan} onClose={() => setPlanId(null)} />}
      {newPlan && <NewPlanSheet ctx={ctx} groupId={newPlan.groupId} onClose={() => setNewPlan(null)} />}
      {newChaud && <NewChaudSheet ctx={ctx} onClose={() => setNewChaud(false)} />}
      {profileOpen && <ProfileSheet me={me} setMe={setMe} onClose={() => setProfileOpen(false)} />}
    </div>
  )
}

function Splash() {
  return <div className="center"><div className="logo">{APP_NAME}</div></div>
}

function Setup() {
  return (
    <div className="center" style={{ textAlign: 'left', maxWidth: 420 }}>
      <div className="logo">{APP_NAME}</div>
      <p>L'app n'est pas encore reliée à sa base de données.</p>
      <p className="meta">Renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (voir le README).</p>
    </div>
  )
}
