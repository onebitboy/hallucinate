import type { CharacterLight, Vec3 } from './types.ts'

export type VertexBufferCache = {
  data: Float32Array
  length: number
}

export type VertexWriter = VertexBufferCache

const lightPoint: Vec3 = [0, 0, 0]
const lightNormal: Vec3 = [0, 1, 0]
const lightShade: Vec3 = [0, 0, 0]
const boxA0: Vec3 = [0, 0, 0]
const boxA1: Vec3 = [0, 0, 0]
const boxA2: Vec3 = [0, 0, 0]
const boxA3: Vec3 = [0, 0, 0]
const boxB0: Vec3 = [0, 0, 0]
const boxB1: Vec3 = [0, 0, 0]
const boxB2: Vec3 = [0, 0, 0]
const boxB3: Vec3 = [0, 0, 0]
const shadeA: Vec3 = [0, 0, 0]
const shadeB: Vec3 = [0, 0, 0]

export function resetVertexWriter(writer: VertexWriter) {
  writer.length = 0
}

export function vertexWriterData(writer: VertexWriter): Float32Array {
  return writer.data.length === writer.length ? writer.data : (writer.data.subarray(0, writer.length) as Float32Array)
}

function reserveVertices(writer: VertexWriter, vertices: number) {
  resizeVertexBuffer(writer, writer.length + vertices * 11)
}

function resizeVertexBuffer(cache: VertexBufferCache, size: number) {
  if (cache.data.length < size) {
    const data = new Float32Array(Math.max(size, cache.data.length * 2, 1024))

    data.set(cache.data.subarray(0, cache.length))
    cache.data = data
  }

  return cache.data
}

export function reserveFloats(writer: VertexWriter, count: number) {
  resizeVertexBuffer(writer, writer.length + count)
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
  target: VertexWriter,
  instances: VertexWriter,
  a: Vec3,
  b: Vec3,
  width: number,
  depth: number,
  color: Vec3,
  glow: number,
  turn: number,
  localReflection: boolean,
  light: CharacterLight,
  strobe = 0,
  turnSin = Math.sin(turn),
  turnCos = Math.cos(turn),
  basis?: { side: Vec3 },
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

  if (basis) {
    const dot = basis.side[0] * nx + basis.side[1] * ny + basis.side[2] * nz

    sideX = basis.side[0] - nx * dot
    sideY = basis.side[1] - ny * dot
    sideZ = basis.side[2] - nz * dot
    const sideLength = Math.hypot(sideX, sideY, sideZ)

    if (sideLength === 0) {
      throw new Error('Cannot orient box with parallel side')
    }

    sideX /= sideLength
    sideY /= sideLength
    sideZ /= sideLength
    upX = ny * sideZ - nz * sideY
    upY = nz * sideX - nx * sideZ
    upZ = nx * sideY - ny * sideX
  }
  else if (vertical) {
    sideX = turnCos
    sideZ = -turnSin
    upX = turnSin
    upZ = turnCos
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

  setBoxPoint(boxA0, a, -sideX - upX, -sideY - upY, -sideZ - upZ)
  setBoxPoint(boxA1, a, sideX - upX, sideY - upY, sideZ - upZ)
  setBoxPoint(boxA2, a, sideX + upX, sideY + upY, sideZ + upZ)
  setBoxPoint(boxA3, a, -sideX + upX, -sideY + upY, -sideZ + upZ)
  setBoxPoint(boxB0, b, -sideX - upX, -sideY - upY, -sideZ - upZ)
  setBoxPoint(boxB1, b, sideX - upX, sideY - upY, sideZ - upZ)
  setBoxPoint(boxB2, b, sideX + upX, sideY + upY, sideZ + upZ)
  setBoxPoint(boxB3, b, -sideX + upX, -sideY + upY, -sideZ + upZ)
  shadeA[0] = color[0] * 0.65
  shadeA[1] = color[1] * 0.65
  shadeA[2] = color[2] * 0.65
  shadeB[0] = color[0] * 0.82
  shadeB[1] = color[1] * 0.82
  shadeB[2] = color[2] * 0.82

  addCharacterQuad(target, boxA0, boxA1, boxB1, boxB0, shadeA, glow, localReflection, light)
  addCharacterQuad(target, boxA1, boxA2, boxB2, boxB1, color, glow, localReflection, light)
  addCharacterQuad(target, boxA2, boxA3, boxB3, boxB2, shadeB, glow, localReflection, light)
  addCharacterQuad(target, boxA3, boxA0, boxB0, boxB3, shadeA, glow, localReflection, light)
  addCharacterQuad(target, boxA3, boxA2, boxA1, boxA0, shadeB, glow, localReflection, light)
  addCharacterQuad(target, boxB0, boxB1, boxB2, boxB3, shadeB, glow, localReflection, light)
}

function setBoxPoint(target: Vec3, origin: Vec3, x: number, y: number, z: number) {
  target[0] = origin[0] + x
  target[1] = origin[1] + y
  target[2] = origin[2] + z
}

export function addCharacterQuad(
  target: VertexWriter,
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  color: Vec3,
  glow: number,
  localReflection: boolean,
  light: CharacterLight,
  strobe = 0,
) {
  if (localReflection) {
    addLitQuad(target, a, b, c, d, color, glow, light)
  }
  else {
    addFlatQuad(target, a, b, c, d, color, glow, strobe)
  }
}

function addLitQuad(
  target: VertexWriter,
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  color: Vec3,
  glow: number,
  light: CharacterLight,
) {
  const ux = c[0] - a[0]
  const uy = c[1] - a[1]
  const uz = c[2] - a[2]
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const vz = b[2] - a[2]
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz)
  if (length === 0) {
    throw new Error('Cannot normalize zero vector')
  }

  lightPoint[0] = (a[0] + b[0] + c[0] + d[0]) * 0.25
  lightPoint[1] = (a[1] + b[1] + c[1] + d[1]) * 0.25
  lightPoint[2] = (a[2] + b[2] + c[2] + d[2]) * 0.25
  lightNormal[0] = nx / length
  lightNormal[1] = ny / length
  lightNormal[2] = nz / length

  addFlatQuad(target, a, b, c, d, light(color, lightPoint, lightNormal, lightShade), glow)
}

export function addFlatTriangle(
  target: VertexWriter,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  color: Vec3,
  glow: number,
  strobe = 0,
) {
  reserveVertices(target, 3)
  writeFlatTriangleInto(target, ax, ay, az, bx, by, bz, cx, cy, cz, color, glow, strobe)
}

export function addReservedFlatTriangle(
  target: VertexWriter,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  color: Vec3,
  glow: number,
  strobe = 0,
) {
  writeFlatTriangleInto(target, ax, ay, az, bx, by, bz, cx, cy, cz, color, glow, strobe)
}

function writeFlatTriangleInto(
  target: VertexWriter,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  color: Vec3,
  glow: number,
  strobe = 0,
) {
  const data = target.data
  let offset = target.length
  const r = color[0]
  const g = color[1]
  const b = color[2]

  data[offset++] = ax
  data[offset++] = ay
  data[offset++] = az
  data[offset++] = r
  data[offset++] = g
  data[offset++] = b
  data[offset++] = glow
  data[offset++] = strobe
  data[offset++] = 0
  data[offset++] = 0
  data[offset++] = 0
  data[offset++] = bx
  data[offset++] = by
  data[offset++] = bz
  data[offset++] = r
  data[offset++] = g
  data[offset++] = b
  data[offset++] = glow
  data[offset++] = strobe
  data[offset++] = 0
  data[offset++] = 0
  data[offset++] = 0
  data[offset++] = cx
  data[offset++] = cy
  data[offset++] = cz
  data[offset++] = r
  data[offset++] = g
  data[offset++] = b
  data[offset++] = glow
  data[offset++] = strobe
  data[offset++] = 0
  data[offset++] = 0
  data[offset++] = 0
  target.length = offset
}

function addFlatQuad(
  target: VertexWriter,
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  color: Vec3,
  glow: number,
  strobe = 0,
) {
  reserveVertices(target, 6)

  const data = target.data
  let offset = target.length
  const r = color[0]
  const g = color[1]
  const blue = color[2]
  const ax = a[0]
  const ay = a[1]
  const az = a[2]
  const bx = b[0]
  const by = b[1]
  const bz = b[2]
  const cx = c[0]
  const cy = c[1]
  const cz = c[2]
  const dx = d[0]
  const dy = d[1]
  const dz = d[2]

  data[offset++] = ax
  data[offset++] = ay
  data[offset++] = az
  data[offset++] = r
  data[offset++] = g
  data[offset++] = blue
  data[offset++] = glow
  data[offset++] = strobe
  data[offset++] = 0
  data[offset++] = 0
  data[offset++] = 0
  data[offset++] = bx
  data[offset++] = by
  data[offset++] = bz
  data[offset++] = r
  data[offset++] = g
  data[offset++] = blue
  data[offset++] = glow
  data[offset++] = strobe
  data[offset++] = 0
  data[offset++] = 0
  data[offset++] = 0
  data[offset++] = cx
  data[offset++] = cy
  data[offset++] = cz
  data[offset++] = r
  data[offset++] = g
  data[offset++] = blue
  data[offset++] = glow
  data[offset++] = strobe
  data[offset++] = 0
  data[offset++] = 0
  data[offset++] = 0
  data[offset++] = ax
  data[offset++] = ay
  data[offset++] = az
  data[offset++] = r
  data[offset++] = g
  data[offset++] = blue
  data[offset++] = glow
  data[offset++] = strobe
  data[offset++] = 0
  data[offset++] = 0
  data[offset++] = 0
  data[offset++] = cx
  data[offset++] = cy
  data[offset++] = cz
  data[offset++] = r
  data[offset++] = g
  data[offset++] = blue
  data[offset++] = glow
  data[offset++] = strobe
  data[offset++] = 0
  data[offset++] = 0
  data[offset++] = 0
  data[offset++] = dx
  data[offset++] = dy
  data[offset++] = dz
  data[offset++] = r
  data[offset++] = g
  data[offset++] = blue
  data[offset++] = glow
  data[offset++] = strobe
  data[offset++] = 0
  data[offset++] = 0
  data[offset++] = 0
  target.length = offset
}

function addCharacterBoxInstance(
  instances: VertexWriter,
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
  reserveFloats(instances, 17)

  const data = instances.data
  let offset = instances.length

  data[offset++] = a[0]
  data[offset++] = a[1]
  data[offset++] = a[2]
  data[offset++] = b[0]
  data[offset++] = b[1]
  data[offset++] = b[2]
  data[offset++] = sideX
  data[offset++] = sideY
  data[offset++] = sideZ
  data[offset++] = upX
  data[offset++] = upY
  data[offset++] = upZ
  data[offset++] = color[0]
  data[offset++] = color[1]
  data[offset++] = color[2]
  data[offset++] = glow
  data[offset++] = strobe
  instances.length = offset
}
