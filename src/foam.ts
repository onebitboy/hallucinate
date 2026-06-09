import type { VertexWriter } from './character-geometry.ts'
import { createRandomPool } from './random-pool.ts'
import { createUnitSphere, reserveSphereFloats, writeSphere } from './sphere-geometry.ts'
import type { Vec3 } from './types.ts'

export type FoamBlob = {
  position: Vec3
  velocity: Vec3
  baseRadius: number
  radius: number
  life: number
}

const gravity = 9.5
const forwardSpeed = 4.6
const upSpeed = 2.2
const spread = 2.4
const settleDamp = 7
const minRadius = 0.06
const maxRadius = 0.15
const minLife = 4
const maxLife = 7
const fadeTime = 1.6
const foamGlow = 0.8
const foamColor: Vec3 = [0.95, 0.97, 1]
const unitSphere = createUnitSphere(6, 10)
const random = createRandomPool()

export type FloorAt = (x: number, y: number, z: number) => number

function createFoam(): FoamBlob {
  return {
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    baseRadius: 0,
    radius: 0,
    life: 0,
  }
}

export function createFoamSystem() {
  const blobs: FoamBlob[] = []
  const pool: FoamBlob[] = []

  function burst(origin: Vec3, forward: Vec3, count: number) {
    for (let i = 0; i < count; i++) {
      const blob = pool.pop() ?? createFoam()

      blob.position[0] = origin[0] + (random() - 0.5) * 0.2
      blob.position[1] = origin[1] + (random() - 0.5) * 0.2
      blob.position[2] = origin[2] + (random() - 0.5) * 0.2
      blob.velocity[0] = forward[0] * forwardSpeed + (random() - 0.5) * spread
      blob.velocity[1] = upSpeed + random() * upSpeed
      blob.velocity[2] = forward[2] * forwardSpeed + (random() - 0.5) * spread
      blob.baseRadius = minRadius + random() * (maxRadius - minRadius)
      blob.radius = blob.baseRadius
      blob.life = minLife + random() * (maxLife - minLife)
      blobs.push(blob)
    }
  }

  function update(delta: number, floorAt: FloorAt) {
    const damp = Math.exp(-settleDamp * delta)

    for (let i = blobs.length - 1; i >= 0; i--) {
      const blob = blobs[i]!

      blob.life -= delta
      if (blob.life <= 0) {
        const last = blobs.pop()!

        if (i < blobs.length) {
          blobs[i] = last
        }
        pool.push(blob)
        continue
      }

      blob.velocity[1] -= gravity * delta
      blob.position[0] += blob.velocity[0] * delta
      blob.position[1] += blob.velocity[1] * delta
      blob.position[2] += blob.velocity[2] * delta

      const floor = floorAt(blob.position[0], blob.position[1], blob.position[2]) + blob.baseRadius

      if (blob.position[1] < floor) {
        blob.position[1] = floor
        blob.velocity[1] = 0
        blob.velocity[0] *= damp
        blob.velocity[2] *= damp
      }

      blob.radius = blob.baseRadius * Math.min(1, blob.life / fadeTime)
    }
  }

  return { blobs, burst, update }
}

export function writeFoamGeometry(target: VertexWriter, blobs: FoamBlob[]) {
  reserveSphereFloats(target, unitSphere, blobs.length)

  for (const blob of blobs) {
    writeSphere(target, unitSphere, blob.position[0], blob.position[1], blob.position[2], blob.radius, foamColor,
      foamGlow)
  }
}
