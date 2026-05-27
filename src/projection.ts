import type { Vec3 } from './types.ts'

type Camera = { eye: Vec3; center: Vec3 }
type Viewport = { width: number; height: number; clientWidth: number; clientHeight: number }
export type ProjectedPoint = { x: number; y: number }
export type WallProjector = ReturnType<typeof createWallProjector>

export function projectedQuadTransform(width: number, height: number, points: ProjectedPoint[]) {
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

export function createWallProjector(camera: Camera, viewport: Viewport) {
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

  return {
    aspect: viewport.width / viewport.height,
    cameraXX,
    cameraXY,
    cameraXZ,
    cameraYX,
    cameraYY,
    cameraYZ,
    cameraZX,
    cameraZY,
    cameraZZ,
    clientHeight: viewport.clientHeight,
    clientWidth: viewport.clientWidth,
    eyeX: camera.eye[0],
    eyeY: camera.eye[1],
    eyeZ: camera.eye[2],
    f: 1 / Math.tan(1.08 * 0.5),
  }
}

export function projectWallPoint(point: Vec3, projector: WallProjector) {
  const relativeX = point[0] - projector.eyeX
  const relativeY = point[1] - projector.eyeY
  const relativeZ = point[2] - projector.eyeZ
  const viewX = projector.cameraXX * relativeX + projector.cameraXY * relativeY + projector.cameraXZ * relativeZ
  const viewY = projector.cameraYX * relativeX + projector.cameraYY * relativeY + projector.cameraYZ * relativeZ
  const viewZ = projector.cameraZX * relativeX + projector.cameraZY * relativeY + projector.cameraZZ * relativeZ
  const depth = -viewZ
  const ndcX = (viewX * projector.f / projector.aspect) / depth
  const ndcY = (viewY * projector.f) / depth

  return {
    x: (ndcX * 0.5 + 0.5) * projector.clientWidth,
    y: (0.5 - ndcY * 0.5) * projector.clientHeight,
  }
}
