import { projectedQuadTransform, projectWallPointWithMinDepthInto } from './projection.ts'
import type { ProjectedPoint, WallProjector } from './projection.ts'
import { createStyleSetter } from './style-setter.ts'
import type { Vec3 } from './types.ts'

export type DomWall = {
  tangent?: Vec3
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

type StyleName = 'height' | 'opacity' | 'pointerEvents' | 'transform' | 'width'
type HiddenStyle = {
  height?: string
  opacity?: string
  transform?: string
  width?: string
}

const defaultMinDepth = 0.05
const defaultScale = 120

export function createDomWallProjection(element: HTMLElement, options: {
  hidden?: HiddenStyle
  hiddenOpacity?: string
  minDepth?: number
  opacity?: string
  pointerEvents?: string
  scale?: number
} = {}) {
  const setStyle = createStyleSetter<StyleName>(element.style)
  const hidden = options.hidden
  const hiddenOpacity = hidden?.opacity ?? options.hiddenOpacity ?? '0'
  const minDepth = options.minDepth ?? defaultMinDepth
  const opacity = options.opacity ?? '1'
  const pointerEvents = options.pointerEvents
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
  let lastHeight = -1
  let lastWidth = -1
  let heightPx = ''
  let widthPx = ''

  return {
    hide() {
      applyHiddenStyle()
      if (pointerEvents) {
        setStyle('pointerEvents', 'none')
      }
    },
    update(camera: Camera, projector: WallProjector, wall: DomWall) {
      if (!domWallFacesCamera(camera, wall)) {
        applyHiddenStyle()
        if (pointerEvents) {
          setStyle('pointerEvents', 'none')
        }
        return false
      }

      domWallCorners(wall, cornerA, cornerB, cornerC, cornerD)
      projectWallPointWithMinDepthInto(cornerA, projector, pointA, minDepth)
      projectWallPointWithMinDepthInto(cornerB, projector, pointB, minDepth)
      projectWallPointWithMinDepthInto(cornerC, projector, pointC, minDepth)
      projectWallPointWithMinDepthInto(cornerD, projector, pointD, minDepth)

      const width = wall.width * scale
      const height = wall.height * scale

      if (width !== lastWidth) {
        lastWidth = width
        widthPx = `${width}px`
      }
      if (height !== lastHeight) {
        lastHeight = height
        heightPx = `${height}px`
      }

      setStyle('opacity', opacity)
      if (pointerEvents) {
        setStyle('pointerEvents', pointerEvents)
      }
      setStyle('width', widthPx)
      setStyle('height', heightPx)
      setStyle('transform', projectedQuadTransform(width, height, points))

      return true
    },
  }

  function applyHiddenStyle() {
    setStyle('opacity', hiddenOpacity)
    if (hidden?.width) {
      setStyle('width', hidden.width)
    }
    if (hidden?.height) {
      setStyle('height', hidden.height)
    }
    if (hidden?.transform) {
      setStyle('transform', hidden.transform)
    }
  }
}

export function domWallCorners(wall: DomWall, a: Vec3, b: Vec3, c: Vec3, d: Vec3) {
  const bottom = wall.y - wall.height / 2
  const top = wall.y + wall.height / 2

  if (wall.tangent) {
    const left: Vec3 = [
      wall.x - wall.tangent[0] * wall.width / 2,
      0,
      wall.z - wall.tangent[2] * wall.width / 2,
    ]
    const right: Vec3 = [
      wall.x + wall.tangent[0] * wall.width / 2,
      0,
      wall.z + wall.tangent[2] * wall.width / 2,
    ]

    setPoint(a, left[0], bottom, left[2])
    setPoint(b, right[0], bottom, right[2])
    setPoint(c, right[0], top, right[2])
    setPoint(d, left[0], top, left[2])
    return
  }

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
