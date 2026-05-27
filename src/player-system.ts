import { characterFloor, hairPalette, jewelPalette } from './character-data.ts'
import { resolvePlayerStyle } from './character-style.ts'
import { lengthSq, mix, normalizeIndex, smoothAngle } from './math.ts'
import {
  backDoor,
  bartenderBar,
  djBooth,
  outsideDjBooth,
  roomBounds,
} from './scene-data.ts'
import { collideRoom, isOutside } from './scene.ts'
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
const inputCrossingDestination: PlayerDestination = { position: [backDoor.x, characterFloor, 0] }

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

export function updatePlayers(players: Player[], delta: number, time: number, outsideTree: CircleBounds) {
  const crossingDestination: PlayerDestination = { position: [backDoor.x, characterFloor, 0] }

  for (const player of players) {
    const destination = activePlayerDestination(player, crossingDestination)
    const dx = destination.position[0] - player.position[0]
    const dz = destination.position[2] - player.position[2]
    const distance = Math.sqrt(dx * dx + dz * dz)

    if (distance < 0.55 && destination === player.destination) {
      player.destination = playerDestination(player.seed, Math.floor(time / 6 + player.seed), outsideTree)
      player.nextDecision = time
    }

    if (time >= player.nextDecision) {
      choosePlayerInput(player, time)
      player.nextDecision = time + seededRange(player.seed, Math.floor(time * 3.1), 0.45, 2.4)
    }

    const moving = lengthSq(player.input) > 0

    player.motionBlend = mix(player.motionBlend, moving ? 1 : 0, 1 - Math.exp(-7 * delta))

    if (moving) {
      const inputLength = Math.sqrt(lengthSq(player.input))
      const directionX = player.input[0] / inputLength
      const directionZ = player.input[2] / inputLength

      player.position[0] += directionX * delta * 2.55
      player.position[2] += directionZ * delta * 2.55
      collideRoom(player.position, outsideTree)
      player.turn = smoothAngle(player.turn, Math.atan2(directionX, directionZ), 8, delta)
    }
    else if (destination.lookAt) {
      const dx = destination.lookAt[0] - player.position[0]
      const dz = destination.lookAt[2] - player.position[2]

      player.turn = smoothAngle(player.turn, Math.atan2(dx, dz), 4, delta)
    }

    player.position[1] = characterFloor
  }
}

function choosePlayerInput(player: Player, time: number) {
  const random = seededRandom(player.seed, Math.floor(time * 7.7))

  if (random < 0.22) {
    player.input[0] = 0
    player.input[1] = 0
    player.input[2] = 0
    return
  }

  const destination = activePlayerDestination(player, inputCrossingDestination)
  const dx = destination.position[0] - player.position[0]
  const dz = destination.position[2] - player.position[2]
  const angle = Math.atan2(dx, dz) + seededRange(player.seed, Math.floor(time * 5.3), -0.75, 0.75)
  const index = normalizeIndex(Math.round(angle / (Math.PI / 4)), inputDirections.length)
  const input = inputDirections[index]!

  player.input[0] = input[0]
  player.input[1] = input[1]
  player.input[2] = input[2]
}

function activePlayerDestination(player: Player, crossingDestination: PlayerDestination): PlayerDestination {
  const outside = isOutside(player.position)
  const destinationOutside = isOutside(player.destination.position)

  if (outside === destinationOutside) {
    return player.destination
  }

  crossingDestination.position[2] = outside ? roomBounds.front - 0.75 : roomBounds.front + 0.75

  return crossingDestination
}

function playerDestination(seed: number, step: number, outsideTree: CircleBounds): PlayerDestination {
  const choice = Math.floor(seededRange(seed, step + 100, 0, 6))
  const jitterX = seededRange(seed, step + 101, -1.8, 1.8)
  const jitterZ = seededRange(seed, step + 102, -1.4, 1.4)

  if (choice === 0) {
    return { position: [jitterX, characterFloor, djBooth.z + 2.2 + jitterZ],
      lookAt: [djBooth.x, characterFloor, djBooth.z] }
  }

  if (choice === 1) {
    return { position: [bartenderBar.x + jitterX, characterFloor, bartenderBar.z - 1.55 + jitterZ * 0.35] }
  }

  if (choice === 2) {
    return { position: [backDoor.x + jitterX * 0.35, characterFloor, roomBounds.front - 1.3 + jitterZ * 0.3] }
  }

  if (choice === 3) {
    return { position: [outsideTree.x + jitterX, characterFloor, outsideTree.z - 2.4 + jitterZ],
      lookAt: [outsideTree.x, characterFloor, outsideTree.z] }
  }

  if (choice === 4) {
    return { position: [outsideDjBooth.x + jitterX, characterFloor, outsideDjBooth.z - 2.6 + jitterZ],
      lookAt: [outsideDjBooth.x, characterFloor, outsideDjBooth.z] }
  }

  return {
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
