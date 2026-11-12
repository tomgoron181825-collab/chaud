import { useEffect, useState } from 'react'
import { supabase, configured } from './supabase'
import { APP_NAME } from './config'
import { useAppData } from './data'
import { TabIcon, useToast, frError } from './components/ui'
import Auth, { Onboarding } from './screens/Auth'
import Home from './screens/Home'
import Groups from './screens/Groups'
import Conso from './screens/Conso'
import Bilan from './screens/Bilan'
import PlanSheet from './components/PlanSheet'
import NewPlanSheet from './components/NewPlanSheet'
import NewChaudSheet from './components/NewChaudSheet'
import ProfileSheet from './components/ProfileSheet'

const TABS = [['home', 'À venir'], ['groups', 'Groupes'], ['conso', 'Conso'], ['bilan', 'Bilan']]

// Code d'invitation reçu par lien (?join=CODE), gardé jusqu'à la connexion
const params = new URLSearchParams(location.search)
if (params.get('join')) {
  try { sessionStorage.setItem('pendingJoin', params.get('join')) } catch {}
  history.replaceState(null, '', location.pathname)
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(undefined)

  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id
  useEffect(() => {
    if (!userId) { setProfile(undefined); return }
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle().then(({ data }) => setProfile(data || null))
  }, [userId])

  if (!configured) return <Setup />
  if (session === undefined || (session && profile === undefined)) return <Splash />
  if (!session) return <Auth />
  if (!profile) return <Onboarding user={session.user} onDone={setProfile} />
  return <Main me={profile} setMe={setProfile} />
}

function Main({ me, setMe }) {
  const { data, error, reload } = useAppData(me.id)
  const [tab, setTab] = useState('home')
  const [groupView, setGroupView] = useState(null)
  const [planId, setPlanId] = useState(null)
  const [newPlan, setNewPlan] = useState(null)
  const [newChaud, setNewChaud] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const toast = useToast()

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

  if (!data) return error ? <div className="center"><p className="error">{error}</p><button className="btn" onClick={reload}>Réessayer</button></div> : <Splash />

  const ctx = {
    me, data, reload,
    openPlan: setPlanId,
    newPlan: (groupId) => setNewPlan({ groupId: groupId || groupView || data.groups[0]?.id }),
    newChaud: () => setNewChaud(true),
    openProfile: () => setProfileOpen(true),
    openGroup: (id) => { setTab('groups'); setGroupView(id) },
  }
  const plan = planId && data.plans.find((p) => p.id === planId)

  return (
    <div className="app">
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
