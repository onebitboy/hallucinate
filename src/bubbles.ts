import type { VertexWriter } from './character-geometry.ts'
import { createRandomPool } from './random-pool.ts'
import { createUnitSphere, reserveSphereFloats, writeSphere } from './sphere-geometry.ts'
import type { Vec3 } from './types.ts'

export type Bubble = {
  position: Vec3
  velocity: Vec3
  radius: number
  life: number
  wobblePhase: number
  wobbleRate: number
  hue: number
}

const emitSpeed = 2.4
const spread = 1.5
const verticalSpeed = 0.22
const buoyancy = 0.16
const wobbleStrength = 0.95
const minRadius = 0.05
const maxRadius = 0.12
const minLife = 4
const maxLife = 6
const bubbleGlow = 1
const unitSphere = createUnitSphere(8, 14)
const color: Vec3 = [0, 0, 0]
const random = createRandomPool()

function createBubble(): Bubble {
  return {
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    radius: 0,
    life: 0,
    wobblePhase: 0,
    wobbleRate: 0,
    hue: 0,
  }
}

export function createBubbleSystem() {
  const bubbles: Bubble[] = []
  const pool: Bubble[] = []

  // Bubbles drift, wobble and pop on their own, so the active count stays bounded
  // by the fixed emit rate times the lifetime — no explicit cap needed.
  function spawn(origin: Vec3, forward: Vec3, count: number) {
    for (let i = 0; i < count; i++) {
      const bubble = pool.pop() ?? createBubble()

      bubble.position[0] = origin[0] + (random() - 0.5) * 0.18
      bubble.position[1] = origin[1] + (random() - 0.5) * 0.18
      bubble.position[2] = origin[2] + (random() - 0.5) * 0.18
      bubble.velocity[0] = forward[0] * emitSpeed + (random() - 0.5) * spread
      bubble.velocity[1] = forward[1] * verticalSpeed + (random() - 0.7) * 0.26
      bubble.velocity[2] = forward[2] * emitSpeed + (random() - 0.5) * spread
      bubble.radius = minRadius + random() * (maxRadius - minRadius)
      bubble.life = minLife + random() * (maxLife - minLife)
      bubble.wobblePhase = random() * Math.PI * 2
      bubble.wobbleRate = 2.4 + random() * 2.6
      bubble.hue = random()
      bubbles.push(bubble)
    }
  }

  function update(delta: number) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const bubble = bubbles[i]!

      bubble.life -= delta
      if (bubble.life <= 0) {
        const last = bubbles.pop()!

        if (i < bubbles.length) {
          bubbles[i] = last
        }
        pool.push(bubble)
        continue
      }

      bubble.wobblePhase += bubble.wobbleRate * delta
      bubble.velocity[1] += buoyancy * delta
      const damp = Math.exp(-0.7 * delta)

      bubble.velocity[0] = bubble.velocity[0] * damp + Math.cos(bubble.wobblePhase) * wobbleStrength * delta
      bubble.velocity[2] = bubble.velocity[2] * damp + Math.sin(bubble.wobblePhase) * wobbleStrength * delta
      bubble.position[0] += bubble.velocity[0] * delta
      bubble.position[1] += bubble.velocity[1] * delta
      bubble.position[2] += bubble.velocity[2] * delta
    }
  }

  return { bubbles, spawn, update }
}

export function writeBubbleGeometry(target: VertexWriter, bubbles: Bubble[]) {
  reserveSphereFloats(target, unitSphere, bubbles.length)

  for (const bubble of bubbles) {
    writeSphere(target, unitSphere, bubble.position[0], bubble.position[1], bubble.position[2], bubble.radius,
      bubbleColor(bubble.hue), bubbleGlow)
  }
}

function bubbleColor(hue: number) {
  const angle = hue * Math.PI * 2

  color[0] = 0.6 + 0.4 * Math.sin(angle)
  color[1] = 0.6 + 0.4 * Math.sin(angle + 2.094)
  color[2] = 0.6 + 0.4 * Math.sin(angle + 4.188)

  return color
}
