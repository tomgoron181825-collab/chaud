import { useRef, useState } from 'react'
import { supabase } from '../supabase'
import { COLORS, squareImage } from '../lib/format'
import { Sheet, Face, useAction, useToast } from './ui'
import { NotifSetting } from './Notifs'
import StatsSheet, { useIsAdmin } from './Stats'

export default function ProfileSheet({ me, setMe, onClose }) {
  const [run, busy] = useAction()
  const [pseudo, setPseudo] = useState(me.pseudo)
  const [color, setColor] = useState(me.color)
  const [confirmDelete, setConfirmDelete] = useState('')
  const admin = useIsAdmin()
  const toast = useToast()
  const file = useRef(null)
  const [uploading, setUploading] = useState(false)

  // Photo de profil : envoyée dans le dossier « avatars », puis l'ancienne est supprimée
  const pickPhoto = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setUploading(true)
    try {
      const blob = await squareImage(f)
      const path = `${me.id}/${Date.now()}.jpg`
      const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' })
      if (error) throw error
      const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
      const { data, error: e2 } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', me.id).select().single()
      if (e2) throw e2
      removeOld(me.avatar_url)
      setMe(data)
      toast('Photo de profil enregistrée')
    } catch {
      toast("La photo n'a pas pu être envoyée")
    }
    setUploading(false)
  }
  const removePhoto = async () => {
    const { data } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', me.id).select().single()
    if (data) { removeOld(me.avatar_url); setMe(data) }
  }
  const removeOld = (url) => {
    const old = url?.split('/avatars/')[1]
    if (old) supabase.storage.from('avatars').remove([old]).then(() => {}, () => {})
  }
  const [stats, setStats] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    const r = await run(() => supabase.from('profiles').update({ pseudo: pseudo.trim(), color }).eq('id', me.id).select().single(), 'Profil enregistré')
    if (r?.data) { setMe(r.data); onClose() }
  }
  const deleteAccount = async () => {
    const r = await run(() => supabase.rpc('delete_me'))
    if (r) await supabase.auth.signOut()
  }

  if (stats) return <StatsSheet onClose={() => setStats(false)} />
  return (
    <Sheet onClose={onClose}>
      <div className="row" style={{ gap: 12 }}>
        <button type="button" className="avatar-btn avatar-edit" onClick={() => file.current?.click()} aria-label="Changer ma photo de profil" disabled={uploading}>
          <Face p={{ pseudo, color, avatar_url: me.avatar_url }} size={64} />
          <span className="avatar-cam" aria-hidden="true">{uploading ? '…' : '+'}</span>
        </button>
        <div>
          <h3 className="sheet-title" style={{ margin: 0 }}>Mon profil</h3>
          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="link small" style={{ paddingLeft: 0 }} onClick={() => file.current?.click()} disabled={uploading}>{uploading ? 'Envoi…' : me.avatar_url ? 'Changer ma photo' : 'Ajouter une photo'}</button>
            {me.avatar_url && !uploading && <button type="button" className="link small danger" onClick={removePhoto}>Retirer</button>}
          </div>
        </div>
        <input ref={file} type="file" accept="image/*" hidden onChange={pickPhoto} />
      </div>
      <form onSubmit={save}>
        <label htmlFor="pf-p">Pseudo</label>
        <input id="pf-p" value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={30} required />
        <label>Couleur</label>
        <div className="row">{COLORS.map((c) => <button type="button" key={c} className="swatch" style={{ background: c }} aria-pressed={c === color} aria-label={'Couleur ' + c} onClick={() => setColor(c)} />)}</div>
        <button className="btn wide" disabled={busy} style={{ marginTop: 14 }}>Enregistrer</button>
      </form>
      <NotifSetting me={me} />
      {admin && <button className="btn wide" style={{ marginTop: 18 }} onClick={() => setStats(true)}>Voir les stats de l'app</button>}
      <button className="btn ghost wide" style={{ marginTop: 10 }} onClick={() => supabase.auth.signOut()}>Me déconnecter</button>
      <div className="section-label">Supprimer mon compte</div>
      <p className="note" style={{ marginTop: 0 }}>Efface ton profil, ta conso, tes messages et ta photo. Impossible à annuler. Tape SUPPRIMER pour confirmer.</p>
      <div className="inputrow">
        <input value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} aria-label="Confirmation" placeholder="SUPPRIMER" />
        <button className="btn small danger" disabled={confirmDelete !== 'SUPPRIMER' || busy} onClick={deleteAccount}>Supprimer</button>
      </div>
    </Sheet>
  )
}
