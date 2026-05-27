import { characterFloor } from './character-data.ts'
import { clamp } from './math.ts'
import { backDoor, bartenderBar, bartenderStools, djBooth, djSpeakers, outsideBounds, outsideCouches, outsideDjBooth,
  outsideDjSpeakers, outsideHut, outsideHutBar, outsideHutBarStools, outsideHutDeckHeight,
  roomBounds } from './scene-data.ts'
import type { Bounds, CircleBounds, Vec3 } from './types.ts'

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
const outsideDjSpeakerCollisions = outsideDjSpeakers.map(bounds => paddedBounds(bounds))
const outsideCouchCollisions = outsideCouches.map(bounds => couchCollisionBounds(bounds))
const outsideHutBarCollision = paddedBounds(outsideHutBar)
const outsideHutBarStoolCollisions = outsideHutBarStools.map(bounds => paddedBounds(bounds))
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

export function walkHeight(x: number, _y: number, z: number) {
  if (inBounds(x, z, outsideHut) || inBounds(x, z, outsideHutBarDeckBounds)) {
    return characterFloor + outsideHutDeckHeight
  }

  return characterFloor
}

function isAtBackDoor(position: Vec3, padding = 0) {
  return Math.abs(position[0] - backDoor.x) < backDoor.width * 0.5 + padding
}

export function isOutside(position: Vec3) {
  return position[0] < roomBounds.left || position[0] > roomBounds.right || position[2] < roomBounds.back
    || position[2] > roomBounds.front
}

export function usesSkyBackground(_camera: { eye: Vec3; center: Vec3 }) {
  return true
}

export function collideRoom(position: Vec3, outsideTree: CircleBounds, outside = isOutside(position)) {
  if (outside) {
    position[0] = clamp(position[0], outsideBounds.left, outsideBounds.right)
    position[2] = clamp(position[2], outsideBounds.back, outsideBounds.front)
    collideBuildingWalls(position, 0.45)
    collideCircle(position, outsideTree)
    collidePaddedBounds(position, outsideDjBoothCollision)
    collidePaddedBounds(position, outsideHutBarCollision)

    for (const speaker of outsideDjSpeakerCollisions) {
      collidePaddedBounds(position, speaker)
    }

    for (const couch of outsideCouchCollisions) {
      collidePaddedBounds(position, couch)
    }

    for (const stool of outsideHutBarStoolCollisions) {
      collidePaddedBounds(position, stool)
    }

    for (const post of outsideHutPostCollisions) {
      collidePaddedBounds(position, post)
    }

    return
  }

  position[0] = clamp(position[0], insideLeft, insideRight)

  if (position[2] > insideFront && !isAtBackDoor(position)) {
    position[2] = insideFront
  }
  else {
    position[2] = clamp(position[2], insideBack, roomBounds.front + 0.45)
  }

  collidePaddedBounds(position, djBoothCollision)
  collidePaddedBounds(position, bartenderBarCollision)

  for (const stool of bartenderStoolCollisions) {
    collidePaddedBounds(position, stool)
  }

  for (const speaker of djSpeakerCollisions) {
    collidePaddedBounds(position, speaker)
  }
}

export function seatAt(position: Vec3, occupiedSeats = new Set<string>(), padding = 0.46): Seat | undefined {
  for (const couch of outsideCouches) {
    const bounds = paddedBounds(couch, padding)

    if (position[0] > bounds.left && position[0] < bounds.right && position[2] > bounds.back
      && position[2] < bounds.front)
    {
      return nearestCouchSeat(couch, position, occupiedSeats)
    }
  }

  for (let i = 0; i < seatStools.length; i++) {
    const stool = seatStools[i]!
    const bounds = paddedBounds(stool, padding)
    const seat = stoolSeat(stool, i)

    if (position[0] > bounds.left && position[0] < bounds.right && position[2] > bounds.back
      && position[2] < bounds.front && !occupiedSeats.has(seat.id))
    {
      return seat
    }
  }
}

export function seats() {
  return [
    ...outsideCouches.flatMap(couch => couchSeats(couch)),
    ...seatStools.map((stool, index) => stoolSeat(stool, index)),
  ]
}

function nearestCouchSeat(couch: (typeof outsideCouches)[number], position: Vec3, occupiedSeats: Set<string>) {
  const seats = couchSeats(couch).filter(seat => !occupiedSeats.has(seat.id))

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

function inBounds(x: number, z: number, bounds: Bounds) {
  return x > bounds.x - bounds.width / 2 && x < bounds.x + bounds.width / 2
    && z > bounds.z - bounds.depth / 2 && z < bounds.z + bounds.depth / 2
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

function collideCircle(position: Vec3, bounds: CircleBounds) {
  const x = position[0] - bounds.x
  const z = position[2] - bounds.z
  const distance = Math.sqrt(x * x + z * z)
  const radius = bounds.radius + 0.28

  if (distance < radius) {
    position[0] = bounds.x + x / distance * radius
    position[2] = bounds.z + z / distance * radius
  }
}
