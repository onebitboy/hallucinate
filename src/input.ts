import type { Vec3 } from './types.ts'

let alternativeInput = true

export function readMoveInput(keys: Set<string>, target: Vec3) {
  const left = alternativeInput ? 'a' : 'j'
  const right = alternativeInput ? 'd' : 'l'
  const forward = alternativeInput ? 'w' : 'i'
  const back = alternativeInput ? 's' : 'k'

  target[0] = Number(keys.has(right) || keys.has('arrowright')) - Number(keys.has(left) || keys.has('arrowleft'))
  target[1] = 0
  target[2] = Number(keys.has(forward) || keys.has('arrowup')) - Number(keys.has(back) || keys.has('arrowdown'))

  return target
}

export function setAlternativeInput(value: boolean) {
  alternativeInput = value
}

export function bindKeyboardInput(options: {
  activeInput: HTMLInputElement
  keys: Set<string>
  openChatInput: () => void
  setAlternativeInput: (value: boolean) => void
  toggleHelp: () => void
  startJumping: () => void
  stopJumping: () => void
  startWave: () => void
  stopWave: () => void
  cycleHair: (direction: number) => void
  cycleHairColor: (direction: number) => void
  cycleSkin: (direction: number) => void
  cycleIdle: (direction: number) => void
  cycleShirt: (direction: number) => void
  cyclePants: (direction: number) => void
  cycleAccessory: (direction: number) => void
}) {
  addEventListener('keydown', event => {
    if (document.activeElement === options.activeInput) {
      return
    }

    if (event.code === 'Tab') {
      event.preventDefault()
      alternativeInput = !alternativeInput
      options.keys.clear()
      options.setAlternativeInput(alternativeInput)
      return
    }

    const key = event.key.toLowerCase()

    if (key === 'h') {
      options.toggleHelp()
      return
    }

    if (key === 't') {
      event.preventDefault()
      options.openChatInput()
      return
    }

    if (event.code === 'Space') {
      event.preventDefault()

      if (options.keys.has(event.code)) {
        return
      }

      options.keys.add(event.code)
      options.startJumping()
      return
    }

    if (key === 'v') {
      options.startWave()
      return
    }

    if ((!alternativeInput && key === 'q') || (alternativeInput && key === 'u')) {
      options.cycleHair(-1)
      return
    }

    if ((!alternativeInput && key === 'w') || (alternativeInput && key === 'i')) {
      options.cycleHair(1)
      return
    }

    if ((!alternativeInput && key === 'd') || (alternativeInput && key === 'l')) {
      options.cycleIdle(-1)
      return
    }

    if ((!alternativeInput && key === 'f') || (alternativeInput && key === ';')) {
      options.cycleIdle(1)
      return
    }

    if ((!alternativeInput && event.key === '1') || (alternativeInput && event.key === '7')) {
      options.cycleHairColor(-1)
      return
    }

    if ((!alternativeInput && event.key === '2') || (alternativeInput && event.key === '8')) {
      options.cycleHairColor(1)
      return
    }

    if ((!alternativeInput && event.key === '3') || (alternativeInput && event.key === '9')) {
      options.cycleSkin(-1)
      return
    }

    if ((!alternativeInput && event.key === '4') || (alternativeInput && event.key === '0')) {
      options.cycleSkin(1)
      return
    }

    if ((!alternativeInput && key === 'a') || (alternativeInput && key === 'j')) {
      options.cycleShirt(-1)
      return
    }

    if ((!alternativeInput && key === 's') || (alternativeInput && key === 'k')) {
      options.cycleShirt(1)
      return
    }

    if ((!alternativeInput && key === 'z') || (alternativeInput && key === 'm')) {
      options.cyclePants(-1)
      return
    }

    if ((!alternativeInput && key === 'x') || (alternativeInput && key === ',')) {
      options.cyclePants(1)
      return
    }

    if ((!alternativeInput && key === 'e') || (alternativeInput && key === 'o')) {
      options.cycleAccessory(-1)
      return
    }

    if ((!alternativeInput && key === 'r') || (alternativeInput && key === 'p')) {
      options.cycleAccessory(1)
      return
    }

    options.keys.add(key)
  })

  addEventListener('keyup', event => {
    const key = event.key.toLowerCase()

    if (key === 'v') {
      options.stopWave()
      return
    }

    if (event.code === 'Space') {
      event.preventDefault()
      options.stopJumping()
    }

    options.keys.delete(key)
    options.keys.delete(event.code)
  })
}
