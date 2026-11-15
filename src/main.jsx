import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/ui'
import './styles.css'

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="center">
        <p className="error">Un bug est passé par là : {String(this.state.error.message || this.state.error)}</p>
        <button className="btn" onClick={() => location.reload()}>Recharger l'app</button>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary><ToastProvider><App /></ToastProvider></ErrorBoundary>
  </React.StrictMode>
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').then((reg) => {
    // Chercher une nouvelle version à chaque retour sur l'app
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}) })
  }).catch(() => {}))
  // Nouvelle version installée : on recharge une fois pour l'afficher (pas au tout premier lancement)
  const hadController = !!navigator.serviceWorker.controller
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return
    reloaded = true
    location.reload()
  })
}

// Tirer l'écran vers le bas (en haut de page) pour actualiser l'app
;(() => {
  let startY = null, pull = 0
  const el = document.createElement('div')
  el.className = 'ptr'
  document.body.appendChild(el)
  const show = (d) => {
    pull = d
    el.style.transform = `translate(-50%, ${Math.min(d, 90) - 50}px)`
    el.style.opacity = String(Math.min(d / 70, 1))
    el.textContent = d > 70 ? 'Relâche pour actualiser' : 'Tire pour actualiser'
  }
  window.addEventListener('touchstart', (e) => {
    startY = window.scrollY <= 0 && !document.querySelector('.sheet-bg') && e.touches.length === 1 ? e.touches[0].clientY : null
  }, { passive: true })
  window.addEventListener('touchmove', (e) => {
    if (startY === null) return
    const d = (e.touches[0].clientY - startY) * 0.5
    if (d > 5 && window.scrollY <= 0) show(d); else if (pull) show(0)
  }, { passive: true })
  window.addEventListener('touchend', () => {
    if (startY === null) return
    startY = null
    if (pull > 70) { el.textContent = 'Actualisation…'; location.reload() } else show(0)
  }, { passive: true })
})()
