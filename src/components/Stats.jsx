import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { Sheet } from './ui'

// Page « Stats » : visible seulement par les admins (table app_admins, fix-004)
export function useIsAdmin() {
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    supabase.rpc('is_admin').then(({ data }) => setAdmin(data === true), () => {})
  }, [])
  return admin
}

const ROWS = [
  ['Utilisateurs', [['inscrits', 'Inscrits'], ['nouveaux_24h', 'Nouveaux (24 h)'], ['nouveaux_7j', 'Nouveaux (7 jours)'], ['installes', "Ont installé l'app"], ['notifs', 'Notifs activées']]],
  ['Actifs', [['actifs_24h', 'Dernières 24 h'], ['actifs_7j', '7 derniers jours'], ['actifs_30j', '30 derniers jours']]],
  ['Contenu', [['groupes', 'Groupes'], ['plans', 'Plans'], ['chauds', 'Chauds']]],
]

export default function StatsSheet({ onClose }) {
  const [s, setS] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    const load = () => supabase.rpc('admin_stats').then(({ data, error }) => {
      if (error) setErr('Impossible de charger les stats')
      else { setS(data); setErr('') }
    })
    load()
    // Mise à jour toute seule toutes les 30 secondes, et quand on revient sur l'app
    const t = setInterval(load, 30000)
    const onVis = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  return (
    <Sheet onClose={onClose}>
      <h3 className="sheet-title">Stats de Chaud</h3>
      {err && <p className="note warn">{err}</p>}
      {!s && !err && <p className="meta">Chargement…</p>}
      {s && ROWS.map(([title, items]) => (
        <div key={title}>
          <div className="section-label">{title}</div>
          <div className="stat-grid">
            {items.map(([k, label]) => (
              <div className="stat" key={k}><b>{Number(s[k] || 0).toLocaleString('fr-FR')}</b><span>{label}</span></div>
            ))}
          </div>
        </div>
      ))}
      {s && <p className="note">Mis à jour à {new Date(s.a).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}. Se met à jour toutes les 30 secondes.</p>}
    </Sheet>
  )
}
