import { characterFloor } from './character-data.ts'
import { clamp } from './math.ts'
import { backDoor, bartenderBar, bartenderStools, djBooth, djSpeakers, outsideBounds, outsideBuddha, outsideCouches,
  outsideDjBooth, outsideDjSpeakers, outsideHut, outsideHutBar, outsideHutBarStools, outsideHutDeckHeight,
  outsidePalmTree, outsideStage, outsideToiletDoor, outsideToilets, roomBounds, tent, tentCenterBench, tentDjBooth,
  tentDjSpeakers, tentDoor, tentDoorAngle, tentPole, tentVideoAngle } from './scene-data.ts'
import type { Bounds, CircleBounds, Vec3, VideoZone } from './types.ts'

export type Seat = {
  id: string
  position: Vec3
  turn: number
}

type PaddedBounds = {
  back: number
  front: number
  left: number
  right: number
}

const djBoothCollision = paddedBounds(djBooth)
const bartenderBarCollision = paddedBounds(bartenderBar)
const bartenderStoolCollisions = bartenderStools.map(bounds => paddedBounds(bounds))
const seatStools = [...bartenderStools, ...outsideHutBarStools]
const djSpeakerCollisions = djSpeakers.map(bounds => paddedBounds(bounds))
const outsideDjBoothCollision = paddedBounds(outsideDjBooth)
const outsideStageCollision = paddedBounds(outsideStage, 0.12)
const outsideDjSpeakerCollisions = outsideDjSpeakers.map(bounds => paddedBounds(bounds))
const tentDjBoothCollision = paddedBounds(tentDjBooth)
const tentDjSpeakerCollisions = tentDjSpeakers.map(bounds => paddedBounds(bounds))
const outsideCouchCollisions = outsideCouches.map(bounds => couchCollisionBounds(bounds))
const outsideHutBarCollision = paddedBounds(outsideHutBar)
const outsideHutBarStoolCollisions = outsideHutBarStools.map(bounds => paddedBounds(bounds))
const outsideToiletWallCollisions = toiletWallBounds().map(bounds => paddedBounds(bounds, 0.18))
const outsideHutBarDeckBounds: Bounds = {
  x: (outsideHut.x - outsideHut.width / 2 + outsideHutBar.x) / 2,
  z: outsideHutBar.z,
  width: outsideHut.width / 2 + outsideHutBar.width,
  depth: outsideHut.depth,
}
const outsideHutPostCollisions = hutPostBounds(outsideHut).map(bounds => paddedBounds(bounds, 0.18))
const insideLeft = roomBounds.left + 0.8
const insideRight = roomBounds.right - 0.8
const insideBack = roomBounds.back + 0.8
const insideFront = roomBounds.front - 0.8
const buddhaSeatId = 'buddha'
const djBoothTop = characterFloor + 0.71
const speakerTop = characterFloor + 1.82
const barTop = characterFloor + 0.86
const couchTop = characterFloor + 0.78
const stoolTop = characterFloor + 0.72
const outsideHutStoolTop = characterFloor + outsideHutDeckHeight + 0.72
const outsideStageTop = characterFloor + 4.2
const platformStep = 0.42

export function walkHeight(x: number, y: number, z: number) {
  const platform = platformHeight(x, z)

  if (platform !== undefined && y > platform - platformStep) {
    return platform
  }

  if (inBounds(x, z, outsideHut) || inBounds(x, z, outsideHutBarDeckBounds)) {
    return characterFloor + outsideHutDeckHeight
  }

  return characterFloor
}

function isAtBackDoor(position: Vec3, padding = 0) {
  return Math.abs(position[0] - backDoor.x) < backDoor.width * 0.5 + padding
}

function isAtTentDoor(position: Vec3, padding = 0) {
  const distance = Math.hypot(position[0] - tent.x, position[2] - tent.z)

  return Math.abs(angleDistance(pointAngle(position[0], position[2]), tentDoorAngle))
    < Math.asin((tentDoor.width / 2 + padding) / tent.radius)
    && distance > tent.radius - 1
}

export function isOutside(position: Vec3) {
  return position[0] < roomBounds.left || position[0] > roomBounds.right || position[2] < roomBounds.back
    || position[2] > roomBounds.front
}

export function roomAt(position: Vec3): VideoZone {
  return inTent(position[0], position[2]) ? 'tent' : isOutside(position) ? 'outside' : 'inside'
}

export function usesSkyBackground(_camera: { eye: Vec3; center: Vec3 }) {
  return true
}

export function collideRoom(position: Vec3, outsideTree: CircleBounds, outside = isOutside(position), previous?: Vec3) {
  if (outside) {
    position[0] = clamp(position[0], outsideBounds.left, outsideBounds.right)
    position[2] = clamp(position[2], outsideBounds.back, outsideBounds.front)
    collideBuildingWalls(position, 0.45)
    collideTentWalls(position, 0.35)
    collideCircle(position, tentPole)
    collideCircle(position, outsideTree)
    collideCircle(position, outsidePalmTree)
    collideCircle(position, outsideBuddha)
    if (!onPaddedPlatform(position, outsideDjBoothCollision, djBoothTop)) {
      collidePaddedBounds(position, outsideDjBoothCollision)
    }
    collidePaddedBounds(position, outsideStageCollision)
    if (!onPaddedPlatform(position, tentDjBoothCollision, djBoothTop)) {
      collidePaddedBounds(position, tentDjBoothCollision)
    }
    if (!onPaddedPlatform(position, outsideHutBarCollision, barTop)) {
      collidePaddedBounds(position, outsideHutBarCollision)
    }

    for (const speaker of outsideDjSpeakerCollisions) {
      if (!onPaddedPlatform(position, speaker, speakerTop)) {
        collidePaddedBounds(position, speaker)
      }
    }
    for (const speaker of tentDjSpeakerCollisions) {
      if (!onPaddedPlatform(position, speaker, speakerTop)) {
        collidePaddedBounds(position, speaker)
      }
    }

    for (const couch of outsideCouchCollisions) {
      if (!onPaddedPlatform(position, couch, couchTop)) {
        collidePaddedBounds(position, couch)
      }
    }

    for (const stool of outsideHutBarStoolCollisions) {
      if (!onPaddedPlatform(position, stool, outsideHutStoolTop)) {
        collidePaddedBounds(position, stool)
      }
    }

    for (const post of outsideHutPostCollisions) {
      collidePaddedBounds(position, post)
    }

    collideToiletWalls(position, previous)

    return
  }

  position[0] = clamp(position[0], insideLeft, insideRight)

  if (position[2] > insideFront && !isAtBackDoor(position)) {
    position[2] = insideFront
  }
  else {
    position[2] = clamp(position[2], insideBack, roomBounds.front + 0.45)
  }

  if (!onPaddedPlatform(position, djBoothCollision, djBoothTop)) {
    collidePaddedBounds(position, djBoothCollision)
  }
  if (!onPaddedPlatform(position, bartenderBarCollision, barTop)) {
    collidePaddedBounds(position, bartenderBarCollision)
  }

  for (const stool of bartenderStoolCollisions) {
    if (!onPaddedPlatform(position, stool, stoolTop)) {
      collidePaddedBounds(position, stool)
    }
  }

  for (const speaker of djSpeakerCollisions) {
    if (!onPaddedPlatform(position, speaker, speakerTop)) {
      collidePaddedBounds(position, speaker)
    }
  }
}

export function collideSphereRoom(position: Vec3, radius: number, outsideTree: CircleBounds) {
  position[0] = clamp(position[0], outsideBounds.left + radius, outsideBounds.right - radius)
  position[2] = clamp(position[2], outsideBounds.back + radius, outsideBounds.front - radius)
  collideBuildingWalls(position, radius)

  if (sphereOverlapsHeight(position, radius, characterFloor + tent.wallHeight)) {
    collideTentWalls(position, radius)
  }
  if (sphereOverlapsHeight(position, radius, characterFloor + tent.height)) {
    collideCircle(position, tentPole, radius)
  }
  if (sphereOverlapsHeight(position, radius, characterFloor + 5.5)) {
    collideCircle(position, outsideTree, radius)
    collideCircle(position, outsidePalmTree, radius)
  }
  if (sphereOverlapsHeight(position, radius, characterFloor + 1.75)) {
    collideCircle(position, outsideBuddha, radius)
  }

  collideSpherePaddedBounds(position, radius, outsideDjBoothCollision, djBoothTop)
  collideSpherePaddedBounds(position, radius, outsideStageCollision, outsideStageTop)
  collideSpherePaddedBounds(position, radius, tentDjBoothCollision, djBoothTop)
  collideSpherePaddedBounds(position, radius, outsideHutBarCollision, barTop)

  for (const speaker of outsideDjSpeakerCollisions) {
    collideSpherePaddedBounds(position, radius, speaker, speakerTop)
  }
  for (const speaker of tentDjSpeakerCollisions) {
    collideSpherePaddedBounds(position, radius, speaker, speakerTop)
  }
  for (const couch of outsideCouchCollisions) {
    collideSpherePaddedBounds(position, radius, couch, characterFloor + 0.78)
  }
  for (const stool of outsideHutBarStoolCollisions) {
    collideSpherePaddedBounds(position, radius, stool, characterFloor + outsideHutDeckHeight + 0.72)
  }
  for (const post of outsideHutPostCollisions) {
    collideSpherePaddedBounds(position, radius, post, characterFloor + outsideHutDeckHeight + 2.45)
  }
  for (const wall of outsideToiletWallCollisions) {
    collideSpherePaddedBounds(position, radius, wall, characterFloor + 2.75)
  }
}

export function isWalkable(x: number, z: number, outsideTree: CircleBounds) {
  const point: Vec3 = [x, characterFloor, z]

  if (isOutside(point)) {
    return x >= outsideBounds.left && x <= outsideBounds.right && z >= outsideBounds.back && z <= outsideBounds.front
      && !inBuildingWall(x, z, 0.45)
      && !inTentWall(x, z, 0.35)
      && !inCircle(x, z, tentPole)
      && !inCircle(x, z, outsideTree)
      && !inCircle(x, z, outsidePalmTree)
      && !inCircle(x, z, outsideBuddha)
      && !inPaddedBounds(x, z, outsideDjBoothCollision)
      && !inPaddedBounds(x, z, outsideStageCollision)
      && !inPaddedBounds(x, z, tentDjBoothCollision)
      && !inPaddedBounds(x, z, outsideHutBarCollision)
      && outsideDjSpeakerCollisions.every(bounds => !inPaddedBounds(x, z, bounds))
      && tentDjSpeakerCollisions.every(bounds => !inPaddedBounds(x, z, bounds))
      && outsideCouchCollisions.every(bounds => !inPaddedBounds(x, z, bounds))
      && outsideHutBarStoolCollisions.every(bounds => !inPaddedBounds(x, z, bounds))
      && outsideHutPostCollisions.every(bounds => !inPaddedBounds(x, z, bounds))
      && outsideToiletWallCollisions.every(bounds => !inPaddedBounds(x, z, bounds))
  }

  return x >= insideLeft && x <= insideRight
    && z >= insideBack
    && (z <= insideFront || isAtBackDoor(point))
    && z <= roomBounds.front + 0.45
    && !inPaddedBounds(x, z, djBoothCollision)
    && !inPaddedBounds(x, z, bartenderBarCollision)
    && bartenderStoolCollisions.every(bounds => !inPaddedBounds(x, z, bounds))
    && djSpeakerCollisions.every(bounds => !inPaddedBounds(x, z, bounds))
}

function inTent(x: number, z: number) {
  const dx = x - tent.x
  const dz = z - tent.z

  return dx * dx + dz * dz < tent.radius * tent.radius
}

function collideTentWalls(position: Vec3, padding: number) {
  const dx = position[0] - tent.x
  const dz = position[2] - tent.z
  const distance = Math.sqrt(dx * dx + dz * dz)
  const outer = tent.radius + padding
  const inner = tent.radius - 0.62

  if (distance < inner || distance > outer || isAtTentDoor(position, padding)) {
    return
  }

  const radius = distance > tent.radius ? outer : inner

  position[0] = tent.x + dx / distance * radius
  position[2] = tent.z + dz / distance * radius
}

function inTentWall(x: number, z: number, padding: number) {
  const dx = x - tent.x
  const dz = z - tent.z
  const distance = Math.sqrt(dx * dx + dz * dz)

  return distance < tent.radius + padding && distance > tent.radius - 0.62 && !isAtTentDoor([x, characterFloor, z], padding)
}

export function seatAt(position: Vec3, occupiedSeats = new Set<string>(), padding = 0.46, includeOccupied = false):
  | Seat
  | undefined
{
  const buddha = buddhaSeat()
  const tent = tentSeat(position, occupiedSeats, includeOccupied) ?? tentCenterSeat(position, occupiedSeats,
    includeOccupied)

  if (tent) {
    return tent
  }

  const buddhaX = position[0] - outsideBuddha.x
  const buddhaZ = position[2] - outsideBuddha.z

  if (buddhaX * buddhaX + buddhaZ * buddhaZ < (outsideBuddha.radius + padding) ** 2
    && (includeOccupied || !occupiedSeats.has(buddha.id)))
  {
    return buddha
  }

  for (const couch of outsideCouches) {
    const bounds = paddedBounds(couch, padding)

    if (position[0] > bounds.left && position[0] < bounds.right && position[2] > bounds.back
      && position[2] < bounds.front)
    {
      return nearestCouchSeat(couch, position, occupiedSeats, includeOccupied)
    }
  }

  for (let i = 0; i < seatStools.length; i++) {
    const stool = seatStools[i]!
    const bounds = paddedBounds(stool, padding)
    const seat = stoolSeat(stool, i)

    if (position[0] > bounds.left && position[0] < bounds.right && position[2] > bounds.back
      && position[2] < bounds.front && (includeOccupied || !occupiedSeats.has(seat.id)))
    {
      return seat
    }
  }
}

export function seats() {
  return [
    buddhaSeat(),
    ...tentSeats(),
    ...tentCenterSeats(),
    ...outsideCouches.flatMap(couch => couchSeats(couch)),
    ...seatStools.map((stool, index) => stoolSeat(stool, index)),
  ]
}

function buddhaSeat(): Seat {
  return {
    id: buddhaSeatId,
    position: [outsideBuddha.x, characterFloor + 0.8, outsideBuddha.z - 0.3],
    turn: Math.PI,
  }
}

function tentSeat(position: Vec3, occupiedSeats: Set<string>, includeOccupied: boolean) {
  const seats = tentSeats().filter(seat => includeOccupied || !occupiedSeats.has(seat.id))
  const seat = nearestSeat(seats, position)

  return seat && distanceSq(position, seat.position) < 1 ? seat : undefined
}

function tentCenterSeat(position: Vec3, occupiedSeats: Set<string>, includeOccupied: boolean) {
  const seats = tentCenterSeats().filter(seat => includeOccupied || !occupiedSeats.has(seat.id))
  const seat = nearestSeat(seats, position)

  return seat && distanceSq(position, seat.position) < 0.9 ? seat : undefined
}

function tentCenterSeats(): Seat[] {
  const seats: Seat[] = []
  const radius = (tentCenterBench.innerRadius + tentCenterBench.outerRadius) / 2

  for (let i = 0; i < 8; i++) {
    const angle = Math.PI * 2 * i / 8
    const x = tentCenterBench.x + Math.cos(angle) * radius
    const z = tentCenterBench.z + Math.sin(angle) * radius

    seats.push({
      id: `tent-center:${i}`,
      position: [x, characterFloor + 0.3, z],
      turn: Math.atan2(x - tentCenterBench.x, z - tentCenterBench.z),
    })
  }

  return seats
}

function tentSeats(): Seat[] {
  const seats: Seat[] = []
  const outer = tent.radius - 0.52
  const radius = tent.radius - 0.97
  const doorCutoutHalf = Math.asin((tentDoor.width / 2 + 0.28) / outer)
  const boothCutoutHalf = Math.asin(2.2 / outer)

  for (let i = 0; i < 24; i++) {
    const angle = Math.PI * 2 * i / 24
    const x = tent.x + Math.sin(angle) * radius
    const z = tent.z + Math.cos(angle) * radius

    if (Math.abs(angleDistance(angle, tentDoorAngle)) < doorCutoutHalf
      || Math.abs(angleDistance(angle, tentVideoAngle)) < boothCutoutHalf)
    {
      continue
    }

    seats.push({
      id: `tent:${i}`,
      position: [x, characterFloor + 0.3, z],
      turn: Math.atan2(tent.x - x, tent.z - z),
    })
  }

  return seats
}

function angleDistance(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b))
}

function pointAngle(x: number, z: number) {
  return Math.atan2(x - tent.x, z - tent.z)
}

function nearestCouchSeat(
  couch: (typeof outsideCouches)[number],
  position: Vec3,
  occupiedSeats: Set<string>,
  includeOccupied: boolean,
) {
  const seats = couchSeats(couch).filter(seat => includeOccupied || !occupiedSeats.has(seat.id))

  return nearestSeat(seats, position)
}

function nearestSeat(seats: Seat[], position: Vec3) {
  seats.sort((a, b) => distanceSq(position, a.position) - distanceSq(position, b.position))

  return seats[0]
}

function couchSeats(couch: (typeof outsideCouches)[number]): Seat[] {
  const direction = couchSeatDirection(couch.face)
  const side = couchSeatSide(couch.face)
  const couchIndex = outsideCouches.indexOf(couch)
  const depth = couch.face === 'north' || couch.face === 'south' ? couch.depth : couch.width
  const width = couch.face === 'north' || couch.face === 'south' ? couch.width : couch.depth
  const offsets = [-width * 0.3, 0, width * 0.3]

  return offsets.map((offset, index) => ({
    id: `${couchIndex}:${index}`,
    position: [
      couch.x + direction[0] * depth * 0.12 + side[0] * offset,
      walkHeight(couch.x, characterFloor, couch.z) + 0.28,
      couch.z + direction[2] * depth * 0.12 + side[2] * offset,
    ] as Vec3,
    turn: Math.atan2(direction[0], direction[2]),
  }))
}

function stoolSeat(stool: Bounds, index: number): Seat {
  const outside = index >= bartenderStools.length

  return {
    id: `stool:${index}`,
    position: [stool.x, walkHeight(stool.x, characterFloor, stool.z) + 0.34, stool.z],
    turn: outside ? Math.PI / 2 : Math.PI,
  }
}

function couchSeatDirection(face: (typeof outsideCouches)[number]['face']): Vec3 {
  if (face === 'north') {
    return [0, 0, 1]
  }
  if (face === 'south') {
    return [0, 0, -1]
  }
  if (face === 'east') {
    return [1, 0, 0]
  }

  return [-1, 0, 0]
}

function couchSeatSide(face: (typeof outsideCouches)[number]['face']): Vec3 {
  if (face === 'north' || face === 'south') {
    return [1, 0, 0]
  }

  return [0, 0, 1]
}

function distanceSq(a: Vec3, b: Vec3) {
  const x = a[0] - b[0]
  const z = a[2] - b[2]

  return x * x + z * z
}

export function collideBuildingWalls(position: Vec3, padding: number) {
  const left = roomBounds.left - padding
  const right = roomBounds.right + padding
  const back = roomBounds.back - padding
  const front = roomBounds.front + padding

  if (position[0] > left && position[0] < right && position[2] > back && position[2] < front) {
    if (isAtBackDoor(position, padding) && position[2] > roomBounds.front - 0.8) {
      return
    }

    const pushLeft = Math.abs(position[0] - left)
    const pushRight = Math.abs(right - position[0])
    const pushBack = Math.abs(position[2] - back)
    const pushFront = Math.abs(front - position[2])
    const push = Math.min(pushLeft, pushRight, pushBack, pushFront)

    if (push === pushLeft) {
      position[0] = left
    }
    else if (push === pushRight) {
      position[0] = right
    }
    else if (push === pushBack) {
      position[2] = back
    }
    else {
      position[2] = front
    }
  }
}

function paddedBounds(bounds: Bounds, padding = 0.28): PaddedBounds {
  return {
    back: bounds.z - bounds.depth / 2 - padding,
    front: bounds.z + bounds.depth / 2 + padding,
    left: bounds.x - bounds.width / 2 - padding,
    right: bounds.x + bounds.width / 2 + padding,
  }
}

function couchCollisionBounds(bounds: (typeof outsideCouches)[number]): PaddedBounds {
  const collision = paddedBounds(bounds, 0.22)
  const endGap = 0.15

  if (bounds.face === 'north' || bounds.face === 'south') {
    collision.left += endGap
    collision.right -= endGap
  }
  else {
    collision.back += endGap
    collision.front -= endGap
  }

  return collision
}

function hutPostBounds(bounds: Bounds): Bounds[] {
  const left = bounds.x - bounds.width / 2 + 0.18
  const right = bounds.x + bounds.width / 2 - 0.18
  const back = bounds.z - bounds.depth / 2 + 0.18
  const front = bounds.z + bounds.depth / 2 - 0.18

  return [
    { x: left, z: back, width: 0.22, depth: 0.22 },
    { x: right, z: back, width: 0.22, depth: 0.22 },
    { x: left, z: front, width: 0.22, depth: 0.22 },
    { x: right, z: front, width: 0.22, depth: 0.22 },
  ]
}

function toiletWallBounds(): Bounds[] {
  const left = outsideToilets.x - outsideToilets.width / 2
  const right = outsideToilets.x + outsideToilets.width / 2
  const back = outsideToilets.z - outsideToilets.depth / 2
  const front = outsideToilets.z + outsideToilets.depth / 2
  const doorBack = outsideToiletDoor.z - outsideToiletDoor.width / 2
  const doorFront = outsideToiletDoor.z + outsideToiletDoor.width / 2
  const doorSide = outsideToiletDoor.side === 'east' ? 1 : -1
  const doorX = doorSide > 0 ? right : left
  const oppositeX = doorSide > 0 ? left : right
  const dividerX = outsideToilets.x - doorSide * 0.58
  const wall = 0.12
  const divider = 0.5

  return [
    { x: outsideToilets.x, z: back, width: outsideToilets.width, depth: wall },
    { x: outsideToilets.x, z: front, width: outsideToilets.width, depth: wall },
    { x: oppositeX, z: outsideToilets.z, width: wall, depth: outsideToilets.depth },
    { x: doorX, z: (back + doorBack) / 2, width: wall, depth: doorBack - back },
    { x: doorX, z: (doorFront + front) / 2, width: wall, depth: front - doorFront },
    { x: dividerX, z: outsideToilets.z, width: outsideToilets.width - 1.32, depth: divider },
  ]
}

function collideToiletWalls(position: Vec3, previous?: Vec3) {
  const left = outsideToilets.x - outsideToilets.width / 2
  const right = outsideToilets.x + outsideToilets.width / 2
  const back = outsideToilets.z - outsideToilets.depth / 2
  const front = outsideToilets.z + outsideToilets.depth / 2
  const doorBack = outsideToiletDoor.z - outsideToiletDoor.width / 2
  const doorFront = outsideToiletDoor.z + outsideToiletDoor.width / 2
  const doorSide = outsideToiletDoor.side === 'east' ? 1 : -1
  const doorX = doorSide > 0 ? right : left
  const oppositeX = doorSide > 0 ? left : right
  const dividerX = outsideToilets.x - doorSide * 0.58
  const dividerLeft = dividerX - (outsideToilets.width - 1.32) / 2
  const dividerRight = dividerX + (outsideToilets.width - 1.32) / 2
  const padding = 0.34
  const dividerPadding = 0.43

  if (previous) {
    collideHorizontalWall(position, previous, back, left, right, padding)
    collideHorizontalWall(position, previous, front, left, right, padding)
    collideVerticalWall(position, previous, oppositeX, back, front, padding)
    collideVerticalWall(position, previous, doorX, back, doorBack, padding)
    collideVerticalWall(position, previous, doorX, doorFront, front, padding)
    collideHorizontalWall(position, previous, outsideToilets.z, dividerLeft, dividerRight, dividerPadding)
  }

  if (position[0] > left - padding && position[0] < right + padding) {
    if (position[2] > back - padding && position[2] < back + padding) {
      position[2] = position[2] > back ? back + padding : back - padding
    }
    if (position[2] > front - padding && position[2] < front + padding) {
      position[2] = position[2] < front ? front - padding : front + padding
    }
  }

  for (const wall of outsideToiletWallCollisions.slice(2)) {
    collidePaddedBounds(position, wall)
  }
}

function collideHorizontalWall(
  position: Vec3,
  previous: Vec3,
  z: number,
  left: number,
  right: number,
  padding: number,
) {
  if (!segmentOverlaps(previous[0], position[0], left, right, padding)) {
    return
  }

  if (previous[2] >= z + padding && position[2] < z + padding) {
    position[2] = z + padding
  }
  else if (previous[2] <= z - padding && position[2] > z - padding) {
    position[2] = z - padding
  }
}

function collideVerticalWall(
  position: Vec3,
  previous: Vec3,
  x: number,
  back: number,
  front: number,
  padding: number,
) {
  if (!segmentOverlaps(previous[2], position[2], back, front, padding)) {
    return
  }

  if (previous[0] >= x + padding && position[0] < x + padding) {
    position[0] = x + padding
  }
  else if (previous[0] <= x - padding && position[0] > x - padding) {
    position[0] = x - padding
  }
}

function segmentOverlaps(a: number, b: number, min: number, max: number, padding: number) {
  return Math.max(a, b) > min - padding && Math.min(a, b) < max + padding
}

function inBounds(x: number, z: number, bounds: Bounds) {
  return x > bounds.x - bounds.width / 2 && x < bounds.x + bounds.width / 2
    && z > bounds.z - bounds.depth / 2 && z < bounds.z + bounds.depth / 2
}

function platformHeight(x: number, z: number) {
  if (inPaddedBounds(x, z, djBoothCollision) || inPaddedBounds(x, z, outsideDjBoothCollision)
    || inPaddedBounds(x, z, tentDjBoothCollision))
  {
    return djBoothTop
  }

  if ([...djSpeakerCollisions, ...outsideDjSpeakerCollisions, ...tentDjSpeakerCollisions].some(bounds =>
    inPaddedBounds(x, z, bounds)))
  {
    return speakerTop
  }

  if (inPaddedBounds(x, z, bartenderBarCollision) || inPaddedBounds(x, z, outsideHutBarCollision)) {
    return barTop
  }
}

function onPaddedPlatform(position: Vec3, bounds: PaddedBounds, height: number) {
  return position[1] > height - platformStep && inPaddedBounds(position[0], position[2], bounds)
}

function inPaddedBounds(x: number, z: number, bounds: PaddedBounds) {
  return x > bounds.left && x < bounds.right && z > bounds.back && z < bounds.front
}

function inBuildingWall(x: number, z: number, padding: number) {
  const left = roomBounds.left - padding
  const right = roomBounds.right + padding
  const back = roomBounds.back - padding
  const front = roomBounds.front + padding

  return x > left && x < right && z > back && z < front
    && !(Math.abs(x - backDoor.x) < backDoor.width * 0.5 + padding && z > roomBounds.front - 0.8)
}

function collidePaddedBounds(position: Vec3, bounds: PaddedBounds) {
  const left = bounds.left
  const right = bounds.right
  const front = bounds.front
  const back = bounds.back

  if (position[0] > left && position[0] < right && position[2] > back && position[2] < front) {
    const pushLeft = Math.abs(position[0] - left)
    const pushRight = Math.abs(right - position[0])
    const pushBack = Math.abs(position[2] - back)
    const pushFront = Math.abs(front - position[2])
    const push = Math.min(pushLeft, pushRight, pushBack, pushFront)

    if (push === pushLeft) {
      position[0] = left
    }
    else if (push === pushRight) {
      position[0] = right
    }
    else if (push === pushBack) {
      position[2] = back
    }
    else {
      position[2] = front
    }
  }
}

function collideSpherePaddedBounds(position: Vec3, radius: number, bounds: PaddedBounds, top: number) {
  if (sphereOverlapsHeight(position, radius, top)) {
    collidePaddedBounds(position, {
      back: bounds.back - radius,
      front: bounds.front + radius,
      left: bounds.left - radius,
      right: bounds.right + radius,
    })
  }
}

function sphereOverlapsHeight(position: Vec3, radius: number, top: number, bottom = characterFloor) {
  return position[1] - radius < top && position[1] + radius > bottom
}

function collideCircle(position: Vec3, bounds: CircleBounds, padding = 0.28) {
  const x = position[0] - bounds.x
  const z = position[2] - bounds.z
  const distance = Math.sqrt(x * x + z * z)
  const radius = bounds.radius + padding

  if (distance < radius) {
    position[0] = bounds.x + x / distance * radius
    position[2] = bounds.z + z / distance * radius
  }
}

function inCircle(x: number, z: number, bounds: CircleBounds) {
  const dx = x - bounds.x
  const dz = z - bounds.z
  const radius = bounds.radius + 0.28

  return dx * dx + dz * dz < radius * radius
}
