import { characterFloor } from './character-data.ts'
import { addCharacterBox } from './character-geometry.ts'
import type { VertexWriter } from './character-geometry.ts'
import { outsideTreeSwing as config } from './scene-data.ts'
import type { CharacterLight, CircleBounds, Vec3 } from './types.ts'

export type TreeSwingSeat = {
  id: string
  position: Vec3
  turn: number
}

type TreeSwing = {
  anchorLeft: Vec3
  anchorRight: Vec3
  ropeLeft: Vec3
  ropeRight: Vec3
  seat: TreeSwingSeat
  seatLeft: Vec3
  seatRight: Vec3
  side: Vec3
  swing: number
}

const id = 'tree-swing'
const up: Vec3 = [0, 1, 0]
const rope: Vec3 = [0.58, 0.44, 0.26]
const wood: Vec3 = [0.16, 0.075, 0.028]
const unusedInstances: VertexWriter = { data: new Float32Array(0), length: 0 }
const directionX = Math.sin(config.angle)
const directionZ = Math.cos(config.angle)
const turn = config.angle + config.facing
const forwardX = Math.sin(turn)
const forwardZ = Math.cos(turn)
const turnSin = Math.sin(turn)
const turnCos = Math.cos(turn)
const sideX = turnCos
const sideZ = -turnSin
const ropeLength = config.anchorHeight - config.seatHeight
const sideOffset = config.ropeSpacing * 0.5
const seatOffset = config.seatWidth * 0.5
const swingFrequency = Math.PI * 2 / config.swingSeconds

export const treeSwing: TreeSwing = {
  anchorLeft: [0, 0, 0],
  anchorRight: [0, 0, 0],
  ropeLeft: [0, 0, 0],
  ropeRight: [0, 0, 0],
  seat: {
    id,
    position: [0, characterFloor + config.seatHeight + config.sittingHeightOffset, 0],
    turn,
  },
  seatLeft: [0, 0, 0],
  seatRight: [0, 0, 0],
  side: [1, 0, 0],
  swing: 0,
}

export const treeSwingSeats = [treeSwing.seat]

export function updateTreeSwing(delta: number, time: number, tree: CircleBounds, occupied: boolean) {
  const active = occupied ? 1 : 0
  const amount = 1 - Math.exp(-config.swingRiseSpeed * delta)
  const swingAmount = treeSwing.swing + (active - treeSwing.swing) * amount
  const topX = tree.x + directionX * config.distance
  const topY = characterFloor + config.anchorHeight
  const topZ = tree.z + directionZ * config.distance
  const swing = Math.sin(time * swingFrequency + config.phase) * config.swingAngle * swingAmount
  const swingOffset = Math.sin(swing) * ropeLength
  const seatX = topX + forwardX * swingOffset
  const seatY = topY - Math.cos(swing) * ropeLength
  const seatZ = topZ + forwardZ * swingOffset
  const boardY = seatY - config.seatThickness * 0.5

  treeSwing.swing = swingAmount
  treeSwing.side[0] = sideX
  treeSwing.side[1] = 0
  treeSwing.side[2] = sideZ
  treeSwing.seat.position[0] = seatX
  treeSwing.seat.position[1] = seatY + config.sittingHeightOffset
  treeSwing.seat.position[2] = seatZ
  treeSwing.seat.turn = turn
  treeSwing.anchorLeft[0] = topX - sideX * sideOffset
  treeSwing.anchorLeft[1] = topY
  treeSwing.anchorLeft[2] = topZ - sideZ * sideOffset
  treeSwing.anchorRight[0] = topX + sideX * sideOffset
  treeSwing.anchorRight[1] = topY
  treeSwing.anchorRight[2] = topZ + sideZ * sideOffset
  treeSwing.ropeLeft[0] = seatX - sideX * sideOffset
  treeSwing.ropeLeft[1] = seatY
  treeSwing.ropeLeft[2] = seatZ - sideZ * sideOffset
  treeSwing.ropeRight[0] = seatX + sideX * sideOffset
  treeSwing.ropeRight[1] = seatY
  treeSwing.ropeRight[2] = seatZ + sideZ * sideOffset
  treeSwing.seatLeft[0] = seatX - sideX * seatOffset
  treeSwing.seatLeft[1] = boardY
  treeSwing.seatLeft[2] = seatZ - sideZ * seatOffset
  treeSwing.seatRight[0] = seatX + sideX * seatOffset
  treeSwing.seatRight[1] = boardY
  treeSwing.seatRight[2] = seatZ + sideZ * seatOffset
}

export function treeSwingSeatAt(
  position: Vec3,
  occupiedSeats: Set<string>,
  padding: number,
  includeOccupied: boolean,
) {
  const seat = treeSwing.seat
  const dx = position[0] - seat.position[0]
  const dz = position[2] - seat.position[2]
  const radius = Math.max(config.seatWidth, config.seatDepth) * 0.5 + padding

  return dx * dx + dz * dz < radius * radius && (includeOccupied || !occupiedSeats.has(seat.id))
    ? seat
    : undefined
}

export function writeTreeSwingGeometry(target: VertexWriter, light: CharacterLight) {
  addCharacterBox(target, unusedInstances, treeSwing.anchorLeft, treeSwing.ropeLeft, config.ropeThickness,
    config.ropeThickness, rope, 0, treeSwing.seat.turn, true, light, 0, turnSin, turnCos, { side: treeSwing.side })
  addCharacterBox(target, unusedInstances, treeSwing.anchorRight, treeSwing.ropeRight, config.ropeThickness,
    config.ropeThickness, rope, 0, treeSwing.seat.turn, true, light, 0, turnSin, turnCos, { side: treeSwing.side })
  addCharacterBox(target, unusedInstances, treeSwing.seatLeft, treeSwing.seatRight, config.seatThickness,
    config.seatDepth, wood, 0.04, treeSwing.seat.turn, true, light, 0, turnSin, turnCos, { side: up })
}
