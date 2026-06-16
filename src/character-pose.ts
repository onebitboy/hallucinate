import type { Vec3 } from './types.ts'

export function poseGround(pose: Vec3[], groundJointIndices: number[]) {
  let ground = Infinity

  for (const index of groundJointIndices) {
    ground = Math.min(ground, pose[index]![1])
  }

  return ground
}

export function createPose(length: number) {
  return Array.from({ length }, () => [0, 0, 0] as Vec3)
}

export function blendPoseInto(from: Vec3[], to: Vec3[], blend: number, target = createPose(from.length)) {
  for (let i = 0; i < from.length; i++) {
    const point = from[i]!
    const next = to[i]!
    const value = target[i]!

    value[0] = point[0] + (next[0] - point[0]) * blend
    value[1] = point[1] + (next[1] - point[1]) * blend
    value[2] = point[2] + (next[2] - point[2]) * blend
  }

  return target
}

export function blendGroundedPoseInto(
  from: Vec3[],
  to: Vec3[],
  blend: number,
  groundJointIndices: number[],
  target = createPose(from.length),
) {
  const fromGround = poseGround(from, groundJointIndices)
  const toGround = poseGround(to, groundJointIndices)

  for (let i = 0; i < from.length; i++) {
    const point = from[i]!
    const next = to[i]!
    const value = target[i]!

    value[0] = point[0] + (next[0] - point[0]) * blend
    value[1] = point[1] - fromGround + (next[1] - toGround - point[1] + fromGround) * blend
    value[2] = point[2] + (next[2] - point[2]) * blend
  }

  return target
}

export function placeBlendedPoseInto(
  from: Vec3[],
  to: Vec3[],
  blend: number,
  position: Vec3,
  turn: number,
  groundJointIndices: number[],
  scale: number,
  target = createPose(from.length),
) {
  let ground = Infinity
  const sin = Math.sin(turn)
  const cos = Math.cos(turn)

  for (const index of groundJointIndices) {
    const point = from[index]!
    const next = to[index]!

    ground = Math.min(ground, point[1] + (next[1] - point[1]) * blend)
  }

  for (let i = 0; i < from.length; i++) {
    const point = from[i]!
    const next = to[i]!
    const x = (point[0] + (next[0] - point[0]) * blend) * scale
    const y = (point[1] + (next[1] - point[1]) * blend - ground) * scale
    const z = (point[2] + (next[2] - point[2]) * blend) * scale
    const placed = target[i]!

    placed[0] = position[0] + x * cos + z * sin
    placed[1] = position[1] + y
    placed[2] = position[2] - x * sin + z * cos
  }

  return target
}

export function placePoseInto(
  pose: Vec3[],
  position: Vec3,
  turn: number,
  groundJointIndices: number[],
  scale: number,
  target = createPose(pose.length),
  ground = poseGround(pose, groundJointIndices),
  poseUp?: Vec3,
) {
  const sin = Math.sin(turn)
  const cos = Math.cos(turn)
  let sideX = cos
  let sideY = 0
  let sideZ = -sin
  let upX = 0
  let upY = 1
  let upZ = 0

  if (poseUp) {
    const upLength = Math.sqrt(poseUp[0] * poseUp[0] + poseUp[1] * poseUp[1] + poseUp[2] * poseUp[2])

    if (upLength === 0) {
      throw new Error('Cannot place character pose with zero up vector')
    }

    upX = poseUp[0] / upLength
    upY = poseUp[1] / upLength
    upZ = poseUp[2] / upLength

    const dot = sideX * upX + sideY * upY + sideZ * upZ

    sideX -= upX * dot
    sideY -= upY * dot
    sideZ -= upZ * dot

    const sideLength = Math.sqrt(sideX * sideX + sideY * sideY + sideZ * sideZ)

    if (sideLength === 0) {
      throw new Error('Cannot place character pose with parallel turn and up')
    }

    sideX /= sideLength
    sideY /= sideLength
    sideZ /= sideLength
  }

  const forwardX = sideY * upZ - sideZ * upY
  const forwardY = sideZ * upX - sideX * upZ
  const forwardZ = sideX * upY - sideY * upX

  for (let i = 0; i < pose.length; i++) {
    const point = pose[i]!
    const x = point[0] * scale
    const y = (point[1] - ground) * scale
    const z = point[2] * scale
    const placed = target[i]!

    placed[0] = position[0] + x * sideX + y * upX + z * forwardX
    placed[1] = position[1] + x * sideY + y * upY + z * forwardY
    placed[2] = position[2] + x * sideZ + y * upZ + z * forwardZ
  }

  return target
}
