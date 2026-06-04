import { characterFloor } from './character-data.ts'
import type { WallProjector } from './projection.ts'
import type { Vec3 } from './types.ts'

type StyleAction = {
  label: string
  apply: (direction: number) => void
}

type PointerState = {
  id: number
  x: number
  y: number
  moved: boolean
  longPressed: boolean
  timer: ReturnType<typeof setTimeout>
}

const tapMoveThreshold = 10
const longPressDelay = 520
const actions: StyleAction[] = []

export function createMobileControls(options: {
  cycleHair: (direction: number) => void
  cycleHairColor: (direction: number) => void
  cycleSkin: (direction: number) => void
  cycleIdle: (direction: number) => void
  cycleShirt: (direction: number) => void
  cyclePants: (direction: number) => void
  cycleAccessory: (direction: number) => void
  openChatInput: () => void
}) {
  updateTouchControlsMode()
  addEventListener('resize', updateTouchControlsMode)
  actions.length = 0
  actions.push(
    { label: 'Hair color', apply: options.cycleHairColor },
    { label: 'Hair style', apply: options.cycleHair },
    { label: 'Skin tone', apply: options.cycleSkin },
    { label: 'Top wear', apply: options.cycleShirt },
    { label: 'Bottom wear', apply: options.cyclePants },
    { label: 'Accessories', apply: options.cycleAccessory },
    { label: 'Dance move', apply: options.cycleIdle },
  )

  const root = document.createElement('div')
  const toggle = document.createElement('button')
  const panel = document.createElement('div')
  const speak = document.createElement('button')

  root.id = 'mobile-controls'
  root.dataset.open = 'false'
  toggle.id = 'mobile-menu-toggle'
  toggle.type = 'button'
  toggle.ariaLabel = 'Open menu'
  toggle.textContent = '☰'
  speak.id = 'mobile-speak'
  speak.type = 'button'
  speak.ariaLabel = 'Speak'
  speak.textContent = '💬'
  panel.id = 'mobile-menu'

  panel.append(...actions.map(actionRow))
  root.append(toggle, panel, speak)
  document.body.append(root)

  toggle.addEventListener('click', () => {
    const open = root.dataset.open !== 'true'

    root.dataset.open = String(open)
    toggle.ariaLabel = open ? 'Close menu' : 'Open menu'
    document.documentElement.dataset.videoHintDismissed = 'true'
  })
  speak.addEventListener('click', options.openChatInput)

  return root
}

function updateTouchControlsMode() {
  document.documentElement.dataset.touchControls = String(usesTouchControls())
}

function usesTouchControls() {
  const platform = navigator.platform
  const agent = navigator.userAgent

  return matchMedia('(pointer: coarse)').matches
    || innerWidth <= 1180
    || (/iPad|iPhone|Android/.test(agent) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1))
}

export function bindTapDestination(options: {
  canvas: HTMLCanvasElement
  jump: (target: Vec3) => void
  projector: WallProjector
  setDestination: (value: Vec3) => void
  ignorePointer?: (event: PointerEvent) => boolean
}) {
  let pointer: PointerState | undefined

  options.canvas.addEventListener('pointerdown', event => {
    if (options.ignorePointer?.(event)) {
      return
    }

    if (event.pointerType === 'mouse') {
      return
    }

    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      longPressed: false,
      timer: setTimeout(() => {
        if (pointer?.id === event.pointerId && !pointer.moved) {
          const target = screenGroundPoint(event.clientX, event.clientY, options.canvas, options.projector)

          if (!target) {
            return
          }

          pointer.longPressed = true
          options.jump(target)
        }
      }, longPressDelay),
    }
  })

  options.canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer?.id) {
      return
    }

    const dx = event.clientX - pointer.x
    const dy = event.clientY - pointer.y

    pointer.moved ||= dx * dx + dy * dy > tapMoveThreshold * tapMoveThreshold
    if (pointer.moved) {
      clearTimeout(pointer.timer)
    }
  })

  options.canvas.addEventListener('pointerup', event => {
    if (event.pointerId !== pointer?.id) {
      return
    }

    const released = pointer

    pointer = undefined
    clearTimeout(released.timer)
    if (released.moved || released.longPressed) {
      return
    }

    const target = screenGroundPoint(event.clientX, event.clientY, options.canvas, options.projector)

    if (target) {
      options.setDestination(target)
    }
  })

  options.canvas.addEventListener('pointercancel', event => {
    if (event.pointerId === pointer?.id) {
      clearTimeout(pointer.timer)
      pointer = undefined
    }
  })
}

function actionRow(action: StyleAction) {
  const row = document.createElement('div')
  const previous = document.createElement('button')
  const next = document.createElement('button')
  const label = document.createElement('span')

  row.className = 'mobile-menu-row'
  previous.type = 'button'
  next.type = 'button'
  previous.textContent = '‹'
  next.textContent = '›'
  label.textContent = action.label
  previous.addEventListener('click', () => action.apply(-1))
  next.addEventListener('click', () => action.apply(1))
  row.append(previous, label, next)

  return row
}

function screenGroundPoint(x: number, y: number, canvas: HTMLCanvasElement, projector: WallProjector): Vec3 | undefined {
  const rect = canvas.getBoundingClientRect()
  const ndcX = ((x - rect.left) / rect.width) * 2 - 1
  const ndcY = 1 - ((y - rect.top) / rect.height) * 2
  const rayX = -projector.cameraZX + projector.cameraXX * ndcX * projector.aspect / projector.f
    + projector.cameraYX * ndcY / projector.f
  const rayY = -projector.cameraZY + projector.cameraXY * ndcX * projector.aspect / projector.f
    + projector.cameraYY * ndcY / projector.f
  const rayZ = -projector.cameraZZ + projector.cameraXZ * ndcX * projector.aspect / projector.f
    + projector.cameraYZ * ndcY / projector.f
  const t = (characterFloor - projector.eyeY) / rayY

  if (t <= 0) {
    return undefined
  }

  return [
    projector.eyeX + rayX * t,
    characterFloor,
    projector.eyeZ + rayZ * t,
  ]
}
