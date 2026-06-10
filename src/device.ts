export function isMobileUserAgent() {
  const platform = navigator.platform
  const agent = navigator.userAgent

  return /iPad|iPhone|Android/.test(agent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function usesTouchControls() {
  return matchMedia('(pointer: coarse)').matches
    || innerWidth <= 1180
    || isMobileUserAgent()
}
