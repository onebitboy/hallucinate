import { characterFloor } from './character-data.ts'
import { electricNavy, outsideMotif } from './constants.ts'
import {
  add,
  clamp,
  cross,
  dot,
  normalize,
  scale,
  smoothstep,
  subtract,
} from './math.ts'
import { outsideBounds } from './scene-data.ts'
import type { CircleBounds, Vec3, Vertex } from './types.ts'

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
    const center = scale(add(add(a, b), c), 1 / 3)
    const normal = normalize(cross(subtract(c, a), subtract(b, a)))
    const sun = normalize(subtract([10.5, 6.8, outsideBounds.front], center))
    const diffuse = Math.abs(dot(normal, sun))
    const lift = clamp((normal[1] + 1) * 0.5, 0, 1)
    const night = outsideMotif === 'night'
    const treeLights: Vec3[] = [
      [tree.x - tree.radius * 2.5, characterFloor - 0.35, tree.z + tree.radius * 0.85],
      [tree.x + tree.radius * 2.5, characterFloor - 0.35, tree.z + tree.radius * 0.85],
      [tree.x, characterFloor - 0.35, tree.z - tree.radius * 2.5],
    ]
    let uplight = 0

    for (const light of treeLights) {
      const toLight = subtract(light, center)
      const distance = Math.hypot(toLight[0], toLight[1], toLight[2])
      const fromLight = normalize(subtract(center, light))
      const vertical = clamp(dot(fromLight, [0, 1, 0]), 0, 1)
      const facing = clamp(dot(normal, scale(fromLight, -1)), 0, 1)
      const cone = smoothstep(0.58, 0.96, vertical)

      uplight += facing * cone * clamp(1 - distance / 8, 0, 1)
    }

    const light = 0.34 + diffuse * 0.86 + lift * 0.18
    const warmth: Vec3 = [1.1, 1.03, 0.86]
    const baseLight = night ? light * 0.22 + lift * 0.04 : light
    const blueLight = night ? uplight * 2.1 : 0
    const shade: Vec3 = [
      clamp(color[0] * baseLight * warmth[0] + blueLight * electricNavy[0], 0, 1),
      clamp(color[1] * baseLight * warmth[1] + blueLight * electricNavy[1], 0, 1),
      clamp(color[2] * baseLight * warmth[2] + blueLight * electricNavy[2], 0, 1),
    ]

    target.push(
      [a[0], a[1], a[2], shade[0], shade[1], shade[2], 0, 0, 0, 0, 0],
      [b[0], b[1], b[2], shade[0], shade[1], shade[2], 0, 0, 0, 0, 0],
      [c[0], c[1], c[2], shade[0], shade[1], shade[2], 0, 0, 0, 0, 0],
    )
  }

  function addLocalReflection(color: Vec3, point: Vec3, normal: Vec3): Vec3 {
    const red = redReflection(point, normal)
    const white = options.strobeReflection(point, normal)

    return [
      clamp(color[0] + red * 1.45 + white * 2.85, 0, 1),
      clamp(color[1] + red * 0.06 + white * 2.7, 0, 1),
      clamp(color[2] + red * 0.03 + white * 2.25, 0, 1),
    ]
  }

  return { addLocalReflection, addSunLitTriangle }
}

function redReflection(point: Vec3, normal: Vec3) {
  if (Math.abs(normal[0]) > Math.abs(normal[2])) {
    const x = normal[0] > 0 ? 6.98 : -6.98
    const z = nearestWallLightZ(point[2])

    return redLightAmount(point, normal, x, point[1], z)
  }

  const z = normal[2] > 0 ? 3.98 : -23.98
  const x = nearestBackLightX(point[0])

  return redLightAmount(point, normal, x, point[1], z)
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

function redLightAmount(point: Vec3, normal: Vec3, x: number, y: number, z: number) {
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
