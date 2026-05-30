import type { Bounds, CircleBounds, Vec3, VideoZone } from './types.ts'

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
export const outsideStage: Bounds = { x: outsideDjBooth.x, z: outsideDjBooth.z + 2.15, width: 8.6, depth: 1.55 }
export const outsideDjSpeakers: Bounds[] = [
  { x: -4.16, z: 29.08, width: 0.71, depth: 0.79 },
  { x: 4.16, z: 29.08, width: 0.71, depth: 0.79 },
]
export const outsideBuddha: CircleBounds = { x: 11.5, z: 27.9, radius: 1.05 }
export const outsidePalmTree: CircleBounds = { x: -11, z: 29.15, radius: 0.45 }
export const outsideHut: Bounds = { x: -18, z: 20.5, width: 6.2, depth: 5 }
export const outsideHutDeckHeight = 0.32
export const outsideHutBar: Bounds = {
  x: outsideHut.x - outsideHut.width / 2 + 1.75,
  z: outsideHut.z,
  width: 0.72,
  depth: outsideHut.depth - 1.25,
}
export const outsideHutBarStools: Bounds[] = [-1.35, 0, 1.35].map(offset => ({
  x: outsideHutBar.x + 0.95,
  z: outsideHutBar.z + offset,
  width: 0.36,
  depth: 0.36,
}))
export const outsideCouches: (Bounds & { color: Vec3; face: 'east' | 'north' | 'south' | 'west' })[] = [
  { x: 11.5, z: 9.2, width: 2.4, depth: 0.82, color: [0.5, 0.05, 0.16], face: 'north' },
  { x: 13.35, z: 11.1, width: 0.82, depth: 2.35, color: [0.05, 0.28, 0.5], face: 'west' },
  { x: 13.35, z: 13.65, width: 0.82, depth: 2.05, color: [0.42, 0.28, 0.04], face: 'west' },
  { x: -11.8, z: 8.7, width: 2.55, depth: 0.82, color: [0.1, 0.36, 0.18], face: 'north' },
  { x: -13.75, z: 10.55, width: 0.82, depth: 2.15, color: [0.42, 0.09, 0.46], face: 'east' },
  { x: -12.55, z: 31.05, width: 2.35, depth: 0.82, color: [0.06, 0.36, 0.42], face: 'south' },
  { x: -13.95, z: 29.7, width: 0.82, depth: 2.35, color: [0.46, 0.11, 0.38], face: 'east' },
  { x: 16.1, z: 16.3, width: 2.15, depth: 0.82, color: [0.06, 0.38, 0.42], face: 'north' },
  { x: 17.7, z: 18.05, width: 0.82, depth: 2, color: [0.5, 0.18, 0.05], face: 'west' },
]
export const djVideoWall = { x: 0, y: .25, z: -23.96, width: 5.5, height: 3.0625, normal: [0, 0, 1] as Vec3 }
export const outsideVideoWall = { x: 0, y: .25, z: 31.41, width: 5.5, height: 3.0625, normal: [0, 0, -1] as Vec3 }
export const tent = {
  x: 25,
  z: 25,
  radius: 4.4,
  wallHeight: 2.6,
  height: 6.8,
  doorWidth: 1.65,
  doorHeight: 2.55,
}
export const tentDoorAngle = -Math.PI / 2
export const tentVideoAngle = Math.PI / 2
export const tentDoor = {
  x: tent.x + Math.sin(tentDoorAngle) * tent.radius,
  z: tent.z + Math.cos(tentDoorAngle) * tent.radius,
  width: tent.doorWidth,
  height: tent.doorHeight,
}
export const tentVideoWall = {
  x: tent.x + Math.sin(tentVideoAngle) * (tent.radius - 0.22),
  y: 0,
  z: tent.z + Math.cos(tentVideoAngle) * (tent.radius - 0.22),
  width: 3.6,
  height: 2.025,
  normal: [-1, 0, 0] as Vec3,
}
export const tentDjBooth: Bounds = { x: tent.x + tent.radius - 1.3, z: tent.z, width: 1.08, depth: 3.1 }
export const tentDjSpeakers: Bounds[] = [
  { x: tentDjBooth.x + 0.08, z: tent.z - 2.35, width: 0.68, depth: 0.58 },
  { x: tentDjBooth.x + 0.08, z: tent.z + 2.35, width: 0.68, depth: 0.58 },
]
export const tentPole: CircleBounds = { x: tent.x, z: tent.z, radius: 0.13 }
export const tentCenterBench = { x: tent.x, z: tent.z, innerRadius: 0.34, outerRadius: 0.9 }
export const videoTracks: Record<VideoZone, string> = {
  inside: '0oB97YhEukw',
  outside: 'JviNPyhY6U4', // 'DK5XBwLiWZY', // 'xda6KAXJESo', // 'IIbcGjZy6OM', // '5lthiQoQiRA', 'CsGauHXioos', // 'HIn1BxT38mE', // 'ZEaqqk8V1bY', //
  tent: 'fz6nN5AtcYk',
}
export const videoStartTimes: Record<VideoZone, number> = {
  inside: 0,
  outside: 100,
  tent: 0,
}
export const videoPlaylists: Partial<Record<VideoZone, string>> = {
  // inside: 'PLdfk8NH4EncB_75qaHdSR96vP8L7Lowpv',
}
export const backDoor = { x: -4.75, z: 4, width: 1.45, height: 2.55 }
export const roomBounds = { left: -7, right: 7, back: -24, front: 4 }
export const outsideBounds = { left: -24, right: 40, back: -32, front: 38 }
export const landscapeBounds = { left: -72, right: 72, back: -84, front: 88 }
