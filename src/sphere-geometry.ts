import { reserveFloats } from './character-geometry.ts'
import type { VertexWriter } from './character-geometry.ts'
import type { Vec3 } from './types.ts'

export function createUnitSphere(rows: number, columns: number) {
  const vertices: number[] = []

  for (let y = 0; y < rows; y++) {
    const top = -Math.PI / 2 + Math.PI * y / rows
    const bottom = -Math.PI / 2 + Math.PI * (y + 1) / rows

    for (let x = 0; x < columns; x++) {
      const left = Math.PI * 2 * x / columns
      const right = Math.PI * 2 * (x + 1) / columns

      addUnitQuad(vertices, top, bottom, left, right)
    }
  }

  return new Float32Array(vertices)
}

export function reserveSphereFloats(target: VertexWriter, unit: Float32Array, count: number) {
  reserveFloats(target, count * unit.length / 3 * 11)
}

export function writeSphere(
  target: VertexWriter,
  unit: Float32Array,
  centerX: number,
  centerY: number,
  centerZ: number,
  radius: number,
  color: Vec3,
  glow: number,
) {
  const data = target.data
  let offset = target.length

  for (let i = 0; i < unit.length; i += 3) {
    data[offset] = centerX + unit[i]! * radius
    data[offset + 1] = centerY + unit[i + 1]! * radius
    data[offset + 2] = centerZ + unit[i + 2]! * radius
    data[offset + 3] = color[0]
    data[offset + 4] = color[1]
    data[offset + 5] = color[2]
    data[offset + 6] = glow
    data[offset + 7] = 0
    data[offset + 8] = 0
    data[offset + 9] = 0
    data[offset + 10] = 0
    offset += 11
  }

  target.length = offset
}

function addUnitQuad(target: number[], top: number, bottom: number, left: number, right: number) {
  addUnitPoint(target, top, left)
  addUnitPoint(target, top, right)
  addUnitPoint(target, bottom, right)
  addUnitPoint(target, top, left)
  addUnitPoint(target, bottom, right)
  addUnitPoint(target, bottom, left)
}

function addUnitPoint(target: number[], vertical: number, horizontal: number) {
  const radius = Math.cos(vertical)

  target.push(Math.cos(horizontal) * radius, Math.sin(vertical), Math.sin(horizontal) * radius)
}
