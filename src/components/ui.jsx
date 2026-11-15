import { createContext, useContext, useEffect, useState } from 'react'

export function Face({ p, size }) {
  const name = p?.pseudo || '?'
  const style = { background: p?.color || '#888' }
  if (size) Object.assign(style, { width: size, height: size, fontSize: size * 0.42 })
  if (p?.avatar_url) return <img className="face" src={p.avatar_url} alt="" title={name} style={size ? { width: size, height: size } : undefined} loading="lazy" />
  return <span className="face" style={style} title={name}>{name[0]?.toUpperCase()}</span>
}

export function Faces({ ids, profiles, max = 6 }) {
  return (
    <div className="faces">
      {ids.slice(0, max).map((id) => <Face key={id} p={profiles[id]} />)}
      {ids.length > max && <span className="face more">+{ids.length - max}</span>}
    </div>
  )
}

export function Sheet({ onClose, children, full }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [onClose])
  return (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'sheet' + (full ? ' full' : '')} role="dialog" aria-modal="true">
        <div className="sheet-head"><div className="grab" /><button className="close" onClick={onClose} aria-label="Fermer">✕</button></div>
        {children}
      </div>
    </div>
  )
}

export function Switch({ checked, onChange, label }) {
  return <button type="button" className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
}

const ToastCtx = createContext(() => {})
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null)
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 2200); return () => clearTimeout(t) }, [msg])
  return (
    <ToastCtx.Provider value={setMsg}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

const ICON = {
  biere: <><path d="M7 7h10v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" fill="#F4B400" /><path d="M7 7c0-2 1.5-3 3-3 1 0 1.5.6 2 .6S13 4 14.5 4C16 4 17 5 17 7z" fill="#FFF6DA" stroke="#E2C77A" /><path d="M17 10h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2" fill="none" stroke="#C98A00" strokeWidth="1.6" /></>,
  vin: <><path d="M8 3h8c0 5-1.5 8-4 8s-4-3-4-8z" fill="#9B1B42" /><path d="M12 11v8M8.5 20h7" stroke="#9B1B42" strokeWidth="1.8" strokeLinecap="round" fill="none" /></>,
  cocktail: <><path d="M4 5h16l-8 8z" fill="#FF5A1F" /><path d="M12 13v7M8.5 20h7" stroke="#FF5A1F" strokeWidth="1.8" strokeLinecap="round" fill="none" /><circle cx="17" cy="5" r="2.3" fill="#7BC043" /></>,
  shot: <><path d="M8 6h8l-1 13H9z" fill="#E8D9B0" stroke="#B89A55" strokeWidth="1.2" /><path d="M8.4 11h7.2l-.6 8H9z" fill="#C98A00" /></>,
  soft: <><path d="M7 6h10l-1.2 14H8.2z" fill="#2F7FE0" /><path d="M13 2l-1 8" stroke="#888" strokeWidth="1.5" fill="none" /></>,
  eau: <path d="M12 3c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z" fill="#4FB6E8" />,
}
export const DrinkIcon = ({ k, size = 30 }) => <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{ICON[k]}</svg>

export const TabIcon = {
  home: <path d="M4 6h16v14H4zM4 10h16M9 3v5M15 3v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  groups: <><circle cx="9" cy="9" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="17" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3 19c.8-3.5 3-5 6-5s5.2 1.5 6 5M15 15c3 0 5 1.3 6 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>,
  conso: <path d="M7 4h10l-1.5 16h-7zM7.4 9h9.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  bilan: <path d="M5 20V12M10 20V6M15 20v-9M20 20V4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
}

export function ErrorNote({ error }) {
  if (!error) return null
  return <p className="error" role="alert">{error}</p>
}

// Exécute une action Supabase et affiche l'erreur éventuelle
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = async (fn, okMsg) => {
    setBusy(true)
    try {
      const r = await fn()
      if (r && r.error) throw r.error
      if (okMsg) toast(okMsg)
      return r ?? true
    } catch (e) {
      toast(frError(e))
      return null
    } finally {
      setBusy(false)
    }
  }
  return [run, busy]
}

export function frError(e) {
  const m = e?.message || String(e)
  if (/Code inconnu/.test(m)) return "Ce code d'invitation n'existe pas"
  if (/adulte/.test(m)) return "L'app est réservée aux 18 ans et plus"
  if (/Invalid login/i.test(m)) return 'E-mail ou mot de passe incorrect'
  if (/already registered/i.test(m)) return 'Un compte existe déjà avec cet e-mail'
  if (/Password should/i.test(m)) return 'Le mot de passe doit faire au moins 6 caractères'
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Pas de connexion internet'
  return 'Oups : ' + m
}
