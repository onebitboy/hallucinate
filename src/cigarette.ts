import { handSideSign } from './character-accessory.ts'
import type { TurnBasis } from './character-accessory.ts'
import type { Vec3 } from './types.ts'

export type CigaretteGeometry = {
  base: Vec3
  tip: Vec3
  emberTip: Vec3
  side: Vec3
  forward: Vec3
}

// One slow puffing cycle: the cigarette rests in the hand, rises to the mouth
// for a drag, holds, lowers again, then the smoker exhales a plume.
const period = 8
const liftStart = 1
const liftEnd = 1.7
const holdEnd = 2.9
const lowerEnd = 3.6
const exhaleEnd = 4.8
const gripReach = 0.08
const gripSideOffset = 0.035
const gripForwardOffset = 0.025
const gripHeightOffset = 0.015
const mouthForwardOffset = 0.05
const mouthHeightOffset = -0.08
const cigaretteSide = 0.32
const cigaretteRise = -0.18
const cigaretteLength = 0.1
const emberLength = 0.016
const mouthPoint: Vec3 = [0, 0, 0]

export function createCigaretteGeometry(): CigaretteGeometry {
  return {
    base: [0, 0, 0],
    tip: [0, 0, 0],
    emberTip: [0, 0, 0],
    side: [0, 0, 0],
    forward: [0, 0, 0],
  }
}

export function cigarettePhase(time: number) {
  return ((time % period) + period) % period
}

// 0 = cigarette resting at the hand, 1 = held at the mouth.
export function cigaretteLift(time: number) {
  const t = cigarettePhase(time)

  if (t < liftStart) {
    return 0
  }
  if (t < liftEnd) {
    return smoothstep((t - liftStart) / (liftEnd - liftStart))
  }
  if (t < holdEnd) {
    return 1
  }
  if (t < lowerEnd) {
    return 1 - smoothstep((t - holdEnd) / (lowerEnd - holdEnd))
  }

  return 0
}

// 0 outside the exhale window, rising to 1 at the peak of the plume.
export function cigaretteExhale(time: number) {
  const t = cigarettePhase(time)

  if (t < lowerEnd || t > exhaleEnd) {
    return 0
  }

  return Math.sin((t - lowerEnd) / (exhaleEnd - lowerEnd) * Math.PI)
}

export function cigaretteTipSmoke(time: number) {
  const t = cigarettePhase(time)

  if (t >= liftStart && t < lowerEnd) {
    return 0
  }

  return 1
}

export function cigaretteHeldSmoke(time: number) {
  const t = cigarettePhase(time)

  return t >= liftStart && t < lowerEnd ? 1 : 0
}

export function setCigaretteMouth(target: Vec3, head: Vec3, turn: TurnBasis) {
  target[0] = head[0] + turn.sin * mouthForwardOffset
  target[1] = head[1] + mouthHeightOffset
  target[2] = head[2] + turn.cos * mouthForwardOffset
}

export function raiseCigaretteArm(hand: Vec3, foreArm: Vec3, head: Vec3, turn: TurnBasis, time: number) {
  const lift = cigaretteLift(time)

  if (lift <= 0) {
    return
  }

  setCigaretteMouth(mouthPoint, head, turn)
  const deltaX = (mouthPoint[0] - hand[0]) * lift
  const deltaY = (mouthPoint[1] - hand[1]) * lift
  const deltaZ = (mouthPoint[2] - hand[2]) * lift

  hand[0] += deltaX
  hand[1] += deltaY
  hand[2] += deltaZ
  foreArm[0] += deltaX * 0.55
  foreArm[1] += deltaY * 0.55
  foreArm[2] += deltaZ * 0.55
}

export function setCigaretteGeometry(
  target: CigaretteGeometry,
  torso: Vec3,
  foreArm: Vec3,
  hand: Vec3,
  turn: TurnBasis,
) {
  const dx = hand[0] - foreArm[0]
  const dy = hand[1] - foreArm[1]
  const dz = hand[2] - foreArm[2]
  const sideX = turn.cos
  const sideZ = -turn.sin
  const handSide = handSideSign(hand, torso, sideX, sideZ)
  const forwardX = turn.sin
  const forwardZ = turn.cos
  const baseX = hand[0] + dx * gripReach + sideX * handSide * gripSideOffset + forwardX * gripForwardOffset
  const baseY = hand[1] + dy * gripReach + gripHeightOffset
  const baseZ = hand[2] + dz * gripReach + sideZ * handSide * gripSideOffset + forwardZ * gripForwardOffset
  let dirX = forwardX + sideX * handSide * cigaretteSide
  let dirY = cigaretteRise
  let dirZ = forwardZ + sideZ * handSide * cigaretteSide
  const dirLength = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ)

  dirX /= dirLength
  dirY /= dirLength
  dirZ /= dirLength

  target.side[0] = sideX * handSide
  target.side[1] = 0
  target.side[2] = sideZ * handSide
  target.forward[0] = dirX
  target.forward[1] = dirY
  target.forward[2] = dirZ
  target.base[0] = baseX
  target.base[1] = baseY
  target.base[2] = baseZ
  target.tip[0] = baseX + dirX * cigaretteLength
  target.tip[1] = baseY + dirY * cigaretteLength
  target.tip[2] = baseZ + dirZ * cigaretteLength
  target.emberTip[0] = target.tip[0] + dirX * emberLength
  target.emberTip[1] = target.tip[1] + dirY * emberLength
  target.emberTip[2] = target.tip[2] + dirZ * emberLength
}

function smoothstep(x: number) {
  return x * x * (3 - 2 * x)
}
