import type { Vec3 } from './types.ts'

type Camera = { eye: Vec3; center: Vec3 }
export type Viewport = { width: number; height: number; clientWidth: number; clientHeight: number }
export type ProjectedPoint = { x: number; y: number }
export type WallProjector = ReturnType<typeof createWallProjector>

const quadFrom: ProjectedPoint[] = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
]
const basisFrom = new Array<number>(9).fill(0)
const basisTo = new Array<number>(9).fill(0)
const inverseFrom = new Array<number>(9).fill(0)
const inverseBasis = new Array<number>(9).fill(0)
const matrixScratch = new Array<number>(9).fill(0)
const scaleScratch: Vec3 = [0, 0, 0]

export function projectedQuadTransform(width: number, height: number, points: ProjectedPoint[]) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width === 0 || height === 0) {
    throw new Error(`Invalid projected quad size ${width}x${height}`)
  }

  quadFrom[0]!.x = 0
  quadFrom[0]!.y = height
  quadFrom[1]!.x = width
  quadFrom[1]!.y = height
  quadFrom[2]!.x = width
  quadFrom[2]!.y = 0
  quadFrom[3]!.x = 0
  quadFrom[3]!.y = 0

  quadBasisInto(points, basisTo)
  quadBasisInto(quadFrom, basisFrom)
  invertProjectiveInto(basisFrom, inverseFrom)
  multiplyProjectiveInto(basisTo, inverseFrom, matrixScratch)
  assertProjectiveMatrix(matrixScratch)

  return `matrix3d(${matrixScratch[0]},${matrixScratch[3]},0,${matrixScratch[6]},${matrixScratch[1]},${
    matrixScratch[4]
  },0,${matrixScratch[7]},0,0,1,0,${matrixScratch[2]},${matrixScratch[5]},0,${matrixScratch[8]})`
}

export function quadBasis(points: { x: number; y: number }[]) {
  const matrix = new Array<number>(9)

  return quadBasisInto(points, matrix)
}

function quadBasisInto(points: { x: number; y: number }[], target: number[]) {
  const a = points[0]!
  const b = points[1]!
  const c = points[2]!
  const d = points[3]!

  target[0] = a.x
  target[1] = b.x
  target[2] = c.x
  target[3] = a.y
  target[4] = b.y
  target[5] = c.y
  target[6] = 1
  target[7] = 1
  target[8] = 1
  invertProjectiveInto(target, inverseBasis)
  multiplyProjectiveVectorInto(inverseBasis, d.x, d.y, 1, scaleScratch)

  target[0] *= scaleScratch[0]
  target[1] *= scaleScratch[1]
  target[2] *= scaleScratch[2]
  target[3] *= scaleScratch[0]
  target[4] *= scaleScratch[1]
  target[5] *= scaleScratch[2]
  target[6] *= scaleScratch[0]
  target[7] *= scaleScratch[1]
  target[8] *= scaleScratch[2]

  return target
}

export function multiplyProjective(a: number[], b: number[]) {
  return multiplyProjectiveInto(a, b, new Array<number>(9))
}

function multiplyProjectiveInto(a: number[], b: number[], target: number[]) {
  target[0] = a[0]! * b[0]! + a[1]! * b[3]! + a[2]! * b[6]!
  target[1] = a[0]! * b[1]! + a[1]! * b[4]! + a[2]! * b[7]!
  target[2] = a[0]! * b[2]! + a[1]! * b[5]! + a[2]! * b[8]!
  target[3] = a[3]! * b[0]! + a[4]! * b[3]! + a[5]! * b[6]!
  target[4] = a[3]! * b[1]! + a[4]! * b[4]! + a[5]! * b[7]!
  target[5] = a[3]! * b[2]! + a[4]! * b[5]! + a[5]! * b[8]!
  target[6] = a[6]! * b[0]! + a[7]! * b[3]! + a[8]! * b[6]!
  target[7] = a[6]! * b[1]! + a[7]! * b[4]! + a[8]! * b[7]!
  target[8] = a[6]! * b[2]! + a[7]! * b[5]! + a[8]! * b[8]!

  return target
}

export function multiplyProjectiveVector(matrix: number[], vector: Vec3): Vec3 {
  return multiplyProjectiveVectorInto(matrix, vector[0], vector[1], vector[2], [0, 0, 0])
}

function multiplyProjectiveVectorInto(matrix: number[], x: number, y: number, z: number, target: Vec3): Vec3 {
  target[0] = matrix[0]! * x + matrix[1]! * y + matrix[2]! * z
  target[1] = matrix[3]! * x + matrix[4]! * y + matrix[5]! * z
  target[2] = matrix[6]! * x + matrix[7]! * y + matrix[8]! * z

  return target
}

export function invertProjective(matrix: number[]) {
  return invertProjectiveInto(matrix, new Array<number>(9))
}

function invertProjectiveInto(matrix: number[], target: number[]) {
  const a = matrix[0]!
  const b = matrix[1]!
  const c = matrix[2]!
  const d = matrix[3]!
  const e = matrix[4]!
  const f = matrix[5]!
  const g = matrix[6]!
  const h = matrix[7]!
  const i = matrix[8]!
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)

  if (!Number.isFinite(determinant) || determinant === 0) {
    throw new Error(`Singular projective matrix determinant ${determinant}`)
  }

  target[0] = (e * i - f * h) / determinant
  target[1] = (c * h - b * i) / determinant
  target[2] = (b * f - c * e) / determinant
  target[3] = (f * g - d * i) / determinant
  target[4] = (a * i - c * g) / determinant
  target[5] = (c * d - a * f) / determinant
  target[6] = (d * h - e * g) / determinant
  target[7] = (b * g - a * h) / determinant
  target[8] = (a * e - b * d) / determinant

  return target
}

function assertProjectiveMatrix(matrix: number[]) {
  for (const value of matrix) {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid projective matrix value ${value}`)
    }
  }
}

export function createWallProjector(camera: Camera, viewport: Viewport, target?: {
  aspect: number
  cameraXX: number
  cameraXY: number
  cameraXZ: number
  cameraYX: number
  cameraYY: number
  cameraYZ: number
  cameraZX: number
  cameraZY: number
  cameraZZ: number
  clientHeight: number
  clientWidth: number
  eyeX: number
  eyeY: number
  eyeZ: number
  f: number
}) {
  const forwardX = camera.center[0] - camera.eye[0]
  const forwardY = camera.center[1] - camera.eye[1]
  const forwardZ = camera.center[2] - camera.eye[2]
  const forwardLength = Math.hypot(forwardX, forwardY, forwardZ)
  const cameraZX = -forwardX / forwardLength
  const cameraZY = -forwardY / forwardLength
  const cameraZZ = -forwardZ / forwardLength
  const cameraXLength = Math.hypot(cameraZZ, cameraZX)
  const cameraXX = cameraZZ / cameraXLength
  const cameraXY = 0
  const cameraXZ = -cameraZX / cameraXLength
  const cameraYX = cameraZY * cameraXZ - cameraZZ * cameraXY
  const cameraYY = cameraZZ * cameraXX - cameraZX * cameraXZ
  const cameraYZ = cameraZX * cameraXY - cameraZY * cameraXX

  const projector = target ?? {
    aspect: 0,
    cameraXX: 0,
    cameraXY: 0,
    cameraXZ: 0,
    cameraYX: 0,
    cameraYY: 0,
    cameraYZ: 0,
    cameraZX: 0,
    cameraZY: 0,
    cameraZZ: 0,
    clientHeight: 0,
    clientWidth: 0,
    eyeX: 0,
    eyeY: 0,
    eyeZ: 0,
    f: 0,
  }

  projector.aspect = viewport.width / viewport.height
  projector.cameraXX = cameraXX
  projector.cameraXY = cameraXY
  projector.cameraXZ = cameraXZ
  projector.cameraYX = cameraYX
  projector.cameraYY = cameraYY
  projector.cameraYZ = cameraYZ
  projector.cameraZX = cameraZX
  projector.cameraZY = cameraZY
  projector.cameraZZ = cameraZZ
  projector.clientHeight = viewport.clientHeight
  projector.clientWidth = viewport.clientWidth
  projector.eyeX = camera.eye[0]
  projector.eyeY = camera.eye[1]
  projector.eyeZ = camera.eye[2]
  projector.f = 1 / Math.tan(1.08 * 0.5)

  return projector
}

export function projectWallPoint(point: Vec3, projector: WallProjector) {
  return projectWallPointInto(point, projector, { x: 0, y: 0 })
}

export function projectWallPointInto(point: Vec3, projector: WallProjector, target: ProjectedPoint) {
  return projectWallPointWithMinDepthInto(point, projector, target, 0)
}

export function projectWallPointWithMinDepthInto(
  point: Vec3,
  projector: WallProjector,
  target: ProjectedPoint,
  minDepth: number,
) {
  const relativeX = point[0] - projector.eyeX
  const relativeY = point[1] - projector.eyeY
  const relativeZ = point[2] - projector.eyeZ
  const viewX = projector.cameraXX * relativeX + projector.cameraXY * relativeY + projector.cameraXZ * relativeZ
  const viewY = projector.cameraYX * relativeX + projector.cameraYY * relativeY + projector.cameraYZ * relativeZ
  const viewZ = projector.cameraZX * relativeX + projector.cameraZY * relativeY + projector.cameraZZ * relativeZ
  const depth = Math.max(-viewZ, minDepth)
  const ndcX = (viewX * projector.f / projector.aspect) / depth
  const ndcY = (viewY * projector.f) / depth

  target.x = (ndcX * 0.5 + 0.5) * projector.clientWidth
  target.y = (0.5 - ndcY * 0.5) * projector.clientHeight

  return target
}

export function projectVisiblePointInto(point: Vec3, projector: WallProjector, target: ProjectedPoint) {
  const relativeX = point[0] - projector.eyeX
  const relativeY = point[1] - projector.eyeY
  const relativeZ = point[2] - projector.eyeZ
  const viewX = projector.cameraXX * relativeX + projector.cameraXY * relativeY + projector.cameraXZ * relativeZ
  const viewY = projector.cameraYX * relativeX + projector.cameraYY * relativeY + projector.cameraYZ * relativeZ
  const viewZ = projector.cameraZX * relativeX + projector.cameraZY * relativeY + projector.cameraZZ * relativeZ
  const depth = -viewZ
  const ndcX = (viewX * projector.f / projector.aspect) / depth
  const ndcY = (viewY * projector.f) / depth

  if (depth <= 0 || ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1) {
    return
  }

  target.x = (ndcX * 0.5 + 0.5) * projector.clientWidth
  target.y = (0.5 - ndcY * 0.5) * projector.clientHeight

  return target
}
