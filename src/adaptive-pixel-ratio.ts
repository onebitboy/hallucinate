import { clamp, mix } from './math.ts'

import { isMobileUserAgent } from './device.ts'

export function createAdaptiveResolution() {
  const pixelRatioMin = 0.5
  const pixelRatioStep = 0.15
  const pixelRatioSlowFrame = 1 / 55
  const bloomScaleMin = isMobileUserAgent() ? 0.5 : 1.5
  const bloomScaleMax = isMobileUserAgent() ? 1 : 2
  const bloomScaleStep = 0.1
  const bloomScaleSlowFrame = 1 / 54
  const fastFrame = 1 / 59
  let pixelRatio = window.devicePixelRatio
  let bloomScale = bloomScaleMax
  let frameTime = 1 / 60
  let pixelRatioChangeAt = 0
  let bloomScaleChangeAt = 0

  const state = () => ({
    pixelRatio,
    bloomScale,
  })

  function updatePixelRatio(step: number, stamp: number) {
    pixelRatio = clamp(pixelRatio + step, pixelRatioMin, window.devicePixelRatio)
    pixelRatioChangeAt = stamp + (step > 0 ? 2000 : 250)
  }

  function updateBloomScale(step: number, stamp: number) {
    bloomScale = clamp(bloomScale + step, bloomScaleMin, bloomScaleMax)
    bloomScaleChangeAt = stamp + (step > 0 ? 2500 : 250)
  }

  return {
    pixelRatio: () => pixelRatio,
    bloomScale: () => bloomScale,
    maxBloomScale: () => bloomScaleMax,
    update(delta: number, stamp: number) {
      if (delta === 0) {
        return state()
      }

      frameTime = mix(frameTime, delta, 0.08)
      pixelRatio = clamp(pixelRatio, pixelRatioMin, window.devicePixelRatio)

      if (frameTime > pixelRatioSlowFrame && pixelRatio > pixelRatioMin && stamp >= pixelRatioChangeAt) {
        updatePixelRatio(-pixelRatioStep, stamp)
      }
      else if (frameTime > bloomScaleSlowFrame && pixelRatio <= pixelRatioMin && bloomScale > bloomScaleMin
        && stamp >= bloomScaleChangeAt)
      {
        updateBloomScale(-bloomScaleStep, stamp)
      }
      else if (frameTime < fastFrame && bloomScale < bloomScaleMax && stamp >= bloomScaleChangeAt) {
        updateBloomScale(bloomScaleStep, stamp)
      }
      else if (frameTime < fastFrame && bloomScale >= bloomScaleMax && pixelRatio < window.devicePixelRatio
        && stamp >= pixelRatioChangeAt)
      {
        updatePixelRatio(pixelRatioStep, stamp)
      }

      return state()
    },
  }
}
