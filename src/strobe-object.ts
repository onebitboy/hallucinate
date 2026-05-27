import { characterFloor } from './character-data.ts'
import { electricNavy } from './constants.ts'
import { clamp, mix, smoothstep } from './math.ts'
import { outsideDjBooth, roomBounds } from './scene-data.ts'
import type { StrobeLight, Vec3 } from './types.ts'

export function strobeLightAmount(point: Vec3, normal: Vec3, light: StrobeLight, target: Vec3) {
  const top = 4.75
  const floor = -1.96
  const t = clamp((top - point[1]) / (top - floor), 0, 1)
  const radiusX = mix(0.07, 0.5, t)
  const radiusZ = mix(0.07, 0.68, t)
  const centerX = mix(light.x, target[0], t)
  const centerZ = mix(light.z, target[2], t)
  const dx = (point[0] - centerX) / radiusX
  const dz = (point[2] - centerZ) / radiusZ
  const cone = dx * dx + dz * dz

  if (cone > 1) {
    return 0
  }

  const lx = light.x - point[0]
  const ly = top - point[1]
  const lz = light.z - point[2]
  const length = Math.sqrt(lx * lx + ly * ly + lz * lz)
  const facing = Math.max(0, (normal[0] * lx + normal[1] * ly + normal[2] * lz) / length)
  const inside = Math.pow(1 - cone, 0.45)

  return inside * Math.sqrt(facing) * 7.2
}

export function strobeRandom(id: number, frame: number) {
  const value = Math.sin(id * 17.13 + frame * 9.27) * 43758.5453

  return value - Math.floor(value)
}

export function createStrobeLights() {
  const lights: StrobeLight[] = []
  let id = 1

  for (const x of [-3.8, 0, 3.8]) {
    for (const z of [-5.5, -10.5, -15.5, -20.5]) {
      lights.push({
        id,
        x,
        z,
        zone: 'inside',
        top: 4.75,
        floor: -1.96,
        color: [0.9, 0.88, 0.8],
        minX: -5.8,
        maxX: 5.8,
        minZ: -22.7,
        maxZ: 3.1,
      })
      id++
    }
  }

  const stageTop = characterFloor + 4.1
  const stageZ = outsideDjBooth.z + 2.15
  const stageHalfWidth = 3.7

  for (const x of [outsideDjBooth.x - stageHalfWidth, outsideDjBooth.x + stageHalfWidth]) {
    const side = Math.sign(x - outsideDjBooth.x)

    lights.push({
      id,
      x,
      z: stageZ,
      zone: 'outside',
      top: stageTop,
      floor: characterFloor + 0.02,
      color: electricNavy,
      minX: outsideDjBooth.x - 10.5,
      maxX: outsideDjBooth.x + 10.5,
      minZ: roomBounds.front + 1.2,
      maxZ: outsideDjBooth.z - 1.0,
    })
    id++
  }

  return lights
}

export function strobeTarget(light: StrobeLight, time: number): Vec3 {
  if (light.zone === 'outside') {
    return outsideStrobeTarget(light, time)
  }

  const cycle = time % 16
  const sweepTime = cycle < 5.5 ? time : time - 3
  const speed = 1.15
  const phase = sweepTime * speed + (light.id * 1.27)
  const sweepX = light.x + Math.sin(phase) * 2.5 + Math.sin(phase * 1.7) * 0.8
  const sweepZ = light.z + Math.cos(sweepTime * 1.3 + light.id * 1.43) * 3.2 + Math.sin(phase * 2.1) * 0.9
  const vertical = smoothstep(5.5, 7.0, cycle) * (1 - smoothstep(12.5, 14.0, cycle))
  const x = mix(sweepX, light.x, vertical)
  const z = mix(sweepZ, light.z, vertical)

  return [clamp(x, light.minX, light.maxX), light.floor, clamp(z, light.minZ, light.maxZ)]
}

function outsideStrobeTarget(light: StrobeLight, time: number): Vec3 {
  const side = Math.sign(light.x - outsideDjBooth.x)
  const phase = time * 0.56 + light.id * 2.17
  const drift = time * 0.37 + light.id * 1.31
  const x = Math.sin(phase) * 5.8 + Math.sin(drift * 1.73) * 2.6 - side * 0.9
  const z = light.z - 6.8 - Math.cos(drift) * 3.4 - Math.sin(phase * 0.61) * 2.1

  return [clamp(x, light.minX, light.maxX), light.floor, clamp(z, light.minZ, light.maxZ)]
}
