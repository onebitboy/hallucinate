import { characterFloor } from './character-data.ts'
import { clamp, lengthSq, lerpVec3, mix, smoothAngle } from './math.ts'
import { backDoor, outsideBounds, roomBounds, tent } from './scene-data.ts'
import { collideBuildingWalls, isOutside, roomAt, walkHeight } from './scene.ts'
import type { Vec3 } from './types.ts'

const insideCameraFront = roomBounds.front - 0.2
const manualCameraHoldTime = 5000

export function createCameraController(canvas: HTMLCanvasElement, characterPosition: Vec3) {
  const position: Vec3 = [-2.2, 0.15, -9.0]
  const target: Vec3 = [-2.2, -0.75, -6.8]
  let turn = 0
  let dragX = 0
  let dragY = 0
  let pitch = 0
  let dragging = false
  let holdingManualCamera = false
  let manualCameraHoldUntil = 0
  let returning = false
  let wasMoving = false

  canvas.style.touchAction = 'none'
  canvas.addEventListener('pointerdown', event => {
    dragging = true
    returning = false
    dragX = event.clientX
    dragY = event.clientY
    canvas.setPointerCapture(event.pointerId)
  })

  canvas.addEventListener('pointermove', event => {
    if (dragging) {
      turn -= (event.clientX - dragX) * 0.005
      pitch = clamp(pitch + (event.clientY - dragY) * 0.018, -2.4, 4.2)
      holdingManualCamera = true
      manualCameraHoldUntil = performance.now() + manualCameraHoldTime
      dragX = event.clientX
      dragY = event.clientY
    }
  })

  canvas.addEventListener('pointerup', event => {
    dragging = false
    canvas.releasePointerCapture(event.pointerId)
  })

  canvas.addEventListener('pointercancel', event => {
    dragging = false
    canvas.releasePointerCapture(event.pointerId)
  })

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
    update(delta: number, input: Vec3, characterTurn: number, bounceActive: boolean, lookDown = false) {
      const moving = lengthSq(input) > 0
      const movingBack = moving && input[2] < 0

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

      target[0] = characterPosition[0]
      target[1] = characterPosition[1] + 1.2
      target[2] = characterPosition[2]
      const zone = roomAt(characterPosition)

      if (holdingManualCamera && !dragging) {
        clampCameraToZone(position, zone)
        wasMoving = moving
        return
      }

      const outside = zone !== 'inside'
      const cameraOutside = isOutside(position)
      const crossingOutside = outside && !cameraOutside
      const time = performance.now() * 0.001
      const distance = bounceActive && !outside ? cameraDanceDistance(time) : 2.2
      const bounce = bounceActive ? cameraDanceBounce(time) : 0
      const ideal: Vec3 = [
        characterPosition[0] - Math.sin(turn) * distance,
        characterPosition[1] + 1.35 + pitch + bounce,
        characterPosition[2] - Math.cos(turn) * distance,
      ]

      ideal[0] = zone === 'tent'
        ? clamp(ideal[0], tent.x - tent.radius + 1, tent.x + tent.radius - 1)
        : outside
          ? clamp(ideal[0], outsideBounds.left + 1, outsideBounds.right - 1)
          : clamp(ideal[0], roomBounds.left + 0.4, roomBounds.right - 0.4)
      ideal[1] = clamp(ideal[1], characterFloor + 0.35, 4.3)
      ideal[2] = zone === 'tent'
        ? clamp(ideal[2], tent.z - tent.radius + 1, tent.z + tent.radius - 1)
        : outside
          ? clamp(ideal[2], outsideBounds.back + 1, outsideBounds.front - 1)
          : clamp(ideal[2], roomBounds.back + 0.2, insideCameraFront)
      clampCameraToZone(ideal, zone)

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
      clampCameraToZone(position, zone)

      position[1] = Math.max(position[1], walkHeight(position[0], characterPosition[1], position[2]) + 0.35)
    },
  }
}

function clampCameraToZone(position: Vec3, zone: ReturnType<typeof roomAt>) {
  if (zone === 'tent') {
    clampTentCamera(position)
  }
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
