import type { Bounds, Vec3, VideoZone } from './types.ts'

export const djBooth: Bounds = { x: 0, z: -21.55, width: 3.6, depth: 1.24 }
export const djSpeakers: Bounds[] = [
  { x: -4.16, z: -21.63, width: 0.71, depth: 0.79 },
  { x: 4.16, z: -21.63, width: 0.71, depth: 0.79 },
]
export const bartenderBar: Bounds = { x: 2.25, z: 2.42, width: 5.2, depth: 0.7 }
export const bartenderStools: Bounds[] = [-2.05, -1.15, -0.25, 0.65, 1.55, 2.25].map(offset => ({
  x: bartenderBar.x + offset,
  z: bartenderBar.z - 1.15,
  width: 0.34,
  depth: 0.34,
}))
export const outsideDjBooth: Bounds = { x: 0, z: 29, width: 3.6, depth: 1.24 }
export const outsideDjSpeakers: Bounds[] = [
  { x: -4.16, z: 29.08, width: 0.71, depth: 0.79 },
  { x: 4.16, z: 29.08, width: 0.71, depth: 0.79 },
]
export const djVideoWall = { x: 0, y: .25, z: -23.96, width: 5.5, height: 3.0625, normal: [0, 0, 1] as Vec3 }
export const outsideVideoWall = { x: 0, y: .25, z: 31.41, width: 5.5, height: 3.0625, normal: [0, 0, -1] as Vec3 }
export const videoTracks: Record<VideoZone, string> = {
  inside: '0oB97YhEukw',
  outside: 'HIn1BxT38mE',
}
export const backDoor = { x: -4.75, z: 4, width: 1.45, height: 2.55 }
export const roomBounds = { left: -7, right: 7, back: -24, front: 4 }
export const outsideBounds = { left: -24, right: 24, back: -32, front: 34 }
export const landscapeBounds = { left: -72, right: 72, back: -84, front: 88 }
