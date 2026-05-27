import { identity, mix, nodeTransform, transformOrigin } from './math.ts'
import type { AssimpChannel, AssimpNode, AssimpScene, CharacterClip, CharacterRig, Mat4, PoseBlendCache, Quat, RigNode,
  SampledPose, Vec3 } from './types.ts'

type PoseSamplePlan = {
  channels: WeakMap<CharacterClip, (AssimpChannel | undefined)[]>
  indices: number[]
  local: Mat4[]
  poseSlots: number[]
  world: Mat4[]
}

const identityMatrix = identity()
const identityQuat: Quat = [1, 0, 0, 0]
const unitScale: Vec3 = [1, 1, 1]
const samplePosition: Vec3 = [0, 0, 0]
const sampleRotation: Quat = [1, 0, 0, 0]
const sampleScale: Vec3 = [1, 1, 1]
const poseSamplePlans = new WeakMap<CharacterRig, WeakMap<Set<string>, PoseSamplePlan>>()

export function createCharacterClip(scene: AssimpScene, name: string): CharacterClip {
  const animation = scene.animations?.[0]

  if (!animation) {
    throw new Error(`${name} has no animation`)
  }

  return {
    duration: animation.duration ?? 1,
    ticksPerSecond: animation.tickspersecond ?? 30,
    channels: new Map((animation.channels ?? []).map(channel => [channel.name, channel])),
  }
}

export function validateCharacterRig(root: AssimpNode, characterBones: [string, string][]) {
  const names = collectNodeNames(root, new Set<string>())

  for (const [from, to] of characterBones) {
    if (!names.has(from) || !names.has(to)) {
      throw new Error(`Missing skeleton bone ${from} -> ${to}`)
    }
  }
}

function collectNodeNames(node: AssimpNode, names: Set<string>) {
  names.add(node.name)

  for (const child of node.children ?? []) {
    collectNodeNames(child, names)
  }

  return names
}

export function createRigNodes(root: AssimpNode) {
  const nodes: RigNode[] = []
  const add = (node: AssimpNode, parent: number) => {
    const transform = nodeTransform(node)
    const index = nodes.length
    const helper = isAssimpHelper(node)

    nodes.push({
      name: node.name,
      parent,
      helper,
      transform,
      origin: transformOrigin(transform),
    })

    for (const child of node.children ?? []) {
      add(child, index)
    }
  }

  add(root, -1)

  return nodes
}

export function sampleCharacterPose(
  rig: CharacterRig,
  time: number,
  player: { position: Vec3; turn: number; motionBlend: number },
  characterPoseJoints: string[],
  characterPoseJointSet: Set<string>,
  characterGroundJointIndices: number[],
  characterScale: number,
  basePose = sampleBasePose(rig, time, characterPoseJoints, characterPoseJointSet),
  blendCache?: PoseBlendCache,
  placedPose?: Vec3[],
  cacheFrame = 0,
) {
  const motionBlendKey = blendCache ? Math.round(player.motionBlend * 60) : 0
  const blendKey = cacheFrame * 100 + motionBlendKey
  const blend = blendCache ? motionBlendKey / 60 : player.motionBlend
  const cached = blendCache?.get(blendKey)

  if (cached) {
    return placeCharacterPose(cached, player.position, player.turn, characterPoseJoints, characterGroundJointIndices,
      characterScale, placedPose)
  }

  const { stand, run } = basePose
  const pose = new Array<Vec3>(characterPoseJoints.length)

  for (let i = 0; i < characterPoseJoints.length; i++) {
    const point = stand[i]!
    const next = run[i]!

    pose[i] = [
      mix(point[0], next[0], blend),
      mix(point[1], next[1], blend),
      mix(point[2], next[2], blend),
    ]
  }

  blendCache?.set(blendKey, pose)

  return placeCharacterPose(pose, player.position, player.turn, characterPoseJoints, characterGroundJointIndices,
    characterScale, placedPose)
}

export function sampleBasePose(
  rig: CharacterRig,
  time: number,
  characterPoseJoints: string[],
  characterPoseJointSet: Set<string>,
): SampledPose {
  return {
    stand: sampleClipPose(rig, rig.clips.stand, time, characterPoseJoints, characterPoseJointSet),
    run: sampleClipPose(rig, rig.clips.run, time, characterPoseJoints, characterPoseJointSet),
  }
}

export function sampleClipPose(rig: CharacterRig, clip: CharacterClip, time: number,
  characterPoseJoints: string[], characterPoseJointSet: Set<string>)
{
  const tick = (time * clip.ticksPerSecond) % clip.duration
  const plan = getPoseSamplePlan(rig, characterPoseJoints, characterPoseJointSet)
  const channels = getPoseSampleChannels(rig, clip, plan)
  const pose = new Array<Vec3>(characterPoseJoints.length)

  for (const i of plan.indices) {
    const node = rig.nodes[i]!
    const parent = node.parent < 0 ? identityMatrix : plan.world[node.parent]!
    const channel = channels[i]
    const local = channel ? sampleChannelTransform(node, channel, tick, plan.local[i]!) : node.transform
    const matrix = node.helper ? parent : multiplyInto(parent, local, plan.world[i]!)
    const poseSlot = plan.poseSlots[i]!

    plan.world[i] = matrix

    if (poseSlot >= 0) {
      pose[poseSlot] = transformOrigin(matrix)
    }
  }

  return pose
}

function sampleChannelTransform(node: RigNode, channel: AssimpChannel, tick: number, target: Mat4) {
  return composeInto(
    sampleVec3Into(channel.positionkeys, tick, node.origin, samplePosition),
    sampleQuatInto(channel.rotationkeys, tick, identityQuat, sampleRotation),
    sampleVec3Into(channel.scalingkeys, tick, unitScale, sampleScale),
    target,
  )
}

function composeInto(position: Vec3, rotation: Quat, nextScale: Vec3, target: Mat4) {
  const length = Math.hypot(rotation[0], rotation[1], rotation[2], rotation[3])
  const w = rotation[0] / length
  const x = rotation[1] / length
  const y = rotation[2] / length
  const z = rotation[3] / length
  const xx = x * x
  const yy = y * y
  const zz = z * z
  const xy = x * y
  const xz = x * z
  const yz = y * z
  const wx = w * x
  const wy = w * y
  const wz = w * z

  target[0] = (1 - 2 * (yy + zz)) * nextScale[0]
  target[1] = 2 * (xy - wz) * nextScale[1]
  target[2] = 2 * (xz + wy) * nextScale[2]
  target[3] = position[0]
  target[4] = 2 * (xy + wz) * nextScale[0]
  target[5] = (1 - 2 * (xx + zz)) * nextScale[1]
  target[6] = 2 * (yz - wx) * nextScale[2]
  target[7] = position[1]
  target[8] = 2 * (xz - wy) * nextScale[0]
  target[9] = 2 * (yz + wx) * nextScale[1]
  target[10] = (1 - 2 * (xx + yy)) * nextScale[2]
  target[11] = position[2]
  target[12] = 0
  target[13] = 0
  target[14] = 0
  target[15] = 1

  return target
}

function multiplyInto(a: Mat4, b: Mat4, target: Mat4) {
  const a0 = a[0]
  const a1 = a[1]
  const a2 = a[2]
  const a3 = a[3]
  const a4 = a[4]
  const a5 = a[5]
  const a6 = a[6]
  const a7 = a[7]
  const a8 = a[8]
  const a9 = a[9]
  const a10 = a[10]
  const a11 = a[11]
  const a12 = a[12]
  const a13 = a[13]
  const a14 = a[14]
  const a15 = a[15]
  const b0 = b[0]
  const b1 = b[1]
  const b2 = b[2]
  const b3 = b[3]
  const b4 = b[4]
  const b5 = b[5]
  const b6 = b[6]
  const b7 = b[7]
  const b8 = b[8]
  const b9 = b[9]
  const b10 = b[10]
  const b11 = b[11]
  const b12 = b[12]
  const b13 = b[13]
  const b14 = b[14]
  const b15 = b[15]

  target[0] = a0 * b0 + a1 * b4 + a2 * b8 + a3 * b12
  target[1] = a0 * b1 + a1 * b5 + a2 * b9 + a3 * b13
  target[2] = a0 * b2 + a1 * b6 + a2 * b10 + a3 * b14
  target[3] = a0 * b3 + a1 * b7 + a2 * b11 + a3 * b15
  target[4] = a4 * b0 + a5 * b4 + a6 * b8 + a7 * b12
  target[5] = a4 * b1 + a5 * b5 + a6 * b9 + a7 * b13
  target[6] = a4 * b2 + a5 * b6 + a6 * b10 + a7 * b14
  target[7] = a4 * b3 + a5 * b7 + a6 * b11 + a7 * b15
  target[8] = a8 * b0 + a9 * b4 + a10 * b8 + a11 * b12
  target[9] = a8 * b1 + a9 * b5 + a10 * b9 + a11 * b13
  target[10] = a8 * b2 + a9 * b6 + a10 * b10 + a11 * b14
  target[11] = a8 * b3 + a9 * b7 + a10 * b11 + a11 * b15
  target[12] = a12 * b0 + a13 * b4 + a14 * b8 + a15 * b12
  target[13] = a12 * b1 + a13 * b5 + a14 * b9 + a15 * b13
  target[14] = a12 * b2 + a13 * b6 + a14 * b10 + a15 * b14
  target[15] = a12 * b3 + a13 * b7 + a14 * b11 + a15 * b15

  return target
}

function sampleVec3Into(keys: [number, Vec3][] | undefined, tick: number, fallback: Vec3, target: Vec3): Vec3 {
  if (!keys?.length) {
    target[0] = fallback[0]
    target[1] = fallback[1]
    target[2] = fallback[2]

    return target
  }

  if (keys.length === 1 || tick <= keys[0]![0]) {
    target[0] = keys[0]![1][0]
    target[1] = keys[0]![1][1]
    target[2] = keys[0]![1][2]

    return target
  }

  const index = nextKeyIndex(keys, tick)

  if (index > 0) {
    const from = keys[index - 1]!
    const to = keys[index]!
    const t = (tick - from[0]) / (to[0] - from[0])

    target[0] = mix(from[1][0], to[1][0], t)
    target[1] = mix(from[1][1], to[1][1], t)
    target[2] = mix(from[1][2], to[1][2], t)

    return target
  }

  target[0] = keys[keys.length - 1]![1][0]
  target[1] = keys[keys.length - 1]![1][1]
  target[2] = keys[keys.length - 1]![1][2]

  return target
}

function sampleQuatInto(keys: [number, Quat][] | undefined, tick: number, fallback: Quat, target: Quat): Quat {
  if (!keys?.length) {
    target[0] = fallback[0]
    target[1] = fallback[1]
    target[2] = fallback[2]
    target[3] = fallback[3]

    return target
  }

  if (keys.length === 1 || tick <= keys[0]![0]) {
    target[0] = keys[0]![1][0]
    target[1] = keys[0]![1][1]
    target[2] = keys[0]![1][2]
    target[3] = keys[0]![1][3]

    return target
  }

  const index = nextKeyIndex(keys, tick)

  if (index > 0) {
    const from = keys[index - 1]!
    const to = keys[index]!

    return slerpInto(from[1], to[1], (tick - from[0]) / (to[0] - from[0]), target)
  }

  target[0] = keys[keys.length - 1]![1][0]
  target[1] = keys[keys.length - 1]![1][1]
  target[2] = keys[keys.length - 1]![1][2]
  target[3] = keys[keys.length - 1]![1][3]

  return target
}

function slerpInto(a: Quat, b: Quat, t: number, target: Quat) {
  let bw = b[0]
  let bx = b[1]
  let by = b[2]
  let bz = b[3]
  let value = a[0] * bw + a[1] * bx + a[2] * by + a[3] * bz

  if (value < 0) {
    value = -value
    bw = -bw
    bx = -bx
    by = -by
    bz = -bz
  }

  if (value > 0.9995) {
    target[0] = mix(a[0], bw, t)
    target[1] = mix(a[1], bx, t)
    target[2] = mix(a[2], by, t)
    target[3] = mix(a[3], bz, t)

    const length = Math.hypot(target[0], target[1], target[2], target[3])

    target[0] /= length
    target[1] /= length
    target[2] /= length
    target[3] /= length

    return target
  }

  const theta = Math.acos(value)
  const sinTheta = Math.sin(theta)
  const from = Math.sin((1 - t) * theta) / sinTheta
  const to = Math.sin(t * theta) / sinTheta

  target[0] = a[0] * from + bw * to
  target[1] = a[1] * from + bx * to
  target[2] = a[2] * from + by * to
  target[3] = a[3] * from + bz * to

  return target
}

export function placeCharacterPose(
  pose: Vec3[],
  position: Vec3,
  turn: number,
  characterPoseJoints: string[],
  characterGroundJointIndices: number[],
  characterScale: number,
  target = new Array<Vec3>(characterPoseJoints.length),
) {
  let ground = Infinity
  const sin = Math.sin(turn)
  const cos = Math.cos(turn)

  for (const index of characterGroundJointIndices) {
    ground = Math.min(ground, pose[index]![1])
  }

  for (let i = 0; i < characterPoseJoints.length; i++) {
    const point = pose[i]!
    const x = point[0] * characterScale
    const y = (point[1] - ground) * characterScale
    const z = point[2] * characterScale

    const next = target[i]
    const px = position[0] + x * cos + z * sin
    const py = position[1] + y
    const pz = position[2] - x * sin + z * cos

    if (next) {
      next[0] = px
      next[1] = py
      next[2] = pz
    }
    else {
      target[i] = [px, py, pz]
    }
  }

  return target
}

function getPoseSamplePlan(rig: CharacterRig, characterPoseJoints: string[], characterPoseJointSet: Set<string>) {
  let bySet = poseSamplePlans.get(rig)

  if (!bySet) {
    bySet = new WeakMap()
    poseSamplePlans.set(rig, bySet)
  }

  let plan = bySet.get(characterPoseJointSet)

  if (!plan) {
    const needed = new Set<number>()

    for (let i = 0; i < rig.nodes.length; i++) {
      if (characterPoseJointSet.has(rig.nodes[i]!.name)) {
        let index = i

        while (index >= 0 && !needed.has(index)) {
          needed.add(index)
          index = rig.nodes[index]!.parent
        }
      }
    }

    const indices = [...needed].sort((a, b) => a - b)
    const poseSlots = new Array<number>(rig.nodes.length).fill(-1)

    for (const index of indices) {
      const node = rig.nodes[index]!

      if (!node.helper && characterPoseJointSet.has(node.name)) {
        poseSlots[index] = characterPoseJoints.indexOf(node.name)
      }
    }

    plan = {
      channels: new WeakMap(),
      indices,
      local: Array.from({ length: rig.nodes.length }, identity),
      poseSlots,
      world: Array.from({ length: rig.nodes.length }, identity),
    }
    bySet.set(characterPoseJointSet, plan)
  }

  return plan
}

function getPoseSampleChannels(rig: CharacterRig, clip: CharacterClip, plan: PoseSamplePlan) {
  let channels = plan.channels.get(clip)

  if (!channels) {
    channels = new Array<AssimpChannel | undefined>(rig.nodes.length)

    for (const index of plan.indices) {
      channels[index] = clip.channels.get(rig.nodes[index]!.name)
    }

    plan.channels.set(clip, channels)
  }

  return channels
}

function nextKeyIndex<T extends Vec3 | Quat>(keys: [number, T][], tick: number) {
  let low = 1
  let high = keys.length - 1

  while (low < high) {
    const middle = (low + high) >> 1

    if (tick <= keys[middle]![0]) {
      high = middle
    }
    else {
      low = middle + 1
    }
  }

  return tick <= keys[low]![0] ? low : -1
}

function isAssimpHelper(node: AssimpNode) {
  return node.name.includes('$AssimpFbx$')
}
