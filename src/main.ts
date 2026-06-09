import './style.css'
import { getDomElements } from './dom-elements.ts'
import { afterNextPaint, setIntroLoadProgress } from './startup.ts'

document.documentElement.dataset.touchControls = String(usesTouchControls())

const domElements = getDomElements()

document.body.dataset.introVisible = 'true'
document.body.dataset.introReady = 'false'
setIntroLoadProgress(domElements, 1)
await afterNextPaint()
setIntroLoadProgress(domElements, 2)
await import('./club-app.ts')

if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(e => console.error(e))
  })
}

function usesTouchControls() {
  const platform = navigator.platform
  const agent = navigator.userAgent

  return matchMedia('(pointer: coarse)').matches
    || innerWidth <= 1180
    || (/iPad|iPhone|Android/.test(agent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1))
}
