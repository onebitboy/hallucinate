import { compose, identity, mix, multiply, nodeTransform, normalizeQuat, slerp, transformOrigin } from './math.ts'
import type { AssimpChannel, AssimpNode, AssimpScene, CharacterClip, CharacterRig, Mat4, PoseBlendCache, Quat, RigNode,
  SampledPose, Vec3 } from './types.ts'

type PoseSamplePlan = {
  channels: WeakMap<CharacterClip, (AssimpChannel | undefined)[]>
  indices: number[]
  poseSlots: number[]
  world: Mat4[]
}

const identityMatrix = identity()
const identityQuat: Quat = [1, 0, 0, 0]
const unitScale: Vec3 = [1, 1, 1]
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
) {
  const blendKey = blendCache ? Math.round(player.motionBlend * 60) : 0
  const blend = blendCache ? blendKey / 60 : player.motionBlend
  const cached = blendCache?.get(blendKey)

  if (cached) {
    return placeCharacterPose(cached, player.position, player.turn, characterPoseJoints, characterGroundJointIndices,
      characterScale)
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
    characterScale)
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
    const local = channel ? sampleChannelTransform(node, channel, tick) : node.transform
    const matrix = node.helper ? parent : multiply(parent, local)
    const poseSlot = plan.poseSlots[i]!

    plan.world[i] = matrix

    if (poseSlot >= 0) {
      pose[poseSlot] = transformOrigin(matrix)
    }
  }

  return pose
}

function sampleChannelTransform(node: RigNode, channel: AssimpChannel, tick: number) {
  return compose(
    sampleVec3(channel.positionkeys, tick, node.origin),
    sampleQuat(channel.rotationkeys, tick, identityQuat),
    sampleVec3(channel.scalingkeys, tick, unitScale),
  )
}

function sampleVec3(keys: [number, Vec3][] | undefined, tick: number, fallback: Vec3): Vec3 {
  if (!keys?.length) {
    return fallback
  }

  if (keys.length === 1 || tick <= keys[0]![0]) {
    return keys[0]![1]
  }

  const index = nextKeyIndex(keys, tick)

  if (index > 0) {
    const from = keys[index - 1]!
    const to = keys[index]!
    const t = (tick - from[0]) / (to[0] - from[0])

    return [
      mix(from[1][0], to[1][0], t),
      mix(from[1][1], to[1][1], t),
      mix(from[1][2], to[1][2], t),
    ]
  }

  return keys[keys.length - 1]![1]
}

function sampleQuat(keys: [number, Quat][] | undefined, tick: number, fallback: Quat): Quat {
  if (!keys?.length) {
    return fallback
  }

  if (keys.length === 1 || tick <= keys[0]![0]) {
    return normalizeQuat(keys[0]![1])
  }

  const index = nextKeyIndex(keys, tick)

  if (index > 0) {
    const from = keys[index - 1]!
    const to = keys[index]!

    return slerp(from[1], to[1], (tick - from[0]) / (to[0] - from[0]))
  }

  return normalizeQuat(keys[keys.length - 1]![1])
}

export function placeCharacterPose(
  pose: Vec3[],
  position: Vec3,
  turn: number,
  characterPoseJoints: string[],
  characterGroundJointIndices: number[],
  characterScale: number,
) {
  let ground = Infinity
  const next = new Array<Vec3>(characterPoseJoints.length)
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

    next[i] = [
      position[0] + x * cos + z * sin,
      position[1] + y,
      position[2] - x * sin + z * cos,
    ]
  }

  return next
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
      poseSlots,
      world: new Array<Mat4>(rig.nodes.length),
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
