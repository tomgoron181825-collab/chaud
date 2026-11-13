import { useState } from 'react'
import { supabase } from '../supabase'
import { COLORS } from '../lib/format'
import { Sheet, Face, useAction } from './ui'
import { NotifSetting } from './Notifs'

export default function ProfileSheet({ me, setMe, onClose }) {
  const [run, busy] = useAction()
  const [pseudo, setPseudo] = useState(me.pseudo)
  const [color, setColor] = useState(me.color)
  const [confirmDelete, setConfirmDelete] = useState('')

  const save = async (e) => {
    e.preventDefault()
    const r = await run(() => supabase.from('profiles').update({ pseudo: pseudo.trim(), color }).eq('id', me.id).select().single(), 'Profil enregistré')
    if (r?.data) { setMe(r.data); onClose() }
  }
  const deleteAccount = async () => {
    const r = await run(() => supabase.rpc('delete_me'))
    if (r) await supabase.auth.signOut()
  }

  return (
    <Sheet onClose={onClose}>
      <div className="row" style={{ gap: 12 }}><Face p={{ pseudo, color }} size={52} /><h3 className="sheet-title" style={{ margin: 0 }}>Mon profil</h3></div>
      <form onSubmit={save}>
        <label htmlFor="pf-p">Pseudo</label>
        <input id="pf-p" value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={30} required />
        <label>Couleur</label>
        <div className="row">{COLORS.map((c) => <button type="button" key={c} className="swatch" style={{ background: c }} aria-pressed={c === color} aria-label={'Couleur ' + c} onClick={() => setColor(c)} />)}</div>
        <button className="btn wide" disabled={busy} style={{ marginTop: 14 }}>Enregistrer</button>
      </form>
      <NotifSetting me={me} />
      <button className="btn ghost wide" style={{ marginTop: 10 }} onClick={() => supabase.auth.signOut()}>Me déconnecter</button>
      <div className="section-label">Supprimer mon compte</div>
      <p className="note" style={{ marginTop: 0 }}>Efface ton profil, ta conso, tes messages et tes photos. Impossible à annuler. Tape SUPPRIMER pour confirmer.</p>
      <div className="inputrow">
        <input value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} aria-label="Confirmation" placeholder="SUPPRIMER" />
        <button className="btn small danger" disabled={confirmDelete !== 'SUPPRIMER' || busy} onClick={deleteAccount}>Supprimer</button>
      </div>
    </Sheet>
  )
}
