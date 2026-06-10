import { characterFloor } from './character-data.ts'
import { clamp, lengthSq, lerpVec3, mix, smoothAngle } from './math.ts'
import { backDoor, loftBounds, outsideBounds, outsideDjBooth, outsideStage, outsideToilets, roomBounds,
  tent } from './scene-data.ts'
import { collideBuildingWalls, isOutside, roomAt, walkHeight } from './scene.ts'
import type { Vec3 } from './types.ts'

const insideCameraFront = roomBounds.front - 0.2
const outsideCameraFront = outsideStage.z - outsideStage.depth / 2 - 0.35
const manualCameraHoldTime = 5000
const cameraBouncePauseTime = 2500
const dragMoveThreshold = 3

export function createCameraController(canvas: HTMLCanvasElement, characterPosition: Vec3) {
  const position: Vec3 = [-2.2, 0.15, -9.0]
  const target: Vec3 = [-2.2, -0.75, -6.8]
  let turn = 0
  let dragX = 0
  let dragY = 0
  let pitch = 0
  let dragging = false
  let dragTouchId = -1
  let dragMoved = false
  let holdingManualCamera = false
  let manualCameraHoldUntil = 0
  let cameraBouncePausedUntil = 0
  let returning = false
  let wasMoving = false

  function startDrag(x: number, y: number) {
    dragging = true
    dragMoved = false
    returning = false
    dragX = x
    dragY = y
  }

  function moveDrag(x: number, y: number) {
    const dx = x - dragX
    const dy = y - dragY

    if (!dragMoved && dx * dx + dy * dy < dragMoveThreshold * dragMoveThreshold) {
      return
    }

    dragMoved = true
    turn -= dx * 0.005
    pitch = clamp(pitch + dy * 0.018, -2.4, 4.2)
    holdingManualCamera = true
    manualCameraHoldUntil = performance.now() + manualCameraHoldTime
    cameraBouncePausedUntil = performance.now() + cameraBouncePauseTime
    dragX = x
    dragY = y
  }

  canvas.style.touchAction = 'none'
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') {
      return
    }

    event.preventDefault()
    startDrag(event.clientX, event.clientY)
    canvas.setPointerCapture(event.pointerId)
  })

  canvas.addEventListener('pointermove', event => {
    if (dragging) {
      event.preventDefault()
      moveDrag(event.clientX, event.clientY)
    }
  })

  canvas.addEventListener('pointerup', event => {
    dragging = false
    releasePointerCapture(canvas, event.pointerId)
  })

  canvas.addEventListener('pointercancel', event => {
    dragging = false
    releasePointerCapture(canvas, event.pointerId)
  })

  canvas.addEventListener('touchstart', event => {
    if (dragTouchId !== -1 || interactiveTarget(event.target)) {
      return
    }

    const touch = event.changedTouches[0]!

    event.preventDefault()
    dragTouchId = touch.identifier
    startDrag(touch.clientX, touch.clientY)
  }, { passive: false })

  canvas.addEventListener('touchmove', event => {
    const touch = [...event.changedTouches].find(next => next.identifier === dragTouchId)

    if (!touch) {
      return
    }

    event.preventDefault()
    moveDrag(touch.clientX, touch.clientY)
  }, { passive: false })

  canvas.addEventListener('touchend', event => {
    const touch = [...event.changedTouches].find(next => next.identifier === dragTouchId)

    if (touch) {
      event.preventDefault()
      dragging = false
      dragTouchId = -1
    }
  }, { passive: false })

  canvas.addEventListener('touchcancel', event => {
    const touch = [...event.changedTouches].find(next => next.identifier === dragTouchId)

    if (touch) {
      dragging = false
      dragTouchId = -1
    }
  })

  document.addEventListener('mousedown', event => {
    if (event.button !== 0 || interactiveTarget(event.target)) {
      return
    }

    event.preventDefault()
    startDrag(event.clientX, event.clientY)
  }, { capture: true })

  document.addEventListener('mousemove', event => {
    if (!dragging) {
      return
    }

    event.preventDefault()
    moveDrag(event.clientX, event.clientY)
  }, { capture: true })

  document.addEventListener('mouseup', () => {
    dragging = false
  }, { capture: true })

  return {
    position,
    target,
    get turn() {
      return turn
    },
    set turn(value: number) {
      turn = value
    },
    get() {
      return {
        eye: [position[0], position[1], position[2]] as Vec3,
        center: [target[0], target[1], target[2]] as Vec3,
      }
    },
    update(
      delta: number,
      input: Vec3,
      characterTurn: number,
      bounceActive: boolean,
      lookDown = false,
      loft = false,
      cameraUp?: Vec3,
    ) {
      const moving = lengthSq(input) > 0
      const movingBack = moving && input[2] < 0

      if (dragging && !dragMoved) {
        wasMoving = moving
        return
      }

      if (holdingManualCamera && !dragging && performance.now() > manualCameraHoldUntil) {
        holdingManualCamera = false
      }

      if (lookDown && !dragging) {
        pitch = mix(pitch, 0.9, 1 - Math.exp(-7 * delta))
      }

      if (holdingManualCamera && moving) {
        holdingManualCamera = false
        returning = true
      }

      if (!dragging && wasMoving && !moving) {
        returning = true
      }

      if (!dragging && movingBack) {
        returning = false
      }

      if (!dragging && ((moving && input[2] >= 0) || returning)) {
        const turnSpeed = returning ? 5 : mix(0.8, 2.2, input[2])

        turn = smoothAngle(turn, characterTurn, turnSpeed, delta)
        pitch = mix(pitch, lookDown ? 0.9 : 0, 1 - Math.exp(-4 * delta))

        if (returning) {
          const angle = Math.abs(Math.atan2(Math.sin(characterTurn - turn), Math.cos(characterTurn - turn)))

          if (angle < 0.01 && Math.abs(pitch) < 0.01) {
            returning = false
          }
        }
      }

      wasMoving = moving

      const basis = cameraBasis(turn, cameraUp)
      const targetHeight = 1.2

      target[0] = characterPosition[0] + basis.upX * targetHeight
      target[1] = characterPosition[1] + basis.upY * targetHeight
      target[2] = characterPosition[2] + basis.upZ * targetHeight
      const zone = loft ? 'loft' : roomAt(characterPosition)

      if (holdingManualCamera && !dragging) {
        clampCameraToZone(position, zone, characterPosition)
        wasMoving = moving
        return
      }

      const outside = !loft && zone !== 'inside'
      const cameraOutside = isOutside(position)
      const crossingOutside = outside && !cameraOutside
      const time = performance.now() * 0.001
      const bouncePaused = dragging || performance.now() < cameraBouncePausedUntil
      const bounceAllowed = bounceActive && !bouncePaused
      const distance = bounceAllowed && !outside ? cameraDanceDistance(time) : 2.2
      const bounce = bounceAllowed ? cameraDanceBounce(time) : 0
      const cameraHeight = 1.35 + pitch + bounce
      const ideal: Vec3 = [
        characterPosition[0] - basis.forwardX * distance + basis.upX * cameraHeight,
        characterPosition[1] - basis.forwardY * distance + basis.upY * cameraHeight,
        characterPosition[2] - basis.forwardZ * distance + basis.upZ * cameraHeight,
      ]

      ideal[0] = zone === 'loft'
        ? clamp(ideal[0], loftBounds.left + 0.65, loftBounds.right - 0.65)
        : zone === 'tent'
        ? clamp(ideal[0], tent.x - tent.radius + 1, tent.x + tent.radius - 1)
        : outside
        ? clamp(ideal[0], outsideBounds.left + 1, outsideBounds.right - 1)
        : clamp(ideal[0], roomBounds.left + 0.4, roomBounds.right - 0.4)
      ideal[1] = clamp(ideal[1], characterFloor + 0.35, 4.3)
      ideal[2] = zone === 'loft'
        ? clamp(ideal[2], loftBounds.back + 0.65, loftBounds.front - 0.65)
        : zone === 'tent'
        ? clamp(ideal[2], tent.z - tent.radius + 1, tent.z + tent.radius - 1)
        : outside
        ? clamp(ideal[2], outsideBounds.back + 1, outsideBounds.front - 1)
        : clamp(ideal[2], roomBounds.back + 0.2, insideCameraFront)
      clampCameraToZone(ideal, zone, characterPosition)

      if (crossingOutside && ideal[2] < insideCameraFront) {
        ideal[0] = backDoor.x
        ideal[2] = insideCameraFront
      }

      const crossing = outside !== cameraOutside
      const cameraCollides = outside && !crossing

      if (cameraCollides) {
        collideBuildingWalls(ideal, 0.65)
      }

      const follow = crossingOutside ? 1 - Math.pow(0.0002, delta) : 1 - Math.pow(0.015, delta)

      lerpVec3(position, ideal, follow)
      if (cameraCollides) {
        collideBuildingWalls(position, 0.65)
      }
      clampCameraToZone(position, zone, characterPosition)

      position[1] = Math.max(position[1],
        (loft ? characterFloor : walkHeight(position[0], characterPosition[1], position[2])) + 0.35)
    },
  }
}

function cameraBasis(turn: number, up?: Vec3) {
  const sin = Math.sin(turn)
  const cos = Math.cos(turn)
  let sideX = cos
  let sideY = 0
  let sideZ = -sin
  let upX = 0
  let upY = 1
  let upZ = 0

  if (up) {
    const upLength = Math.sqrt(up[0] * up[0] + up[1] * up[1] + up[2] * up[2])

    if (upLength === 0) {
      throw new Error('Cannot orient camera with zero up vector')
    }

    upX = up[0] / upLength
    upY = up[1] / upLength
    upZ = up[2] / upLength

    const dot = sideX * upX + sideY * upY + sideZ * upZ

    sideX -= upX * dot
    sideY -= upY * dot
    sideZ -= upZ * dot

    const sideLength = Math.sqrt(sideX * sideX + sideY * sideY + sideZ * sideZ)

    if (sideLength === 0) {
      throw new Error('Cannot orient camera with parallel turn and up')
    }

    sideX /= sideLength
    sideY /= sideLength
    sideZ /= sideLength
  }

  return {
    forwardX: sideY * upZ - sideZ * upY,
    forwardY: sideZ * upX - sideX * upZ,
    forwardZ: sideX * upY - sideY * upX,
    upX,
    upY,
    upZ,
  }
}

function releasePointerCapture(canvas: HTMLCanvasElement, pointerId: number) {
  if (canvas.hasPointerCapture(pointerId)) {
    canvas.releasePointerCapture(pointerId)
  }
}

function interactiveTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLButtonElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLDialogElement
    || target instanceof HTMLAnchorElement
}

function clampCameraToZone(position: Vec3, zone: ReturnType<typeof roomAt> | 'loft', characterPosition: Vec3) {
  if (zone === 'loft') {
    position[0] = clamp(position[0], loftBounds.left + 0.65, loftBounds.right - 0.65)
    position[2] = clamp(position[2], loftBounds.back + 0.65, loftBounds.front - 0.65)
    return
  }

  if (inOutsideToilets(characterPosition)) {
    clampOutsideToiletCamera(position, characterPosition)
    return
  }

  if (zone === 'outside' && inOutsideDjCameraZone(characterPosition)) {
    position[2] = Math.min(position[2], outsideCameraFront)
    return
  }

  if (zone === 'tent') {
    clampTentCamera(position)
  }
}

function inOutsideToilets(position: Vec3) {
  return position[0] > outsideToilets.x - outsideToilets.width / 2
    && position[0] < outsideToilets.x + outsideToilets.width / 2
    && position[2] > outsideToilets.z - outsideToilets.depth / 2
    && position[2] < outsideToilets.z + outsideToilets.depth / 2
}

function inOutsideDjCameraZone(position: Vec3) {
  const side = outsideDjBooth.width / 2 + 0.45
  const back = outsideDjBooth.z - outsideDjBooth.depth / 2 - 1.2
  const front = outsideDjBooth.z + outsideDjBooth.depth / 2 + 0.9

  return position[0] > outsideDjBooth.x - side
    && position[0] < outsideDjBooth.x + side
    && position[2] > back
    && position[2] < front
}

function clampOutsideToiletCamera(position: Vec3, characterPosition: Vec3) {
  const padding = 0.42
  const dividerPadding = 0.3
  const back = outsideToilets.z - outsideToilets.depth / 2 + padding
  const front = outsideToilets.z + outsideToilets.depth / 2 - padding
  const toiletBack = characterPosition[2] < outsideToilets.z
  const minZ = toiletBack ? back : outsideToilets.z + dividerPadding
  const maxZ = toiletBack ? outsideToilets.z - dividerPadding : front

  position[0] = clamp(position[0], outsideToilets.x - outsideToilets.width / 2 + padding,
    outsideToilets.x + outsideToilets.width / 2 - padding)
  position[2] = clamp(position[2], minZ, maxZ)
}

function clampTentCamera(position: Vec3) {
  const y = position[1] - characterFloor
  const roof = clamp((y - tent.wallHeight) / (tent.height - tent.wallHeight), 0, 1)
  const radius = tent.radius * (1 - roof) - 0.7
  const x = position[0] - tent.x
  const z = position[2] - tent.z
  const distance = Math.sqrt(x * x + z * z)

  if (distance > radius) {
    position[0] = tent.x + x / distance * radius
    position[2] = tent.z + z / distance * radius
  }
}

function cameraDanceBounce(time: number) {
  const beat = (time * 2.25) % 1
  const offbeat = (time * 4.3 + 0.5) % 1
  const kick = beat < 0.08 ? beat / 0.08 : 1 - (beat - 0.08) / 0.92
  const tick = offbeat < 0.04 ? offbeat / 0.04 : 1 - (offbeat - 0.04) / 0.96

  return kick * 0.26 + tick * 0.035
}

function cameraDanceDistance(time: number) {
  const beat = (time * 2.15) % 1
  const zoom = beat < 0.1 ? beat / 0.1 : 1 - (beat - 0.1) / 0.9

  return 2.2 + zoom * 0.18
}
