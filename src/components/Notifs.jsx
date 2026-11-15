import { useEffect, useState } from 'react'
import { pushState, enablePush, disablePush, isIOS } from '../lib/push'
import { supabase } from '../supabase'
import { Switch, useToast } from './ui'

const TEXT = {
  install: isIOS()
    ? "Sur iPhone, ajoute d'abord Chaud à l'écran d'accueil (bouton Partager, puis « Sur l'écran d'accueil »), puis ouvre-la depuis l'icône."
    : "Ton navigateur ne gère pas les notifications. Essaie depuis Chrome ou après avoir installé l'app.",
  denied: "Les notifications sont bloquées pour Chaud. Réactive-les dans les réglages de ton téléphone.",
}
const WHAT = "Seulement l'utile : un nouveau plan, un pote chaud, un « Moi aussi » sur ton chaud, une invitation en +1."

// Types de notifs : les 4 premiers sont activés par défaut, les autres au choix
export const PREFS = [
  ['plans', 'Nouveau plan dans mes groupes', true],
  ['chauds', 'Un pote est chaud', true],
  ['joins', '« Moi aussi » sur mon chaud', true],
  ['guests', 'Invitation en +1', true],
  ['responses', 'Réponses à mes plans', false],
  ['messages', 'Messages des plans où je vais', false],
]
const DEFAULTS = Object.fromEntries(PREFS.map(([k, , d]) => [k, d]))

export function usePush(userId) {
  const [state, setState] = useState(null)
  const toast = useToast()
  useEffect(() => { pushState().then(setState, () => setState('unsupported')) }, [])
  const set = async (on) => {
    try {
      const s = on ? await enablePush(userId) : await disablePush()
      setState(s)
      if (s === 'on') toast('Notifications activées')
      else if (s === 'denied') toast('Notifications refusées. Tu peux les réactiver dans les réglages du téléphone.')
    } catch (e) {
      toast("Impossible d'activer les notifications pour l'instant")
    }
  }
  return [state, set]
}

// Carte sur l'écran d'accueil, tant que les notifs ne sont pas activées (masquable)
export function NotifCard({ me }) {
  const [state, set] = usePush(me.id)
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('notif-card-hidden') === '1' } catch { return false } })
  if (hidden || !state || state === 'on' || state === 'unsupported' || state === 'denied') return null
  const hide = () => { setHidden(true); try { localStorage.setItem('notif-card-hidden', '1') } catch {} }
  return (
    <div className="card" style={{ marginTop: 0, marginBottom: 12 }}>
      <b>Ne rate plus un plan</b>
      <p className="meta" style={{ margin: '4px 0 10px' }}>{state === 'install' ? TEXT.install : WHAT}</p>
      <div className="row" style={{ gap: 8 }}>
        {state === 'off' && <button className="btn small" onClick={() => set(true)}>Activer les notifs</button>}
        <button className="btn small ghost" onClick={hide}>Plus tard</button>
      </div>
    </div>
  )
}

// Réglage dans « Mon profil » : tout activer ou couper, puis choisir type par type
export function NotifSetting({ me }) {
  const [state, set] = usePush(me.id)
  const [prefs, setPrefs] = useState(DEFAULTS)
  const toast = useToast()
  useEffect(() => {
    supabase.from('notif_prefs').select('*').eq('user_id', me.id).maybeSingle()
      .then(({ data }) => { if (data) setPrefs({ ...DEFAULTS, ...Object.fromEntries(PREFS.map(([k]) => [k, data[k]])) }) }, () => {})
  }, [])
  const change = async (k, v) => {
    const next = { ...prefs, [k]: v }
    setPrefs(next)
    const { error } = await supabase.from('notif_prefs').upsert({ user_id: me.id, ...next, updated_at: new Date().toISOString() })
    if (error) { setPrefs(prefs); toast("Impossible d'enregistrer ce choix pour l'instant") }
  }
  if (!state) return null
  return (
    <>
      <div className="section-label">Notifications</div>
      {state === 'on' || state === 'off'
        ? <div className="toggle"><b>Recevoir les notifications</b><Switch checked={state === 'on'} onChange={set} label="Recevoir les notifications" /></div>
        : <p className="meta" style={{ margin: 0 }}>{TEXT[state] || TEXT.install}</p>}
      {state === 'on' && (
        <>
          {PREFS.map(([k, label]) => (
            <div className="toggle" key={k}><span>{label}</span><Switch checked={!!prefs[k]} onChange={(v) => change(k, v)} label={label} /></div>
          ))}
          <p className="note" style={{ marginTop: 4 }}>Par défaut, seulement l'utile. Active les autres si tu veux.</p>
        </>
      )}
      {state === 'off' && <p className="note" style={{ marginTop: 4 }}>{WHAT} Tu pourras ensuite choisir lesquelles.</p>}
    </>
  )
}
