import type { Vec3 } from './types.ts'

export type DayCycle = {
  daylight: number
  moonDirection: Vec3
  moonProgress: number
  progress: number
  sunDirection: Vec3
}

export const electricNavy: Vec3 = [0.0, 0.028, 0.42]
export const debugDayNight = false
const dayCycleLoopSeconds = 30
const dayCycleLoopStartedAt = Date.now()
const sunriseHour = 7
const daylightHours = 12

export function dayCycleAt(date?: Date): DayCycle {
  const now = date ?? new Date()
  const hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600 + now.getMilliseconds() / 3600000
  const loop = debugDayNight && dayCycleLoopSeconds > 0 && date === undefined
  const progress = loop
    ? ((Date.now() - dayCycleLoopStartedAt) / (dayCycleLoopSeconds * 1000) % 1) * 2 - 0.5
    : (hours - sunriseHour) / daylightHours
  const angle = progress * Math.PI
  const height = Math.sin(angle)
  const eastWest = Math.cos(angle)
  const south = 0.9
  const length = Math.hypot(eastWest, height, south)
  const daylight = smoothstep(-0.18, 0.05, height)
  const moonProgress = progress < 0 ? progress + 1 : progress - 1
  const moonAngle = moonProgress * Math.PI
  const moonHeight = Math.sin(moonAngle)
  const moonEastWest = Math.cos(moonAngle)
  const moonLength = Math.hypot(moonEastWest, moonHeight, south)

  return {
    daylight,
    moonDirection: [moonEastWest / moonLength, moonHeight / moonLength, south / moonLength],
    moonProgress,
    progress,
    sunDirection: [eastWest / length, height / length, south / length],
  }
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1)

  return t * t * (3 - t * 2)
}
