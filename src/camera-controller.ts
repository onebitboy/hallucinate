import { characterFloor } from './character-data.ts'
import { clamp, lengthSq, lerpVec3, mix, smoothAngle } from './math.ts'
import { outsideBounds, roomBounds } from './scene-data.ts'
import { collideBuildingWalls, isOutside, walkHeight } from './scene.ts'
import type { Vec3 } from './types.ts'

export function createCameraController(canvas: HTMLCanvasElement, characterPosition: Vec3) {
  const position: Vec3 = [-2.2, 0.15, -9.0]
  const target: Vec3 = [-2.2, -0.75, -6.8]
  let turn = 0
  let dragX = 0
  let dragY = 0
  let pitch = 0
  let dragging = false
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
      dragX = event.clientX
      dragY = event.clientY
    }
  })

  canvas.addEventListener('pointerup', event => {
    dragging = false
    returning = true
    canvas.releasePointerCapture(event.pointerId)
  })

  canvas.addEventListener('pointercancel', event => {
    dragging = false
    returning = true
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
    update(delta: number, input: Vec3, characterTurn: number) {
      const moving = lengthSq(input) > 0

      if (!dragging && wasMoving && !moving) {
        returning = true
      }

      if (!dragging && ((moving && input[2] >= 0) || returning)) {
        const turnSpeed = returning ? 5 : mix(0.8, 2.2, input[2])

        turn = smoothAngle(turn, characterTurn, turnSpeed, delta)
        pitch = mix(pitch, 0, 1 - Math.exp(-4 * delta))

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
      const outside = isOutside(characterPosition)
      const time = performance.now() * 0.001
      const distance = outside ? 2.2 : cameraDanceDistance(time)
      const bounce = outside ? 0 : cameraDanceBounce(time)
      const ideal: Vec3 = [
        characterPosition[0] - Math.sin(turn) * distance,
        characterPosition[1] + 1.35 + pitch + bounce,
        characterPosition[2] - Math.cos(turn) * distance,
      ]

      ideal[0] = outside
        ? clamp(ideal[0], outsideBounds.left + 1, outsideBounds.right - 1)
        : clamp(ideal[0], roomBounds.left + 0.4, roomBounds.right - 0.4)
      ideal[1] = clamp(ideal[1], characterFloor + 0.35, 4.3)
      ideal[2] = outside
        ? clamp(ideal[2], outsideBounds.back + 1, outsideBounds.front - 1)
        : clamp(ideal[2], roomBounds.back + 0.2, roomBounds.front - 0.2)

      if (outside) {
        collideBuildingWalls(ideal, 0.65)
      }

      lerpVec3(position, ideal, 1 - Math.pow(0.015, delta))
      if (outside) {
        collideBuildingWalls(position, 0.65)
      }

      position[1] = Math.max(position[1], walkHeight(position[0], characterPosition[1], position[2]) + 0.35)
    },
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
