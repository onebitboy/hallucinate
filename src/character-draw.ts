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
import { add, dot, normalize, normalizeIndex, scale, subtract } from './math.ts'
import type {
  CharacterPart,
  CharacterRig,
  HairInstance,
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
  vertexCache?: VertexBufferCache
  width: number
  height: number
}

export function buildCharacterDrawData(options: BuildOptions) {
  const vertices: Vertex[] = []
  const boxInstances: number[] = []
  const hairInstances: HairInstance[] = []
  const basePose = sampleBasePose(options.rig, options.time, characterPoseJointSet)

  addRenderedCharacter(vertices, boxInstances, hairInstances, options.character, options, true, basePose)

  const view = characterView(options.cameraPosition, options.cameraTarget)
  const npcBlendCache: PoseBlendCache = new Map()

  for (const player of options.players) {
    if (characterInView(player, view, options.width, options.height)) {
      addRenderedCharacter(vertices, boxInstances, hairInstances, player, options, false, basePose, npcBlendCache)
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
  hairInstances: HairInstance[],
  player: CharacterInput,
  options: BuildOptions,
  detailedHair: boolean,
  basePose?: SampledPose,
  blendCache?: PoseBlendCache,
) {
  const pose = sampleCharacterPose(options.rig, options.time, player, characterPoseJoints, characterPoseJointSet,
    characterGroundJoints, characterScale, basePose, blendCache)
  const style = player.resolvedStyle ?? resolvePlayerStyle(player.style)
  const localReflection = detailedHair

  for (const part of characterParts) {
    if (style.bottomMode === 'pants' || !part.bottom) {
      addCharacterPart(target, boxInstances, pose, part, player, style, options.light, localReflection)
    }
  }

  if (style.bottomMode === 'skirt') {
    addCharacterSkirt(target, pose, player, style, options.light, localReflection)
  }

  if (style.topMode === 'chest') {
    addCharacterChest(target, boxInstances, pose, player, options.light, localReflection)
  }

  const hair = playerHair(options.hairMeshes, player.style.hairIndex)

  if (hair && detailedHair) {
    addCharacterHair(target, pose, hair, player, style.hairColor, options.light)
  }
  else if (hair && options.hairMeshes.length > 0) {
    addNpcHairInstance(hairInstances, options.hairMeshes, pose, hair, player, style.hairColor)
  }
}

function addNpcHairInstance(
  hairInstances: HairInstance[],
  hairMeshes: HairMesh[],
  pose: Map<string, Vec3>,
  hair: HairMesh,
  player: { turn: number },
  color: Vec3,
) {
  const head = pose.get('mixamorig:Head')!
  const top = pose.get('mixamorig:HeadTop_End')!
  const up = normalize(subtract(top, head))
  const center = add(head, scale(up, -0.035))
  hairInstances.push({
    meshIndex: hairMeshes.indexOf(hair),
    center,
    side: [Math.cos(player.turn), 0, -Math.sin(player.turn)],
    up,
    forward: [Math.sin(player.turn), 0, Math.cos(player.turn)],
    color,
  })
}

function addCharacterPart(
  target: Vertex[],
  boxInstances: number[],
  pose: Map<string, Vec3>,
  part: CharacterPart,
  player: { turn: number },
  style: ResolvedPlayerStyle,
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3,
  localReflection: boolean,
) {
  const from = pose.get(part.from)!
  const to = pose.get(part.to)!
  const start = part.start ?? 0
  const end = part.end ?? 1
  const axis = subtract(to, from)
  let a = add(from, scale(axis, start))
  let b = add(from, scale(axis, end))

  if (part.armOffset) {
    const center = scale(add(a, b), 0.5)
    const torso = pose.get('mixamorig:Spine2')!
    const side: Vec3 = [Math.cos(player.turn), 0, -Math.sin(player.turn)]
    const amount = Math.sign(dot(subtract(center, torso), side)) * part.armOffset
    const offset = scale(side, amount)

    a = add(a, offset)
    b = add(b, offset)
  }

  if (part.lift) {
    const offset: Vec3 = [0, part.lift, 0]

    a = add(a, offset)
    b = add(b, offset)
  }

  addCharacterBox(target, boxInstances, a, b, part.width, part.depth, characterPartColor(part, style),
    part.glow ?? 0.02, player.turn, localReflection, light)
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
  pose: Map<string, Vec3>,
  player: { turn: number },
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3,
  localReflection: boolean,
) {
  const spine = pose.get('mixamorig:Spine2')!
  const neck = pose.get('mixamorig:Neck')!
  const center = add(spine, scale(subtract(neck, spine), 0.32))
  const side: Vec3 = [Math.cos(player.turn), 0, -Math.sin(player.turn)]
  const forward: Vec3 = [Math.sin(player.turn), 0, Math.cos(player.turn)]

  for (const offset of [-0.055, 0.055]) {
    const a = add(add(center, scale(side, offset)), scale(forward, 0.06))
    const b = add(add(center, scale(side, offset)), scale(forward, 0.13))

    addCharacterBox(target, boxInstances, a, b, 0.065, 0.06, skin, 0.02, player.turn, localReflection, light)
  }
}

function addCharacterSkirt(
  target: Vertex[],
  pose: Map<string, Vec3>,
  player: { turn: number },
  style: ResolvedPlayerStyle,
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3,
  localReflection: boolean,
) {
  const hips = pose.get('mixamorig:Hips')!
  const leftUp = pose.get('mixamorig:LeftUpLeg')!
  const rightUp = pose.get('mixamorig:RightUpLeg')!
  const leftLeg = pose.get('mixamorig:LeftLeg')!
  const rightLeg = pose.get('mixamorig:RightLeg')!
  const topCenter = scale(add(add(hips, leftUp), rightUp), 1 / 3)
  const bottomCenter = scale(add(leftLeg, rightLeg), 0.5)
  const side: Vec3 = [Math.cos(player.turn), 0, -Math.sin(player.turn)]
  const forward: Vec3 = [Math.sin(player.turn), 0, Math.cos(player.turn)]
  const topWidth = 0.09
  const bottomWidth = 0.15
  const topDepth = 0.11
  const bottomDepth = 0.14
  const a = add(add(topCenter, scale(side, -topWidth)), scale(forward, -topDepth))
  const b = add(add(topCenter, scale(side, topWidth)), scale(forward, -topDepth))
  const c = add(add(topCenter, scale(side, topWidth)), scale(forward, topDepth))
  const d = add(add(topCenter, scale(side, -topWidth)), scale(forward, topDepth))
  const e = add(add(bottomCenter, scale(side, -bottomWidth)), scale(forward, -bottomDepth))
  const f = add(add(bottomCenter, scale(side, bottomWidth)), scale(forward, -bottomDepth))
  const g = add(add(bottomCenter, scale(side, bottomWidth)), scale(forward, bottomDepth))
  const h = add(add(bottomCenter, scale(side, -bottomWidth)), scale(forward, bottomDepth))

  addCharacterQuad(target, a, b, f, e, style.pants, 0.02, localReflection, light)
  addCharacterQuad(target, b, c, g, f, scale(style.pants, 0.88), 0.02, localReflection, light)
  addCharacterQuad(target, c, d, h, g, scale(style.pants, 0.78), 0.02, localReflection, light)
  addCharacterQuad(target, d, a, e, h, scale(style.pants, 0.88), 0.02, localReflection, light)
  addCharacterQuad(target, e, f, g, h, scale(style.pants, 0.68), 0.02, localReflection, light)
}

function addCharacterHair(
  target: Vertex[],
  pose: Map<string, Vec3>,
  mesh: HairMesh,
  player: { turn: number },
  color: Vec3,
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3,
) {
  const head = pose.get('mixamorig:Head')!
  const top = pose.get('mixamorig:HeadTop_End')!
  const up = normalize(subtract(top, head))
  const side: Vec3 = [Math.cos(player.turn), 0, -Math.sin(player.turn)]
  const forward: Vec3 = [Math.sin(player.turn), 0, Math.cos(player.turn)]
  const center = add(head, scale(up, -0.035))
  const triangles = mesh.localTriangles
  const centerX = center[0]
  const centerY = center[1]
  const centerZ = center[2]
  const sideX = side[0]
  const sideY = side[1]
  const sideZ = side[2]
  const upX = up[0]
  const upY = up[1]
  const upZ = up[2]
  const forwardX = forward[0]
  const forwardY = forward[1]
  const forwardZ = forward[2]

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
      const shade = light(color, [(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3],
        [nx / length, ny / length, nz / length])

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
