import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { APP_NAME } from '../config'
import { COLORS } from '../lib/format'
import { frError, ErrorNote } from '../components/ui'
import { pendingInvite } from '../lib/invite'

const age = (iso) => {
  if (!iso) return 0
  const b = new Date(iso), n = new Date()
  let a = n.getFullYear() - b.getFullYear()
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--
  return a
}

export default function Auth() {
  const [mode, setMode] = useState('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pseudo, setPseudo] = useState('')
  const [birth, setBirth] = useState('')
  const [err, setErr] = useState(null)
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [invite] = useState(pendingInvite)

  const submit = async (e) => {
    e.preventDefault()
    setErr(null); setInfo(null)
    if (mode === 'signup') {
      if (!pseudo.trim()) return setErr('Choisis un pseudo')
      if (age(birth) < 18) return setErr(`${APP_NAME} est réservée aux 18 ans et plus.`)
    }
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { pseudo: pseudo.trim(), birth_date: birth }, emailRedirectTo: location.origin + location.pathname },
        })
        if (error) throw error
        if (!data.session) setInfo('Compte créé ! Clique sur le lien reçu par e-mail pour te connecter.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (e2) {
      setErr(frError(e2))
    } finally {
      setBusy(false)
    }
  }

  const forgot = async () => {
    if (!email) return setErr("Écris ton e-mail d'abord")
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })
    if (error) setErr(frError(error)); else setInfo('Un e-mail pour changer ton mot de passe vient de partir.')
  }

  return (
    <div className="auth">
      <div className="logo big">{APP_NAME}</div>
      <p className="tagline">Les plans de tes potes, au même endroit.</p>
      {invite && mode === 'signup' && <div className="card invite-banner"><b>{invite.de || 'Un pote'} t'invite sur {APP_NAME}</b><div className="meta">Crée ton compte, vous serez directement amis.</div></div>}
      <div className="seg">
        <button aria-pressed={mode === 'signup'} onClick={() => setMode('signup')}>Créer un compte</button>
        <button aria-pressed={mode === 'login'} onClick={() => setMode('login')}>Se connecter</button>
      </div>
      <form onSubmit={submit}>
        {mode === 'signup' && (
          <>
            <label htmlFor="a-pseudo">Pseudo</label>
            <input id="a-pseudo" value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={30} autoComplete="nickname" placeholder="Comment tes potes t'appellent" />
            <label htmlFor="a-birth">Date de naissance</label>
            <input id="a-birth" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} required />
          </>
        )}
        <label htmlFor="a-email">E-mail</label>
        <input id="a-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <label htmlFor="a-pass">Mot de passe</label>
        <input id="a-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
        <ErrorNote error={err} />
        {info && <p className="info">{info}</p>}
        <button className="btn wide" disabled={busy}>{mode === 'signup' ? 'Créer mon compte' : 'Me connecter'}</button>
        {mode === 'login' && <button type="button" className="link" onClick={forgot}>Mot de passe oublié</button>}
      </form>
      {mode === 'signup' && <p className="note">Réservé aux 18 ans et plus. Ta conso reste privée sauf si tu choisis de la partager avec un groupe.</p>}
    </div>
  )
}

// Crée le profil après la première connexion
export function Onboarding({ user, onDone }) {
  const meta = user.user_metadata || {}
  const [pseudo, setPseudo] = useState(meta.pseudo || '')
  const [birth, setBirth] = useState(meta.birth_date || '')
  const [err, setErr] = useState(null)

  const save = async (e) => {
    e?.preventDefault()
    if (!pseudo.trim()) return setErr('Choisis un pseudo')
    if (age(birth) < 18) return setErr(`${APP_NAME} est réservée aux 18 ans et plus.`)
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]
    const { data, error } = await supabase.from('profiles').insert({ id: user.id, pseudo: pseudo.trim(), birth_date: birth, color }).select().single()
    if (error) return setErr(frError(error))
    onDone(data)
  }

  useEffect(() => { if (meta.pseudo && meta.birth_date) save() }, [])

  return (
    <div className="auth">
      <div className="logo big">{APP_NAME}</div>
      <form onSubmit={save}>
        <label htmlFor="o-pseudo">Pseudo</label>
        <input id="o-pseudo" value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={30} />
        <label htmlFor="o-birth">Date de naissance</label>
        <input id="o-birth" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} required />
        <ErrorNote error={err} />
        <button className="btn wide">C'est parti</button>
      </form>
      <button className="link" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
    </div>
  )
}
