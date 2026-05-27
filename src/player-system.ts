import { characterFloor, hairPalette, jewelPalette } from './character-data.ts'
import { resolvePlayerStyle } from './character-style.ts'
import { lengthSq, mix, normalizeIndex, smoothAngle } from './math.ts'
import {
  backDoor,
  bartenderBar,
  bartenderStools,
  djBooth,
  outsideCouches,
  outsideDjBooth,
  outsideHutBarStools,
  roomBounds,
} from './scene-data.ts'
import { collideRoom, isOutside, seatAt, walkHeight } from './scene.ts'
import type { CircleBounds, Player, PlayerDestination, PlayerStyle, Vec3 } from './types.ts'

const inputDirections: Vec3[] = [
  [0, 0, 1],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, -1],
  [1, 0, -1],
  [-1, 0, -1],
]
const inputCrossingDestination: PlayerDestination = { outside: false, position: [backDoor.x, characterFloor, 0] }
const updateCrossingDestination: PlayerDestination = { outside: false, position: [backDoor.x, characterFloor, 0] }

export function createPlayers(count: number, outsideTree: CircleBounds) {
  const next: Player[] = []

  for (let i = 0; i < count; i++) {
    const seed = i + 1
    const destination = playerDestination(seed, 0, outsideTree)
    const position: Vec3 = [
      destination.position[0] + seededRange(seed, 10, -1.2, 1.2),
      characterFloor,
      destination.position[2] + seededRange(seed, 11, -1.2, 1.2),
    ]
    const style: PlayerStyle = {
      topStyleIndex: Math.floor(seededRange(seed, 14, 0, jewelPalette.length * 2 + 2)),
      bottomStyleIndex: Math.floor(seededRange(seed, 15, 0, jewelPalette.length * 2)),
      hairIndex: Math.floor(seededRange(seed, 16, 0, 19)),
      hairColorIndex: Math.floor(seededRange(seed, 17, 0, hairPalette.length)),
    }

    next.push({
      position,
      turn: seededRange(seed, 12, -Math.PI, Math.PI),
      motionBlend: 0,
      idleClipIndex: Math.floor(seededRange(seed, 18, 0, 20)),
      input: [0, 0, 0],
      nextDecision: seededRange(seed, 13, 0.3, 2.8),
      destination,
      style,
      resolvedStyle: resolvePlayerStyle(style),
      seed,
    })
  }

  return next
}

export function updatePlayers(
  players: Player[],
  delta: number,
  time: number,
  outsideTree: CircleBounds,
  occupiedSeats: Set<string>,
) {
  for (const player of players) {
    if (player.seat) {
      if (time < player.sittingUntil!) {
        player.input[0] = 0
        player.input[1] = 0
        player.input[2] = 0
        player.motionBlend = 0
        player.mode = player.resolvedStyle.bottomMode === 'pants' ? 'manSitting' : 'womanSitting'

        continue
      }

      occupiedSeats.delete(player.seat)
      player.seat = undefined
      player.sittingUntil = undefined
      player.mode = 'run'
      player.motionBlend = 1
      player.position[0] += Math.sin(player.turn) * 0.46
      player.position[2] += Math.cos(player.turn) * 0.46
      player.destination = playerDestination(player.seed, Math.floor(time / 6 + player.seed), outsideTree)
      player.nextDecision = time
    }

    const outside = isOutside(player.position)
    const destination = activePlayerDestination(player, outside, updateCrossingDestination)
    const dx = destination.position[0] - player.position[0]
    const dz = destination.position[2] - player.position[2]
    const distance = Math.sqrt(dx * dx + dz * dz)

    if (distance < 0.55 && destination === player.destination) {
      if (trySitPlayer(player, time, occupiedSeats)) {
        continue
      }

      player.destination = playerDestination(player.seed, Math.floor(time / 6 + player.seed), outsideTree)
      player.nextDecision = time
    }

    if (time >= player.nextDecision) {
      choosePlayerInput(player, time)
      player.nextDecision = time + seededRange(player.seed, Math.floor(time * 3.1), 0.45, 2.4)
    }

    const inputLengthSq = lengthSq(player.input)
    const moving = inputLengthSq > 0

    player.motionBlend = mix(player.motionBlend, moving ? 1 : 0, 1 - Math.exp(-7 * delta))
    player.mode = player.motionBlend > 0.5 ? 'run' : 'stand'

    if (moving) {
      const inputLength = Math.sqrt(inputLengthSq)
      const directionX = player.input[0] / inputLength
      const directionZ = player.input[2] / inputLength

      player.position[0] += directionX * delta * 2.55
      player.position[2] += directionZ * delta * 2.55
      if (trySitPlayer(player, time, occupiedSeats)) {
        continue
      }

      collideRoom(player.position, outsideTree, isOutside(player.position))
      player.turn = smoothAngle(player.turn, Math.atan2(directionX, directionZ), 8, delta)
    }
    else if (destination.lookAt) {
      const dx = destination.lookAt[0] - player.position[0]
      const dz = destination.lookAt[2] - player.position[2]

      player.turn = smoothAngle(player.turn, Math.atan2(dx, dz), 4, delta)
    }

    player.position[1] = walkHeight(player.position[0], player.position[1], player.position[2])
  }
}

function trySitPlayer(player: Player, time: number, occupiedSeats: Set<string>) {
  const seat = seatAt(player.position, occupiedSeats)

  if (!seat) {
    return false
  }

  player.seat = seat.id
  occupiedSeats.add(seat.id)
  player.position[0] = seat.position[0]
  player.position[1] = seat.position[1]
  player.position[2] = seat.position[2]
  player.turn = seat.turn
  player.motionBlend = 0
  player.mode = player.resolvedStyle.bottomMode === 'pants' ? 'manSitting' : 'womanSitting'
  player.sittingUntil = time + seededRange(player.seed, Math.floor(time * 2.3), 5, 14)
  player.nextDecision = player.sittingUntil

  return true
}

function choosePlayerInput(player: Player, time: number) {
  const random = seededRandom(player.seed, Math.floor(time * 7.7))

  if (random < 0.22) {
    player.input[0] = 0
    player.input[1] = 0
    player.input[2] = 0
    return
  }

  const destination = activePlayerDestination(player, isOutside(player.position), inputCrossingDestination)
  const dx = destination.position[0] - player.position[0]
  const dz = destination.position[2] - player.position[2]
  const angle = Math.atan2(dx, dz) + seededRange(player.seed, Math.floor(time * 5.3), -0.75, 0.75)
  const index = normalizeIndex(Math.round(angle / (Math.PI / 4)), inputDirections.length)
  const input = inputDirections[index]!

  player.input[0] = input[0]
  player.input[1] = input[1]
  player.input[2] = input[2]
}

function activePlayerDestination(
  player: Player,
  outside: boolean,
  crossingDestination: PlayerDestination,
): PlayerDestination {
  if (outside === player.destination.outside) {
    return player.destination
  }

  crossingDestination.outside = outside
  crossingDestination.position[2] = outside ? roomBounds.front - 0.75 : roomBounds.front + 0.75

  return crossingDestination
}

function playerDestination(seed: number, step: number, outsideTree: CircleBounds): PlayerDestination {
  const choice = Math.floor(seededRange(seed, step + 100, 0, 10))
  const jitterX = seededRange(seed, step + 101, -1.8, 1.8)
  const jitterZ = seededRange(seed, step + 102, -1.4, 1.4)

  if (choice === 0) {
    return { outside: false, position: [jitterX, characterFloor, djBooth.z + 2.2 + jitterZ],
      lookAt: [djBooth.x, characterFloor, djBooth.z] }
  }

  if (choice === 1) {
    return { outside: false, position: [bartenderBar.x + jitterX, characterFloor, bartenderBar.z - 1.55 + jitterZ * 0.35] }
  }

  if (choice === 2) {
    return { outside: false, position: [backDoor.x + jitterX * 0.35, characterFloor, roomBounds.front - 1.3 + jitterZ * 0.3] }
  }

  if (choice === 3) {
    return { outside: true, position: [outsideTree.x + jitterX, characterFloor, outsideTree.z - 2.4 + jitterZ],
      lookAt: [outsideTree.x, characterFloor, outsideTree.z] }
  }

  if (choice === 4) {
    return { outside: true, position: [outsideDjBooth.x + jitterX, characterFloor, outsideDjBooth.z - 2.6 + jitterZ],
      lookAt: [outsideDjBooth.x, characterFloor, outsideDjBooth.z] }
  }

  if (choice === 5 || choice === 6) {
    const couch = outsideCouches[normalizeIndex(Math.floor(seededRange(seed, step + 105, 0, outsideCouches.length)),
      outsideCouches.length)]!

    return { outside: true, position: [couch.x + jitterX * 0.25, characterFloor, couch.z + jitterZ * 0.25] }
  }

  if (choice === 7) {
    const stool = bartenderStools[normalizeIndex(Math.floor(seededRange(seed, step + 106, 0, bartenderStools.length)),
      bartenderStools.length)]!

    return { outside: false, position: [stool.x + jitterX * 0.12, characterFloor, stool.z + jitterZ * 0.12] }
  }

  if (choice === 8) {
    const stool = outsideHutBarStools[normalizeIndex(Math.floor(seededRange(seed, step + 107, 0,
      outsideHutBarStools.length)), outsideHutBarStools.length)]!

    return { outside: true, position: [stool.x + jitterX * 0.12, characterFloor, stool.z + jitterZ * 0.12] }
  }

  return {
    outside: false,
    position: [seededRange(seed, step + 103, roomBounds.left + 1.2, roomBounds.right - 1.2), characterFloor,
      seededRange(seed, step + 104, roomBounds.back + 2.2, roomBounds.front - 2.0)],
  }
}

function seededRange(seed: number, salt: number, min: number, max: number) {
  return mix(min, max, seededRandom(seed, salt))
}

function seededRandom(seed: number, salt: number) {
  const value = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453123

  return value - Math.floor(value)
}
