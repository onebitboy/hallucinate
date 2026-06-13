import { characterFloor, hairPalette, jewelPalette, skinPalette } from './character-data.ts'
import { resolvePlayerStyle } from './character-style.ts'
import { characterView, characterVisibilityInto } from './character-visibility.ts'
import { clamp, lengthSq, smoothAngle } from './math.ts'
import { findPath } from './pathfinding.ts'
import {
  backDoor,
  djBooth,
  outsideDjBooth,
  outsideFoodTruckFoodWall,
  outsideHutBar,
  outsidePhotoWall,
  outsideRooftop,
  outsideRooftopLanding,
  outsideRooftopStairs,
  outsideToilets,
  roomBounds,
  upstairsBar,
  upstairsDjBooth,
  upstairsDoor,
} from './scene-data.ts'
import {
  collideRoomWithoutDuck,
  isOutside,
  onOutsideRooftopStairPath,
  roomAt,
  seatAt,
  seatById,
  seats,
  walkHeightWithoutDuck,
} from './scene.ts'
import { treeSwing } from './tree-swing.ts'
import { createObjectTurnBasisCache } from './turn-basis.ts'
import type { CircleBounds, Player, PlayerDestination, PlayerStyle, Vec3 } from './types.ts'

const npcConfig = {
  initialSeatedCount: 12,
  leaveSeatTime: 1.4,
  movement: {
    minimumTravelers: 7,
    travelerRatio: 0.12,
  },
  arrive: {
    waypoint: 0.75,
    destination: 1.35,
    seat: 0.7,
  },
  destination: {
    weights: {
      insideDj: 0.2,
      outsideDj: 0.36,
      upstairsDj: 0.52,
      upstairsBarDance: 0.57,
      lounge: 0.68,
      stool: 0.8,
      tree: 0.88,
      kiosk: 0.95,
      foodTruck: 0.98,
      restroom: 0.99,
      photoWall: 0.995,
    },
    linger: [20, 65] as const,
    shortLinger: [5, 14] as const,
    jitter: [0.35, 0.9] as const,
    danceFloor: {
      sideRange: 4.7,
      backRange: [0.2, 8.8] as const,
      distance: 0.9,
      jitter: 0.95,
    },
    outsideDanceFloor: {
      sideRange: 4.8,
      backRange: [0, 8.4] as const,
      distance: 0.9,
      jitter: 0.8,
    },
    kioskRadius: [1.9, 6.4] as const,
    foodTruckDistance: [1.25, 2.25] as const,
    foodTruckSpread: 2.1,
    treeRadius: [2.6, 9.5] as const,
    treeSpots: 12,
  },
  seat: {
    linger: [35, 110] as const,
  },
  decision: {
    interval: [0.8, 2.2] as const,
    repickChance: 0.12,
  },
  travel: {
    targetJitter: 0.85,
    targetJitterTime: [3, 7] as const,
    lateralTime: [0.4, 1.15] as const,
    speed: [0.82, 1.28] as const,
  },
  pause: {
    random: [1.2, 3.2] as const,
    blocked: [10, 30] as const,
    randomInputChance: 0.16,
    destinationJitterChance: 0.85,
  },
}
const npcPathClearance = 0.18
const doorCrossLaneRange = backDoor.width * 0.5 - npcPathClearance - 0.06
const doorFlowWidth = backDoor.width * 0.5 + 0.75
const doorApproachLaneRange = doorFlowWidth - 0.28
const doorClearInside = roomBounds.front - 2.05
const doorClearOutside = roomBounds.front + 2.35
const doorClearMargin = 0.45
const doorFlowInside = roomBounds.front - 1.65
const doorFlowOutside = roomBounds.front + 1.95
const doorClearFlowInside = doorClearInside - doorClearMargin
const doorClearFlowOutside = doorClearOutside + doorClearMargin
const doorApproachInside = doorFlowInside + 0.2
const doorApproachOutside = doorFlowOutside - 0.2
const npcPathOptions = { duck: false, clearance: npcPathClearance } as const
const upstairsFloor = characterFloor + outsideRooftop.height
const upstairsDoorLaneBack = Math.max(
  upstairsDoor.z - upstairsDoor.width / 2 + 0.35,
  outsideRooftopLanding.z - outsideRooftopLanding.depth / 2 + 0.25,
)
const upstairsDoorLaneFront = Math.min(
  upstairsDoor.z + upstairsDoor.width / 2 - 0.35,
  outsideRooftopLanding.z + outsideRooftopLanding.depth / 2 - 0.25,
)
const upstairsStairBottom: Vec3 = [
  outsideRooftopStairs.x,
  characterFloor,
  outsideRooftopStairs.z + outsideRooftopStairs.depth / 2 - 0.2,
]
const upstairsStairTop: Vec3 = [
  outsideRooftopLanding.x,
  upstairsFloor,
  outsideRooftopLanding.z,
]
const upstairsDoorTarget: Vec3 = [
  roomBounds.left + 1.2,
  upstairsFloor,
  upstairsDoor.z,
]
const upstairsDoorOutsideX = outsideRooftopLanding.x + outsideRooftopLanding.width / 2 - 0.34
const destinationSeats = seats()
const loungeDestinationSeats = destinationSeats.filter(seat => !seat.id.startsWith('stool:'))
const stoolDestinationSeats = destinationSeats.filter(seat => seat.id.startsWith('stool:'))
const playerTurnBasis = createObjectTurnBasisCache<Player>()
const npcNearUpdateDistanceSq = 16 * 16
const npcMidUpdateDistanceSq = 26 * 26
const npcUpdateVisibility = { depth: 0, distanceSq: 0, visible: false }

type PlayerUpdateView = {
  camera: {
    center: Vec3
    eye: Vec3
  }
  frame: number
  height: number
  width: number
}

export function createPlayers(count: number, outsideTree: CircleBounds, occupiedSeats: Set<string>) {
  const next: Player[] = []
  const initialSeats = seats()

  for (let i = 0; i < count; i++) {
    const seed = i + 1
    const destination = playerDestination(seed, 0, outsideTree, occupiedSeats)
    const position: Vec3 = [
      destination.position[0] + seededRange(seed, 10, -0.45, 0.45),
      destination.position[1],
      destination.position[2] + seededRange(seed, 11, -0.45, 0.45),
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
      idleClipIndex: Math.floor(seededRange(seed, 18, 1, 20)),
      input: [0, 0, 0],
      nextDecision: seededRange(seed, 13, 0.3, 2.8),
      travelSpeed: travelSpeed(seed, 22),
      destination,
      destinationUntil: seededRange(seed, 20, 35, 95),
      lingeringUntil: destination.kind === 'random'
        ? seededRange(seed, 21, destination.linger![0], destination.linger![1])
        : undefined,
      style,
      resolvedStyle: resolvePlayerStyle(style),
      seed,
    }

    if (i < npcConfig.initialSeatedCount) {
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
  player.sittingUntil = seededRange(player.seed, 31, npcConfig.seat.linger[0], npcConfig.seat.linger[1])
  player.nextDecision = player.sittingUntil
}

export function updatePlayers(
  players: Player[],
  delta: number,
  time: number,
  outsideTree: CircleBounds,
  occupiedSeats: Set<string>,
  updateView: PlayerUpdateView,
) {
  const view = characterView(updateView.camera.eye, updateView.camera.center)
  const movement = {
    count: players.reduce((count, player) => count + (travelingPlayer(player, time) ? 1 : 0), 0),
    max: Math.max(npcConfig.movement.minimumTravelers, Math.floor(players.length * npcConfig.movement.travelerRatio)),
  }

  for (const player of players) {
    const cadence = npcUpdateCadence(player, view, updateView.width, updateView.height)

    player.npcUpdateDelta = (player.npcUpdateDelta ?? 0) + delta
    if (cadence > 1 && (updateView.frame + player.seed) % cadence !== 0) {
      continue
    }

    const updateDelta = player.npcUpdateDelta

    player.npcUpdateDelta = 0
    const flowingDoor = doorPauseFlow(player)
    const flowingStairs = stairFlow(player)

    if (flowingDoor || flowingStairs) {
      player.pauseUntil = undefined
    }

    if (player.seat) {
      if (time < player.sittingUntil!) {
        const seat = seatById(player.seat)
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
      leaveSeat(player, time)
      choosePlayerDestination(player, time, outsideTree, occupiedSeats)
    }

    if (player.leavingSeatUntil && time < player.leavingSeatUntil) {
      player.input[0] = 0
      player.input[1] = 0
      player.input[2] = 1
      player.pauseUntil = undefined
      player.sidestepUntil = undefined
      player.travelLateralUntil = undefined
      player.travelLateralDirection = undefined
    }
    else if (!flowingDoor && !flowingStairs && updateRandomPause(player, time)) {
      player.motionBlend += (0 - player.motionBlend) * (1 - Math.exp(-7 * updateDelta))
      player.mode = player.motionBlend > 0.5 ? 'run' : 'stand'
      settlePlayerPosition(player, outsideTree)
      continue
    }

    if (player.leavingSeatUntil && time < player.leavingSeatUntil) {
      player.nextDecision = player.leavingSeatUntil
    }
    else if (player.destination.kind === 'random') {
      updateRandomPlayer(player, updateDelta, time, outsideTree, occupiedSeats, movement)
    }
    else {
      updateDestinationPlayer(player, updateDelta, time, outsideTree, occupiedSeats, movement)
    }

    const inputLengthSq = lengthSq(player.input)
    const moving = inputLengthSq > 0

    player.motionBlend += ((moving ? 1 : 0) - player.motionBlend) * (1 - Math.exp(-7 * updateDelta))
    player.mode = player.motionBlend > 0.5 ? 'run' : 'stand'

    if (moving) {
      const lastX = player.position[0]
      const lastZ = player.position[2]
      const previousPosition: Vec3 = [player.position[0], player.position[1], player.position[2]]
      const turn = playerTurnBasis(player, player.turn)
      const inputX = turn.sin * player.input[2] + turn.cos * player.input[0]
      const inputZ = turn.cos * player.input[2] - turn.sin * player.input[0]
      const inputLength = Math.sqrt(inputX * inputX + inputZ * inputZ)
      const directionX = inputX / inputLength
      const directionZ = inputZ / inputLength

      const speed = Math.min(Math.sqrt(inputLengthSq), 1)

      player.position[0] += directionX * updateDelta * 2.55 * speed * player.travelSpeed
      player.position[2] += directionZ * updateDelta * 2.55 * speed * player.travelSpeed

      collideRoomWithoutDuck(player.position, outsideTree, isOutside(player.position), previousPosition)
      if ((!player.leavingSeatUntil || time >= player.leavingSeatUntil) && trySitPlayer(player, time, occupiedSeats)) {
        continue
      }

      if (blockedForward(player, lastX, lastZ, directionX, directionZ, updateDelta)) {
        if (doorPauseFlow(player) || stairFlow(player)) {
          player.travelLateralUntil = undefined
          player.travelLateralDirection = undefined
          player.doorTarget = undefined
          continue
        }

        pauseBlockedPlayer(player, time, outsideTree, occupiedSeats)
        continue
      }

      player.turn = smoothAngle(player.turn, Math.atan2(directionX, directionZ), 8, updateDelta)
    }
    else {
      collideRoomWithoutDuck(player.position, outsideTree, isOutside(player.position))
    }

    player.position[1] = walkHeightWithoutDuck(player.position[0], player.position[1], player.position[2])
  }
}

function npcUpdateCadence(
  player: Player,
  view: ReturnType<typeof characterView>,
  width: number,
  height: number,
) {
  const visibility = characterVisibilityInto(player, view, width, height, npcUpdateVisibility)

  if (visibility.visible || visibility.distanceSq <= npcNearUpdateDistanceSq) {
    return 1
  }
  if (visibility.distanceSq <= npcMidUpdateDistanceSq) {
    return 2
  }

  return 4
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
  leaveSeat(player, time)
  choosePlayerDestination(player, time, outsideTree, occupiedSeats)
}

function leaveSeat(player: Player, time: number) {
  player.seat = undefined
  player.sittingUntil = undefined
  player.mode = 'run'
  player.motionBlend = 1
  player.input[0] = 0
  player.input[1] = 0
  player.input[2] = 1
  player.position[0] += Math.sin(player.turn) * 0.46
  player.position[2] += Math.cos(player.turn) * 0.46
  player.leavingSeatUntil = time + npcConfig.leaveSeatTime
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

  player.nextPauseDecision = time
    + seededRange(player.seed, Math.floor(time * 4.7), 2, 6)

  if (seededRandom(player.seed, Math.floor(time * 8.9)) >= 0.16) {
    return false
  }

  player.pauseUntil = time
    + seededRange(player.seed, Math.floor(time * 6.1), npcConfig.pause.random[0], npcConfig.pause.random[1])
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
  movement: { count: number; max: number },
) {
  if (time >= player.lingeringUntil!) {
    if (!useMovementSlot(movement)) {
      waitForMovementSlot(player, time)
      return
    }

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
  movement: { count: number; max: number },
) {
  if (time >= player.destinationUntil!) {
    if (!travelingPlayer(player, time) && !useMovementSlot(movement)) {
      waitForMovementSlot(player, time)
      return
    }

    choosePlayerDestination(player, time, outsideTree, occupiedSeats)
    return
  }

  if (time >= player.nextDecision) {
    player.nextDecision = time
      + seededRange(player.seed, Math.floor(time * 3.1), npcConfig.decision.interval[0], npcConfig.decision.interval[1])

    if (seededRandom(player.seed, Math.floor(time * 9.7)) < npcConfig.decision.repickChance) {
      if (!travelingPlayer(player, time) && !useMovementSlot(movement)) {
        stopPlayerInput(player)
        return
      }

      choosePlayerDestination(player, time, outsideTree, occupiedSeats)
      return
    }
  }

  const target = activePlayerTarget(player, time, outsideTree)
  const dx = target[0] - player.position[0]
  const dz = target[2] - player.position[2]
  const distanceSq = dx * dx + dz * dz
  const atDestinationSide = roomAt(player.position) === player.destination.zone
  const destinationDx = player.destination.position[0] - player.position[0]
  const destinationDz = player.destination.position[2] - player.position[2]
  const destinationDistanceSq = destinationDx * destinationDx + destinationDz * destinationDz

  const arriveRadius = player.destination.kind === 'lounge' || player.destination.kind === 'stool'
    ? npcConfig.arrive.seat
    : npcConfig.arrive.destination

  if (atDestinationSide && destinationDistanceSq < arriveRadius * arriveRadius) {
    if (player.destination.kind === 'lounge' || player.destination.kind === 'stool') {
      if (trySitPlayer(player, time, occupiedSeats)) {
        return
      }

      choosePlayerDestination(player, time, outsideTree, occupiedSeats)
      return
    }

    if (!player.lingeringUntil) {
      player.lingeringUntil = time
        + seededRange(player.seed, Math.floor(time * 2.9), player.destination.linger![0], player.destination.linger![1])
      player.nextDecision = time
    }

    if (time >= player.nextDecision) {
      chooseDestinationJitter(player, delta, time)
      player.nextDecision = time
        + seededRange(player.seed, Math.floor(time * 3.1), npcConfig.destination.jitter[0],
          npcConfig.destination.jitter[1])
    }

    turnTowardDestination(player, delta)

    if (time >= player.lingeringUntil) {
      if (!useMovementSlot(movement)) {
        waitForMovementSlot(player, time)
        return
      }

      choosePlayerDestination(player, time, outsideTree, occupiedSeats)
    }

    return
  }

  player.sidestepUntil = undefined

  const distance = Math.sqrt(distanceSq)

  chooseTravelInput(player, dx / distance, dz / distance, delta, time)
}

function travelingPlayer(player: Player, time: number) {
  return !player.seat
    && (!player.pauseUntil || time >= player.pauseUntil)
    && player.destination.kind !== 'random'
    && !destinationReached(player)
}

function destinationReached(player: Player) {
  const dx = player.destination.position[0] - player.position[0]
  const dz = player.destination.position[2] - player.position[2]
  const arriveRadius = player.destination.kind === 'lounge' || player.destination.kind === 'stool'
    ? npcConfig.arrive.seat
    : npcConfig.arrive.destination

  return roomAt(player.position) === player.destination.zone && dx * dx + dz * dz < arriveRadius * arriveRadius
}

function useMovementSlot(movement: { count: number; max: number }) {
  if (movement.count >= movement.max) {
    return false
  }

  movement.count++

  return true
}

function waitForMovementSlot(player: Player, time: number) {
  stopPlayerInput(player)
  player.nextDecision = time + seededRange(player.seed, Math.floor(time * 4.3), 2, 5)
  player.destinationUntil = player.nextDecision
  player.lingeringUntil = player.nextDecision
}

function stopPlayerInput(player: Player) {
  player.input[0] = 0
  player.input[1] = 0
  player.input[2] = 0
}

function settlePlayerPosition(player: Player, outsideTree: CircleBounds) {
  collideRoomWithoutDuck(player.position, outsideTree, isOutside(player.position))
  player.position[1] = walkHeightWithoutDuck(player.position[0], player.position[1], player.position[2])
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

  player.travelLateralUntil = time
    + seededRange(player.seed, Math.floor(time * 2.1), npcConfig.travel.lateralTime[0], npcConfig.travel.lateralTime[1])
  player.travelLateralDirection = seededRandom(player.seed, Math.floor(time * 2.7)) < 0.5 ? -1 : 1

  return player.travelLateralDirection
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
  const pauseUntil = time
    + seededRange(player.seed, Math.floor(time * 6.7), npcConfig.pause.blocked[0], npcConfig.pause.blocked[1])

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

function activePlayerTarget(player: Player, time: number, outsideTree: CircleBounds) {
  const zone = roomAt(player.position)
  let target: Vec3

  if (player.destination.zone === 'upstairs') {
    target = upstairsTravelTarget(player, time, outsideTree)
  }
  else if (zone === 'upstairs' || onUpstairsExitPath(player.position)) {
    target = downstairsTravelTarget(player, time, outsideTree)
  }
  else if (doorFlow(player)) {
    target = travelPathTarget(player, doorTarget(player), outsideTree)
  }
  else {
    target = activeTravelTarget(player, travelTarget(player, time), outsideTree)
  }

  return target
}

function doorFlow(player: Player) {
  return player.destination.kind !== 'random'
    && (destinationNeedsBackDoor(player) || inDoorFlow(player.position))
}

function doorPauseFlow(player: Player) {
  return doorFlow(player) || (player.destination.kind !== 'random' && inDoorClearFlow(player.position))
}

function stairFlow(player: Player) {
  return player.destination.kind !== 'random'
    && (player.destination.zone === 'upstairs' || roomAt(player.position) === 'upstairs' || onUpstairsExitPath(player.position))
}

function destinationNeedsBackDoor(player: Player) {
  const zone = roomAt(player.position)

  if (zone === 'upstairs') {
    return player.destination.zone !== 'upstairs'
  }

  return player.destination.zone === 'upstairs'
    ? zone === 'inside'
    : isOutside(player.position) !== player.destination.outside
}

function inDoorFlow(position: Vec3) {
  return Math.abs(position[0] - backDoor.x) < doorFlowWidth
    && position[2] > doorFlowInside
    && position[2] < doorFlowOutside
}

function inDoorClearFlow(position: Vec3) {
  return Math.abs(position[0] - backDoor.x) < doorFlowWidth
    && position[2] > doorClearFlowInside
    && position[2] < doorClearFlowOutside
}

function doorTarget(player: Player) {
  const z = doorTargetZ(player)
  const x = doorTargetX(player, z)

  if (player.doorTarget?.[0] === x && player.doorTarget[2] === z) {
    return player.doorTarget
  }

  player.doorTarget = [x, characterFloor, z]

  return player.doorTarget
}

function doorTargetZ(player: Player) {
  if (inDoorFlow(player.position)) {
    return player.destination.outside || player.destination.zone === 'upstairs' ? doorClearOutside : doorClearInside
  }

  return isOutside(player.position) ? doorApproachOutside : doorApproachInside
}

function doorTargetX(player: Player, z: number) {
  const step = Math.floor(player.destinationUntil! * 5.3)

  if (z === doorApproachInside || z === doorApproachOutside) {
    return backDoor.x + seededRange(player.seed, step + 301, -doorApproachLaneRange, doorApproachLaneRange)
  }

  return backDoor.x + seededRange(player.seed, step, -doorCrossLaneRange, doorCrossLaneRange)
}

function travelTarget(player: Player, time: number) {
  if (player.destination.kind === 'lounge' || player.destination.kind === 'stool') {
    return player.destination.position
  }

  if (player.travelTarget && time < player.nextTravelTargetAt!) {
    return player.travelTarget
  }

  const angle = seededRange(player.seed, Math.floor(time * 2.9), -Math.PI, Math.PI)
  const radius = seededRange(player.seed, Math.floor(time * 3.7), 0, npcConfig.travel.targetJitter)

  const target: Vec3 = [
    player.destination.position[0] + Math.sin(angle) * radius,
    player.destination.position[1],
    player.destination.position[2] + Math.cos(angle) * radius,
  ]

  player.travelTarget = roomAt(target) === player.destination.zone
    ? target
    : player.destination.position
  player.nextTravelTargetAt = time
    + seededRange(player.seed, Math.floor(time * 4.1), npcConfig.travel.targetJitterTime[0],
      npcConfig.travel.targetJitterTime[1])

  return player.travelTarget
}

function upstairsTravelTarget(player: Player, time: number, outsideTree: CircleBounds) {
  const zone = roomAt(player.position)

  if (zone === 'inside' || inDoorFlow(player.position)) {
    return travelPathTarget(player, doorTarget(player), outsideTree)
  }

  if (zone === 'upstairs') {
    return travelTarget(player, time)
  }

  if (player.position[1] < upstairsFloor - 0.7) {
    if (!onUpstairsStairPath(player.position)
      && distanceSq(player.position, upstairsStairBottom) > npcConfig.arrive.waypoint ** 2)
    {
      return travelPathTarget(player, upstairsStairBottom, outsideTree)
    }

    return upstairsStairClimbTarget(player.position)
  }

  const outsideDoor = upstairsDoorOutsideTarget(player)

  if (distanceSq(player.position, outsideDoor) > npcConfig.arrive.waypoint ** 2) {
    return outsideDoor
  }

  const door = upstairsDoorInsideTarget(player)

  if (distanceSq(player.position, door) > 1) {
    return door
  }

  return travelTarget(player, time)
}

function downstairsTravelTarget(player: Player, time: number, outsideTree: CircleBounds) {
  const onStairs = onUpstairsStairPath(player.position)
  const nearStairTop = distanceSq(player.position, upstairsStairTop) <= npcConfig.arrive.waypoint ** 2
  const insideDoor = upstairsDoorInsideTarget(player)
  const outsideDoor = upstairsDoorOutsideTarget(player)

  if (player.position[1] > upstairsFloor - 0.7 || (onStairs && player.position[1] > characterFloor + 0.7)) {
    if (!onStairs && !nearStairTop
      && player.position[0] > roomBounds.left - 0.2
      && Math.abs(player.position[2] - insideDoor[2]) > 0.35)
    {
      return insideDoor
    }

    if (!onStairs && !nearStairTop
      && distanceSq(player.position, outsideDoor) > npcConfig.arrive.waypoint ** 2)
    {
      return outsideDoor
    }

    if (!onStairs && !nearStairTop
      && distanceSq(player.position, upstairsStairTop) > npcConfig.arrive.waypoint ** 2)
    {
      return upstairsStairTop
    }

    return upstairsStairDescendTarget(player.position)
  }

  if (doorFlow(player)) {
    return travelPathTarget(player, doorTarget(player), outsideTree)
  }

  return activeTravelTarget(player, travelTarget(player, time), outsideTree)
}

function activeTravelTarget(player: Player, target: Vec3, outsideTree: CircleBounds) {
  return isOutside(player.position) && player.destination.outside
    ? travelPathTarget(player, target, outsideTree)
    : target
}

function upstairsDoorInsideTarget(player: Player): Vec3 {
  return [
    upstairsDoorTarget[0],
    upstairsDoorTarget[1],
    upstairsDoorLaneZ(player),
  ]
}

function upstairsDoorOutsideTarget(player: Player): Vec3 {
  return [
    upstairsDoorOutsideX,
    upstairsFloor,
    upstairsDoorLaneZ(player),
  ]
}

function upstairsDoorLaneZ(player: Player) {
  return seededRange(player.seed, Math.floor(player.destinationUntil! * 4.7) + 307, upstairsDoorLaneBack,
    upstairsDoorLaneFront)
}

function upstairsStairClimbTarget(position: Vec3): Vec3 {
  const stairBack = outsideRooftopStairs.z - outsideRooftopStairs.depth / 2
  const nextZ = Math.max(stairBack + 0.35, position[2] - 0.55)

  return nextZ <= stairBack + 0.4 ? upstairsStairTop : [outsideRooftopStairs.x, position[1], nextZ]
}

function upstairsStairDescendTarget(position: Vec3): Vec3 {
  const stairFront = outsideRooftopStairs.z + outsideRooftopStairs.depth / 2
  const nextZ = Math.min(stairFront - 0.35, position[2] + 0.55)

  return nextZ >= stairFront - 0.4 ? upstairsStairBottom : [outsideRooftopStairs.x, position[1], nextZ]
}

function onUpstairsExitPath(position: Vec3) {
  return position[1] > upstairsFloor - 0.7
    || (onUpstairsStairPath(position) && position[1] > characterFloor + 0.7)
}

function onUpstairsStairPath(position: Vec3) {
  return onOutsideRooftopStairPath(position)
}

function travelPathTarget(player: Player, target: Vec3, outsideTree: CircleBounds) {
  if (!player.travelPathTarget || !samePoint(player.travelPathTarget, target)) {
    try {
      player.travelPath = findPath(player.position, target, outsideTree, npcPathOptions)
    }
    catch (e) {
      console.error(e)
      player.travelPath = []
    }
    player.travelPathTarget = target
  }

  while (player.travelPath!.length > 0 && waypointReached(player.position, player.travelPath![0]!)) {
    player.travelPath!.shift()
  }

  return player.travelPath![0] ?? target
}

function samePoint(a: Vec3, b: Vec3) {
  return a[0] === b[0] && a[2] === b[2]
}

function distanceSq(a: Vec3, b: Vec3) {
  const dx = a[0] - b[0]
  const dz = a[2] - b[2]

  return dx * dx + dz * dz
}

function waypointReached(position: Vec3, waypoint: Vec3) {
  return distanceSq(position, waypoint) < npcConfig.arrive.waypoint * npcConfig.arrive.waypoint
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
    + seededRange(player.seed, Math.floor(time * 2.3), npcConfig.seat.linger[0], npcConfig.seat.linger[1])
  player.nextDecision = player.sittingUntil
  player.lingeringUntil = undefined
  player.pauseUntil = undefined
  player.sidestepUntil = undefined
  player.travelLateralUntil = undefined
  player.travelLateralDirection = undefined
  player.travelTarget = undefined
  player.travelPath = undefined
  player.travelPathTarget = undefined
  player.nextTravelTargetAt = undefined
  player.doorTarget = undefined
  player.leavingSeatUntil = undefined
}

function chooseRandomInput(player: Player, delta: number, time: number) {
  const random = seededRandom(player.seed, Math.floor(time * 7.7))

  if (random < npcConfig.pause.randomInputChance) {
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

  if (random < npcConfig.pause.destinationJitterChance) {
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
  return rawPlayerDestination(seed, step, outsideTree, occupiedSeats)
}

function rawPlayerDestination(
  seed: number,
  step: number,
  outsideTree: CircleBounds,
  occupiedSeats: Set<string>,
): PlayerDestination {
  const pick = seededRandom(seed, step + 100)
  const weights = npcConfig.destination.weights

  if (pick < weights.insideDj) {
    return djDestination(seed, step, true)
  }

  if (pick < weights.outsideDj) {
    return djDestination(seed, step, false)
  }

  if (pick < weights.upstairsDj) {
    return upstairsDjDestination(seed, step)
  }

  if (pick < weights.upstairsBarDance) {
    return upstairsBarDanceDestination(seed, step)
  }

  if (pick < weights.lounge) {
    return seatDestination(seed, step, occupiedSeats, 'lounge')
      ?? treeDestination(seed, step, outsideTree, occupiedSeats)
  }

  if (pick < weights.stool) {
    return seatDestination(seed, step, occupiedSeats, 'stool') ?? kioskDestination(seed, step)
  }

  if (pick < weights.tree) {
    return treeDestination(seed, step, outsideTree, occupiedSeats)
  }

  if (pick < weights.kiosk) {
    return kioskDestination(seed, step)
  }

  if (pick < weights.foodTruck) {
    return foodTruckDestination(seed, step)
  }

  if (pick < weights.restroom) {
    return restroomDestination(seed, step)
  }

  if (pick < weights.photoWall) {
    return photoWallDestination(seed, step)
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
  player.travelSpeed = travelSpeed(player.seed, Math.floor(time * 5.1))
  player.lingeringUntil = player.destination.kind === 'random'
    ? time
      + seededRange(player.seed, Math.floor(time * 2.9), player.destination.linger![0], player.destination.linger![1])
    : undefined
  player.nextDecision = time
  player.pauseUntil = undefined
  player.sidestepUntil = undefined
  player.travelLateralUntil = undefined
  player.travelLateralDirection = undefined
  player.travelTarget = undefined
  player.travelPath = undefined
  player.travelPathTarget = undefined
  player.nextTravelTargetAt = time
  player.doorTarget = undefined
  player.destinationUntil = time + seededRange(player.seed, Math.floor(time * 4.9), 35, 95)
}

function travelSpeed(seed: number, step: number) {
  return seededRange(seed, step, npcConfig.travel.speed[0], npcConfig.travel.speed[1])
}

function djDestination(seed: number, step: number, inside: boolean) {
  const danceFloor = inside
    ? npcConfig.destination.danceFloor
    : npcConfig.destination.outsideDanceFloor
  const jitterX = seededRange(seed, step + 102, -danceFloor.sideRange, danceFloor.sideRange)
    + seededRange(seed, step + 111, -danceFloor.jitter, danceFloor.jitter)
  const jitterZ = seededRange(seed, step + 103, danceFloor.backRange[0], danceFloor.backRange[1])
    + seededRange(seed, step + 112, -danceFloor.jitter, danceFloor.jitter)

  return inside
    ? danceFloorDestination(djBooth, false, 1, jitterX, jitterZ)
    : danceFloorDestination(outsideDjBooth, true, -1, jitterX, jitterZ, danceFloor.distance)
}

function seatDestination(
  seed: number,
  step: number,
  occupiedSeats: Set<string>,
  kind: 'lounge' | 'stool',
): PlayerDestination | undefined {
  const candidates = kind === 'stool' ? stoolDestinationSeats : loungeDestinationSeats
  let openCount = 0

  for (const candidate of candidates) {
    if (!occupiedSeats.has(candidate.id)) {
      openCount++
    }
  }

  if (openCount === 0) {
    return undefined
  }
  let index = Math.floor(seededRange(seed, step + 104, 0, openCount))
  let seat = candidates[0]!

  for (const candidate of candidates) {
    if (occupiedSeats.has(candidate.id)) {
      continue
    }

    if (index === 0) {
      seat = candidate
      break
    }

    index--
  }

  const offset = seededRange(seed, step + 105, -0.18, 0.18)
  const approachDistance = kind === 'stool' ? 0.78 : 0.52
  const approachDirection = kind === 'stool' ? -approachDistance : approachDistance

  return {
    kind,
    outside: isOutside(seat.position),
    position: [
      seat.position[0] + Math.sin(seat.turn) * approachDirection + Math.cos(seat.turn) * offset,
      seat.position[1] - 0.28,
      seat.position[2] + Math.cos(seat.turn) * approachDirection - Math.sin(seat.turn) * offset,
    ],
    zone: roomAt(seat.position),
    lookAt: seat.position,
    linger: [npcConfig.destination.linger[0], npcConfig.destination.linger[1]],
  }
}

function treeDestination(
  seed: number,
  step: number,
  outsideTree: CircleBounds,
  occupiedSeats: Set<string>,
): PlayerDestination {
  if (!occupiedSeats.has(treeSwing.seat.id) && seededRandom(seed, step + 118) < 0.45) {
    return {
      kind: 'tree',
      outside: true,
      position: [treeSwing.seat.position[0], characterFloor, treeSwing.seat.position[2]],
      zone: 'outside',
      lookAt: [outsideTree.x, characterFloor, outsideTree.z],
      linger: [npcConfig.destination.linger[0], npcConfig.destination.linger[1]],
    }
  }

  const spot = Math.floor(seededRange(seed, step + 106, 0, npcConfig.destination.treeSpots))
  const spread = Math.PI / npcConfig.destination.treeSpots
  const angle = spot / npcConfig.destination.treeSpots * Math.PI * 2 + seededRange(seed, step + 109, -spread, spread)
  const distance = seededRange(seed, step + 107, outsideTree.radius + npcConfig.destination.treeRadius[0],
    outsideTree.radius + npcConfig.destination.treeRadius[1])

  return {
    kind: 'tree',
    outside: true,
    position: [outsideTree.x + Math.sin(angle) * distance, characterFloor, outsideTree.z + Math.cos(angle) * distance],
    zone: 'outside',
    lookAt: [outsideTree.x, characterFloor, outsideTree.z],
    linger: [npcConfig.destination.linger[0], npcConfig.destination.linger[1]],
  }
}

function kioskDestination(seed: number, step: number): PlayerDestination {
  const angle = seededRange(seed, step + 113, 0, Math.PI * 2)
  const distance = seededRange(seed, step + 114, npcConfig.destination.kioskRadius[0],
    npcConfig.destination.kioskRadius[1])

  return {
    kind: 'kiosk',
    outside: true,
    position: [outsideHutBar.x + Math.sin(angle) * distance, characterFloor,
      outsideHutBar.z + Math.cos(angle) * distance],
    zone: 'outside',
    lookAt: [outsideHutBar.x, characterFloor, outsideHutBar.z],
    linger: [npcConfig.destination.linger[0], npcConfig.destination.linger[1]],
  }
}

function foodTruckDestination(seed: number, step: number): PlayerDestination {
  const along = seededRange(seed, step + 115, -npcConfig.destination.foodTruckSpread,
    npcConfig.destination.foodTruckSpread)
  const distance = seededRange(seed, step + 116, npcConfig.destination.foodTruckDistance[0],
    npcConfig.destination.foodTruckDistance[1])

  return {
    kind: 'foodTruck',
    outside: true,
    position: [
      outsideFoodTruckFoodWall.x + outsideFoodTruckFoodWall.tangent[0] * along
      + outsideFoodTruckFoodWall.normal[0] * distance,
      characterFloor,
      outsideFoodTruckFoodWall.z + outsideFoodTruckFoodWall.tangent[2] * along
      + outsideFoodTruckFoodWall.normal[2] * distance,
    ],
    zone: 'outside',
    lookAt: [outsideFoodTruckFoodWall.x, characterFloor, outsideFoodTruckFoodWall.z],
    linger: [npcConfig.destination.linger[0], npcConfig.destination.linger[1]],
  }
}

function restroomDestination(seed: number, step: number): PlayerDestination {
  const x = outsideToilets.x + outsideToilets.width / 2 + seededRange(seed, step + 125, 1.1, 2.2)
  const z = outsideToilets.z + seededRange(seed, step + 126, -1.65, 1.05)

  return {
    kind: 'restroom',
    outside: true,
    position: [x, characterFloor, z],
    zone: 'outside',
    lookAt: [outsideToilets.x + outsideToilets.width / 2, characterFloor, z],
    linger: [npcConfig.destination.shortLinger[0], npcConfig.destination.shortLinger[1]],
  }
}

function photoWallDestination(seed: number, step: number): PlayerDestination {
  const z = outsidePhotoWall.z
    + seededRange(seed, step + 127, -outsidePhotoWall.width * 0.32, outsidePhotoWall.width * 0.32)
  const x = outsidePhotoWall.x + seededRange(seed, step + 128, 1.25, 2.45)

  return {
    kind: 'photoWall',
    outside: true,
    position: [x, characterFloor, z],
    zone: 'outside',
    lookAt: [outsidePhotoWall.x, characterFloor, z],
    linger: [npcConfig.destination.shortLinger[0], npcConfig.destination.shortLinger[1]],
  }
}

function randomDestination(seed: number, step: number): PlayerDestination {
  return {
    kind: 'random',
    outside: seededRandom(seed, step + 108) < 0.5,
    position: [0, characterFloor, 0],
    zone: seededRandom(seed, step + 108) < 0.5 ? 'outside' : 'inside',
    linger: [npcConfig.destination.linger[0], npcConfig.destination.linger[1]],
  }
}

function danceFloorDestination(
  bounds: typeof djBooth,
  outside: boolean,
  forward: number,
  jitterX: number,
  jitterZ: number,
  distance = npcConfig.destination.danceFloor.distance,
): PlayerDestination {
  return {
    kind: 'dj',
    outside,
    position: [bounds.x + jitterX, characterFloor, bounds.z + forward * (bounds.depth * 0.5 + distance + jitterZ)],
    zone: outside ? 'outside' : 'inside',
    lookAt: [bounds.x, characterFloor, bounds.z],
    linger: [npcConfig.destination.linger[0], npcConfig.destination.linger[1]],
  }
}

function upstairsDjDestination(seed: number, step: number): PlayerDestination {
  const danceFloor = npcConfig.destination.danceFloor
  const jitterX = seededRange(seed, step + 119, -danceFloor.sideRange, danceFloor.sideRange)
    + seededRange(seed, step + 120, -danceFloor.jitter, danceFloor.jitter)
  const jitterZ = seededRange(seed, step + 121, danceFloor.backRange[0], danceFloor.backRange[1])
    + seededRange(seed, step + 122, -danceFloor.jitter, danceFloor.jitter)

  return {
    kind: 'dj',
    outside: false,
    position: [
      upstairsDjBooth.x + jitterX,
      upstairsFloor,
      upstairsDjBooth.z - (upstairsDjBooth.depth * 0.5 + danceFloor.distance + jitterZ),
    ],
    zone: 'upstairs',
    lookAt: [upstairsDjBooth.x, upstairsFloor, upstairsDjBooth.z],
    linger: [npcConfig.destination.linger[0], npcConfig.destination.linger[1]],
  }
}

function upstairsBarDanceDestination(seed: number, step: number): PlayerDestination {
  const x = upstairsBar.x + seededRange(seed, step + 123, -4.35, 4.35)
  const backCouchFront = roomBounds.back + 1.08 + 0.82 / 2
  const barBack = upstairsBar.z - upstairsBar.depth / 2
  const centerZ = (backCouchFront + barBack) / 2
  const z = centerZ + seededRange(seed, step + 124, -2.25, 2.25)

  return {
    kind: 'dj',
    outside: false,
    position: [x, upstairsFloor, z],
    zone: 'upstairs',
    lookAt: [upstairsDjBooth.x, upstairsFloor, upstairsDjBooth.z],
    linger: [npcConfig.destination.linger[0], npcConfig.destination.linger[1]],
  }
}

function seededRange(seed: number, salt: number, min: number, max: number) {
  return min + (max - min) * seededRandom(seed, salt)
}

function seededRandom(seed: number, salt: number) {
  const value = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453123

  return value - Math.floor(value)
}
