import { characterFloor } from './character-data.ts'
import { readMoveInput } from './input.ts'
import {
  lengthSq,
  mix,
  normalizeInto,
  smoothAngle,
} from './math.ts'
import { findPath } from './pathfinding.ts'
import { collideRoom, isOutside, seatAt, walkHeight } from './scene.ts'
import type { Seat } from './scene.ts'
import type { BottomMode, CharacterMode, CircleBounds, Vec3 } from './types.ts'

const jumpDuration = 0.8
const jumpHeight = 1.65
const jumpRiseDuration = 0.4
const waveDuration = 95 / 30
const waveLoopStart = 28 / 30
const waveLoopEnd = 62 / 30

export function createLocalCharacter(keys: Set<string>) {
  const position: Vec3 = [-2.2, -1.95, -6.8]
  const input: Vec3 = [0, 0, 0]
  const forward: Vec3 = [0, 0, 0]
  const right: Vec3 = [0, 0, 0]
  const direction: Vec3 = [0, 0, 0]
  const destination: Vec3 = [0, 0, 0]
  const jumpTarget: Vec3 = [0, 0, 0]
  let path: Vec3[] = []
  let destinationSeat = ''
  let turn = 0
  let motionBlend = 0
  let mode: CharacterMode = 'stand'
  let velocityY = 0
  let seated = false
  let couchRelease = 0
  let seat = ''
  let hasDestination = false
  let hasJumpTarget = false
  let jumpTime = 0
  let jumpElapsed = 0
  let jumpHeld = false
  let waveActive = false
  let waveHeld = false
  let waveElapsed = 0
  let waveOutElapsed = 0

  function startJump() {
    hasDestination = false
    hasJumpTarget = false
    destinationSeat = ''
    path = []
    jumpTime = jumpDuration
    jumpElapsed = 0
    mode = 'jump'
    motionBlend = 0
  }

  return {
    position,
    input,
    get turn() {
      return turn
    },
    set turn(value: number) {
      turn = value
    },
    get motionBlend() {
      return motionBlend
    },
    get mode() {
      return mode
    },
    get jumping() {
      return jumpTime > 0
    },
    get modeTime() {
      return mode === 'wave' ? waveElapsed : mode === 'waveOut' ? waveOutElapsed : jumpElapsed
    },
    get velocityY() {
      return velocityY
    },
    set velocityY(value: number) {
      velocityY = value
    },
    setDestination(value: Vec3, targetSeat?: Seat) {
      destination[0] = value[0]
      destination[1] = value[1]
      destination[2] = value[2]
      destinationSeat = targetSeat?.id ?? ''
      hasDestination = true
      hasJumpTarget = false
      path = []
    },
    readInput() {
      return readMoveInput(keys, input)
    },
    startJumping() {
      jumpHeld = !seated

      if (!seated && jumpTime === 0) {
        startJump()
      }
    },
    stopJumping() {
      jumpHeld = false
    },
    jump() {
      if (seated || jumpTime > 0) {
        return
      }

      startJump()
    },
    jumpToward(target: Vec3) {
      if (seated || jumpTime > 0) {
        return
      }

      startJump()
      jumpTarget[0] = target[0]
      jumpTarget[1] = target[1]
      jumpTarget[2] = target[2]
      hasJumpTarget = true
    },
    startWave() {
      if (seated || jumpTime > 0) {
        return
      }

      if (waveActive) {
        waveHeld = true
        return
      }

      hasDestination = false
      hasJumpTarget = false
      destinationSeat = ''
      path = []
      waveActive = true
      waveHeld = true
      waveElapsed = 0
      waveOutElapsed = 0
      mode = 'wave'
      motionBlend = 0
    },
    stopWave() {
      waveHeld = false
    },
    update(
      delta: number,
      cameraTurn: number,
      outsideTree: CircleBounds,
      bottomMode: BottomMode,
      occupiedSeats: Set<string>,
      takeSeat: (seat: Seat) => void,
    ) {
      this.readInput()
      if (lengthSq(input) > 0) {
        hasDestination = false
        hasJumpTarget = false
        destinationSeat = ''
        path = []
      }
      if (hasDestination) {
        if (path.length === 0) {
          try {
            path = findPath(position, destination, outsideTree)
          }
          catch (e) {
            void e
            hasDestination = false
            destinationSeat = ''
            path = []
          }
        }

        while (path.length > 0 && waypointReached(position, path[0]!)) {
          path.shift()
        }

        hasDestination = path.length > 0
      }
      if (hasDestination) {
        const target = path[0]!
        const dx = target[0] - position[0]
        const dz = target[2] - position[2]
        const distanceSq = dx * dx + dz * dz

        const distance = Math.sqrt(distanceSq)
        const worldX = dx / distance
        const worldZ = dz / distance
        const sin = Math.sin(cameraTurn)
        const cos = Math.cos(cameraTurn)

        input[0] = -cos * worldX + sin * worldZ
        input[1] = 0
        input[2] = sin * worldX + cos * worldZ
      }
      if (hasJumpTarget) {
        if (waypointReached(position, jumpTarget)) {
          hasJumpTarget = false
          input[0] = 0
          input[1] = 0
          input[2] = 0
        }
        else {
          turn = smoothAngle(turn, Math.atan2(jumpTarget[0] - position[0], jumpTarget[2] - position[2]), 10, delta)
          input[0] = 0
          input[1] = 0
          input[2] = 1
        }
      }
      const moving = lengthSq(input) > 0

      couchRelease = Math.max(0, couchRelease - delta)
      if (jumpTime > 0) {
        jumpTime = Math.max(0, jumpTime - delta)
        jumpElapsed += delta
      }
      if (jumpHeld && jumpTime === 0 && !seated) {
        startJump()
      }
      if (waveActive) {
        waveElapsed += delta

        if (!waveHeld && waveElapsed >= waveLoopStart) {
          waveActive = false
          waveOutElapsed = 0
          mode = 'waveOut'
        }
      }
      else if (mode === 'waveOut') {
        waveOutElapsed += delta

        if (waveOutElapsed >= waveDuration - waveLoopEnd) {
          waveActive = false
          mode = moving ? 'run' : 'stand'
        }
      }

      if (seated) {
        if (hasDestination || hasJumpTarget || input[2] > 0) {
          seated = false
          couchRelease = 0.35
          occupiedSeats.delete(seat)
          seat = ''
          mode = 'run'
          motionBlend = 1
          position[0] += Math.sin(turn) * 0.46
          position[2] += Math.cos(turn) * 0.46
        }
        else {
          motionBlend = 0
          mode = bottomMode === 'pants' ? 'manSitting' : 'womanSitting'

          return
        }
      }

      if (jumpTime > 0) {
        mode = 'jump'
        motionBlend = 0
        waveActive = false
        waveHeld = false
        waveOutElapsed = 0
      }
      else if (waveActive && !moving) {
        mode = 'wave'
        motionBlend = 0
      }
      else if (waveActive) {
        motionBlend = mix(motionBlend, 1, 1 - Math.exp(-8 * delta))
        mode = 'wave'
      }
      else if (mode === 'waveOut' && !moving) {
        motionBlend = 0
      }
      else if (mode === 'waveOut') {
        motionBlend = mix(motionBlend, 1, 1 - Math.exp(-8 * delta))
      }
      else {
        motionBlend = mix(motionBlend, moving ? 1 : 0, 1 - Math.exp(-8 * delta))
        mode = motionBlend > 0.5 ? 'run' : 'stand'
      }

      const previousPosition: Vec3 = [position[0], position[1], position[2]]

      if (jumpTime > 0) {
        const floorY = walkHeight(position[0], position[1], position[2])

        position[1] = floorY + jumpOffset(jumpElapsed)
        velocityY = 0
      }

      if (moving) {
        normalizeInto(input)
        if (hasJumpTarget) {
          direction[0] = Math.sin(turn)
          direction[1] = 0
          direction[2] = Math.cos(turn)
        }
        else {
          const sin = Math.sin(cameraTurn)
          const cos = Math.cos(cameraTurn)

          forward[0] = sin
          forward[1] = 0
          forward[2] = cos
          right[0] = -cos
          right[1] = 0
          right[2] = sin
          direction[0] = forward[0] * input[2] + right[0] * input[0]
          direction[1] = 0
          direction[2] = forward[2] * input[2] + right[2] * input[0]
        }
        normalizeInto(direction)

        position[0] += direction[0] * delta * 5
        position[2] += direction[2] * delta * 5
        const foundSeat = couchRelease <= 0 ? seatAt(position, occupiedSeats, 0.46, true) : undefined
        const nextSeat = foundSeat && (!hasDestination || foundSeat.id === destinationSeat) ? foundSeat : undefined

        if (nextSeat) {
          takeSeat(nextSeat)
          seated = true
          hasDestination = false
          hasJumpTarget = false
          destinationSeat = ''
          path = []
          seat = nextSeat.id
          occupiedSeats.add(seat)
          position[0] = nextSeat.position[0]
          position[1] = nextSeat.position[1]
          position[2] = nextSeat.position[2]
          turn = nextSeat.turn
          motionBlend = 0
          mode = bottomMode === 'pants' ? 'manSitting' : 'womanSitting'
          velocityY = 0

          return
        }

        collideRoom(position, outsideTree, isOutside(position), previousPosition)
        turn = smoothAngle(turn, Math.atan2(direction[0], direction[2]), 10, delta)
      }

      const floorY = walkHeight(position[0], position[1], position[2])

      if (jumpTime > 0) {
        position[1] = floorY + jumpOffset(jumpElapsed)
        velocityY = 0
      }
      else if (floorY > position[1]) {
        position[1] = floorY
        velocityY = 0
      }
      else {
        velocityY -= 12 * delta
        position[1] += velocityY * delta

        if (position[1] < floorY) {
          position[1] = floorY
          velocityY = 0
        }
      }

      collideRoom(position, outsideTree, isOutside(position), previousPosition)
    },
  }
}

function jumpOffset(elapsed: number) {
  const progress = elapsed < jumpRiseDuration
    ? elapsed / jumpRiseDuration * 0.5
    : 0.5 + (elapsed - jumpRiseDuration) / (jumpDuration - jumpRiseDuration) * 0.5

  return Math.sin(progress * Math.PI) * jumpHeight
}

function waypointReached(position: Vec3, waypoint: Vec3) {
  const dx = waypoint[0] - position[0]
  const dz = waypoint[2] - position[2]

  return dx * dx + dz * dz < 0.09
}
