// Lien « Inviter un pote » : ?ami=CODE&de=PSEUDO
// Celui qui s'inscrit avec ce lien devient directement ami avec celui qui l'a envoyé.
import { APP_NAME } from '../config'

const KEY = 'pendingInvite'

// À appeler au chargement : garde l'invitation jusqu'à l'inscription
export function captureInvite() {
  const p = new URLSearchParams(location.search)
  const code = p.get('ami')
  if (!code) return
  try { localStorage.setItem(KEY, JSON.stringify({ code, de: (p.get('de') || '').slice(0, 30) })) } catch {}
  p.delete('ami'); p.delete('de')
  const rest = p.toString()
  history.replaceState(null, '', location.pathname + (rest ? '?' + rest : ''))
}

export function pendingInvite() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}
export function clearInvite() {
  try { localStorage.removeItem(KEY) } catch {}
}

export function inviteLink(me) {
  return `${location.origin}${location.pathname}?ami=${encodeURIComponent(me.friend_code)}&de=${encodeURIComponent(me.pseudo)}`
}

export async function shareInvite(me, toast) {
  const url = inviteLink(me)
  const text = `Viens sur ${APP_NAME}, l'app pour organiser nos soirées entre potes. Inscris-toi avec ce lien et on sera direct amis (sinon mon code ami : ${me.friend_code})`
  if (navigator.share) {
    try { await navigator.share({ title: APP_NAME, text, url }) } catch {}
    return
  }
  try { await navigator.clipboard.writeText(text + ' ' + url); toast('Lien copié, envoie-le à ton pote') } catch { toast(url) }
}
