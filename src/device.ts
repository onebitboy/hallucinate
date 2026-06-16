const touchControlsMaxWidth = 1024

export function isMobileUserAgent() {
  const platform = navigator.platform
  const agent = navigator.userAgent

  return /iPad|iPhone|Android/.test(agent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isTouchEnabled() {
  return navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches
}

export function usesTouchMovementControls() {
  return isMobileUserAgent() || isTouchEnabled()
}

export function usesTouchControls() {
  return usesTouchMovementControls() || innerWidth <= touchControlsMaxWidth
}
