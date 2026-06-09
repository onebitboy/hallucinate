import type { VertexWriter } from './character-geometry.ts'
import { createRandomPool } from './random-pool.ts'
import { createUnitSphere, reserveSphereFloats, writeSphere } from './sphere-geometry.ts'
import type { Vec3 } from './types.ts'

export type SmokePuff = {
  position: Vec3
  velocity: Vec3
  baseRadius: number
  radius: number
  life: number
  maxLife: number
}

const rise = 0.32
const riseDamp = 0.6
const drift = 0.1
const damp = 1.4
const growth = 1.6
const fadeFraction = 0.4
const wispRadius = 0.035
const puffRadius = 0.07
const minLife = 1.6
const maxLife = 2.8
const puffGlow = 0.18
const smokeColor: Vec3 = [0.72, 0.72, 0.76]
const unitSphere = createUnitSphere(6, 8)
const random = createRandomPool()

function createPuff(): SmokePuff {
  return {
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    baseRadius: 0,
    radius: 0,
    life: 0,
    maxLife: 0,
  }
}

export function createSmokeSystem() {
  const puffs: SmokePuff[] = []
  const pool: SmokePuff[] = []

  function emit(origin: Vec3, forward: Vec3, count: number, exhale: boolean, radiusScale = 1) {
    for (let i = 0; i < count; i++) {
      const puff = pool.pop() ?? createPuff()
      const push = exhale ? 0.9 : 0.2

      puff.position[0] = origin[0] + (random() - 0.5) * 0.06
      puff.position[1] = origin[1] + (random() - 0.5) * 0.06
      puff.position[2] = origin[2] + (random() - 0.5) * 0.06
      puff.velocity[0] = forward[0] * push + (random() - 0.5) * drift
      puff.velocity[1] = rise * (0.7 + random() * 0.6)
      puff.velocity[2] = forward[2] * push + (random() - 0.5) * drift
      puff.baseRadius = (exhale ? puffRadius : wispRadius) * radiusScale
      puff.radius = puff.baseRadius
      puff.maxLife = minLife + random() * (maxLife - minLife)
      puff.life = puff.maxLife
      puffs.push(puff)
    }
  }

  function update(delta: number) {
    const horizontalDamp = Math.exp(-damp * delta)
    const verticalDamp = Math.exp(-riseDamp * delta)

    for (let i = puffs.length - 1; i >= 0; i--) {
      const puff = puffs[i]!

      puff.life -= delta
      if (puff.life <= 0) {
        const last = puffs.pop()!

        if (i < puffs.length) {
          puffs[i] = last
        }
        pool.push(puff)
        continue
      }

      puff.velocity[0] *= horizontalDamp
      puff.velocity[1] *= verticalDamp
      puff.velocity[2] *= horizontalDamp
      puff.position[0] += puff.velocity[0] * delta
      puff.position[1] += puff.velocity[1] * delta
      puff.position[2] += puff.velocity[2] * delta

      const age = 1 - puff.life / puff.maxLife
      const fade = Math.min(1, puff.life / (puff.maxLife * fadeFraction))

      puff.radius = puff.baseRadius * (1 + growth * age) * fade
    }
  }

  return { puffs, emit, update }
}

export function writeSmokeGeometry(target: VertexWriter, puffs: SmokePuff[]) {
  reserveSphereFloats(target, unitSphere, puffs.length)

  for (const puff of puffs) {
    writeSphere(target, unitSphere, puff.position[0], puff.position[1], puff.position[2], puff.radius, smokeColor,
      puffGlow)
  }
}
