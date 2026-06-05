import { identity, nodeTransform, transformOrigin } from './math.ts'
import type { AssimpChannel, AssimpNode, AssimpScene, CharacterClip, CharacterMode, CharacterRig, Mat4, PoseBlendCache,
  Quat, RigNode, SampledPose, Vec3 } from './types.ts'

type PoseSamplePlan = {
  channels: WeakMap<CharacterClip, (PackedChannel | undefined)[]>
  entries: PoseSampleEntry[]
}
type PoseSampleEntry = {
  helper: boolean
  local: Mat4
  name: string
  origin: Vec3
  parentSlot: number
  poseSlot: number
  transform: Mat4
  world: Mat4
}
type PackedChannel = {
  position?: PackedVec3Track
  rotation?: PackedQuatTrack
  scale?: PackedVec3Track
}
type PackedVec3Track = {
  stepInverse: number
  start: number
  times: Float64Array
  values: Float64Array
}
type PackedQuatTrack = {
  stepInverse: number
  start: number
  times: Float64Array
  values: Float64Array
}
type UpperPosePlan = { anchorIndex: number; indices: number[] }

const identityMatrix = identity()
const identityQuat: Quat = [1, 0, 0, 0]
const unitScale: Vec3 = [1, 1, 1]
const samplePosition: Vec3 = [0, 0, 0]
const sampleRotation: Quat = [1, 0, 0, 0]
const sampleScale: Vec3 = [1, 1, 1]
const poseSamplePlans = new WeakMap<CharacterRig, WeakMap<Set<string>, PoseSamplePlan>>()
const packedChannels = new WeakMap<AssimpChannel, PackedChannel>()
const upperPosePlans = new WeakMap<string[], UpperPosePlan>()
const waveDuration = 95 / 30
const waveLoopStart = 28 / 30
const waveLoopEnd = 62 / 30
const waveLoopDuration = waveLoopEnd - waveLoopStart

export function idleClip(rig: CharacterRig, index: number) {
  if (index === 0) {
    return rig.clips.stand
  }

  return rig.clips.dances[index - 1] ?? rig.clips.stand
}

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
  player: {
    position: Vec3
    turn: number
    motionBlend: number
    idleClipIndex?: number
    mode?: CharacterMode
    modeTime?: number
  },
  characterPoseJoints: string[],
  characterPoseJointSet: Set<string>,
  characterGroundJointIndices: number[],
  characterScale: number,
  basePose?: SampledPose,
  blendCache?: PoseBlendCache,
  placedPose?: Vec3[],
  cacheFrame = 0,
) {
  if (player.mode === 'jump') {
    const pose = sampleClipPose(rig, rig.clips[player.mode], player.modeTime ?? time, characterPoseJoints, characterPoseJointSet,
      blendCache?.get(cacheFrame) ?? placedPose)
    const startPose = sampleClipPose(rig, rig.clips[player.mode], 0, characterPoseJoints, characterPoseJointSet)

    blendCache?.set(cacheFrame, pose)

    return placeCharacterPose(pose, player.position, player.turn, characterPoseJoints, characterGroundJointIndices,
      characterScale, placedPose, poseGround(startPose, characterGroundJointIndices))
  }

  if (player.mode === 'manSitting' || player.mode === 'womanSitting') {
    const pose = sampleClipPose(rig, rig.clips[player.mode], player.modeTime ?? time, characterPoseJoints, characterPoseJointSet,
      blendCache?.get(cacheFrame) ?? placedPose)

    blendCache?.set(cacheFrame, pose)

    return placeCharacterPose(pose, player.position, player.turn, characterPoseJoints, characterGroundJointIndices,
      characterScale, placedPose)
  }

  const motionBlendKey = blendCache ? Math.round(player.motionBlend * 60) : 0
  const blendKey = cacheFrame * 100 + motionBlendKey
  const blend = blendCache ? motionBlendKey / 60 : player.motionBlend
  const cached = blendCache?.get(blendKey)

  if (cached) {
    return placeCharacterPose(cached, player.position, player.turn, characterPoseJoints, characterGroundJointIndices,
      characterScale, placedPose)
  }

  const base = basePose ?? sampleBasePose(rig, time, characterPoseJoints, characterPoseJointSet,
    player.idleClipIndex ?? 0, undefined, player.motionBlend > 0 || player.mode === 'wave' || player.mode === 'waveOut')
  const { stand } = base

  if (player.mode === 'wave' || player.mode === 'waveOut') {
    const run = base.run ?? sampleClipPose(rig, rig.clips.run, time, characterPoseJoints, characterPoseJointSet)
    const pose = blendCharacterPose(stand, run, player.motionBlend, characterPoseJoints)
    const wave = sampleClipPose(rig, rig.clips.wave, waveClipTime(player.mode, player.modeTime ?? time),
      characterPoseJoints, characterPoseJointSet)

    blendUpperPose(pose, wave, characterPoseJoints)

    return placeCharacterPose(pose, player.position, player.turn, characterPoseJoints, characterGroundJointIndices,
      characterScale, placedPose)
  }

  if (blend === 0) {
    return placeCharacterPose(stand, player.position, player.turn, characterPoseJoints, characterGroundJointIndices,
      characterScale, placedPose)
  }

  const run = base.run ?? sampleClipPose(rig, rig.clips.run, time, characterPoseJoints, characterPoseJointSet)

  if (!blendCache) {
    return placeBlendedCharacterPose(stand, run, blend, player.position, player.turn, characterPoseJoints,
      characterGroundJointIndices, characterScale, placedPose)
  }

  const pose = blendCharacterPose(stand, run, blend, characterPoseJoints)

  blendCache?.set(blendKey, pose)

  return placeCharacterPose(pose, player.position, player.turn, characterPoseJoints, characterGroundJointIndices,
    characterScale, placedPose)
}

function blendCharacterPose(stand: Vec3[], run: Vec3[], blend: number, characterPoseJoints: string[]) {
  const pose = createPose(characterPoseJoints.length)

  for (let i = 0; i < characterPoseJoints.length; i++) {
    const point = stand[i]!
    const next = run[i]!
    const target = pose[i]!

    target[0] = point[0] + (next[0] - point[0]) * blend
    target[1] = point[1] + (next[1] - point[1]) * blend
    target[2] = point[2] + (next[2] - point[2]) * blend
  }

  return pose
}

function blendUpperPose(pose: Vec3[], wave: Vec3[], characterPoseJoints: string[]) {
  const plan = upperPosePlan(characterPoseJoints)
  const anchor = pose[plan.anchorIndex]!
  const waveAnchor = wave[plan.anchorIndex]!

  for (const i of plan.indices) {
    const target = pose[i]!
    const source = wave[i]!

    target[0] = anchor[0] + source[0] - waveAnchor[0]
    target[1] = anchor[1] + source[1] - waveAnchor[1]
    target[2] = anchor[2] + source[2] - waveAnchor[2]
  }
}

function upperPosePlan(characterPoseJoints: string[]) {
  let plan = upperPosePlans.get(characterPoseJoints)

  if (plan) {
    return plan
  }

  const indices: number[] = []

  for (let i = 0; i < characterPoseJoints.length; i++) {
    if (upperPoseJoint(characterPoseJoints[i]!)) {
      indices.push(i)
    }
  }

  plan = {
    anchorIndex: characterPoseJoints.indexOf('mixamorig:Spine2'),
    indices,
  }
  upperPosePlans.set(characterPoseJoints, plan)

  return plan
}

function upperPoseJoint(name: string) {
  return name.includes('Shoulder') || name.includes('Arm') || name.includes('ForeArm') || name.includes('Hand')
    || name.includes('Neck') || name.includes('Head')
}

function waveClipTime(mode: CharacterMode | undefined, time: number) {
  if (mode === 'waveOut') {
    return Math.min(waveLoopEnd + time, waveDuration - 0.001)
  }

  if (time < waveLoopStart) {
    return time
  }

  return waveLoopStart + (time - waveLoopStart) % waveLoopDuration
}

function placeBlendedCharacterPose(
  stand: Vec3[],
  run: Vec3[],
  blend: number,
  position: Vec3,
  turn: number,
  characterPoseJoints: string[],
  characterGroundJointIndices: number[],
  characterScale: number,
  target = createPose(characterPoseJoints.length),
) {
  let ground = Infinity
  const sin = Math.sin(turn)
  const cos = Math.cos(turn)

  for (const index of characterGroundJointIndices) {
    const point = stand[index]!
    const next = run[index]!

    ground = Math.min(ground, point[1] + (next[1] - point[1]) * blend)
  }

  for (let i = 0; i < characterPoseJoints.length; i++) {
    const point = stand[i]!
    const next = run[i]!
    const x = (point[0] + (next[0] - point[0]) * blend) * characterScale
    const y = (point[1] + (next[1] - point[1]) * blend - ground) * characterScale
    const z = (point[2] + (next[2] - point[2]) * blend) * characterScale
    const placed = target[i]
    const px = position[0] + x * cos + z * sin
    const py = position[1] + y
    const pz = position[2] - x * sin + z * cos

    placed[0] = px
    placed[1] = py
    placed[2] = pz
  }

  return target
}

export function sampleBasePose(
  rig: CharacterRig,
  time: number,
  characterPoseJoints: string[],
  characterPoseJointSet: Set<string>,
  idleClipIndex = 0,
  target?: SampledPose,
  includeRun = true,
): SampledPose {
  return {
    run: includeRun
      ? sampleClipPose(rig, rig.clips.run, time, characterPoseJoints, characterPoseJointSet, target?.run)
      : target?.run,
    stand: sampleClipPose(rig, idleClip(rig, idleClipIndex), time, characterPoseJoints, characterPoseJointSet,
      target?.stand),
  }
}

export function sampleClipPose(rig: CharacterRig, clip: CharacterClip, time: number, characterPoseJoints: string[],
  characterPoseJointSet: Set<string>, target?: Vec3[])
{
  const tick = (time * clip.ticksPerSecond) % clip.duration
  const plan = getPoseSamplePlan(rig, characterPoseJoints, characterPoseJointSet)
  const channels = getPoseSampleChannels(clip, plan)
  const pose = target ?? createPose(characterPoseJoints.length)

  for (let i = 0; i < plan.entries.length; i++) {
    const entry = plan.entries[i]!
    const parent = entry.parentSlot < 0 ? identityMatrix : plan.entries[entry.parentSlot]!.world
    const channel = channels[i]
    const matrix = entry.helper
      ? parent
      : multiplyAffineInto(parent, channel ? sampleChannelTransform(entry.origin, channel, tick, entry.local) : entry.transform,
        entry.world)
    const poseSlot = entry.poseSlot

    entry.world = matrix

    if (poseSlot >= 0) {
      setTransformOrigin(matrix, pose, poseSlot)
    }
  }

  return pose
}

function setTransformOrigin(matrix: Mat4, target: Vec3[], index: number) {
  const point = target[index]

  point[0] = matrix[3]
  point[1] = matrix[7]
  point[2] = matrix[11]
}

function sampleChannelTransform(origin: Vec3, channel: PackedChannel, tick: number, target: Mat4) {
  return composeInto(
    channel.position ? sampleVec3TrackInto(channel.position, tick, samplePosition) : origin,
    channel.rotation ? sampleQuatTrackInto(channel.rotation, tick, sampleRotation) : identityQuat,
    channel.scale ? sampleVec3TrackInto(channel.scale, tick, sampleScale) : unitScale,
    target,
  )
}

function composeInto(position: Vec3, rotation: Quat, nextScale: Vec3, target: Mat4) {
  const w = rotation[0]
  const x = rotation[1]
  const y = rotation[2]
  const z = rotation[3]
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

function multiplyAffineInto(a: Mat4, b: Mat4, target: Mat4) {
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

  target[0] = a0 * b0 + a1 * b4 + a2 * b8
  target[1] = a0 * b1 + a1 * b5 + a2 * b9
  target[2] = a0 * b2 + a1 * b6 + a2 * b10
  target[3] = a0 * b3 + a1 * b7 + a2 * b11 + a3
  target[4] = a4 * b0 + a5 * b4 + a6 * b8
  target[5] = a4 * b1 + a5 * b5 + a6 * b9
  target[6] = a4 * b2 + a5 * b6 + a6 * b10
  target[7] = a4 * b3 + a5 * b7 + a6 * b11 + a7
  target[8] = a8 * b0 + a9 * b4 + a10 * b8
  target[9] = a8 * b1 + a9 * b5 + a10 * b9
  target[10] = a8 * b2 + a9 * b6 + a10 * b10
  target[11] = a8 * b3 + a9 * b7 + a10 * b11 + a11
  target[12] = 0
  target[13] = 0
  target[14] = 0
  target[15] = 1

  return target
}

function sampleVec3TrackInto(track: PackedVec3Track, tick: number, target: Vec3): Vec3 {
  const times = track.times
  const values = track.values

  if (times.length === 1 || tick <= times[0]!) {
    return setPackedVec3(values, 0, target)
  }

  const lastIndex = times.length - 1

  if (tick >= times[lastIndex]!) {
    return setPackedVec3(values, lastIndex * 3, target)
  }

  const index = nextPackedKeyIndex(track, tick)

  if (index > 0) {
    const fromIndex = index - 1
    const fromOffset = fromIndex * 3
    const toOffset = index * 3
    const fromTime = times[fromIndex]!
    const toTime = times[index]!
    const t = (tick - fromTime) / (toTime - fromTime)

    target[0] = values[fromOffset]! + (values[toOffset]! - values[fromOffset]!) * t
    target[1] = values[fromOffset + 1]! + (values[toOffset + 1]! - values[fromOffset + 1]!) * t
    target[2] = values[fromOffset + 2]! + (values[toOffset + 2]! - values[fromOffset + 2]!) * t

    return target
  }

  return setPackedVec3(values, lastIndex * 3, target)
}

function sampleQuatTrackInto(track: PackedQuatTrack, tick: number, target: Quat): Quat {
  const times = track.times
  const values = track.values

  if (times.length === 1 || tick <= times[0]!) {
    return setPackedQuat(values, 0, target)
  }

  const lastIndex = times.length - 1

  if (tick >= times[lastIndex]!) {
    return setPackedQuat(values, lastIndex * 4, target)
  }

  const index = nextPackedKeyIndex(track, tick)

  if (index > 0) {
    const fromIndex = index - 1
    const fromOffset = fromIndex * 4
    const toOffset = index * 4
    const fromTime = times[fromIndex]!
    const toTime = times[index]!
    const t = (tick - fromTime) / (toTime - fromTime)

    return slerpPackedInto(values, fromOffset, toOffset, t, target)
  }

  return setPackedQuat(values, lastIndex * 4, target)
}

function setPackedVec3(values: Float64Array, offset: number, target: Vec3): Vec3 {
  target[0] = values[offset]!
  target[1] = values[offset + 1]!
  target[2] = values[offset + 2]!

  return target
}

function setPackedQuat(values: Float64Array, offset: number, target: Quat): Quat {
  target[0] = values[offset]!
  target[1] = values[offset + 1]!
  target[2] = values[offset + 2]!
  target[3] = values[offset + 3]!

  return target
}

function slerpPackedInto(values: Float64Array, fromOffset: number, toOffset: number, t: number, target: Quat) {
  const aw = values[fromOffset]!
  const ax = values[fromOffset + 1]!
  const ay = values[fromOffset + 2]!
  const az = values[fromOffset + 3]!
  let bw = values[toOffset]!
  let bx = values[toOffset + 1]!
  let by = values[toOffset + 2]!
  let bz = values[toOffset + 3]!
  let value = aw * bw + ax * bx + ay * by + az * bz

  if (value < 0) {
    value = -value
    bw = -bw
    bx = -bx
    by = -by
    bz = -bz
  }

  if (value > 0.9995) {
    target[0] = aw + (bw - aw) * t
    target[1] = ax + (bx - ax) * t
    target[2] = ay + (by - ay) * t
    target[3] = az + (bz - az) * t

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

  target[0] = aw * from + bw * to
  target[1] = ax * from + bx * to
  target[2] = ay * from + by * to
  target[3] = az * from + bz * to

  return target
}

export function placeCharacterPose(
  pose: Vec3[],
  position: Vec3,
  turn: number,
  characterPoseJoints: string[],
  characterGroundJointIndices: number[],
  characterScale: number,
  target = createPose(characterPoseJoints.length),
  ground = poseGround(pose, characterGroundJointIndices),
) {
  const sin = Math.sin(turn)
  const cos = Math.cos(turn)

  for (let i = 0; i < characterPoseJoints.length; i++) {
    const point = pose[i]!
    const x = point[0] * characterScale
    const y = (point[1] - ground) * characterScale
    const z = point[2] * characterScale

    const next = target[i]
    const px = position[0] + x * cos + z * sin
    const py = position[1] + y
    const pz = position[2] - x * sin + z * cos

    next[0] = px
    next[1] = py
    next[2] = pz
  }

  return target
}

function poseGround(pose: Vec3[], characterGroundJointIndices: number[]) {
  let ground = Infinity

  for (const index of characterGroundJointIndices) {
    ground = Math.min(ground, pose[index]![1])
  }

  return ground
}

function createPose(length: number) {
  return Array.from({ length }, () => [0, 0, 0] as Vec3)
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
    const entries: PoseSampleEntry[] = []
    const nodeSlots = new Array<number>(rig.nodes.length).fill(-1)

    for (const index of indices) {
      const node = rig.nodes[index]!
      const slot = entries.length
      const parentSlot = node.parent < 0 ? -1 : nodeSlots[node.parent]!

      nodeSlots[index] = slot
      entries.push({
        helper: node.helper,
        local: identity(),
        name: node.name,
        origin: node.origin,
        parentSlot,
        poseSlot: !node.helper && characterPoseJointSet.has(node.name) ? characterPoseJoints.indexOf(node.name) : -1,
        transform: node.transform,
        world: identity(),
      })
    }

    plan = {
      channels: new WeakMap(),
      entries,
    }
    bySet.set(characterPoseJointSet, plan)
  }

  return plan
}

function getPoseSampleChannels(clip: CharacterClip, plan: PoseSamplePlan) {
  let channels = plan.channels.get(clip)

  if (!channels) {
    channels = new Array<PackedChannel | undefined>(plan.entries.length)

    for (let i = 0; i < plan.entries.length; i++) {
      const channel = clip.channels.get(plan.entries[i]!.name)

      channels[i] = channel ? packedChannel(channel) : undefined
    }

    plan.channels.set(clip, channels)
  }

  return channels
}

function packedChannel(channel: AssimpChannel) {
  let packed = packedChannels.get(channel)

  if (!packed) {
    packed = {
      position: channel.positionkeys?.length ? packVec3Track(channel.positionkeys) : undefined,
      rotation: channel.rotationkeys?.length ? packQuatTrack(channel.rotationkeys) : undefined,
      scale: channel.scalingkeys?.length ? packVec3Track(channel.scalingkeys) : undefined,
    }
    packedChannels.set(channel, packed)
  }

  return packed
}

function packVec3Track(keys: [number, Vec3][]): PackedVec3Track {
  const times = new Float64Array(keys.length)
  const values = new Float64Array(keys.length * 3)

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!
    const offset = i * 3

    times[i] = key[0]
    values[offset] = key[1][0]
    values[offset + 1] = key[1][1]
    values[offset + 2] = key[1][2]
  }

  return {
    start: times[0]!,
    stepInverse: uniformStepInverse(times),
    times,
    values,
  }
}

function packQuatTrack(keys: [number, Quat][]): PackedQuatTrack {
  const times = new Float64Array(keys.length)
  const values = new Float64Array(keys.length * 4)

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!
    const offset = i * 4
    const value = key[1]
    const length = Math.hypot(value[0], value[1], value[2], value[3])

    times[i] = key[0]
    values[offset] = value[0] / length
    values[offset + 1] = value[1] / length
    values[offset + 2] = value[2] / length
    values[offset + 3] = value[3] / length
  }

  return {
    start: times[0]!,
    stepInverse: uniformStepInverse(times),
    times,
    values,
  }
}

function uniformStepInverse(times: Float64Array) {
  const step = times.length > 2 ? times[1]! - times[0]! : 0

  if (step <= 0) {
    return 0
  }

  for (let i = 2; i < times.length; i++) {
    if (Math.abs(times[i]! - times[i - 1]! - step) > 0.000000001) {
      return 0
    }
  }

  return 1 / step
}

function nextPackedKeyIndex(track: PackedVec3Track | PackedQuatTrack, tick: number) {
  const times = track.times

  if (track.stepInverse > 0) {
    const index = Math.ceil((tick - track.start) * track.stepInverse)

    if (index > 0 && index < times.length && tick <= times[index]! && tick > times[index - 1]!) {
      return index
    }
  }

  let low = 1
  let high = times.length - 1

  while (low < high) {
    const middle = (low + high) >> 1

    if (tick <= times[middle]!) {
      high = middle
    }
    else {
      low = middle + 1
    }
  }

  return tick <= times[low]! ? low : -1
}

function isAssimpHelper(node: AssimpNode) {
  return node.name.includes('$AssimpFbx$')
}
