// Estimation du taux d'alcool (formule de Widmark simplifiée) et messages de prévention.
// C'est une estimation grossière : elle ne dit jamais si on peut conduire.

const R = { h: 0.7, f: 0.6 } // coefficient de diffusion
const ELIMINATION = 0.15 // g/L éliminés par heure, en moyenne

export function estimateBac(drinks, settings, at = new Date()) {
  if (!settings?.weight_kg || !settings?.sex) return null
  const alc = drinks.filter((d) => Number(d.units) > 0 && new Date(d.drunk_at) <= at)
  if (!alc.length) return { bac: 0, soberAt: null }
  const grams = alc.reduce((a, d) => a + Number(d.units) * 10, 0)
  const first = Math.min(...alc.map((d) => new Date(d.drunk_at).getTime()))
  const hours = Math.max(0, (at.getTime() - first) / 3600e3)
  const bac = Math.max(0, grams / (Number(settings.weight_kg) * R[settings.sex]) - ELIMINATION * hours)
  const soberAt = bac > 0 ? new Date(at.getTime() + (bac / ELIMINATION) * 3600e3) : null
  return { bac, soberAt }
}

export const fmtBac = (b) => b.toFixed(2).replace('.', ',')

// Message selon le nombre de verres standard de la soirée
export function preventionMessage(units) {
  if (units >= 8) return { level: 'high', text: "Là, ça fait vraiment beaucoup. Pause, de l'eau, et reste avec tes potes. Si quelqu'un ne va pas bien : appelle le 15 ou le 112." }
  if (units >= 6) return { level: 'high', text: "6 verres ou plus en une soirée, c'est ce qu'on appelle une alcoolisation ponctuelle importante : plus de risques d'accident, de malaise et de trous de mémoire. On ralentit ?" }
  if (units >= 5) return { level: 'mid', text: "5 verres, c'est déjà beaucoup. Un verre d'eau et un truc à manger avant le prochain ?" }
  if (units >= 3) return { level: 'low', text: "Tu as dépassé le repère de 2 verres par jour. Pense à alterner avec de l'eau." }
  if (units > 0) return { level: 'low', text: "Pense à boire de l'eau entre deux verres." }
  return null
}

// Petit message au moment où on franchit un seuil
export function thresholdToast(before, after) {
  for (const t of [8, 6, 5, 3]) if (before < t && after >= t) return preventionMessage(after).text
  return null
}
