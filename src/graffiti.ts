import { characterFloor } from './character-data.ts'
import { pack } from './geometry.ts'
import type { WallProjector } from './projection.ts'
import { outsideToiletDoor, outsideToilets, roomBounds, tent, tentDoor, tentDoorAngle } from './scene-data.ts'
import type { GraffitiSplat, Vec3, Vertex } from './types.ts'

export const maxGraffitiSplats = 60000
export const graffitiTextureSize = 1024
export const graffitiColors: Vec3[] = [
  [0.015, 0.012, 0.01],
  [1, 1, 1],
  [0.42, 0.42, 0.42],
  [0.42, 0.2, 0.08],
  [1, 0.02, 0.02],
  [1, 0.32, 0.02],
  [1, 0.9, 0.02],
  [0.02, 1, 0.12],
  [0.02, 0.55, 1],
  [0.1, 0.08, 1],
  [0.66, 0.08, 1],
  [1, 0.03, 0.72],
]

type GraffitiSides = 'front' | 'both'
type PlaneGraffitiWall = {
  kind: 'plane'
  axis: 'x' | 'z'
  value: number
  min: number
  max: number
  yMin: number
  yMax: number
  normal: Vec3
  sides: GraffitiSides
}
type CylinderGraffitiWall = {
  kind: 'cylinder'
  x: number
  z: number
  radius: number
  min: number
  max: number
  yMin: number
  yMax: number
  segments: number
  cutouts: { x: number; radius: number }[]
  sides: GraffitiSides
}
type ConeGraffitiWall = {
  kind: 'cone'
  x: number
  z: number
  radius: number
  min: number
  max: number
  yMin: number
  yMax: number
  xSegments: number
  ySegments: number
  cutouts: { x: number; radius: number }[]
  sides: GraffitiSides
}
type GraffitiWall = PlaneGraffitiWall | CylinderGraffitiWall | ConeGraffitiWall
type ScreenRay = ReturnType<typeof screenRay>

const wallYMin = characterFloor + 0.03
const wallYMax = 5
const wallMargin = 0.03
const wallEpsilon = 0.09
const splatBaseScale = 0.24
const splatRadiusScale = 2.3
const screenSplatNear = 1
const screenSplatRange = 25
const screenSplatPower = 2.2
const graffitiAtlasColumns = 4
const toiletLeft = outsideToilets.x - outsideToilets.width / 2
const toiletRight = outsideToilets.x + outsideToilets.width / 2
const toiletBack = outsideToilets.z - outsideToilets.depth / 2
const toiletFront = outsideToilets.z + outsideToilets.depth / 2
const toiletDoorBack = outsideToiletDoor.z - outsideToiletDoor.width / 2
const toiletDoorFront = outsideToiletDoor.z + outsideToiletDoor.width / 2
const toiletDoorSide = outsideToiletDoor.side === 'east' ? 1 : -1
const toiletDoorX = toiletDoorSide > 0 ? toiletRight : toiletLeft
const toiletOppositeX = toiletDoorSide > 0 ? toiletLeft : toiletRight
const toiletTop = characterFloor + 2.55
const toiletDoorTop = characterFloor + outsideToiletDoor.height + 0.05
const tentWallMax = Math.PI * tent.radius
const tentDoorCutout = Math.asin((tentDoor.width / 2 + 0.18) / tent.radius) * tent.radius

const walls: GraffitiWall[] = [
  planeWall('z', roomBounds.front, roomBounds.left, roomBounds.right, wallYMin, wallYMax, [0, 0, 1], 'front'),
  planeWall('z', roomBounds.back, roomBounds.left, roomBounds.right, wallYMin, wallYMax, [0, 0, -1], 'front'),
  planeWall('x', roomBounds.left, roomBounds.back, roomBounds.front, wallYMin, wallYMax, [-1, 0, 0], 'front'),
  planeWall('x', roomBounds.right, roomBounds.back, roomBounds.front, wallYMin, wallYMax, [1, 0, 0], 'front'),
  planeWall('z', toiletFront, toiletLeft, toiletRight, wallYMin, toiletTop, [0, 0, 1], 'both'),
  planeWall('z', toiletBack, toiletLeft, toiletRight, wallYMin, toiletTop, [0, 0, -1], 'both'),
  planeWall('x', toiletOppositeX, toiletBack, toiletFront, wallYMin, toiletTop, [-toiletDoorSide, 0, 0], 'both'),
  planeWall('x', toiletDoorX, toiletBack, toiletDoorBack, wallYMin, toiletTop, [toiletDoorSide, 0, 0], 'both'),
  planeWall('x', toiletDoorX, toiletDoorFront, toiletFront, wallYMin, toiletTop, [toiletDoorSide, 0, 0], 'both'),
  planeWall('x', toiletDoorX, toiletDoorBack, toiletDoorFront, toiletDoorTop, toiletTop, [toiletDoorSide, 0, 0],
    'both'),
  {
    kind: 'cylinder',
    x: tent.x,
    z: tent.z,
    radius: tent.radius,
    min: -tentWallMax,
    max: tentWallMax,
    yMin: wallYMin,
    yMax: characterFloor + tent.wallHeight,
    segments: 72,
    cutouts: [{ x: tentDoorAngle * tent.radius, radius: tentDoorCutout }],
    sides: 'both',
  },
  {
    kind: 'cone',
    x: tent.x,
    z: tent.z,
    radius: tent.radius,
    min: -tentWallMax,
    max: tentWallMax,
    yMin: characterFloor + tent.wallHeight,
    yMax: characterFloor + tent.height,
    xSegments: 72,
    ySegments: 12,
    cutouts: [],
    sides: 'both',
  },
]
export const graffitiWallCount = walls.length

const graffitiWallAtlasRows = Math.ceil(graffitiWallCount / graffitiAtlasColumns)
const paintingAtlasRows = 1
const graffitiAtlasRows = graffitiWallAtlasRows + paintingAtlasRows
const graffitiCellWidth = graffitiTextureSize / graffitiAtlasColumns
const graffitiCellHeight = graffitiTextureSize / graffitiAtlasRows
const paintingAtlasIndex = graffitiAtlasColumns * graffitiWallAtlasRows
const paintingAtlasPadding = 12

export function sprayWallPoint(clientX: number, clientY: number, projector: WallProjector) {
  const ray = screenRay(clientX, clientY, projector)
  let best: { wall: number; x: number; y: number; distance: number } | undefined

  for (let wall = 0; wall < walls.length; wall++) {
    const hit = wallHit(wall, ray)

    if (hit && (!best || hit.distance < best.distance)) {
      best = { wall, x: hit.x, y: hit.y, distance: hit.distance }
    }
  }

  return best
}

export function addGraffitiGeometry(target: Vertex[], splats: GraffitiSplat[]) {
  for (const splat of splats) {
    addGraffitiSplat(target, splat)
  }
}

export function addGraffitiWallGeometry(target: Vertex[]) {
  for (let wall = 0; wall < walls.length; wall++) {
    const data = wallAt(wall)

    addGraffitiWallSurface(target, wall, data, 1)

    if (data.sides === 'both') {
      addGraffitiWallSurface(target, wall, data, -1)
    }
  }
}

export function graffitiWallBounds(wallIndex: number) {
  const wall = wallAt(wallIndex)

  return {
    min: wall.min,
    max: wall.max,
    yMin: wall.yMin,
    yMax: wall.yMax,
  }
}

export function createGraffitiCanvas() {
  const canvas = document.createElement('canvas')

  canvas.width = graffitiTextureSize
  canvas.height = graffitiTextureSize

  return canvas
}

export function paintingTextureBounds(index: number) {
  const [u0, v0, u1, v1] = wallTextureBounds(paintingAtlasIndex)
  const gap = paintingAtlasPadding / graffitiTextureSize
  const tile = (graffitiCellWidth - paintingAtlasPadding * 4) / 3 / graffitiTextureSize
  const left = u0 + gap + index * (tile + gap)

  return [
    left,
    v0 + paintingAtlasPadding / graffitiTextureSize,
    left + tile,
    v1 - paintingAtlasPadding / graffitiTextureSize,
  ] as const
}

export function paintLoftPaintingTextures(context: CanvasRenderingContext2D) {
  const column = paintingAtlasIndex % graffitiAtlasColumns
  const row = Math.floor(paintingAtlasIndex / graffitiAtlasColumns)
  const x = column * graffitiCellWidth
  const y = row * graffitiCellHeight
  const width = graffitiCellWidth
  const height = graffitiCellHeight
  const gap = paintingAtlasPadding
  const tileWidth = (width - gap * 4) / 3
  const tileHeight = height - gap * 2
  const tileY = y + gap
  const palettes: Vec3[][] = [
    [[0.2, 0.15, 0.18], [0.52, 0.34, 0.28], [0.72, 0.55, 0.38], [0.86, 0.77, 0.62], [0.46, 0.55, 0.58]],
    [[0.13, 0.18, 0.24], [0.3, 0.5, 0.58], [0.55, 0.68, 0.66], [0.86, 0.78, 0.62], [0.58, 0.4, 0.46]],
    [[0.18, 0.17, 0.15], [0.48, 0.48, 0.34], [0.74, 0.64, 0.42], [0.82, 0.74, 0.58], [0.42, 0.5, 0.62]],
  ]

  context.save()
  context.clearRect(x, y, width, height)
  for (let i = 0; i < palettes.length; i++) {
    paintAbstractTile(context, x + gap + i * (tileWidth + gap), tileY, tileWidth, tileHeight, palettes[i]!, i)
  }
  context.restore()
}

export function graffitiRadiusForScreenDistance(distance: number) {
  const t = Math.max(0, Math.min(1, (distance - screenSplatNear) / screenSplatRange))
  const scale = splatBaseScale + Math.pow(t, screenSplatPower) * splatRadiusScale

  return Math.max(0, Math.min(255, Math.round((scale - splatBaseScale) / splatRadiusScale * 255)))
}

export function paintGraffitiSplats(context: CanvasRenderingContext2D, splats: GraffitiSplat[]) {
  for (const splat of splats) {
    paintGraffitiSplat(context, splat)
  }
}

function paintAbstractTile(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  palette: Vec3[],
  style: number,
) {
  const seed = style * 2.17 + 0.6

  context.save()
  context.beginPath()
  context.rect(x, y, width, height)
  context.clip()
  context.fillStyle = cssColor(palette[0]!)
  context.fillRect(x, y, width, height)
  context.globalCompositeOperation = 'lighter'
  context.filter = `blur(${Math.max(3, width * 0.055)}px)`

  for (let i = 0; i < 9; i++) {
    const t = i / 8
    const cx = x + width * (0.18 + 0.68 * fract(Math.sin(seed * 21 + i * 13.7) * 97.23))
    const cy = y + height * (0.16 + 0.7 * fract(Math.sin(seed * 17 + i * 9.1) * 83.41))
    const radius = width * (0.22 + 0.2 * fract(Math.sin(seed * 11 + i * 5.6) * 31.7))
    const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius)
    const color = cssColor(palette[Math.min(palette.length - 1, 1 + Math.floor(t * (palette.length - 1)))]!)

    gradient.addColorStop(0, color)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.globalAlpha = 0.34
    context.fillStyle = gradient
    context.fillRect(x - width * 0.2, y - height * 0.2, width * 1.4, height * 1.4)
  }

  context.filter = 'none'
  context.globalCompositeOperation = 'source-over'
  context.globalAlpha = 0.22
  context.fillStyle = '#ffffff'
  for (let i = 0; i < 3; i++) {
    context.beginPath()
    context.ellipse(x + width * (0.28 + i * 0.22), y + height * (0.32 + i * 0.16), width * 0.2,
      height * 0.1, seed + i * 0.7, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

function cssColor(color: Vec3) {
  return `rgb(${Math.round(color[0] * 255)} ${Math.round(color[1] * 255)} ${Math.round(color[2] * 255)})`
}

function fract(value: number) {
  return value - Math.floor(value)
}

function smoothstepNumber(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))

  return t * t * (3 - 2 * t)
}

function screenRay(clientX: number, clientY: number, projector: WallProjector) {
  const ndcX = clientX / projector.clientWidth * 2 - 1
  const ndcY = 1 - clientY / projector.clientHeight * 2
  const x = -projector.cameraZX + projector.cameraXX * ndcX * projector.aspect / projector.f
    + projector.cameraYX * ndcY / projector.f
  const y = -projector.cameraZY + projector.cameraXY * ndcX * projector.aspect / projector.f
    + projector.cameraYY * ndcY / projector.f
  const z = -projector.cameraZZ + projector.cameraXZ * ndcX * projector.aspect / projector.f
    + projector.cameraYZ * ndcY / projector.f

  return {
    eyeX: projector.eyeX,
    eyeY: projector.eyeY,
    eyeZ: projector.eyeZ,
    x,
    y,
    z,
    length: Math.hypot(x, y, z),
  }
}

function wallHit(wallIndex: number, ray: ScreenRay) {
  const wall = wallAt(wallIndex)

  return wall.kind === 'plane'
    ? planeWallHit(wall, ray)
    : wall.kind === 'cylinder'
    ? cylinderWallHit(wall, ray)
    : coneWallHit(wall, ray)
}

function planeWallHit(wall: PlaneGraffitiWall, ray: ScreenRay) {
  const component = wall.axis === 'x' ? ray.x : ray.z
  const eye = wall.axis === 'x' ? ray.eyeX : ray.eyeZ

  if (component === 0) {
    return
  }

  const distance = (wall.value - eye) / component

  if (distance <= 0) {
    return
  }

  const worldX = ray.eyeX + ray.x * distance
  const worldY = ray.eyeY + ray.y * distance
  const worldZ = ray.eyeZ + ray.z * distance
  const along = wall.axis === 'x' ? worldZ : worldX

  if (worldY < wall.yMin || worldY > wall.yMax || along < wall.min + wallMargin || along > wall.max - wallMargin) {
    return
  }

  return {
    x: along,
    y: worldY,
    distance: distance * ray.length,
  }
}

function cylinderWallHit(wall: CylinderGraffitiWall, ray: ScreenRay) {
  const x = ray.eyeX - wall.x
  const z = ray.eyeZ - wall.z
  const a = ray.x * ray.x + ray.z * ray.z
  const b = 2 * (x * ray.x + z * ray.z)
  const c = x * x + z * z - wall.radius * wall.radius
  const determinant = b * b - 4 * a * c

  if (a === 0 || determinant < 0) {
    return
  }

  const root = Math.sqrt(determinant)
  const first = (-b - root) / (2 * a)
  const second = (-b + root) / (2 * a)
  const distance = first > 0 ? first : second

  if (distance <= 0) {
    return
  }

  const worldX = ray.eyeX + ray.x * distance
  const worldY = ray.eyeY + ray.y * distance
  const worldZ = ray.eyeZ + ray.z * distance
  const along = Math.atan2(worldX - wall.x, worldZ - wall.z) * wall.radius

  if (worldY < wall.yMin || worldY > wall.yMax || along < wall.min || along > wall.max
    || inWallCutout(wall, along))
  {
    return
  }

  return {
    x: along,
    y: worldY,
    distance: distance * ray.length,
  }
}

function coneWallHit(wall: ConeGraffitiWall, ray: ScreenRay) {
  const x = ray.eyeX - wall.x
  const z = ray.eyeZ - wall.z
  const y = wall.yMax - ray.eyeY
  const slope = wall.radius / (wall.yMax - wall.yMin)
  const slopeSq = slope * slope
  const rayY = -ray.y
  const a = ray.x * ray.x + ray.z * ray.z - slopeSq * rayY * rayY
  const b = 2 * (x * ray.x + z * ray.z - slopeSq * y * rayY)
  const c = x * x + z * z - slopeSq * y * y
  const determinant = b * b - 4 * a * c

  if (a === 0 || determinant < 0) {
    return
  }

  const root = Math.sqrt(determinant)
  const first = (-b - root) / (2 * a)
  const second = (-b + root) / (2 * a)
  const distances = first < second ? [first, second] : [second, first]

  for (const distance of distances) {
    if (distance <= 0) {
      continue
    }

    const worldX = ray.eyeX + ray.x * distance
    const worldY = ray.eyeY + ray.y * distance
    const worldZ = ray.eyeZ + ray.z * distance
    const along = Math.atan2(worldX - wall.x, worldZ - wall.z) * wall.radius

    if (worldY < wall.yMin || worldY > wall.yMax || along < wall.min || along > wall.max
      || inWallCutout(wall, along))
    {
      continue
    }

    return {
      x: along,
      y: worldY,
      distance: distance * ray.length,
    }
  }
}

function addGraffitiSplat(target: Vertex[], splat: GraffitiSplat) {
  const wall = wallAt(splat.wall)
  const color = graffitiColors[splat.colorIndex % graffitiColors.length]!
  const tangent = wallTangent(wall, splat.x)
  const up = wallUp(wall, splat.x)
  const center = wallPoint(wall, splat.x, splat.y)
  const scale = graffitiSplatScale(splat.radius)
  const count = 3 + splat.seed % 3

  for (let i = 0; i < count; i++) {
    const angle = random(splat.seed, i * 4) * Math.PI * 2
    const radius = scale * (0.025 + random(splat.seed, i * 4 + 1) * 0.12)
    const sizeX = scale * (0.055 + random(splat.seed, i * 4 + 2) * 0.09)
    const sizeY = scale * (0.04 + random(splat.seed, i * 4 + 3) * 0.08)
    const cx = Math.cos(angle) * radius
    const cy = Math.sin(angle) * radius * 0.72
    const point: Vec3 = [
      center[0] + tangent[0] * cx + up[0] * cy,
      center[1] + tangent[1] * cx + up[1] * cy,
      center[2] + tangent[2] * cx + up[2] * cy,
    ]

    addSplatQuad(target, point, tangent, up, sizeX, sizeY, color)
  }
}

function wallPoint(wall: GraffitiWall, x: number, y: number): Vec3 {
  if (wall.kind === 'cylinder') {
    return cylinderWallPoint(wall, x, y, 1)
  }

  if (wall.kind === 'cone') {
    return coneWallPoint(wall, x, y, 1)
  }

  if (wall.axis === 'x') {
    return [wall.value + wall.normal[0] * wallEpsilon, y, x]
  }

  return [x, y, wall.value + wall.normal[2] * wallEpsilon]
}

function wallTangent(wall: GraffitiWall, x: number): Vec3 {
  if (wall.kind === 'cylinder' || wall.kind === 'cone') {
    const angle = x / wall.radius

    return [Math.cos(angle), 0, -Math.sin(angle)]
  }

  return wall.axis === 'x' ? [0, 0, 1] : [1, 0, 0]
}

function wallUp(wall: GraffitiWall, x: number): Vec3 {
  if (wall.kind !== 'cone') {
    return [0, 1, 0]
  }

  const angle = x / wall.radius
  const slope = wall.radius / (wall.yMax - wall.yMin)
  const length = Math.hypot(slope, 1)

  return [
    -Math.sin(angle) * slope / length,
    1 / length,
    -Math.cos(angle) * slope / length,
  ]
}

function addGraffitiWallSurface(target: Vertex[], wallIndex: number, wall: GraffitiWall, side: 1 | -1) {
  if (wall.kind === 'plane') {
    addPlaneGraffitiWallSurface(target, wallIndex, wall, side)
    return
  }

  if (wall.kind === 'cylinder') {
    addCylinderGraffitiWallSurface(target, wallIndex, wall, side)
    return
  }

  addConeGraffitiWallSurface(target, wallIndex, wall, side)
}

function addPlaneGraffitiWallSurface(target: Vertex[], wallIndex: number, wall: PlaneGraffitiWall, side: 1 | -1) {
  const [u0, v0, u1, v1] = wallTextureBounds(wallIndex)

  if (wall.axis === 'x') {
    const x = wall.value + wall.normal[0] * wallEpsilon * side

    addGraffitiQuad(target, [x, wall.yMin, wall.min], [x, wall.yMin, wall.max], [x, wall.yMax, wall.max], [x, wall.yMax,
      wall.min], u0, v0, u1, v1)
    return
  }

  const z = wall.value + wall.normal[2] * wallEpsilon * side

  addGraffitiQuad(target, [wall.min, wall.yMin, z], [wall.max, wall.yMin, z], [wall.max, wall.yMax, z], [wall.min,
    wall.yMax, z], u0, v0, u1, v1)
}

function addCylinderGraffitiWallSurface(
  target: Vertex[],
  wallIndex: number,
  wall: CylinderGraffitiWall,
  side: 1 | -1,
) {
  const [u0, v0, u1, v1] = wallTextureBounds(wallIndex)
  const span = wall.max - wall.min

  for (let i = 0; i < wall.segments; i++) {
    const a = wall.min + span * i / wall.segments
    const b = wall.min + span * (i + 1) / wall.segments
    const mid = (a + b) / 2

    if (inWallCutout(wall, mid)) {
      continue
    }

    const left = u0 + (a - wall.min) / span * (u1 - u0)
    const right = u0 + (b - wall.min) / span * (u1 - u0)

    addGraffitiQuad(target, cylinderWallPoint(wall, a, wall.yMin, side), cylinderWallPoint(wall, b, wall.yMin, side),
      cylinderWallPoint(wall, b, wall.yMax, side), cylinderWallPoint(wall, a, wall.yMax, side), left, v0, right, v1)
  }
}

function cylinderWallPoint(wall: CylinderGraffitiWall, x: number, y: number, side: 1 | -1): Vec3 {
  const angle = x / wall.radius
  const radius = wall.radius + wallEpsilon * side

  return [
    wall.x + Math.sin(angle) * radius,
    y,
    wall.z + Math.cos(angle) * radius,
  ]
}

function addConeGraffitiWallSurface(target: Vertex[], wallIndex: number, wall: ConeGraffitiWall, side: 1 | -1) {
  const [u0, v0, u1, v1] = wallTextureBounds(wallIndex)
  const xSpan = wall.max - wall.min
  const ySpan = wall.yMax - wall.yMin

  for (let yIndex = 0; yIndex < wall.ySegments; yIndex++) {
    const bottomY = wall.yMin + ySpan * yIndex / wall.ySegments
    const topY = wall.yMin + ySpan * (yIndex + 1) / wall.ySegments
    const bottom = v1 - (bottomY - wall.yMin) / ySpan * (v1 - v0)
    const top = v1 - (topY - wall.yMin) / ySpan * (v1 - v0)

    for (let xIndex = 0; xIndex < wall.xSegments; xIndex++) {
      const a = wall.min + xSpan * xIndex / wall.xSegments
      const b = wall.min + xSpan * (xIndex + 1) / wall.xSegments
      const mid = (a + b) / 2

      if (inWallCutout(wall, mid)) {
        continue
      }

      const left = u0 + (a - wall.min) / xSpan * (u1 - u0)
      const right = u0 + (b - wall.min) / xSpan * (u1 - u0)

      addGraffitiQuad(target, coneWallPoint(wall, a, bottomY, side), coneWallPoint(wall, b, bottomY, side),
        coneWallPoint(wall, b, topY, side), coneWallPoint(wall, a, topY, side), left, top, right, bottom)
    }
  }
}

function coneWallPoint(wall: ConeGraffitiWall, x: number, y: number, side: 1 | -1): Vec3 {
  const angle = x / wall.radius
  const baseRadius = wall.radius * (wall.yMax - y) / (wall.yMax - wall.yMin)
  const normal = coneWallNormal(wall, angle)
  const point: Vec3 = [
    wall.x + Math.sin(angle) * baseRadius,
    y,
    wall.z + Math.cos(angle) * baseRadius,
  ]

  return [
    point[0] + normal[0] * wallEpsilon * side,
    point[1] + normal[1] * wallEpsilon * side,
    point[2] + normal[2] * wallEpsilon * side,
  ]
}

function coneWallNormal(wall: ConeGraffitiWall, angle: number): Vec3 {
  const slope = wall.radius / (wall.yMax - wall.yMin)
  const length = Math.hypot(1, slope)

  return [
    Math.sin(angle) / length,
    slope / length,
    Math.cos(angle) / length,
  ]
}

function wallTextureBounds(wall: number) {
  const column = wall % graffitiAtlasColumns
  const row = Math.floor(wall / graffitiAtlasColumns)
  const u0 = column * graffitiCellWidth / graffitiTextureSize
  const v0 = row * graffitiCellHeight / graffitiTextureSize
  const u1 = (column + 1) * graffitiCellWidth / graffitiTextureSize
  const v1 = (row + 1) * graffitiCellHeight / graffitiTextureSize

  return [u0, v0, u1, v1] as const
}

function addSplatQuad(target: Vertex[], center: Vec3, tangent: Vec3, up: Vec3, sizeX: number, sizeY: number,
  color: Vec3)
{
  const a = offset(center, tangent, up, -sizeX, -sizeY)
  const b = offset(center, tangent, up, sizeX, -sizeY)
  const c = offset(center, tangent, up, sizeX, sizeY)
  const d = offset(center, tangent, up, -sizeX, sizeY)

  target.push(
    pack(a, color, 0, 0, -1, -1, 6),
    pack(b, color, 0, 0, 1, -1, 6),
    pack(c, color, 0, 0, 1, 1, 6),
    pack(a, color, 0, 0, -1, -1, 6),
    pack(c, color, 0, 0, 1, 1, 6),
    pack(d, color, 0, 0, -1, 1, 6),
  )
}

function addGraffitiQuad(
  target: Vertex[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
) {
  const color: Vec3 = [1, 1, 1]

  target.push(
    pack(a, color, 0, 0, u0, v1, 6),
    pack(b, color, 0, 0, u1, v1, 6),
    pack(c, color, 0, 0, u1, v0, 6),
    pack(a, color, 0, 0, u0, v1, 6),
    pack(c, color, 0, 0, u1, v0, 6),
    pack(d, color, 0, 0, u0, v0, 6),
  )
}

function paintGraffitiSplat(context: CanvasRenderingContext2D, splat: GraffitiSplat) {
  const color = graffitiColors[splat.colorIndex % graffitiColors.length]!
  const wall = wallAt(splat.wall)
  const [x, y] = splatCanvasPoint(splat)
  const pixelsPerMeterX = graffitiCellWidth / (wall.max - wall.min)
  const pixelsPerMeterY = graffitiCellHeight / (wall.yMax - wall.yMin)
  const scale = graffitiSplatScale(splat.radius)
  const count = 3 + splat.seed % 3

  context.save()
  context.translate(x, y)
  context.scale(pixelsPerMeterX, pixelsPerMeterY)
  context.fillStyle = `rgb(${Math.round(color[0] * 255)} ${Math.round(color[1] * 255)} ${Math.round(color[2] * 255)})`

  for (let i = 0; i < count; i++) {
    const angle = random(splat.seed, i * 4) * Math.PI * 2
    const radius = scale * (0.025 + random(splat.seed, i * 4 + 1) * 0.12)
    const sizeX = scale * (0.055 + random(splat.seed, i * 4 + 2) * 0.09)
    const sizeY = scale * (0.04 + random(splat.seed, i * 4 + 3) * 0.08)
    const xRadius = Math.cos(angle) * radius
    const yRadius = Math.sin(angle) * radius * 0.72

    context.beginPath()
    context.ellipse(xRadius, yRadius, sizeX, sizeY, angle * 0.37, 0, Math.PI * 2)
    context.fill()
  }

  context.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < count + 2; i++) {
    const angle = random(splat.seed, 40 + i * 3) * Math.PI * 2
    const radius = scale * (0.035 + random(splat.seed, 41 + i * 3) * 0.12)
    const size = scale * (0.012 + random(splat.seed, 42 + i * 3) * 0.026)
    const xRadius = Math.cos(angle) * radius
    const yRadius = Math.sin(angle) * radius

    context.beginPath()
    context.arc(xRadius, yRadius, size, 0, Math.PI * 2)
    context.fill()
  }

  context.restore()
}

function splatCanvasPoint(splat: GraffitiSplat) {
  const wall = wallAt(splat.wall)
  const cellX = splat.wall % graffitiAtlasColumns * graffitiCellWidth
  const cellY = Math.floor(splat.wall / graffitiAtlasColumns) * graffitiCellHeight
  const u = (splat.x - wall.min) / (wall.max - wall.min)
  const v = 1 - (splat.y - wall.yMin) / (wall.yMax - wall.yMin)

  return [
    cellX + u * graffitiCellWidth,
    cellY + v * graffitiCellHeight,
  ]
}

function graffitiSplatScale(radius: number) {
  return splatBaseScale + radius / 255 * splatRadiusScale
}

function offset(center: Vec3, tangent: Vec3, up: Vec3, x: number, y: number): Vec3 {
  return [
    center[0] + tangent[0] * x + up[0] * y,
    center[1] + tangent[1] * x + up[1] * y,
    center[2] + tangent[2] * x + up[2] * y,
  ]
}

function random(seed: number, offset: number) {
  let value = (seed + offset * 374761393) | 0

  value = Math.imul(value ^ value >>> 15, 2246822519)
  value = Math.imul(value ^ value >>> 13, 3266489917)

  return ((value ^ value >>> 16) >>> 0) / 4294967296
}

function wallAt(index: number) {
  const wall = walls[index]

  if (!wall) {
    throw new Error(`Unknown graffiti wall ${index}`)
  }

  return wall
}

function planeWall(
  axis: 'x' | 'z',
  value: number,
  min: number,
  max: number,
  yMin: number,
  yMax: number,
  normal: Vec3,
  sides: GraffitiSides,
): PlaneGraffitiWall {
  return {
    kind: 'plane',
    axis,
    value,
    min,
    max,
    yMin,
    yMax,
    normal,
    sides,
  }
}

function inWallCutout(wall: CylinderGraffitiWall | ConeGraffitiWall, x: number) {
  const size = wall.max - wall.min

  return wall.cutouts.some(cutout => Math.abs(wrapDistance(x - cutout.x, size)) < cutout.radius)
}

function wrapDistance(value: number, size: number) {
  return value - Math.round(value / size) * size
}
