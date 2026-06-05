import { projectedQuadTransform, projectWallPointWithMinDepthInto } from './projection.ts'
import type { ProjectedPoint, WallProjector } from './projection.ts'
import type { Vec3 } from './types.ts'

export type DomWall = {
  x: number
  y: number
  z: number
  width: number
  height: number
  normal: Vec3
}

type Camera = {
  center: Vec3
  eye: Vec3
}

type StyleName = 'height' | 'opacity' | 'transform' | 'width'

const defaultMinDepth = 0.05
const defaultScale = 120

export function createDomWallProjection(element: HTMLElement, options: {
  minDepth?: number
  opacity?: string
  scale?: number
} = {}) {
  const setStyle = createStyleSetter(element.style)
  const minDepth = options.minDepth ?? defaultMinDepth
  const opacity = options.opacity ?? '1'
  const scale = options.scale ?? defaultScale
  const cornerA: Vec3 = [0, 0, 0]
  const cornerB: Vec3 = [0, 0, 0]
  const cornerC: Vec3 = [0, 0, 0]
  const cornerD: Vec3 = [0, 0, 0]
  const pointA: ProjectedPoint = { x: 0, y: 0 }
  const pointB: ProjectedPoint = { x: 0, y: 0 }
  const pointC: ProjectedPoint = { x: 0, y: 0 }
  const pointD: ProjectedPoint = { x: 0, y: 0 }
  const points = [pointA, pointB, pointC, pointD]

  return {
    hide() {
      setStyle('opacity', '0')
    },
    update(camera: Camera, projector: WallProjector, wall: DomWall) {
      if (!domWallFacesCamera(camera, wall)) {
        setStyle('opacity', '0')
        return false
      }

      domWallCorners(wall, cornerA, cornerB, cornerC, cornerD)
      projectWallPointWithMinDepthInto(cornerA, projector, pointA, minDepth)
      projectWallPointWithMinDepthInto(cornerB, projector, pointB, minDepth)
      projectWallPointWithMinDepthInto(cornerC, projector, pointC, minDepth)
      projectWallPointWithMinDepthInto(cornerD, projector, pointD, minDepth)

      const width = wall.width * scale
      const height = wall.height * scale

      setStyle('opacity', opacity)
      setStyle('width', `${width}px`)
      setStyle('height', `${height}px`)
      setStyle('transform', projectedQuadTransform(width, height, points))

      return true
    },
  }
}

export function domWallCorners(wall: DomWall, a: Vec3, b: Vec3, c: Vec3, d: Vec3) {
  const bottom = wall.y - wall.height / 2
  const top = wall.y + wall.height / 2

  if (Math.abs(wall.normal[0]) > 0) {
    const back = wall.z - wall.width / 2
    const front = wall.z + wall.width / 2

    if (wall.normal[0] < 0) {
      setPoint(a, wall.x, bottom, back)
      setPoint(b, wall.x, bottom, front)
      setPoint(c, wall.x, top, front)
      setPoint(d, wall.x, top, back)
      return
    }

    setPoint(a, wall.x, bottom, front)
    setPoint(b, wall.x, bottom, back)
    setPoint(c, wall.x, top, back)
    setPoint(d, wall.x, top, front)
    return
  }

  const left = wall.x - wall.width / 2
  const right = wall.x + wall.width / 2

  if (wall.normal[2] < 0) {
    setPoint(a, right, bottom, wall.z)
    setPoint(b, left, bottom, wall.z)
    setPoint(c, left, top, wall.z)
    setPoint(d, right, top, wall.z)
    return
  }

  setPoint(a, left, bottom, wall.z)
  setPoint(b, right, bottom, wall.z)
  setPoint(c, right, top, wall.z)
  setPoint(d, left, top, wall.z)
}

function setPoint(target: Vec3, x: number, y: number, z: number) {
  target[0] = x
  target[1] = y
  target[2] = z
}

function createStyleSetter(style: CSSStyleDeclaration) {
  const values = new Map<StyleName, string>()

  return (name: StyleName, value: string) => {
    if (values.get(name) !== value) {
      values.set(name, value)
      style[name] = value
    }
  }
}

function domWallFacesCamera(camera: Camera, wall: DomWall) {
  const toCameraX = camera.eye[0] - wall.x
  const toCameraY = camera.eye[1] - wall.y
  const toCameraZ = camera.eye[2] - wall.z
  const toVideoX = wall.x - camera.eye[0]
  const toVideoY = wall.y - camera.eye[1]
  const toVideoZ = wall.z - camera.eye[2]
  const forwardX = camera.center[0] - camera.eye[0]
  const forwardY = camera.center[1] - camera.eye[1]
  const forwardZ = camera.center[2] - camera.eye[2]

  return wall.normal[0] * toCameraX + wall.normal[1] * toCameraY + wall.normal[2] * toCameraZ > 0
    && forwardX * toVideoX + forwardY * toVideoY + forwardZ * toVideoZ > 0
}
