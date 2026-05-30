import { characterFloor, hairPalette, jewelPalette, skinPalette } from './character-data.ts'
import { resolvePlayerStyle } from './character-style.ts'
import { clamp, lengthSq, mix, smoothAngle } from './math.ts'
import {
  backDoor,
  djBooth,
  outsideDjBooth,
  outsideHutBar,
  roomBounds,
} from './scene-data.ts'
import { collideRoom, isOutside, seatAt, seats, walkHeight } from './scene.ts'
import type { CircleBounds, Player, PlayerDestination, PlayerStyle, Vec3 } from './types.ts'

const danceFloorSideRange = 3.1
const outsideDanceFloorSideRange = 4.8
const danceFloorBackRange = [0, 5.4] as const
const danceFloorDistance = 0.9
const outsideDanceFloorBackRange = [0, 8.4] as const
const outsideDanceFloorDistance = 0.9
const kioskDestinationRadius = [1.9, 6.4] as const
const treeDestinationRadius = [2.6, 9.5] as const
const waypointArriveRadius = 0.75
const destinationArriveRadius = 1.35
const seatArriveRadius = 0.7
const destinationLinger = [10, 30] as const
const destinationJitter = [0.35, 0.9] as const
const travelTargetJitter = 0.85
const travelTargetJitterTime = [5, 10] as const
const travelLateralTime = [0.6, 1.4] as const
const randomPause = [2, 5] as const
const blockedPause = [10, 30] as const
const initialSeatedPlayerCount = 4
const leaveSeatTime = 1.4
const doorInside: Vec3 = [backDoor.x, characterFloor, roomBounds.front - 0.75]
const doorOutside: Vec3 = [backDoor.x, characterFloor, roomBounds.front + 0.75]

export function createPlayers(count: number, outsideTree: CircleBounds, occupiedSeats: Set<string>) {
  const next: Player[] = []
  const initialSeats = seats()

  for (let i = 0; i < count; i++) {
    const seed = i + 1
    const destination = playerDestination(seed, 0, outsideTree, occupiedSeats)
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
      skinColorIndex: Math.floor(seededRange(seed, 19, 0, skinPalette.length)),
      accessoryIndex: 0,
    }

    const player: Player = {
      position,
      turn: seededRange(seed, 12, -Math.PI, Math.PI),
      motionBlend: 0,
      glowstickTrailKey: seed,
      idleClipIndex: Math.floor(seededRange(seed, 18, 1, 20)),
      input: [0, 0, 0],
      nextDecision: seededRange(seed, 13, 0.3, 2.8),
      destination,
      style,
      resolvedStyle: resolvePlayerStyle(style),
      seed,
    }

    if (i < initialSeatedPlayerCount) {
      sitInitialPlayer(player, initialSeats[(i * 4 + 1) % initialSeats.length]!, occupiedSeats)
    }

    next.push(player)
  }

  return next
}

function sitInitialPlayer(player: Player, seat: ReturnType<typeof seats>[number], occupiedSeats: Set<string>) {
  player.seat = seat.id
  occupiedSeats.add(seat.id)
  player.position[0] = seat.position[0]
  player.position[1] = seat.position[1]
  player.position[2] = seat.position[2]
  player.turn = seat.turn
  player.motionBlend = 0
  player.mode = player.resolvedStyle.bottomMode === 'pants' ? 'manSitting' : 'womanSitting'
  player.sittingUntil = seededRange(player.seed, 31, 18, 55)
  player.nextDecision = player.sittingUntil
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
        const seat = seats().find(seat => seat.id === player.seat)!
        player.position[0] = seat.position[0]
        player.position[1] = seat.position[1]
        player.position[2] = seat.position[2]
        player.turn = seat.turn
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
      player.input[0] = Math.sin(player.turn)
      player.input[1] = 0
      player.input[2] = Math.cos(player.turn)
      player.position[0] += player.input[0] * 0.46
      player.position[2] += player.input[2] * 0.46
      player.leavingSeatUntil = time + leaveSeatTime
      choosePlayerDestination(player, time, outsideTree, occupiedSeats)
    }

    if (player.leavingSeatUntil && time < player.leavingSeatUntil) {
      player.pauseUntil = undefined
      player.sidestepUntil = undefined
      player.travelLateralUntil = undefined
      player.travelLateralDirection = undefined
    }
    else if (updateRandomPause(player, time)) {
      player.motionBlend = mix(player.motionBlend, 0, 1 - Math.exp(-7 * delta))
      player.mode = player.motionBlend > 0.5 ? 'run' : 'stand'
      player.position[1] = walkHeight(player.position[0], player.position[1], player.position[2])
      continue
    }

    if (player.leavingSeatUntil && time < player.leavingSeatUntil) {
      player.nextDecision = player.leavingSeatUntil
    }
    else if (player.destination.kind === 'random') {
      updateRandomPlayer(player, delta, time, outsideTree, occupiedSeats)
    }
    else {
      updateDestinationPlayer(player, delta, time, outsideTree, occupiedSeats)
    }

    const inputLengthSq = lengthSq(player.input)
    const moving = inputLengthSq > 0

    player.motionBlend = mix(player.motionBlend, moving ? 1 : 0, 1 - Math.exp(-7 * delta))
    player.mode = player.motionBlend > 0.5 ? 'run' : 'stand'

    if (moving) {
      const lastX = player.position[0]
      const lastZ = player.position[2]
      const direction = playerInputDirection(player)
      const directionX = direction[0]
      const directionZ = direction[2]

      const speed = Math.min(Math.sqrt(inputLengthSq), 1)

      player.position[0] += directionX * delta * 2.55 * speed
      player.position[2] += directionZ * delta * 2.55 * speed

      collideRoom(player.position, outsideTree, isOutside(player.position))
      if ((!player.leavingSeatUntil || time >= player.leavingSeatUntil) && trySitPlayer(player, time, occupiedSeats)) {
        continue
      }

      if (blockedForward(player, lastX, lastZ, directionX, directionZ, delta)) {
        pauseBlockedPlayer(player, time, outsideTree, occupiedSeats)
        continue
      }

      player.turn = smoothAngle(player.turn, Math.atan2(directionX, directionZ), 8, delta)
    }

    player.position[1] = walkHeight(player.position[0], player.position[1], player.position[2])
  }
}

export function takeNpcSeat(
  players: Player[],
  seat: ReturnType<typeof seats>[number],
  time: number,
  outsideTree: CircleBounds,
  occupiedSeats: Set<string>,
) {
  const player = players.find(player => player.seat === seat.id)

  if (!player) {
    return
  }

  occupiedSeats.delete(player.seat!)
  player.seat = undefined
  player.sittingUntil = undefined
  player.mode = 'run'
  player.motionBlend = 1
  player.input[0] = Math.sin(player.turn)
  player.input[1] = 0
  player.input[2] = Math.cos(player.turn)
  player.position[0] += player.input[0] * 0.46
  player.position[2] += player.input[2] * 0.46
  player.leavingSeatUntil = time + leaveSeatTime
  choosePlayerDestination(player, time, outsideTree, occupiedSeats)
}

function updateRandomPause(player: Player, time: number) {
  if (player.pauseUntil && time < player.pauseUntil) {
    player.input[0] = 0
    player.input[1] = 0
    player.input[2] = 0
    return true
  }

  player.pauseUntil = undefined

  if (lengthSq(player.input) === 0 || time < (player.nextPauseDecision ?? 0)) {
    return false
  }

  player.nextPauseDecision = time + seededRange(player.seed, Math.floor(time * 4.7), 2, 6)

  if (seededRandom(player.seed, Math.floor(time * 8.9)) >= 0.16) {
    return false
  }

  player.pauseUntil = time + seededRange(player.seed, Math.floor(time * 6.1), randomPause[0], randomPause[1])
  player.input[0] = 0
  player.input[1] = 0
  player.input[2] = 0

  return true
}

function updateRandomPlayer(
  player: Player,
  delta: number,
  time: number,
  outsideTree: CircleBounds,
  occupiedSeats: Set<string>,
) {
  if (time >= player.lingeringUntil!) {
    choosePlayerDestination(player, time, outsideTree, occupiedSeats)
    return
  }

  if (time >= player.nextDecision) {
    chooseRandomInput(player, delta, time)
    player.nextDecision = time + seededRange(player.seed, Math.floor(time * 3.1), 0.45, 2.4)
  }
}

function updateDestinationPlayer(
  player: Player,
  delta: number,
  time: number,
  outsideTree: CircleBounds,
  occupiedSeats: Set<string>,
) {
  if (time >= player.destinationUntil!) {
    choosePlayerDestination(player, time, outsideTree, occupiedSeats)
    return
  }

  if (time >= player.nextDecision) {
    player.nextDecision = time + seededRange(player.seed, Math.floor(time * 3.1), 1.2, 3.4)

    if (seededRandom(player.seed, Math.floor(time * 9.7)) < 0.05) {
      choosePlayerDestination(player, time, outsideTree, occupiedSeats)
      return
    }
  }

  const target = activePlayerTarget(player, time)
  const dx = target[0] - player.position[0]
  const dz = target[2] - player.position[2]
  const distance = Math.sqrt(dx * dx + dz * dz)
  const atDestinationSide = isOutside(player.position) === player.destination.outside
  const destinationDx = player.destination.position[0] - player.position[0]
  const destinationDz = player.destination.position[2] - player.position[2]
  const destinationDistance = Math.sqrt(destinationDx * destinationDx + destinationDz * destinationDz)

  if (!atDestinationSide && distance < waypointArriveRadius) {
    player.input[0] = 0
    player.input[1] = 0
    player.input[2] = 0
    return
  }

  const arriveRadius = player.destination.kind === 'lounge' || player.destination.kind === 'stool'
    ? seatArriveRadius
    : destinationArriveRadius

  if (atDestinationSide && destinationDistance < arriveRadius) {
    if (player.destination.kind === 'lounge' || player.destination.kind === 'stool') {
      if (trySitPlayer(player, time, occupiedSeats)) {
        return
      }

      choosePlayerDestination(player, time, outsideTree, occupiedSeats)
      return
    }

    if (!player.lingeringUntil) {
      player.lingeringUntil = time
        + seededRange(player.seed, Math.floor(time * 2.9), destinationLinger[0], destinationLinger[1])
      player.nextDecision = time
    }

    if (time >= player.nextDecision) {
      chooseDestinationJitter(player, delta, time)
      player.nextDecision = time
        + seededRange(player.seed, Math.floor(time * 3.1), destinationJitter[0], destinationJitter[1])
    }

    turnTowardDestination(player, delta)

    if (time >= player.lingeringUntil) {
      choosePlayerDestination(player, time, outsideTree, occupiedSeats)
    }

    return
  }

  player.sidestepUntil = undefined

  chooseTravelInput(player, dx / distance, dz / distance, delta, time)
}

function chooseTravelInput(player: Player, targetX: number, targetZ: number, delta: number, time: number) {
  const targetAngle = Math.atan2(targetX, targetZ)
  const turnDistance = Math.abs(Math.atan2(Math.sin(targetAngle - player.turn), Math.cos(targetAngle - player.turn)))
  const speed = clamp(1 - turnDistance / (Math.PI * 0.55), 0, 1)
  const lateral = travelLateralInput(player, time)

  player.turn = smoothAngle(player.turn, targetAngle, 4.5, delta)
  player.input[0] = lateral
  player.input[1] = 0
  player.input[2] = lateral ? Math.max(speed * 0.75, 0.35) : speed
}

function travelLateralInput(player: Player, time: number) {
  if (player.travelLateralUntil && time < player.travelLateralUntil) {
    return player.travelLateralDirection!
  }

  player.travelLateralUntil = undefined
  player.travelLateralDirection = undefined

  if (seededRandom(player.seed, Math.floor(time * 1.7)) >= 0.006) {
    return 0
  }

  player.travelLateralUntil = time + seededRange(player.seed, Math.floor(time * 2.1),
    travelLateralTime[0], travelLateralTime[1])
  player.travelLateralDirection = seededRandom(player.seed, Math.floor(time * 2.7)) < 0.5 ? -1 : 1

  return player.travelLateralDirection
}

function playerInputDirection(player: Player): Vec3 {
  const sin = Math.sin(player.turn)
  const cos = Math.cos(player.turn)
  const x = sin * player.input[2] + cos * player.input[0]
  const z = cos * player.input[2] - sin * player.input[0]
  const length = Math.hypot(x, z)

  return [x / length, 0, z / length]
}

function blockedForward(
  player: Player,
  lastX: number,
  lastZ: number,
  directionX: number,
  directionZ: number,
  delta: number,
) {
  const movedX = player.position[0] - lastX
  const movedZ = player.position[2] - lastZ
  const forwardMovement = movedX * directionX + movedZ * directionZ

  return forwardMovement < delta * 0.35
}

function pauseBlockedPlayer(
  player: Player,
  time: number,
  outsideTree: CircleBounds,
  occupiedSeats: Set<string>,
) {
  const pauseUntil = time + seededRange(player.seed, Math.floor(time * 6.7), blockedPause[0], blockedPause[1])

  player.input[0] = 0
  player.input[1] = 0
  player.input[2] = 0
  choosePlayerDestination(player, pauseUntil, outsideTree, occupiedSeats)
  player.pauseUntil = pauseUntil
}

function turnTowardDestination(player: Player, delta: number) {
  if (!player.destination.lookAt) {
    return
  }

  const dx = player.destination.lookAt[0] - player.position[0]
  const dz = player.destination.lookAt[2] - player.position[2]

  player.turn = smoothAngle(player.turn, Math.atan2(dx, dz), 4, delta)
}

function activePlayerTarget(player: Player, time: number) {
  const outside = isOutside(player.position)

  if (outside === player.destination.outside) {
    return travelTarget(player, time)
  }

  return outside ? doorInside : doorOutside
}

function travelTarget(player: Player, time: number) {
  if (player.destination.kind === 'lounge' || player.destination.kind === 'stool') {
    return player.destination.position
  }

  if (player.travelTarget && time < player.nextTravelTargetAt!) {
    return player.travelTarget
  }

  const angle = seededRange(player.seed, Math.floor(time * 2.9), -Math.PI, Math.PI)
  const radius = seededRange(player.seed, Math.floor(time * 3.7), 0, travelTargetJitter)

  player.travelTarget = [
    player.destination.position[0] + Math.sin(angle) * radius,
    characterFloor,
    player.destination.position[2] + Math.cos(angle) * radius,
  ]
  player.nextTravelTargetAt = time + seededRange(player.seed, Math.floor(time * 4.1),
    travelTargetJitterTime[0], travelTargetJitterTime[1])

  return player.travelTarget
}

function trySitPlayer(player: Player, time: number, occupiedSeats: Set<string>) {
  if (player.leavingSeatUntil && time < player.leavingSeatUntil) {
    return false
  }

  const seat = seatAt(player.position, occupiedSeats, 0.9)

  if (!seat) {
    return false
  }

  sitPlayer(player, seat, time, occupiedSeats)

  return true
}

function sitPlayer(
  player: Player,
  seat: ReturnType<typeof seats>[number],
  time: number,
  occupiedSeats: Set<string>,
) {
  player.seat = seat.id
  occupiedSeats.add(seat.id)
  player.position[0] = seat.position[0]
  player.position[1] = seat.position[1]
  player.position[2] = seat.position[2]
  player.turn = seat.turn
  player.motionBlend = 0
  player.mode = player.resolvedStyle.bottomMode === 'pants' ? 'manSitting' : 'womanSitting'
  player.sittingUntil = time
    + seededRange(player.seed, Math.floor(time * 2.3), destinationLinger[0], destinationLinger[1])
  player.nextDecision = player.sittingUntil
  player.lingeringUntil = undefined
  player.pauseUntil = undefined
  player.sidestepUntil = undefined
  player.travelLateralUntil = undefined
  player.travelLateralDirection = undefined
  player.travelTarget = undefined
  player.nextTravelTargetAt = undefined
  player.leavingSeatUntil = undefined
}

function chooseRandomInput(player: Player, delta: number, time: number) {
  const random = seededRandom(player.seed, Math.floor(time * 7.7))

  if (random < 0.22) {
    player.input[0] = 0
    player.input[1] = 0
    player.input[2] = 0
    return
  }

  const angle = seededRange(player.seed, Math.floor(time * 5.3), -Math.PI, Math.PI)
  const turnDistance = Math.abs(Math.atan2(Math.sin(angle - player.turn), Math.cos(angle - player.turn)))
  const lateral = travelLateralInput(player, time)

  player.turn = smoothAngle(player.turn, angle, 4.5, delta)
  player.input[0] = lateral
  player.input[1] = 0
  player.input[2] = clamp(1 - turnDistance / (Math.PI * 0.55), 0, 1)
}

function chooseDestinationJitter(player: Player, delta: number, time: number) {
  const random = seededRandom(player.seed, Math.floor(time * 7.7))

  if (random < 0.45) {
    player.input[0] = 0
    player.input[1] = 0
    player.input[2] = 0
    return
  }

  const angle = seededRange(player.seed, Math.floor(time * 5.3), -Math.PI, Math.PI)
  const turnDistance = Math.abs(Math.atan2(Math.sin(angle - player.turn), Math.cos(angle - player.turn)))

  player.turn = smoothAngle(player.turn, angle, 4.5, delta)
  player.input[0] = 0
  player.input[1] = 0
  player.input[2] = clamp(1 - turnDistance / (Math.PI * 0.55), 0, 1)
}

function playerDestination(
  seed: number,
  step: number,
  outsideTree: CircleBounds,
  occupiedSeats: Set<string>,
): PlayerDestination {
  const pick = seededRandom(seed, step + 100)

  if (pick < 0.35) {
    return djDestination(seed, step, true)
  }

  if (pick < 0.75) {
    return djDestination(seed, step, false)
  }

  if (pick < 0.83) {
    return treeDestination(seed, step, outsideTree)
  }

  if (pick < 0.88) {
    return kioskDestination(seed, step)
  }

  if (pick < 0.95) {
    return seatDestination(seed, step, occupiedSeats, 'lounge') ?? treeDestination(seed, step, outsideTree)
  }

  if (pick < 0.98) {
    return seatDestination(seed, step, occupiedSeats, 'stool') ?? kioskDestination(seed, step)
  }

  return randomDestination(seed, step)
}

function choosePlayerDestination(
  player: Player,
  time: number,
  outsideTree: CircleBounds,
  occupiedSeats: Set<string>,
) {
  player.destination = playerDestination(player.seed, Math.floor(time / 6 + player.seed), outsideTree, occupiedSeats)
  player.lingeringUntil = player.destination.kind === 'random'
    ? time + seededRange(player.seed, Math.floor(time * 2.9), destinationLinger[0], destinationLinger[1])
    : undefined
  player.nextDecision = time
  player.nextPauseDecision = time + seededRange(player.seed, Math.floor(time * 4.7), 2, 6)
  player.pauseUntil = undefined
  player.sidestepUntil = undefined
  player.travelLateralUntil = undefined
  player.travelLateralDirection = undefined
  player.travelTarget = undefined
  player.nextTravelTargetAt = time
  player.destinationUntil = time + 30
}

function djDestination(seed: number, step: number, inside: boolean) {
  const sideRange = inside ? danceFloorSideRange : outsideDanceFloorSideRange
  const jitterAmount = inside ? 0.45 : 0.8
  const jitterX = seededRange(seed, step + 102, -sideRange, sideRange)
    + seededRange(seed, step + 111, -jitterAmount, jitterAmount)
  const jitterZ = seededRange(seed, step + 103, danceFloorBackRange[0], danceFloorBackRange[1])
    + seededRange(seed, step + 112, -jitterAmount, jitterAmount)

  return inside
    ? danceFloorDestination(djBooth, false, 1, jitterX, jitterZ)
    : danceFloorDestination(outsideDjBooth, true, -1, jitterX,
      seededRange(seed, step + 103, outsideDanceFloorBackRange[0], outsideDanceFloorBackRange[1])
        + seededRange(seed, step + 112, -jitterAmount, jitterAmount), outsideDanceFloorDistance)
}

function seatDestination(
  seed: number,
  step: number,
  occupiedSeats: Set<string>,
  kind: 'lounge' | 'stool',
): PlayerDestination | undefined {
  const allSeats = seats().filter(seat =>
    kind === 'stool' ? seat.id.startsWith('stool:') : !seat.id.startsWith('stool:')
  )
  const openSeats = allSeats.filter(seat => !occupiedSeats.has(seat.id))
  const seat = openSeats[Math.floor(seededRange(seed, step + 104, 0, openSeats.length))]

  if (!seat) {
    return undefined
  }

  const offset = seededRange(seed, step + 105, -0.18, 0.18)

  return {
    kind,
    outside: isOutside(seat.position),
    position: [seat.position[0] + Math.sin(seat.turn) * offset, characterFloor, seat.position[2] + Math.cos(seat.turn)
        * offset],
    lookAt: seat.position,
    linger: [destinationLinger[0], destinationLinger[1]],
  }
}

function treeDestination(seed: number, step: number, outsideTree: CircleBounds): PlayerDestination {
  const angle = seededRange(seed, step + 106, 0, Math.PI * 2)
  const distance = seededRange(seed, step + 107, outsideTree.radius + treeDestinationRadius[0],
    outsideTree.radius + treeDestinationRadius[1])

  return {
    kind: 'tree',
    outside: true,
    position: [outsideTree.x + Math.sin(angle) * distance, characterFloor, outsideTree.z + Math.cos(angle) * distance],
    lookAt: [outsideTree.x, characterFloor, outsideTree.z],
    linger: [destinationLinger[0], destinationLinger[1]],
  }
}

function kioskDestination(seed: number, step: number): PlayerDestination {
  const angle = seededRange(seed, step + 113, 0, Math.PI * 2)
  const distance = seededRange(seed, step + 114, kioskDestinationRadius[0], kioskDestinationRadius[1])

  return {
    kind: 'kiosk',
    outside: true,
    position: [outsideHutBar.x + Math.sin(angle) * distance, characterFloor,
      outsideHutBar.z + Math.cos(angle) * distance],
    lookAt: [outsideHutBar.x, characterFloor, outsideHutBar.z],
    linger: [destinationLinger[0], destinationLinger[1]],
  }
}

function randomDestination(seed: number, step: number): PlayerDestination {
  return {
    kind: 'random',
    outside: seededRandom(seed, step + 108) < 0.5,
    position: [0, characterFloor, 0],
    linger: [destinationLinger[0], destinationLinger[1]],
  }
}

function danceFloorDestination(
  bounds: typeof djBooth,
  outside: boolean,
  forward: number,
  jitterX: number,
  jitterZ: number,
  distance = danceFloorDistance,
): PlayerDestination {
  return {
    kind: 'dj',
    outside,
    position: [bounds.x + jitterX, characterFloor, bounds.z + forward * (bounds.depth * 0.5 + distance + jitterZ)],
    lookAt: [bounds.x, characterFloor, bounds.z],
    linger: [destinationLinger[0], destinationLinger[1]],
  }
}

function seededRange(seed: number, salt: number, min: number, max: number) {
  return mix(min, max, seededRandom(seed, salt))
}

function seededRandom(seed: number, salt: number) {
  const value = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453123

  return value - Math.floor(value)
}
