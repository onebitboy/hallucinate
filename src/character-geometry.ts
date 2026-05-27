import { addQuad } from './geometry.ts'
import type { Vec3, Vertex } from './types.ts'

export type VertexBufferCache = {
  data: Float32Array
}

export function flattenVertices(target: Vertex[], cache?: VertexBufferCache) {
  const size = target.length * 11
  const data = cache ? resizeVertexBuffer(cache, size) : new Float32Array(size)
  let offset = 0

  for (const vertex of target) {
    data[offset++] = vertex[0]
    data[offset++] = vertex[1]
    data[offset++] = vertex[2]
    data[offset++] = vertex[3]
    data[offset++] = vertex[4]
    data[offset++] = vertex[5]
    data[offset++] = vertex[6]
    data[offset++] = vertex[7]
    data[offset++] = vertex[8]
    data[offset++] = vertex[9]
    data[offset++] = vertex[10]
  }

  return data.length === size ? data : data.subarray(0, size)
}

function resizeVertexBuffer(cache: VertexBufferCache, size: number) {
  if (cache.data.length < size) {
    cache.data = new Float32Array(size)
  }

  return cache.data
}

export function triangleAreaSquared(a: Vec3, b: Vec3, c: Vec3) {
  const ux = c[0] - a[0]
  const uy = c[1] - a[1]
  const uz = c[2] - a[2]
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const vz = b[2] - a[2]
  const x = uy * vz - uz * vy
  const y = uz * vx - ux * vz
  const z = ux * vy - uy * vx

  return x * x + y * y + z * z
}

export function addCharacterBox(
  target: Vertex[],
  instances: number[],
  a: Vec3,
  b: Vec3,
  width: number,
  depth: number,
  color: Vec3,
  glow: number,
  turn: number,
  localReflection: boolean,
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3,
  strobe = 0,
) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  const length = Math.hypot(dx, dy, dz)
  const nx = dx / length
  const ny = dy / length
  const nz = dz / length
  const vertical = Math.abs(ny) > 0.82
  let sideX = 0
  let sideY = 0
  let sideZ = 0
  let upX = 0
  let upY = 0
  let upZ = 0

  if (vertical) {
    sideX = Math.cos(turn)
    sideZ = -Math.sin(turn)
    upX = Math.sin(turn)
    upZ = Math.cos(turn)
  }
  else {
    const sideLength = Math.hypot(-nz, nx)

    sideX = -nz / sideLength
    sideZ = nx / sideLength
    upX = -sideZ * ny
    upY = sideZ * nx - sideX * nz
    upZ = sideX * ny

    const upLength = Math.hypot(upX, upY, upZ)

    upX /= upLength
    upY /= upLength
    upZ /= upLength
  }

  sideX *= width * 0.5
  sideY *= width * 0.5
  sideZ *= width * 0.5
  upX *= depth * 0.5
  upY *= depth * 0.5
  upZ *= depth * 0.5

  if (!localReflection) {
    addCharacterBoxInstance(instances, a, b, sideX, sideY, sideZ, upX, upY, upZ, color, glow, strobe)
    return
  }

  const a0: Vec3 = [a[0] - sideX - upX, a[1] - sideY - upY, a[2] - sideZ - upZ]
  const a1: Vec3 = [a[0] + sideX - upX, a[1] + sideY - upY, a[2] + sideZ - upZ]
  const a2: Vec3 = [a[0] + sideX + upX, a[1] + sideY + upY, a[2] + sideZ + upZ]
  const a3: Vec3 = [a[0] - sideX + upX, a[1] - sideY + upY, a[2] - sideZ + upZ]
  const b0: Vec3 = [b[0] - sideX - upX, b[1] - sideY - upY, b[2] - sideZ - upZ]
  const b1: Vec3 = [b[0] + sideX - upX, b[1] + sideY - upY, b[2] + sideZ - upZ]
  const b2: Vec3 = [b[0] + sideX + upX, b[1] + sideY + upY, b[2] + sideZ + upZ]
  const b3: Vec3 = [b[0] - sideX + upX, b[1] - sideY + upY, b[2] - sideZ + upZ]
  const shadeA: Vec3 = [color[0] * 0.65, color[1] * 0.65, color[2] * 0.65]
  const shadeB: Vec3 = [color[0] * 0.82, color[1] * 0.82, color[2] * 0.82]

  addCharacterQuad(target, a0, a1, b1, b0, shadeA, glow, localReflection, light)
  addCharacterQuad(target, a1, a2, b2, b1, color, glow, localReflection, light)
  addCharacterQuad(target, a2, a3, b3, b2, shadeB, glow, localReflection, light)
  addCharacterQuad(target, a3, a0, b0, b3, shadeA, glow, localReflection, light)
  addCharacterQuad(target, a3, a2, a1, a0, shadeB, glow, localReflection, light)
  addCharacterQuad(target, b0, b1, b2, b3, shadeB, glow, localReflection, light)
}

export function addCharacterQuad(
  target: Vertex[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  color: Vec3,
  glow: number,
  localReflection: boolean,
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3,
) {
  if (localReflection) {
    addLitQuad(target, a, b, c, d, color, glow, light)
  }
  else {
    addQuad(target, a, b, c, d, color, glow)
  }
}

function addLitQuad(
  target: Vertex[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  color: Vec3,
  glow: number,
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3,
) {
  const ux = c[0] - a[0]
  const uy = c[1] - a[1]
  const uz = c[2] - a[2]
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const vz = b[2] - a[2]
  const center: Vec3 = [
    (a[0] + b[0] + c[0] + d[0]) * 0.25,
    (a[1] + b[1] + c[1] + d[1]) * 0.25,
    (a[2] + b[2] + c[2] + d[2]) * 0.25,
  ]
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz)
  if (length === 0) {
    throw new Error('Cannot normalize zero vector')
  }
  const normal: Vec3 = [nx / length, ny / length, nz / length]

  addQuad(target, a, b, c, d, light(color, center, normal), glow)
}

function addCharacterBoxInstance(
  instances: number[],
  a: Vec3,
  b: Vec3,
  sideX: number,
  sideY: number,
  sideZ: number,
  upX: number,
  upY: number,
  upZ: number,
  color: Vec3,
  glow: number,
  strobe: number,
) {
  instances.push(
    a[0],
    a[1],
    a[2],
    b[0],
    b[1],
    b[2],
    sideX,
    sideY,
    sideZ,
    upX,
    upY,
    upZ,
    color[0],
    color[1],
    color[2],
    glow,
    strobe,
  )
}
