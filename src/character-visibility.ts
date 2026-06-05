import type { Player, Vec3 } from './types.ts'

const fovScale = Math.tan(1.08 / 2)

export type CharacterVisibility = {
  depth: number
  distanceSq: number
  visible: boolean
}

export function characterView(eye: Vec3, target: Vec3) {
  const forwardX = target[0] - eye[0]
  const forwardY = target[1] - eye[1]
  const forwardZ = target[2] - eye[2]
  const forwardLength = Math.hypot(forwardX, forwardY, forwardZ)
  const fx = forwardX / forwardLength
  const fy = forwardY / forwardLength
  const fz = forwardZ / forwardLength
  const rightLength = Math.hypot(-fz, fx)
  const rx = -fz / rightLength
  const rz = fx / rightLength

  return {
    eye,
    fx,
    fy,
    fz,
    rx,
    rz,
    ux: -rz * fy,
    uy: rz * fx - rx * fz,
    uz: rx * fy,
  }
}

export function characterInView(
  player: Player,
  view: ReturnType<typeof characterView>,
  width: number,
  height: number,
) {
  return characterVisibility(player, view, width, height).visible
}

export function characterVisibility(
  player: Player,
  view: ReturnType<typeof characterView>,
  width: number,
  height: number,
): CharacterVisibility {
  return characterVisibilityInto(player, view, width, height, { depth: 0, distanceSq: 0, visible: false })
}

export function characterVisibilityInto(
  player: Player,
  view: ReturnType<typeof characterView>,
  width: number,
  height: number,
  target: CharacterVisibility,
): CharacterVisibility {
  const toPlayerX = player.position[0] - view.eye[0]
  const toPlayerY = player.position[1] + 0.85 - view.eye[1]
  const toPlayerZ = player.position[2] - view.eye[2]
  const depth = toPlayerX * view.fx + toPlayerY * view.fy + toPlayerZ * view.fz
  const distanceSq = toPlayerX * toPlayerX + toPlayerZ * toPlayerZ
  const radius = 1.2

  if (depth < -radius || depth > 45) {
    target.depth = depth
    target.distanceSq = distanceSq
    target.visible = false

    return target
  }

  const vertical = fovScale * Math.max(depth, 0.1) + radius
  const horizontal = vertical * (width / height) + radius

  target.depth = depth
  target.distanceSq = distanceSq
  target.visible = Math.abs(toPlayerX * view.rx + toPlayerZ * view.rz) < horizontal
    && Math.abs(toPlayerX * view.ux + toPlayerY * view.uy + toPlayerZ * view.uz) < vertical

  return target
}
