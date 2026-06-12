import { characterFloor } from './character-data.ts'
import { outsideBounds, outsideStageProps } from './scene-data.ts'
import type { Bounds, Vec3 } from './types.ts'

const duck = outsideStageProps.find(prop => prop.kind === 'duck')

if (!duck) {
  throw new Error('Missing outside stage duck')
}

const stageDuck = duck

export const duckPlatformPadding = 0.18
export const duckPlatformStep = 0.42
export const defaultDuckPosition: Vec3 = [stageDuck.x, characterFloor, stageDuck.z]
export const duckPosition: Vec3 = [...defaultDuckPosition]
export let duckTurn = stageDuck.turn
export let duckPositionVersion = 0
export const duckStageProp = stageDuck

export type DuckPose = {
  position: Vec3
  turn: number
}

export type DuckPlatformBounds = {
  back: number
  front: number
  left: number
  right: number
}

export function setDuckPosition(position: Vec3) {
  setDuckPose({ position, turn: duckTurn })
}

export function setDuckPose(pose: DuckPose) {
  validateDuckPosition(pose.position)
  if (duckPosition[0] !== pose.position[0] || duckPosition[1] !== pose.position[1]
    || duckPosition[2] !== pose.position[2] || duckTurn !== pose.turn)
  {
    duckPositionVersion++
  }
  duckPosition[0] = pose.position[0]
  duckPosition[1] = pose.position[1]
  duckPosition[2] = pose.position[2]
  duckTurn = pose.turn
}

export function duckPose(): DuckPose {
  return {
    position: [duckPosition[0], duckPosition[1], duckPosition[2]],
    turn: duckTurn,
  }
}

export function validateDuckPosition(position: Vec3) {
  if (position[0] < outsideBounds.left || position[0] > outsideBounds.right
    || position[2] < outsideBounds.back || position[2] > outsideBounds.front
    || position[1] < characterFloor - 1 || position[1] > characterFloor + 4)
  {
    throw new Error(`Invalid duck position ${position.join(',')}`)
  }
}

export function duckBoundsAt(position = duckPosition): Bounds {
  return {
    x: position[0],
    z: position[2],
    width: stageDuck.width,
    depth: stageDuck.depth,
  }
}

export function duckPlatformTop(position = duckPosition) {
  return position[1] + stageDuck.platformHeight
}

export function duckPaddedBoundsAt(position = duckPosition, padding = duckPlatformPadding): DuckPlatformBounds {
  const bounds = duckBoundsAt(position)

  return {
    left: bounds.x - bounds.width / 2 - padding,
    right: bounds.x + bounds.width / 2 + padding,
    back: bounds.z - bounds.depth / 2 - padding,
    front: bounds.z + bounds.depth / 2 + padding,
  }
}

export function onDuckPlatform(point: Vec3, position = duckPosition) {
  const bounds = duckPaddedBoundsAt(position)

  return point[1] > duckPlatformTop(position) - duckPlatformStep
    && point[0] > bounds.left
    && point[0] < bounds.right
    && point[2] > bounds.back
    && point[2] < bounds.front
}
