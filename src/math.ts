import type { AssimpNode, Mat4, Quat, Vec3 } from './types.ts'

export function identity(): Mat4 {
  return [
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
  ]
}

export function nodeTransform(node: AssimpNode): Mat4 {
  if (!node.transformation) {
    return identity()
  }

  if (node.transformation.length !== 16) {
    throw new Error(`Invalid transform for ${node.name}`)
  }

  return node.transformation as Mat4
}

export function compose(position: Vec3, rotation: Quat, nextScale: Vec3): Mat4 {
  return multiply(translate(position), multiply(rotate(rotation), scaleMatrix(nextScale)))
}

export function translate([x, y, z]: Vec3): Mat4 {
  return [
    1,
    0,
    0,
    x,
    0,
    1,
    0,
    y,
    0,
    0,
    1,
    z,
    0,
    0,
    0,
    1,
  ]
}

export function scaleMatrix([x, y, z]: Vec3): Mat4 {
  return [
    x,
    0,
    0,
    0,
    0,
    y,
    0,
    0,
    0,
    0,
    z,
    0,
    0,
    0,
    0,
    1,
  ]
}

export function rotate(quat: Quat): Mat4 {
  const [w, x, y, z] = normalizeQuat(quat)
  const xx = x * x
  const yy = y * y
  const zz = z * z
  const xy = x * y
  const xz = x * z
  const yz = y * z
  const wx = w * x
  const wy = w * y
  const wz = w * z

  return [
    1 - 2 * (yy + zz),
    2 * (xy - wz),
    2 * (xz + wy),
    0,
    2 * (xy + wz),
    1 - 2 * (xx + zz),
    2 * (yz - wx),
    0,
    2 * (xz - wy),
    2 * (yz + wx),
    1 - 2 * (xx + yy),
    0,
    0,
    0,
    0,
    1,
  ]
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const next = Array.from({ length: 16 }, () => 0) as Mat4

  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      next[row * 4 + column] = a[row * 4] * b[column]
        + a[row * 4 + 1] * b[4 + column]
        + a[row * 4 + 2] * b[8 + column]
        + a[row * 4 + 3] * b[12 + column]
    }
  }

  return next
}

export function transformOrigin(matrix: Mat4): Vec3 {
  return [matrix[3], matrix[7], matrix[11]]
}

export function normalizeQuat([w, x, y, z]: Quat): Quat {
  const length = Math.hypot(w, x, y, z)

  return [w / length, x / length, y / length, z / length]
}

export function slerp(a: Quat, b: Quat, t: number): Quat {
  let [bw, bx, by, bz] = b
  let dot = a[0] * bw + a[1] * bx + a[2] * by + a[3] * bz

  if (dot < 0) {
    dot = -dot
    bw = -bw
    bx = -bx
    by = -by
    bz = -bz
  }

  if (dot > 0.9995) {
    return normalizeQuat([
      mix(a[0], bw, t),
      mix(a[1], bx, t),
      mix(a[2], by, t),
      mix(a[3], bz, t),
    ])
  }

  const theta = Math.acos(dot)
  const sinTheta = Math.sin(theta)
  const from = Math.sin((1 - t) * theta) / sinTheta
  const to = Math.sin(t * theta) / sinTheta

  return [
    a[0] * from + bw * to,
    a[1] * from + bx * to,
    a[2] * from + by * to,
    a[3] * from + bz * to,
  ]
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function scale(vector: Vec3, amount: number): Vec3 {
  return [vector[0] * amount, vector[1] * amount, vector[2] * amount]
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

export function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector[0], vector[1], vector[2])

  if (length === 0) {
    throw new Error('Cannot normalize zero vector')
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

export function normalizeIndex(index: number, length: number) {
  return (index % length + length) % length
}

export function smoothAngle(from: number, to: number, lambda: number, delta: number) {
  const angle = Math.atan2(Math.sin(to - from), Math.cos(to - from))

  return from + angle * (1 - Math.exp(-lambda * delta))
}

export function setVec3(target: Vec3, value: Vec3) {
  target[0] = value[0]
  target[1] = value[1]
  target[2] = value[2]
}

export function lerpVec3(target: Vec3, value: Vec3, t: number) {
  target[0] = mix(target[0], value[0], t)
  target[1] = mix(target[1], value[1], t)
  target[2] = mix(target[2], value[2], t)
}

export function lengthSq(vector: Vec3) {
  return vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]
}

export function normalizeInto(vector: Vec3) {
  const length = Math.hypot(vector[0], vector[1], vector[2])

  vector[0] /= length
  vector[1] /= length
  vector[2] /= length
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function mix(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)

  return t * t * (3 - 2 * t)
}
