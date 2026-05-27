import { characterFloor } from './character-data.ts'
import { clamp } from './math.ts'
import { backDoor, bartenderBar, bartenderStools, djBooth, djSpeakers, outsideBounds, outsideDjBooth, outsideDjSpeakers,
  roomBounds } from './scene-data.ts'
import type { Bounds, CircleBounds, Vec3 } from './types.ts'

type PaddedBounds = {
  back: number
  front: number
  left: number
  right: number
}

const djBoothCollision = paddedBounds(djBooth)
const bartenderBarCollision = paddedBounds(bartenderBar)
const bartenderStoolCollisions = bartenderStools.map(bounds => paddedBounds(bounds))
const djSpeakerCollisions = djSpeakers.map(bounds => paddedBounds(bounds))
const outsideDjBoothCollision = paddedBounds(outsideDjBooth)
const outsideDjSpeakerCollisions = outsideDjSpeakers.map(bounds => paddedBounds(bounds))
const insideLeft = roomBounds.left + 0.8
const insideRight = roomBounds.right - 0.8
const insideBack = roomBounds.back + 0.8
const insideFront = roomBounds.front - 0.8

export function walkHeight(_x: number, _y: number, _z: number) {
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

    for (const speaker of outsideDjSpeakerCollisions) {
      collidePaddedBounds(position, speaker)
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
