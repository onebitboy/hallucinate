import { characterFloor } from './character-data.ts'
import { electricNavy, outsideMotif } from './constants.ts'
import { clamp, smoothstep } from './math.ts'
import { outsideBounds } from './scene-data.ts'
import type { CharacterLight, CircleBounds, Vec3, Vertex } from './types.ts'

const nearestWallLightZ = createNearestValue([-2, -6, -10, -14, -18, -22])
const nearestBackLightX = createNearestValue([-4.5, 0, 4.5])

export function createSceneLighting(options: {
  getTree: () => CircleBounds
  strobeReflection: (point: Vec3, normal: Vec3) => number
}) {
  function addSunLitTriangle(
    target: Vertex[],
    a: Vec3,
    b: Vec3,
    c: Vec3,
    color: Vec3,
    tree = options.getTree(),
  ) {
    const centerX = (a[0] + b[0] + c[0]) / 3
    const centerY = (a[1] + b[1] + c[1]) / 3
    const centerZ = (a[2] + b[2] + c[2]) / 3
    const ux = c[0] - a[0]
    const uy = c[1] - a[1]
    const uz = c[2] - a[2]
    const vx = b[0] - a[0]
    const vy = b[1] - a[1]
    const vz = b[2] - a[2]
    const normalX = uy * vz - uz * vy
    const normalY = uz * vx - ux * vz
    const normalZ = ux * vy - uy * vx
    const normalLength = Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ)
    if (normalLength === 0) {
      throw new Error('Cannot normalize zero vector')
    }
    const nx = normalX / normalLength
    const ny = normalY / normalLength
    const nz = normalZ / normalLength
    const sunX = 10.5 - centerX
    const sunY = 6.8 - centerY
    const sunZ = outsideBounds.front - centerZ
    const sunLength = Math.sqrt(sunX * sunX + sunY * sunY + sunZ * sunZ)
    if (sunLength === 0) {
      throw new Error('Cannot normalize zero vector')
    }
    const diffuse = Math.abs((nx * sunX + ny * sunY + nz * sunZ) / sunLength)
    const lift = clamp((ny + 1) * 0.5, 0, 1)
    const night = outsideMotif === 'night'
    let uplight = 0

    for (let i = 0; i < 3; i++) {
      const lightX = i === 0 ? tree.x - tree.radius * 2.5 : i === 1 ? tree.x + tree.radius * 2.5 : tree.x
      const lightY = characterFloor - 0.35
      const lightZ = i < 2 ? tree.z + tree.radius * 0.85 : tree.z - tree.radius * 2.5
      const toLightX = lightX - centerX
      const toLightY = lightY - centerY
      const toLightZ = lightZ - centerZ
      const distance = Math.sqrt(toLightX * toLightX + toLightY * toLightY + toLightZ * toLightZ)
      if (distance === 0) {
        throw new Error('Cannot normalize zero vector')
      }
      const vertical = clamp(-toLightY / distance, 0, 1)
      const facing = clamp((nx * toLightX + ny * toLightY + nz * toLightZ) / distance, 0, 1)
      const cone = smoothstep(0.58, 0.96, vertical)

      uplight += facing * cone * clamp(1 - distance / 10.5, 0, 1)
    }

    const light = 0.34 + diffuse * 0.86 + lift * 0.18
    const warmth: Vec3 = [1.1, 1.03, 0.86]
    const baseLight = night ? light * 0.22 + lift * 0.04 : light
    const blueLight = night ? uplight * 3.4 : 0
    const shade: Vec3 = [
      clamp(color[0] * baseLight * warmth[0] + blueLight * electricNavy[0], 0, 1),
      clamp(color[1] * baseLight * warmth[1] + blueLight * electricNavy[1], 0, 1),
      clamp(color[2] * baseLight * warmth[2] + blueLight * electricNavy[2], 0, 1),
    ]
    const glow = color[1] > 0.6 && color[0] < 0.1 ? 0.15 : 0

    target.push(
      [a[0], a[1], a[2], shade[0], shade[1], shade[2], glow, 0, 0, 0, 0],
      [b[0], b[1], b[2], shade[0], shade[1], shade[2], glow, 0, 0, 0, 0],
      [c[0], c[1], c[2], shade[0], shade[1], shade[2], glow, 0, 0, 0, 0],
    )
  }

  const addLocalReflection: CharacterLight = (color, point, normal, target) => {
    const orange = orangeReflection(point, normal)
    const white = options.strobeReflection(point, normal)

    target[0] = clamp(color[0] + orange * 1.35 + white * 2.85, 0, 1)
    target[1] = clamp(color[1] + orange * 0.48 + white * 2.7, 0, 1)
    target[2] = clamp(color[2] + orange * 0.04 + white * 2.25, 0, 1)

    return target
  }

  return { addLocalReflection, addSunLitTriangle }
}

function orangeReflection(point: Vec3, normal: Vec3) {
  if (Math.abs(normal[0]) > Math.abs(normal[2])) {
    const x = normal[0] > 0 ? 6.98 : -6.98
    const z = nearestWallLightZ(point[2])

    return orangeLightAmount(point, normal, x, point[1], z)
  }

  const z = normal[2] > 0 ? 3.98 : -23.98
  const x = nearestBackLightX(point[0])

  return orangeLightAmount(point, normal, x, point[1], z)
}

function createNearestValue(values: number[]) {
  const thresholds: number[] = []
  const ascending = values[values.length - 1]! > values[0]!

  for (let i = 0; i < values.length - 1; i++) {
    thresholds.push((values[i]! + values[i + 1]!) * 0.5)
  }

  return (target: number) => {
    for (let i = 0; i < thresholds.length; i++) {
      if (ascending ? target <= thresholds[i]! : target >= thresholds[i]!) {
        return values[i]!
      }
    }

    return values[values.length - 1]!
  }
}

function orangeLightAmount(point: Vec3, normal: Vec3, x: number, y: number, z: number) {
  const dx = x - point[0]
  const dy = y - point[1]
  const dz = z - point[2]
  const distanceSq = dx * dx + dz * dz
  const distance = Math.sqrt(distanceSq)
  const length = Math.sqrt(distanceSq + dy * dy)
  const facing = Math.max(0, (normal[0] * dx + normal[1] * dy + normal[2] * dz) / length)
  const height = 0.8 + Math.max(0, point[1] + 1.95) * 0.18

  return Math.exp(-distance * 0.95) * facing * Math.sqrt(facing) * height * 1.65
}
