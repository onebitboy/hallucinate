import { characterGroundJoints, characterScale, shoe, skin } from './character-data.ts'
import {
  addCharacterBox,
  addCharacterQuad,
  flattenVertices,
} from './character-geometry.ts'
import type { VertexBufferCache } from './character-geometry.ts'
import { characterParts, characterPoseJoints, characterPoseJointSet } from './character-parts.ts'
import { sampleBasePose, sampleCharacterPose } from './character-rig.ts'
import { resolvePlayerStyle } from './character-style.ts'
import { characterInView, characterView } from './character-visibility.ts'
import { normalizeIndex, scale } from './math.ts'
import type {
  CharacterPart,
  CharacterRig,
  HairMesh,
  Player,
  PlayerStyle,
  PoseBlendCache,
  ResolvedPlayerStyle,
  SampledPose,
  Vec3,
  Vertex,
} from './types.ts'

type CharacterInput = {
  position: Vec3
  turn: number
  motionBlend: number
  style: PlayerStyle
  resolvedStyle?: ResolvedPlayerStyle
}

type BuildOptions = {
  cameraPosition: Vec3
  cameraTarget: Vec3
  character: CharacterInput
  hairMeshes: HairMesh[]
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3
  players: Player[]
  rig: CharacterRig
  time: number
  drawCache?: CharacterDrawCache
  vertexCache?: VertexBufferCache
  width: number
  height: number
}

type TurnBasis = {
  cos: number
  sin: number
}

export type CharacterDrawCache = {
  basePoses: Map<number, SampledPose>
  boxInstances: number[]
  hairInstances: number[]
  npcBlendCache: PoseBlendCache
  poses: Vec3[][]
  vertices: Vertex[]
}

const poseJointIndices = new Map(characterPoseJoints.map((name, index) => [name, index]))
const groundJointIndices = characterGroundJoints.map(name => poseJointIndices.get(name)!)
const spine2Index = poseJointIndices.get('mixamorig:Spine2')!
const neckIndex = poseJointIndices.get('mixamorig:Neck')!
const hipsIndex = poseJointIndices.get('mixamorig:Hips')!
const leftUpLegIndex = poseJointIndices.get('mixamorig:LeftUpLeg')!
const rightUpLegIndex = poseJointIndices.get('mixamorig:RightUpLeg')!
const leftLegIndex = poseJointIndices.get('mixamorig:LeftLeg')!
const rightLegIndex = poseJointIndices.get('mixamorig:RightLeg')!
const headIndex = poseJointIndices.get('mixamorig:Head')!
const headTopIndex = poseJointIndices.get('mixamorig:HeadTop_End')!
const characterPartPlans = characterParts.map(part => ({
  part,
  fromIndex: poseJointIndices.get(part.from)!,
  toIndex: poseJointIndices.get(part.to)!,
}))
const hairLightPoint: Vec3 = [0, 0, 0]
const hairLightNormal: Vec3 = [0, 1, 0]

export function buildCharacterDrawData(options: BuildOptions) {
  const cache = options.drawCache
  const vertices = cache?.vertices ?? []
  const boxInstances = cache?.boxInstances ?? []
  const hairInstances = cache?.hairInstances ?? []
  const npcBlendCache = cache?.npcBlendCache ?? new Map()
  const poses = cache?.poses ?? []
  const basePoses = cache?.basePoses ?? new Map()
  const basePose = sampleBasePose(options.rig, options.time, characterPoseJoints, characterPoseJointSet)
  let poseIndex = 0

  vertices.length = 0
  boxInstances.length = 0
  hairInstances.length = 0
  npcBlendCache.clear()
  basePoses.clear()

  addRenderedCharacter(vertices, boxInstances, hairInstances, options.character, options, true, basePose, undefined,
    poses[poseIndex] ??= [])
  poseIndex++

  const view = characterView(options.cameraPosition, options.cameraTarget)

  for (const player of options.players) {
    if (characterInView(player, view, options.width, options.height)) {
      const sampledTime = bodySampleTime(options.time, options.cameraPosition, player.position)
      const sampleKey = Math.round(sampledTime * 60)
      const sampledBasePose = basePoses.get(sampleKey) ?? sampleAndCacheBasePose(options.rig, sampledTime, basePoses,
        sampleKey)

      addRenderedCharacter(vertices, boxInstances, hairInstances, player, options, false, sampledBasePose,
        npcBlendCache, poses[poseIndex] ??= [], sampledTime, sampleKey)
      poseIndex++
    }
  }

  return {
    vertices: flattenVertices(vertices, options.vertexCache),
    boxInstances,
    hairInstances,
  }
}

function addRenderedCharacter(
  target: Vertex[],
  boxInstances: number[],
  hairInstances: number[],
  player: CharacterInput,
  options: BuildOptions,
  detailedHair: boolean,
  basePose?: SampledPose,
  blendCache?: PoseBlendCache,
  placedPose?: Vec3[],
  time = options.time,
  cacheFrame = 0,
) {
  const pose = sampleCharacterPose(options.rig, time, player, characterPoseJoints, characterPoseJointSet,
    groundJointIndices, characterScale, basePose, blendCache, placedPose, cacheFrame)
  const style = player.resolvedStyle ?? resolvePlayerStyle(player.style)
  const localReflection = detailedHair
  const turn: TurnBasis = {
    cos: Math.cos(player.turn),
    sin: Math.sin(player.turn),
  }

  for (const part of characterPartPlans) {
    if (style.bottomMode === 'pants' || !part.part.bottom) {
      addCharacterPart(target, boxInstances, pose, part, player, turn, style, options.light, localReflection)
    }
  }

  if (style.bottomMode === 'skirt') {
    addCharacterSkirt(target, pose, player, turn, style, options.light, localReflection)
  }

  if (style.topMode === 'chest') {
    addCharacterChest(target, boxInstances, pose, player, turn, options.light, localReflection)
  }

  const hair = playerHair(options.hairMeshes, player.style.hairIndex)

  if (hair && detailedHair) {
    addCharacterHair(target, pose, hair, turn, style.hairColor, options.light)
  }
  else if (hair && options.hairMeshes.length > 0) {
    addNpcHairInstance(hairInstances, pose, hair, player, style.hairColor)
  }
}

function bodySampleTime(time: number, cameraPosition: Vec3, playerPosition: Vec3) {
  const dx = playerPosition[0] - cameraPosition[0]
  const dz = playerPosition[2] - cameraPosition[2]
  const distanceSq = dx * dx + dz * dz
  const fps = distanceSq > 32 * 32 ? 8 : distanceSq > 20 * 20 ? 15 : distanceSq > 10 * 10 ? 30 : 60

  return Math.round(time * fps) / fps
}

function sampleAndCacheBasePose(
  rig: CharacterRig,
  time: number,
  basePoses: Map<number, SampledPose>,
  key: number,
) {
  const pose = sampleBasePose(rig, time, characterPoseJoints, characterPoseJointSet)

  basePoses.set(key, pose)

  return pose
}

function addNpcHairInstance(
  hairInstances: number[],
  pose: Vec3[],
  hair: HairMesh,
  player: { turn: number },
  color: Vec3,
) {
  const head = pose[headIndex]!
  const top = pose[headTopIndex]!
  const upX = top[0] - head[0]
  const upY = top[1] - head[1]
  const upZ = top[2] - head[2]
  const upLength = Math.hypot(upX, upY, upZ)
  const up: Vec3 = [upX / upLength, upY / upLength, upZ / upLength]
  const sin = Math.sin(player.turn)
  const cos = Math.cos(player.turn)

  hairInstances.push(
    hair.index,
    head[0] - up[0] * 0.035,
    head[1] - up[1] * 0.035,
    head[2] - up[2] * 0.035,
    cos,
    0,
    -sin,
    up[0],
    up[1],
    up[2],
    sin,
    0,
    cos,
    color[0],
    color[1],
    color[2],
  )
}

function addCharacterPart(
  target: Vertex[],
  boxInstances: number[],
  pose: Vec3[],
  plan: { part: CharacterPart; fromIndex: number; toIndex: number },
  player: { turn: number },
  turn: TurnBasis,
  style: ResolvedPlayerStyle,
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3,
  localReflection: boolean,
) {
  const { part } = plan
  const from = pose[plan.fromIndex]!
  const to = pose[plan.toIndex]!
  const start = part.start ?? 0
  const end = part.end ?? 1
  const axisX = to[0] - from[0]
  const axisY = to[1] - from[1]
  const axisZ = to[2] - from[2]
  let a: Vec3 = [from[0] + axisX * start, from[1] + axisY * start, from[2] + axisZ * start]
  let b: Vec3 = [from[0] + axisX * end, from[1] + axisY * end, from[2] + axisZ * end]

  if (part.armOffset) {
    const torso = pose[spine2Index]!
    const sideX = turn.cos
    const sideZ = -turn.sin
    const centerX = (a[0] + b[0]) * 0.5 - torso[0]
    const centerZ = (a[2] + b[2]) * 0.5 - torso[2]
    const amount = Math.sign(centerX * sideX + centerZ * sideZ) * part.armOffset
    const offsetX = sideX * amount
    const offsetZ = sideZ * amount

    a = [a[0] + offsetX, a[1], a[2] + offsetZ]
    b = [b[0] + offsetX, b[1], b[2] + offsetZ]
  }

  if (part.lift) {
    a = [a[0], a[1] + part.lift, a[2]]
    b = [b[0], b[1] + part.lift, b[2]]
  }

  addCharacterBox(target, boxInstances, a, b, part.width, part.depth, characterPartColor(part, style),
    part.glow ?? 0.02, player.turn, localReflection, light, 0, turn.sin, turn.cos)
}

function characterPartColor(part: CharacterPart, style: ResolvedPlayerStyle) {
  if (part.top === 'torso') {
    return style.topMode === 'shirt' || style.topMode === 'sleeveless' ? style.shirtLight : skin
  }

  if (part.top === 'sleeve') {
    return style.topMode === 'shirt' ? style.shirt : skin
  }

  if (part.bottom) {
    return style.pants
  }

  if (part.color === shoe) {
    return style.shoe
  }

  return part.color
}

function addCharacterChest(
  target: Vertex[],
  boxInstances: number[],
  pose: Vec3[],
  player: { turn: number },
  turn: TurnBasis,
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3,
  localReflection: boolean,
) {
  const spine = pose[spine2Index]!
  const neck = pose[neckIndex]!
  const centerX = spine[0] + (neck[0] - spine[0]) * 0.32
  const centerY = spine[1] + (neck[1] - spine[1]) * 0.32
  const centerZ = spine[2] + (neck[2] - spine[2]) * 0.32
  const sideX = turn.cos
  const sideZ = -turn.sin
  const forwardX = turn.sin
  const forwardZ = turn.cos

  for (const offset of [-0.055, 0.055]) {
    const a: Vec3 = [
      centerX + sideX * offset + forwardX * 0.06,
      centerY,
      centerZ + sideZ * offset + forwardZ * 0.06,
    ]
    const b: Vec3 = [
      centerX + sideX * offset + forwardX * 0.13,
      centerY,
      centerZ + sideZ * offset + forwardZ * 0.13,
    ]

    addCharacterBox(target, boxInstances, a, b, 0.065, 0.06, skin, 0.02, player.turn, localReflection, light, 0,
      turn.sin, turn.cos)
  }
}

function addCharacterSkirt(
  target: Vertex[],
  pose: Vec3[],
  player: { turn: number },
  turn: TurnBasis,
  style: ResolvedPlayerStyle,
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3,
  localReflection: boolean,
) {
  const hips = pose[hipsIndex]!
  const leftUp = pose[leftUpLegIndex]!
  const rightUp = pose[rightUpLegIndex]!
  const leftLeg = pose[leftLegIndex]!
  const rightLeg = pose[rightLegIndex]!
  const topX = (hips[0] + leftUp[0] + rightUp[0]) / 3
  const topY = (hips[1] + leftUp[1] + rightUp[1]) / 3
  const topZ = (hips[2] + leftUp[2] + rightUp[2]) / 3
  const bottomX = (leftLeg[0] + rightLeg[0]) * 0.5
  const bottomY = (leftLeg[1] + rightLeg[1]) * 0.5
  const bottomZ = (leftLeg[2] + rightLeg[2]) * 0.5
  const sideX = turn.cos
  const sideZ = -turn.sin
  const forwardX = turn.sin
  const forwardZ = turn.cos
  const topWidth = 0.09
  const bottomWidth = 0.15
  const topDepth = 0.11
  const bottomDepth = 0.14
  const a: Vec3 = [topX - sideX * topWidth - forwardX * topDepth, topY, topZ - sideZ * topWidth - forwardZ * topDepth]
  const b: Vec3 = [topX + sideX * topWidth - forwardX * topDepth, topY, topZ + sideZ * topWidth - forwardZ * topDepth]
  const c: Vec3 = [topX + sideX * topWidth + forwardX * topDepth, topY, topZ + sideZ * topWidth + forwardZ * topDepth]
  const d: Vec3 = [topX - sideX * topWidth + forwardX * topDepth, topY, topZ - sideZ * topWidth + forwardZ * topDepth]
  const e: Vec3 = [
    bottomX - sideX * bottomWidth - forwardX * bottomDepth,
    bottomY,
    bottomZ - sideZ * bottomWidth - forwardZ * bottomDepth,
  ]
  const f: Vec3 = [
    bottomX + sideX * bottomWidth - forwardX * bottomDepth,
    bottomY,
    bottomZ + sideZ * bottomWidth - forwardZ * bottomDepth,
  ]
  const g: Vec3 = [
    bottomX + sideX * bottomWidth + forwardX * bottomDepth,
    bottomY,
    bottomZ + sideZ * bottomWidth + forwardZ * bottomDepth,
  ]
  const h: Vec3 = [
    bottomX - sideX * bottomWidth + forwardX * bottomDepth,
    bottomY,
    bottomZ - sideZ * bottomWidth + forwardZ * bottomDepth,
  ]

  addCharacterQuad(target, a, b, f, e, style.pants, 0.02, localReflection, light)
  addCharacterQuad(target, b, c, g, f, scale(style.pants, 0.88), 0.02, localReflection, light)
  addCharacterQuad(target, c, d, h, g, scale(style.pants, 0.78), 0.02, localReflection, light)
  addCharacterQuad(target, d, a, e, h, scale(style.pants, 0.88), 0.02, localReflection, light)
  addCharacterQuad(target, e, f, g, h, scale(style.pants, 0.68), 0.02, localReflection, light)
}

function addCharacterHair(
  target: Vertex[],
  pose: Vec3[],
  mesh: HairMesh,
  turn: TurnBasis,
  color: Vec3,
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3,
) {
  const head = pose[headIndex]!
  const top = pose[headTopIndex]!
  const triangles = mesh.localTriangles
  const rawUpX = top[0] - head[0]
  const rawUpY = top[1] - head[1]
  const rawUpZ = top[2] - head[2]
  const upLength = Math.hypot(rawUpX, rawUpY, rawUpZ)
  const upX = rawUpX / upLength
  const upY = rawUpY / upLength
  const upZ = rawUpZ / upLength
  const sideX = turn.cos
  const sideY = 0
  const sideZ = -turn.sin
  const forwardX = -sideZ
  const forwardY = 0
  const forwardZ = sideX
  const centerX = head[0] - upX * 0.035
  const centerY = head[1] - upY * 0.035
  const centerZ = head[2] - upZ * 0.035

  for (let i = 0; i < triangles.length; i += 9) {
    const a0 = triangles[i]!
    const a1 = triangles[i + 1]!
    const a2 = triangles[i + 2]!
    const b0 = triangles[i + 3]!
    const b1 = triangles[i + 4]!
    const b2 = triangles[i + 5]!
    const c0 = triangles[i + 6]!
    const c1 = triangles[i + 7]!
    const c2 = triangles[i + 8]!
    const ax = centerX + sideX * a0 + upX * a1 + forwardX * a2
    const ay = centerY + sideY * a0 + upY * a1 + forwardY * a2
    const az = centerZ + sideZ * a0 + upZ * a1 + forwardZ * a2
    const bx = centerX + sideX * b0 + upX * b1 + forwardX * b2
    const by = centerY + sideY * b0 + upY * b1 + forwardY * b2
    const bz = centerZ + sideZ * b0 + upZ * b1 + forwardZ * b2
    const cx = centerX + sideX * c0 + upX * c1 + forwardX * c2
    const cy = centerY + sideY * c0 + upY * c1 + forwardY * c2
    const cz = centerZ + sideZ * c0 + upZ * c1 + forwardZ * c2
    const ux = cx - ax
    const uy = cy - ay
    const uz = cz - az
    const vx = bx - ax
    const vy = by - ay
    const vz = bz - az
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const area = nx * nx + ny * ny + nz * nz

    if (area > 0.00000001) {
      const length = Math.sqrt(area)
      hairLightPoint[0] = (ax + bx + cx) / 3
      hairLightPoint[1] = (ay + by + cy) / 3
      hairLightPoint[2] = (az + bz + cz) / 3
      hairLightNormal[0] = nx / length
      hairLightNormal[1] = ny / length
      hairLightNormal[2] = nz / length

      const shade = light(color, hairLightPoint, hairLightNormal)

      target.push(
        [ax, ay, az, shade[0], shade[1], shade[2], 0, 0, 0, 0, 0],
        [bx, by, bz, shade[0], shade[1], shade[2], 0, 0, 0, 0, 0],
        [cx, cy, cz, shade[0], shade[1], shade[2], 0, 0, 0, 0, 0],
      )
    }
  }
}

function playerHair(hairMeshes: HairMesh[], index: number) {
  if (index === 0 || hairMeshes.length === 0) {
    return undefined
  }

  return hairMeshes[normalizeIndex(index - 1, hairMeshes.length)]!
}
