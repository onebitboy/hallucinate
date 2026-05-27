import type { Vec3 } from './types.ts'

export type CameraMatrix = {
  forward: Vec3
  right: Vec3
  up: Vec3
  viewProjection: Float32Array
}

export function updateCameraMatrix(target: CameraMatrix, eye: Vec3, center: Vec3, width: number, height: number) {
  const zx = eye[0] - center[0]
  const zy = eye[1] - center[1]
  const zz = eye[2] - center[2]
  const zLength = Math.hypot(zx, zy, zz)
  const z0 = zx / zLength
  const z1 = zy / zLength
  const z2 = zz / zLength
  const xx = z2
  const xz = -z0
  const xLength = Math.hypot(xx, xz)
  const x0 = xx / xLength
  const x2 = xz / xLength
  const y0 = z1 * x2
  const y1 = z2 * x0 - z0 * x2
  const y2 = -z1 * x0
  const f = 1 / Math.tan(1.08 * 0.5)
  const a = f / (width / height)
  const b = f
  const c = (180 + 0.1) / (0.1 - 180)
  const d = (2 * 180 * 0.1) / (0.1 - 180)
  const tx = -(x0 * eye[0] + x2 * eye[2])
  const ty = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2])
  const tz = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2])
  const data = target.viewProjection

  data[0] = a * x0
  data[1] = b * y0
  data[2] = c * z0
  data[3] = -z0
  data[4] = 0
  data[5] = b * y1
  data[6] = c * z1
  data[7] = -z1
  data[8] = a * x2
  data[9] = b * y2
  data[10] = c * z2
  data[11] = -z2
  data[12] = a * tx
  data[13] = b * ty
  data[14] = c * tz + d
  data[15] = -tz

  target.forward[0] = -z0
  target.forward[1] = -z1
  target.forward[2] = -z2
  target.right[0] = x0
  target.right[1] = 0
  target.right[2] = x2
  target.up[0] = y0
  target.up[1] = y1
  target.up[2] = y2
}

export function createCameraMatrix(): CameraMatrix {
  return {
    forward: [0, 0, -1],
    right: [1, 0, 0],
    up: [0, 1, 0],
    viewProjection: new Float32Array(16),
  }
}
