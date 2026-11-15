// Mode hors connexion (festival, cave, avion…) : on garde une copie des données sur le téléphone,
// et les verres ajoutés sans réseau sont envoyés dès que la connexion revient.
import { supabase } from '../supabase'

export const cacheGet = (k) => { try { return JSON.parse(localStorage.getItem('c:' + k) || 'null') } catch { return null } }
export const cacheSet = (k, v) => { try { localStorage.setItem('c:' + k, JSON.stringify(v)) } catch {} }

// File d'attente des verres : ajouts et suppressions pas encore envoyés
const QK = (uid) => 'drinkq:' + uid
export const queue = (uid) => cacheGet(QK(uid)) || { add: [], del: [] }
const saveQueue = (uid, q) => cacheSet(QK(uid), q)

export function queueAdd(uid, row) {
  const q = queue(uid); q.add.push(row); saveQueue(uid, q)
}
export function queueDel(uid, id) {
  const q = queue(uid)
  if (q.add.some((r) => r.id === id)) q.add = q.add.filter((r) => r.id !== id)
  else q.del.push(id)
  saveQueue(uid, q)
}

let flushing = null
// Envoie ce qui attend. Renvoie true si tout est parti.
export function flushDrinks(uid) {
  if (flushing) return flushing
  flushing = (async () => {
    const q = queue(uid)
    if (!q.add.length && !q.del.length) return true
    if (!navigator.onLine) return false
    try {
      if (q.add.length) {
        const { error } = await supabase.from('drinks').upsert(q.add, { onConflict: 'id', ignoreDuplicates: true })
        if (error) return false
      }
      if (q.del.length) {
        const { error } = await supabase.from('drinks').delete().in('id', q.del)
        if (error) return false
      }
      const now = queue(uid)
      const sentAdd = new Set(q.add.map((r) => r.id)), sentDel = new Set(q.del)
      saveQueue(uid, { add: now.add.filter((r) => !sentAdd.has(r.id)), del: now.del.filter((id) => !sentDel.has(id)) })
      return true
    } catch {
      return false
    }
  })().finally(() => { flushing = null })
  return flushing
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
}))

// Réseau saturé (festival) : on n'attend pas plus de quelques secondes avant d'utiliser la copie locale
export function withTimeout(promise, ms = 6000) {
  if (!navigator.onLine) return Promise.reject(new Error('offline'))
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])
}
