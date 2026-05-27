import { compose, identity, mix, multiply, nodeTransform, normalizeQuat, slerp, transformOrigin } from './math.ts'
import type { AssimpChannel, AssimpNode, AssimpScene, CharacterClip, CharacterRig, Mat4, PoseBlendCache, Quat, RigNode, SampledPose, Vec3 } from './types.ts'


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
  characterGroundJoints: string[],
  characterScale: number,
  basePose = sampleBasePose(rig, time, characterPoseJointSet),
  blendCache?: PoseBlendCache,
) {
  const blendKey = Math.round(player.motionBlend * 60)
  const blend = blendCache ? blendKey / 60 : player.motionBlend
  const cached = blendCache?.get(blendKey)

  if (cached) {
    return placeCharacterPose(cached, player.position, player.turn, characterPoseJoints, characterGroundJoints,
      characterScale)
  }

  const { stand, run } = basePose
  const pose = new Map<string, Vec3>()

  for (const name of characterPoseJoints) {
    const point = stand.get(name)!
    const next = run.get(name)!

    pose.set(name, [
      mix(point[0], next[0], blend),
      mix(point[1], next[1], blend),
      mix(point[2], next[2], blend),
    ])
  }

  blendCache?.set(blendKey, pose)

  return placeCharacterPose(pose, player.position, player.turn, characterPoseJoints, characterGroundJoints,
    characterScale)
}

export function sampleBasePose(rig: CharacterRig, time: number, characterPoseJointSet: Set<string>): SampledPose {
  return {
    stand: sampleClipPose(rig, rig.clips.stand, time, characterPoseJointSet),
    run: sampleClipPose(rig, rig.clips.run, time, characterPoseJointSet),
  }
}

export function sampleClipPose(rig: CharacterRig, clip: CharacterClip, time: number, characterPoseJointSet: Set<string>) {
  const tick = (time * clip.ticksPerSecond) % clip.duration
  const pose = new Map<string, Vec3>()
  const world = new Array<Mat4>(rig.nodes.length)

  for (let i = 0; i < rig.nodes.length; i++) {
    const node = rig.nodes[i]!
    const parent = node.parent < 0 ? identity() : world[node.parent]!
    const channel = clip.channels.get(node.name)
    const local = channel ? sampleChannelTransform(node, channel, tick) : node.transform
    const matrix = node.helper ? parent : multiply(parent, local)

    world[i] = matrix

    if (!node.helper && characterPoseJointSet.has(node.name)) {
      pose.set(node.name, transformOrigin(matrix))
    }
  }

  return pose
}

function sampleChannelTransform(node: RigNode, channel: AssimpChannel, tick: number) {
  return compose(
    sampleVec3(channel.positionkeys, tick, node.origin),
    sampleQuat(channel.rotationkeys, tick, [1, 0, 0, 0]),
    sampleVec3(channel.scalingkeys, tick, [1, 1, 1]),
  )
}

function sampleVec3(keys: [number, Vec3][] | undefined, tick: number, fallback: Vec3): Vec3 {
  if (!keys?.length) {
    return fallback
  }

  if (keys.length === 1 || tick <= keys[0]![0]) {
    return [...keys[0]![1]]
  }

  for (let i = 0; i < keys.length - 1; i++) {
    const from = keys[i]!
    const to = keys[i + 1]!

    if (tick <= to[0]) {
      const t = (tick - from[0]) / (to[0] - from[0])

      return [
        mix(from[1][0], to[1][0], t),
        mix(from[1][1], to[1][1], t),
        mix(from[1][2], to[1][2], t),
      ]
    }
  }

  return [...keys[keys.length - 1]![1]]
}

function sampleQuat(keys: [number, Quat][] | undefined, tick: number, fallback: Quat): Quat {
  if (!keys?.length) {
    return fallback
  }

  if (keys.length === 1 || tick <= keys[0]![0]) {
    return normalizeQuat(keys[0]![1])
  }

  for (let i = 0; i < keys.length - 1; i++) {
    const from = keys[i]!
    const to = keys[i + 1]!

    if (tick <= to[0]) {
      return slerp(from[1], to[1], (tick - from[0]) / (to[0] - from[0]))
    }
  }

  return normalizeQuat(keys[keys.length - 1]![1])
}

export function placeCharacterPose(
  pose: Map<string, Vec3>,
  position: Vec3,
  turn: number,
  characterPoseJoints: string[],
  characterGroundJoints: string[],
  characterScale: number,
) {
  const ground = Math.min(...characterGroundJoints.map(name => pose.get(name)![1]))
  const next = new Map<string, Vec3>()
  const sin = Math.sin(turn)
  const cos = Math.cos(turn)

  for (const name of characterPoseJoints) {
    const point = pose.get(name)!
    const x = point[0] * characterScale
    const y = (point[1] - ground) * characterScale
    const z = point[2] * characterScale

    next.set(name, [
      position[0] + x * cos + z * sin,
      position[1] + y,
      position[2] - x * sin + z * cos,
    ])
  }

  return next
}

function isAssimpHelper(node: AssimpNode) {
  return node.name.includes('$AssimpFbx$')
}
