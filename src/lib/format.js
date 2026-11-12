export const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
export const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
export const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
export const TYPES = { soiree: 'Soirée', resto: 'Resto', autre: 'Autre' }
export const COLORS = ['#FF5A1F', '#7B5CFF', '#0E9F84', '#E0407B', '#2F7FE0', '#C98A00', '#8A5A3C', '#4C6A1F']

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const todayIso = () => isoDay(new Date())
export const tomorrowIso = () => { const d = new Date(); d.setDate(d.getDate() + 1); return isoDay(d) }

export const fmtTime = (d) => `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`
export const fmtDay = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`

export function when(dateStr) {
  if (!dateStr) return 'Date à choisir'
  const d = new Date(dateStr)
  const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / 864e5)
  const day = diff === 0 ? "Aujourd'hui" : diff === 1 ? 'Demain' : diff === -1 ? 'Hier' : fmtDay(d)
  return `${day} · ${fmtTime(d)}`
}

export const isPast = (plan) => plan.starts_at && new Date(plan.starts_at) < startOfDay(new Date())

// 1 verre standard = 10 g d'alcool pur ; arrondi au demi-verre
export const units = (cl, deg) => Math.round(Number(cl) * Number(deg) * 0.008 * 2) / 2
export const fmtU = (u) => String(Number(u)).replace('.', ',')
export const euro = (n) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €'

export const DRINKS = [
  { k: 'biere', n: 'Bière', u: '25 cl', std: 1 },
  { k: 'vin', n: 'Vin', u: '12 cl', std: 1 },
  { k: 'cocktail', n: 'Cocktail', u: '1 verre', std: 1 },
  { k: 'shot', n: 'Shot', u: '3 cl', std: 1 },
  { k: 'soft', n: 'Soft', u: '1 verre', std: 0 },
  { k: 'eau', n: 'Eau', u: '1 verre', std: 0 },
]
export const PRESET_DEFAULTS = { biere: [50, 5], vin: [12, 13], cocktail: [15, 11], shot: [3, 40], soft: [33, 0], eau: [25, 0] }

// Qui doit combien à qui, à parts égales entre ceux qui sont venus
export function settle(expenses, people) {
  if (!people.length || !expenses.length) return []
  const bal = {}
  people.forEach((p) => (bal[p] = 0))
  expenses.forEach((e) => {
    bal[e.paid_by] = (bal[e.paid_by] || 0) + Number(e.amount)
    people.forEach((p) => (bal[p] -= Number(e.amount) / people.length))
  })
  const cred = Object.entries(bal).filter((x) => x[1] > 0.01).sort((a, b) => b[1] - a[1])
  const debt = Object.entries(bal).filter((x) => x[1] < -0.01).sort((a, b) => a[1] - b[1])
  const out = []
  let i = 0, j = 0
  while (i < debt.length && j < cred.length) {
    const m = Math.min(-debt[i][1], cred[j][1])
    out.push({ from: debt[i][0], to: cred[j][0], amt: Math.round(m * 100) / 100 })
    debt[i][1] += m; cred[j][1] -= m
    if (debt[i][1] > -0.01) i++
    if (cred[j][1] < 0.01) j++
  }
  return out
}

// Fichier .ics pour ajouter un plan à l'agenda du téléphone
export function icsFor(plan, groupName) {
  const d = new Date(plan.starts_at)
  const end = new Date(d.getTime() + 3 * 3600e3)
  const f = (x) => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const esc = (s) => String(s || '').replace(/[,;\\]/g, (m) => '\\' + m).replace(/\n/g, '\\n')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//app-potes//FR', 'BEGIN:VEVENT',
    `UID:${plan.id}@app-potes`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(d)}`, `DTEND:${f(end)}`,
    `SUMMARY:${esc(plan.title)}`, `LOCATION:${esc(plan.place)}`, `DESCRIPTION:${esc(groupName)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT3H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(plan.title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}

// Réduit une photo avant envoi (max 1600 px, JPEG)
export async function compressImage(file, max = 1600) {
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) return file
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', 0.82))
}
