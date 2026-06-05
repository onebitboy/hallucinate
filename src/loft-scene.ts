import { characterFloor } from './character-data.ts'
import { addDjBoothAt, addLowPolyCouch } from './environment-object.ts'
import { paintingTextureBounds } from './graffiti.ts'
import { addBox, addDisc, addQuad, pack } from './geometry.ts'
import {
  loftBounds,
  loftCornerFigures,
  loftCouches,
  loftDoor,
  loftDjBooth,
  loftDjSpeakers,
  loftTables,
  loftVideoWall,
} from './scene-data.ts'
import type { Vec3, Vertex } from './types.ts'

type FacadeSide = 'back' | 'front' | 'left' | 'right'

const floor = characterFloor
const bounds = loftBounds
const ceiling = 5
const windowHeight = ceiling - floor
const windowCenterY = (ceiling + floor) / 2
const skylineBase = floor - 24
const skylineGround = floor - 13
const beige: Vec3 = [0.18, 0.145, 0.11]
const warmWall: Vec3 = [0.14, 0.11, 0.085]
const wood: Vec3 = [0.32, 0.18, 0.08]
const dark: Vec3 = [0.018, 0.016, 0.018]
const glass: Vec3 = [0.015, 0.02, 0.028]
const red: Vec3 = [1, 0.03, 0.02]
const blue: Vec3 = [0.02, 0.35, 1]
const orange: Vec3 = [1, 0.28, 0.04]
const fuchsia: Vec3 = [1, 0.04, 0.75]
const purple: Vec3 = [0.5, 0.08, 1]

export const loftSpawn = { x: loftDoor.x, z: bounds.front - 2.4, angle: Math.PI }

export function addLoftRoom(target: Vertex[]) {
  const left = bounds.left
  const right = bounds.right
  const back = bounds.back
  const front = bounds.front

  addQuad(target, [left, floor, front], [right, floor, front], [right, floor, back], [left, floor, back], beige, 0)
  addQuad(target, [left, ceiling, back], [right, ceiling, back], [right, ceiling, front], [left, ceiling, front],
    [0.09, 0.072, 0.055], 0)
  addSkylineEnvironment(target)
  addWindowWall(target, 'back')
  addWindowWall(target, 'left')
  addWindowWall(target, 'right')
  addQuad(target, [right, floor, front], [left, floor, front], [left, ceiling, front], [right, ceiling, front], warmWall,
    0)
  addLoftDoor(target)
  addLoftPaintings(target)
  addLoftRug(target)
  addLoftCouches(target)
  addLoftTables(target)
  addLoftStatueBases(target)
  addLoftDj(target)
  addLoftLights(target)
}

export function addLoftLightGeometry(target: Vertex[]) {
  addLoftLights(target)
}

export function addLoftSmoke(_target: Vertex[]) {}

function addWindowWall(target: Vertex[], side: 'back' | 'left' | 'right') {
  const frame: Vec3 = [0.12, 0.08, 0.045]
  const bottom = floor
  const top = ceiling

  if (side === 'back') {
    addQuad(target, [bounds.left, bottom, bounds.back], [bounds.right, bottom, bounds.back],
      [bounds.right, top, bounds.back], [bounds.left, top, bounds.back], glass, 0.04, -0.025)
    for (const x of [-9.4, -5.7, -2, 2, 5.7, 9.4]) {
      addBox(target, x, windowCenterY, bounds.back + 0.04, 0.08, windowHeight, 0.08, frame, 0)
    }
    addBox(target, 0, ceiling - 0.04, bounds.back + 0.04, bounds.right - bounds.left, 0.08, 0.08, frame, 0)
    return
  }

  const x = side === 'left' ? bounds.left : bounds.right

  addQuad(target, [x, bottom, bounds.front], [x, bottom, bounds.back], [x, top, bounds.back],
    [x, top, bounds.front], glass, 0.035, -0.025)
  for (const z of [-9.6, -5.8, -2, 1.8, 5.6, 9.4]) {
    addBox(target, x, windowCenterY, z, 0.08, windowHeight, 0.08, frame, 0)
  }
}

function addLoftDoor(target: Vertex[]) {
  const z = bounds.front - 0.035
  const left = loftDoor.x - loftDoor.width / 2
  const right = loftDoor.x + loftDoor.width / 2
  const bottom = floor
  const top = floor + loftDoor.height
  const frame: Vec3 = [0.06, 0.038, 0.024]
  const door: Vec3 = [0.018, 0.012, 0.009]
  const glow: Vec3 = [1, 0.34, 0.05]

  addQuad(target, [right, bottom, z], [left, bottom, z], [left, top, z], [right, top, z], door, 0.02)
  addBox(target, left - 0.08, bottom + loftDoor.height / 2, z - 0.02, 0.16, loftDoor.height + 0.2, 0.08, frame, 0)
  addBox(target, right + 0.08, bottom + loftDoor.height / 2, z - 0.02, 0.16, loftDoor.height + 0.2, 0.08, frame, 0)
  addBox(target, loftDoor.x, top + 0.08, z - 0.02, loftDoor.width + 0.32, 0.16, 0.08, frame, 0)
  addBox(target, right - 0.25, bottom + 1.25, z - 0.05, 0.08, 0.08, 0.08, glow, 0.6)
}

function addLoftPaintings(target: Vertex[]) {
  const z = bounds.front - 0.055
  const canvasZ = z - 0.07
  const frame: Vec3 = [0.006, 0.005, 0.005]
  const y = floor + 3
  const left = loftCornerFigures[0]!.x + 1.7
  const right = loftDoor.x - loftDoor.width * 0.65

  for (let i = 0; i < 3; i++) {
    const x = left + (right - left) * ((i + 1) / 4)

    addBox(target, x, y, z - 0.018, 1.46, 1.16, 0.06, frame, 0)
    addPaintingQuad(target, x, y, canvasZ, i)
  }
}

function addPaintingQuad(target: Vertex[], x: number, y: number, z: number, index: number) {
  const [u0, v0, u1, v1] = paintingTextureBounds(index)
  const left = x - 0.56
  const right = x + 0.56
  const bottom = y - 0.42
  const top = y + 0.42
  const color: Vec3 = [1, 1, 1]

  target.push(
    pack([right, bottom, z], color, 0, 0, u1, v1, 6),
    pack([left, bottom, z], color, 0, 0, u0, v1, 6),
    pack([left, top, z], color, 0, 0, u0, v0, 6),
    pack([right, bottom, z], color, 0, 0, u1, v1, 6),
    pack([left, top, z], color, 0, 0, u0, v0, 6),
    pack([right, top, z], color, 0, 0, u1, v0, 6),
  )
}

function addSkylineEnvironment(target: Vertex[]) {
  const ground: Vec3 = [0.018, 0.02, 0.027]
  const horizon: Vec3 = [0.026, 0.032, 0.045]

  addQuad(target, [-76, skylineGround, 76], [76, skylineGround, 76], [76, skylineGround, -76],
    [-76, skylineGround, -76], ground, 0.02)
  addQuad(target, [-54, skylineBase, bounds.back - 34], [54, skylineBase, bounds.back - 34],
    [54, skylineGround, bounds.back - 34], [-54, skylineGround, bounds.back - 34], horizon, 0.025)
  addQuad(target, [bounds.left - 34, skylineBase, 54], [bounds.left - 34, skylineBase, -54],
    [bounds.left - 34, skylineGround, -54], [bounds.left - 34, skylineGround, 54], horizon, 0.022)
  addQuad(target, [bounds.right + 34, skylineBase, -54], [bounds.right + 34, skylineBase, 54],
    [bounds.right + 34, skylineGround, 54], [bounds.right + 34, skylineGround, -54], horizon, 0.022)
  addSkylineStrip(target, 'back', 15, -34, 4.9)
  addSkylineStrip(target, 'back', 10, -26, 5.5)
  addSkylineStrip(target, 'left', 13, -27, 4.8)
  addSkylineStrip(target, 'right', 13, -27, 4.8)
  addOppositeDjWallEdgeSkyline(target, -1)
  addOppositeDjWallEdgeSkyline(target, 1)
}

function addSkylineStrip(target: Vertex[], side: FacadeSide, count: number, start: number, step: number) {
  for (let i = 0; i < count; i++) {
    const width = 3.2 + seeded(i, sideSeed(side) + 1) * 3.8
    const depth = 3.0 + seeded(i, sideSeed(side) + 2) * 4.8
    const height = 21 + seeded(i, sideSeed(side) + 3) * 14
    const offset = start + i * step + (seeded(i, sideSeed(side) + 4) - 0.5) * 1.5
    const distance = 5.8 + seeded(i, sideSeed(side) + 5) * 8.5

    if (side === 'back') {
      addBuilding(target, offset, bounds.back - distance, width, depth, height, side, i)
    }
    else {
      const x = side === 'left' ? bounds.left - distance : bounds.right + distance

      addBuilding(target, x, offset, depth, width, height, side, i)
    }
  }
}

function addOppositeDjWallEdgeSkyline(target: Vertex[], sign: -1 | 1) {
  const seed = sign < 0 ? 500 : 600

  for (let i = 0; i < 8; i++) {
    const width = 5.8 + seeded(i, seed + 1) * 5.8
    const depth = 5.2 + seeded(i, seed + 2) * 5.8
    const height = 22 + seeded(i, seed + 3) * 18
    const x = sign * (bounds.right + 2.4 + i * 4.6 + seeded(i, seed + 4) * 1.8)
    const z = bounds.front + 5.2 + seeded(i, seed + 5) * 9.2

    addBuilding(target, x, z, width, depth, height, 'front', seed + i)
  }
}

function sideSeed(side: FacadeSide) {
  return side === 'back' ? 100 : side === 'left' ? 200 : side === 'right' ? 300 : 400
}

function seeded(index: number, salt: number) {
  const value = Math.sin((index + 1) * 127.1 + salt * 311.7) * 43758.5453

  return value - Math.floor(value)
}

function addBuilding(
  target: Vertex[],
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  side: FacadeSide,
  index: number,
) {
  const body: Vec3 = index % 6 === 0 ? [0.09, 0.105, 0.125] : index % 6 === 1
    ? [0.062, 0.076, 0.11]
    : index % 6 === 2
      ? [0.12, 0.13, 0.145]
      : index % 6 === 3
        ? [0.048, 0.068, 0.09]
        : index % 6 === 4 ? [0.14, 0.15, 0.165] : [0.072, 0.088, 0.118]

  addBox(target, x, skylineBase + height / 2, z, width, height, depth, body, 0.04)
  addBuildingWindows(target, x, z, width, depth, height, side, index)
}

function addBuildingWindows(
  target: Vertex[],
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  side: FacadeSide,
  index: number,
) {
  const rows = Math.max(14, Math.floor(height / 0.54))
  const colorA: Vec3 = [1, 0.74, 0.28]
  const colorB: Vec3 = [0.3, 0.72, 1]
  const colorC: Vec3 = [1, 0.22, 0.72]

  if (side === 'back' || side === 'front') {
    addZFaceWindows(z + (side === 'back' ? depth / 2 + 0.012 : -depth / 2 - 0.012), x, width)
    addXFaceWindows(x - width / 2 - 0.012, z, depth, -1, 17)
    addXFaceWindows(x + width / 2 + 0.012, z, depth, 1, 29)
  }
  else {
    const faceX = side === 'left' ? x + width / 2 + 0.012 : x - width / 2 - 0.012
    const sign = side === 'left' ? 1 : -1

    addXFaceWindows(faceX, z, depth, sign, 1)
    addZFaceWindows(z - depth / 2 - 0.012, x, width, 17)
    addZFaceWindows(z + depth / 2 + 0.012, x, width, 29)
  }

  function addZFaceWindows(faceZ: number, centerX: number, span: number, salt = 0) {
    const columns = Math.max(3, Math.floor(span / 0.42))

    for (let row = 1; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        if (seeded(index * 53 + row * 7 + column, 9 + salt) < windowSkip(row)) {
          continue
        }

        const u = (column + 0.5) / columns - 0.5
        const y = windowY(row)
        const color = windowColor(row, column, salt)

        addQuad(target, [centerX + u * span - 0.08, y - 0.065, faceZ],
          [centerX + u * span + 0.08, y - 0.065, faceZ],
          [centerX + u * span + 0.08, y + 0.065, faceZ],
          [centerX + u * span - 0.08, y + 0.065, faceZ], color, 0.08)
      }
    }
  }

  function addXFaceWindows(faceX: number, centerZ: number, span: number, sign: number, salt = 0) {
    const columns = Math.max(3, Math.floor(span / 0.42))

    for (let row = 1; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        if (seeded(index * 53 + row * 7 + column, 9 + salt) < windowSkip(row) + 0.04) {
          continue
        }

        const u = (column + 0.5) / columns - 0.5
        const y = windowY(row)
        const color = windowColor(row, column, salt)

        addQuad(target, [faceX, y - 0.065, centerZ + u * span + 0.08 * sign],
          [faceX, y - 0.065, centerZ + u * span - 0.08 * sign],
          [faceX, y + 0.065, centerZ + u * span - 0.08 * sign],
          [faceX, y + 0.065, centerZ + u * span + 0.08 * sign], color, 0.065)
      }
    }
  }

  function windowColor(row: number, column: number, salt: number): Vec3 {
    return (row + column + index + salt) % 5 === 0 ? colorB : (row + index + salt) % 7 === 0 ? colorC : colorA
  }

  function windowSkip(row: number) {
    return row >= rows - 5 ? 0.28 : 0.38
  }

  function windowY(row: number) {
    return skylineBase + (row / rows) * (height - 0.7) + 0.38
  }
}

function addLoftDj(target: Vertex[]) {
  addBox(target, loftVideoWall.x, loftVideoWall.y, loftVideoWall.z + 0.02, loftVideoWall.width + 0.22,
    loftVideoWall.height + 0.22, 0.08, dark, 0.3)
  addDjBoothAt(target, loftDjBooth, loftDjSpeakers, 1, orange, 2.1)
}

function addLoftCouches(target: Vertex[]) {
  for (const couch of loftCouches) {
    addLowPolyCouch(target, couch, floor)
  }
}

function addLoftRug(target: Vertex[]) {
  const colors: Vec3[] = [
    [0.46, 0.38, 0.28],
    [0.22, 0.18, 0.14],
    [0.34, 0.33, 0.32],
    [0.76, 0.08, 0.54],
    [0.58, 0.48, 0.34],
  ]
  const y = floor + 0.018
  const z = 0.65
  const rings = 5
  const segments = 48
  const radius = 3.25

  for (let ring = 0; ring < rings; ring++) {
    const inner = radius * ring / rings
    const outer = radius * (ring + 1) / rings

    for (let i = 0; i < segments; i++) {
      const a = Math.PI * 2 * i / segments
      const b = Math.PI * 2 * (i + 1) / segments
      const color = colors[(ring + Math.floor(i / 4)) % colors.length]!
      const innerA: Vec3 = [Math.cos(a) * inner, y, Math.sin(a) * inner + z]
      const outerA: Vec3 = [Math.cos(a) * outer, y, Math.sin(a) * outer + z]
      const outerB: Vec3 = [Math.cos(b) * outer, y, Math.sin(b) * outer + z]
      const innerB: Vec3 = [Math.cos(b) * inner, y, Math.sin(b) * inner + z]

      addQuad(target, innerA, outerA, outerB, innerB, color, 0)
    }
  }
}

function addLoftTables(target: Vertex[]) {
  const top: Vec3 = [0.2, 0.13, 0.075]
  const leg: Vec3 = [0.075, 0.048, 0.032]
  const glassColor: Vec3 = [0.85, 0.64, 0.32]
  const snack: Vec3 = [0.72, 0.56, 0.34]

  for (let i = 0; i < loftTables.length; i++) {
    const table = loftTables[i]!
    const side = table.x < 0 ? 1 : -1

    addBox(target, table.x, floor + 0.34, table.z, table.width, 0.12, table.depth, top, 0)
    addBox(target, table.x, floor + 0.17, table.z - table.depth * 0.36, table.width * 0.72, 0.24, 0.07, leg, 0)
    addBox(target, table.x, floor + 0.17, table.z + table.depth * 0.36, table.width * 0.72, 0.24, 0.07, leg, 0)
    addBox(target, table.x + side * 0.18, floor + 0.48, table.z - 0.46, 0.12, 0.16, 0.12, glassColor, 0.12)
    addBox(target, table.x - side * 0.2, floor + 0.48, table.z + 0.46, 0.12, 0.16, 0.12, glassColor, 0.12)
    addDisc(target, [table.x, floor + 0.43, table.z + (i % 2 === 0 ? 0.14 : -0.14)], 0.28, 0.2, 'y', snack, 0)
  }
}

function addLoftStatueBases(target: Vertex[]) {
  const base: Vec3 = [0.11, 0.095, 0.08]
  const trim: Vec3 = [0.18, 0.15, 0.12]

  for (const figure of loftCornerFigures) {
    addBox(target, figure.x, floor + 0.18, figure.z, 1.28, 0.36, 1.28, base, 0)
    addBox(target, figure.x, floor + 0.39, figure.z, 1.42, 0.08, 1.42, trim, 0)
  }
}

function addLoftLights(target: Vertex[]) {
  for (const [x, z, color] of [
    [-4.8, -6.8, orange],
    [4.8, -6.8, orange],
    [-4.8, 0.8, orange],
    [4.8, 0.8, orange],
    [-4.8, 8.2, orange],
    [4.8, 8.2, orange],
    [0, -3, orange],
    [0, 5, orange],
  ] as const) {
    addBox(target, x, ceiling - 0.11, z, 0.64, 0.12, 0.64, dark, 0.08)
    addDisc(target, [x, ceiling - 0.18, z], 0.38, 0.38, 'y', color, 2.8)
  }
}
