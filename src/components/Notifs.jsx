import { useEffect, useState } from 'react'
import { pushState, enablePush, disablePush, isIOS } from '../lib/push'
import { Switch, useToast } from './ui'

const TEXT = {
  install: isIOS()
    ? "Sur iPhone, ajoute d'abord Chaud à l'écran d'accueil (bouton Partager, puis « Sur l'écran d'accueil »), puis ouvre-la depuis l'icône."
    : "Ton navigateur ne gère pas les notifications. Essaie depuis Chrome ou après avoir installé l'app.",
  denied: "Les notifications sont bloquées pour Chaud. Réactive-les dans les réglages de ton téléphone.",
}
const WHAT = "Seulement l'utile : un nouveau plan, un pote chaud, un « Moi aussi » sur ton chaud, une invitation en +1."

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

// Réglage dans « Mon profil »
export function NotifSetting({ me }) {
  const [state, set] = usePush(me.id)
  if (!state) return null
  return (
    <>
      <div className="section-label">Notifications</div>
      {state === 'on' || state === 'off'
        ? <div className="toggle"><span>Recevoir les notifications</span><Switch checked={state === 'on'} onChange={set} label="Recevoir les notifications" /></div>
        : <p className="meta" style={{ margin: 0 }}>{TEXT[state] || TEXT.install}</p>}
      <p className="note" style={{ marginTop: 4 }}>{WHAT}</p>
    </>
  )
}
