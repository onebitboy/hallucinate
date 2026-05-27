import { cross, dot, normalize, scale, subtract } from './math.ts'
import type { Vec3 } from './types.ts'

type Camera = { eye: Vec3; center: Vec3 }
type Viewport = { width: number; height: number; clientWidth: number; clientHeight: number }

export function projectedQuadTransform(width: number, height: number, points: ReturnType<typeof projectWallPoint>[]) {
  const from = [
    { x: 0, y: height },
    { x: width, y: height },
    { x: width, y: 0 },
    { x: 0, y: 0 },
  ]
  const to = points.map(point => ({ x: point.x, y: point.y }))
  const matrix = multiplyProjective(quadBasis(to), invertProjective(quadBasis(from)))

  return `matrix3d(${
    [
      matrix[0],
      matrix[3],
      0,
      matrix[6],
      matrix[1],
      matrix[4],
      0,
      matrix[7],
      0,
      0,
      1,
      0,
      matrix[2],
      matrix[5],
      0,
      matrix[8],
    ].join(',')
  })`
}

export function quadBasis(points: { x: number; y: number }[]) {
  const [a, b, c, d] = points
  const matrix = [
    a!.x,
    b!.x,
    c!.x,
    a!.y,
    b!.y,
    c!.y,
    1,
    1,
    1,
  ]
  const scale = multiplyProjectiveVector(invertProjective(matrix), [d!.x, d!.y, 1])

  return [
    matrix[0]! * scale[0],
    matrix[1]! * scale[1],
    matrix[2]! * scale[2],
    matrix[3]! * scale[0],
    matrix[4]! * scale[1],
    matrix[5]! * scale[2],
    matrix[6]! * scale[0],
    matrix[7]! * scale[1],
    matrix[8]! * scale[2],
  ]
}

export function multiplyProjective(a: number[], b: number[]) {
  return [
    a[0]! * b[0]! + a[1]! * b[3]! + a[2]! * b[6]!,
    a[0]! * b[1]! + a[1]! * b[4]! + a[2]! * b[7]!,
    a[0]! * b[2]! + a[1]! * b[5]! + a[2]! * b[8]!,
    a[3]! * b[0]! + a[4]! * b[3]! + a[5]! * b[6]!,
    a[3]! * b[1]! + a[4]! * b[4]! + a[5]! * b[7]!,
    a[3]! * b[2]! + a[4]! * b[5]! + a[5]! * b[8]!,
    a[6]! * b[0]! + a[7]! * b[3]! + a[8]! * b[6]!,
    a[6]! * b[1]! + a[7]! * b[4]! + a[8]! * b[7]!,
    a[6]! * b[2]! + a[7]! * b[5]! + a[8]! * b[8]!,
  ]
}

export function multiplyProjectiveVector(matrix: number[], vector: Vec3): Vec3 {
  return [
    matrix[0]! * vector[0] + matrix[1]! * vector[1] + matrix[2]! * vector[2],
    matrix[3]! * vector[0] + matrix[4]! * vector[1] + matrix[5]! * vector[2],
    matrix[6]! * vector[0] + matrix[7]! * vector[1] + matrix[8]! * vector[2],
  ]
}

export function invertProjective(matrix: number[]) {
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

  return [
    (e * i - f * h) / determinant,
    (c * h - b * i) / determinant,
    (b * f - c * e) / determinant,
    (f * g - d * i) / determinant,
    (a * i - c * g) / determinant,
    (c * d - a * f) / determinant,
    (d * h - e * g) / determinant,
    (b * g - a * h) / determinant,
    (a * e - b * d) / determinant,
  ]
}

export function projectWallPoint(point: Vec3, camera: Camera, viewport: Viewport) {
  const forward = normalize(subtract(camera.center, camera.eye))
  const cameraZ = scale(forward, -1)
  const cameraX = normalize(cross([0, 1, 0], cameraZ))
  const cameraY = cross(cameraZ, cameraX)
  const relative = subtract(point, camera.eye)
  const viewX = dot(cameraX, relative)
  const viewY = dot(cameraY, relative)
  const viewZ = dot(cameraZ, relative)
  const f = 1 / Math.tan(1.08 * 0.5)
  const aspect = viewport.width / viewport.height
  const depth = -viewZ
  const ndcX = (viewX * f / aspect) / depth
  const ndcY = (viewY * f) / depth

  return {
    x: (ndcX * 0.5 + 0.5) * viewport.clientWidth,
    y: (0.5 - ndcY * 0.5) * viewport.clientHeight,
  }
}
