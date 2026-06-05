import { loadAssimpScene, loadAssimpScenes } from './assimp-loader.ts'
import { triangleAreaSquared } from './character-geometry.ts'
import { add, compose, identity, mix, multiply, nodeTransform, slerp, transformOrigin } from './math.ts'
import type { AssimpChannel, AssimpMesh, AssimpNode, AssimpScene, CircleBounds, Mat4, Quat, Vec3, Vertex } from './types.ts'

type StaticMesh = {
  color: Vec3
  faces: number[][]
  points: Vec3[]
}

type MeshInstance = {
  index: number
  transform: Mat4
}

type StaticObjectOptions = {
  animationPath?: string
  animationTime?: number
  color: Vec3 | ((meshIndex: number) => Vec3)
  height: number
  lightBounds: CircleBounds
  meshIndex?: number
  nodeTransforms?: boolean
  path: string
  position: Vec3
  sourceUp: 'y' | 'z'
  turn: number
}

export async function loadStaticFbxObject(
  target: Vertex[],
  options: StaticObjectOptions,
  addSunLitTriangle: (target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3, tree: CircleBounds) => void,
) {
  const [scene, pose] = options.animationPath
    ? await loadAssimpScenes([
      { path: options.path, name: options.path.slice(1) },
      { path: options.animationPath, name: options.animationPath.slice(1) },
    ])
    : [await loadAssimpScene(options.path, options.path.slice(1)), undefined]

  addStaticFbxObject(target, scene!, options, addSunLitTriangle, pose)
}

export async function loadStaticFbxObjectWithPose(
  target: Vertex[],
  options: StaticObjectOptions & { animationPath: string },
  addSunLitTriangle: (target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3, tree: CircleBounds) => void,
) {
  await loadStaticFbxObject(target, options, addSunLitTriangle)
}

export async function loadStaticFbxObjects(
  target: Vertex[],
  path: string,
  options: StaticObjectOptions[],
  addSunLitTriangle: (target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3, tree: CircleBounds) => void,
) {
  const scene = await loadAssimpScene(path, path.slice(1))

  for (const option of options) {
    addStaticFbxObject(target, scene, option, addSunLitTriangle)
  }
}

function addStaticFbxObject(
  target: Vertex[],
  scene: AssimpScene,
  options: StaticObjectOptions,
  addSunLitTriangle: (target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3, tree: CircleBounds) => void,
  pose?: AssimpScene,
) {
  const meshes = createStaticMeshes(scene, options, pose)

  for (const mesh of meshes) {
    for (const face of mesh.faces) {
      const a = add(options.position, mesh.points[face[0]!]!)
      const b = add(options.position, mesh.points[face[1]!]!)
      const c = add(options.position, mesh.points[face[2]!]!)

      if (triangleAreaSquared(a, b, c) > 0.00000001) {
        addSunLitTriangle(target, a, b, c, mesh.color, options.lightBounds)
      }
    }
  }
}

function createStaticMeshes(scene: AssimpScene, options: StaticObjectOptions, pose?: AssimpScene): StaticMesh[] {
  const poseMatrices = pose ? createPoseMatrices(scene.rootnode, pose, options.animationTime ?? 0) : undefined
  const instances = collectMeshInstances(scene.rootnode)
  const meshInstances = options.nodeTransforms && instances.length > 0
    ? instances
    : scene.meshes!.map((_, index) => ({ index, transform: identity() }))
  const meshes = meshInstances.map(instance => {
    const mesh = scene.meshes![instance.index]!
    const points = poseMatrices && mesh.bones?.length
      ? skinMeshPoints(mesh, poseMatrices)
      : meshPoints(mesh, instance.transform)

    return {
      points,
      faces: mesh.faces.filter(face => face.length === 3),
      color: typeof options.color === 'function' ? options.color(instance.index) : options.color,
    }
  })

  if (meshes.length === 0) {
    throw new Error(`${options.path} has no meshes`)
  }

  const normalized = normalizeStaticMeshes(meshes, options.height, options.sourceUp, options.turn)

  return options.meshIndex === undefined ? normalized : [normalized[options.meshIndex % normalized.length]!]
}

function skinMeshPoints(mesh: AssimpMesh, poseMatrices: Map<string, Mat4>): Vec3[] {
  const points = Array.from({ length: mesh.vertices.length / 3 }, (): Vec3 => [0, 0, 0])
  const weights = new Array<number>(points.length).fill(0)

  for (const bone of mesh.bones!) {
    const pose = poseMatrices.get(bone.name)

    if (!pose) {
      throw new Error(`Missing pose matrix for ${bone.name}`)
    }

    const transform = multiply(pose, bone.offsetmatrix)

    for (const [index, amount] of bone.weights) {
      const point = transformPoint(vertexPoint(mesh, index), transform)

      points[index]![0] += point[0] * amount
      points[index]![1] += point[1] * amount
      points[index]![2] += point[2] * amount
      weights[index]! += amount
    }
  }

  for (let i = 0; i < points.length; i++) {
    const weight = weights[i]!

    if (weight === 0) {
      points[i] = vertexPoint(mesh, i)
    }
    else {
      points[i]![0] /= weight
      points[i]![1] /= weight
      points[i]![2] /= weight
    }
  }

  return points
}

function vertexPoint(mesh: AssimpMesh, index: number): Vec3 {
  const i = index * 3

  return [mesh.vertices[i]!, mesh.vertices[i + 1]!, mesh.vertices[i + 2]!]
}

function createPoseMatrices(root: AssimpNode, pose: AssimpScene, time: number) {
  const animation = pose.animations?.[0]

  if (!animation) {
    throw new Error('Pose scene has no animation')
  }

  const channels = new Map((animation.channels ?? []).map(channel => [channel.name, channel]))
  const sourceNodes = collectNodes(pose.rootnode)
  const tick = (time * (animation.tickspersecond ?? 30)) % (animation.duration ?? 1)
  const matrices = new Map<string, Mat4>()

  const visit = (node: AssimpNode, parent: Mat4) => {
    const local = sampleRetargetedLocal(node, sourceNodes.get(node.name), channels.get(node.name), tick)
    const matrix = multiply(parent, local)

    matrices.set(node.name, matrix)

    for (const child of node.children ?? []) {
      visit(child, matrix)
    }
  }

  visit(root, identity())

  return matrices
}

function sampleRetargetedLocal(target: AssimpNode, source: AssimpNode | undefined, channel: AssimpChannel | undefined,
  tick: number)
{
  const targetBind = nodeTransform(target)

  if (!source || !channel || !retargetStatueBone(target.name)) {
    return targetBind
  }

  const sourceBind = nodeTransform(source)
  const targetPosition = transformOrigin(targetBind)
  const rotation = multiplyQuat(
    multiplyQuat(matrixQuat(targetBind), inverseQuat(matrixQuat(sourceBind))),
    sampleQuat(channel.rotationkeys, tick, matrixQuat(sourceBind)),
  )

  return compose(targetPosition, rotation, [1, 1, 1])
}

function retargetStatueBone(name: string) {
  return name.includes('Spine')
    || name.includes('Neck')
    || name.includes('Head')
    || name.includes('Arm')
    || name.includes('Hand')
}

function collectNodes(root: AssimpNode) {
  const nodes = new Map<string, AssimpNode>()
  const visit = (node: AssimpNode) => {
    nodes.set(node.name, node)

    for (const child of node.children ?? []) {
      visit(child)
    }
  }

  visit(root)

  return nodes
}

function matrixQuat(matrix: Mat4): Quat {
  const trace = matrix[0] + matrix[5] + matrix[10]

  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2

    return [0.25 * s, (matrix[9] - matrix[6]) / s, (matrix[2] - matrix[8]) / s, (matrix[4] - matrix[1]) / s]
  }

  if (matrix[0] > matrix[5] && matrix[0] > matrix[10]) {
    const s = Math.sqrt(1 + matrix[0] - matrix[5] - matrix[10]) * 2

    return [(matrix[9] - matrix[6]) / s, 0.25 * s, (matrix[1] + matrix[4]) / s, (matrix[2] + matrix[8]) / s]
  }

  if (matrix[5] > matrix[10]) {
    const s = Math.sqrt(1 + matrix[5] - matrix[0] - matrix[10]) * 2

    return [(matrix[2] - matrix[8]) / s, (matrix[1] + matrix[4]) / s, 0.25 * s, (matrix[6] + matrix[9]) / s]
  }

  const s = Math.sqrt(1 + matrix[10] - matrix[0] - matrix[5]) * 2

  return [(matrix[4] - matrix[1]) / s, (matrix[2] + matrix[8]) / s, (matrix[6] + matrix[9]) / s, 0.25 * s]
}

function inverseQuat(quat: Quat): Quat {
  const lengthSq = quat[0] * quat[0] + quat[1] * quat[1] + quat[2] * quat[2] + quat[3] * quat[3]

  return [quat[0] / lengthSq, -quat[1] / lengthSq, -quat[2] / lengthSq, -quat[3] / lengthSq]
}

function multiplyQuat(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ]
}

function sampleVec3(keys: [number, Vec3][] | undefined, tick: number, fallback: Vec3): Vec3 {
  if (!keys?.length) {
    return fallback
  }

  if (keys.length === 1 || tick <= keys[0]![0]) {
    return keys[0]![1]
  }

  const index = nextKeyIndex(keys, tick)

  if (index < 0) {
    return keys[keys.length - 1]![1]
  }

  const from = keys[index - 1]!
  const to = keys[index]!
  const amount = (tick - from[0]) / (to[0] - from[0])

  return [
    mix(from[1][0], to[1][0], amount),
    mix(from[1][1], to[1][1], amount),
    mix(from[1][2], to[1][2], amount),
  ]
}

function sampleQuat(keys: [number, Quat][] | undefined, tick: number, fallback: Quat): Quat {
  if (!keys?.length) {
    return fallback
  }

  if (keys.length === 1 || tick <= keys[0]![0]) {
    return keys[0]![1]
  }

  const index = nextKeyIndex(keys, tick)

  if (index < 0) {
    return keys[keys.length - 1]![1]
  }

  const from = keys[index - 1]!
  const to = keys[index]!

  return slerp(from[1], to[1], (tick - from[0]) / (to[0] - from[0]))
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

function meshPoints(mesh: AssimpMesh, transform: Mat4): Vec3[] {
  const points: Vec3[] = []

  for (let i = 0; i < mesh.vertices.length; i += 3) {
    points.push(transformPoint([
      mesh.vertices[i]!,
      mesh.vertices[i + 1]!,
      mesh.vertices[i + 2]!,
    ], transform))
  }

  return points
}

function collectMeshInstances(root: AssimpNode): MeshInstance[] {
  const instances: MeshInstance[] = []
  const visit = (node: AssimpNode, parent: Mat4) => {
    const transform = multiply(parent, nodeTransform(node))

    for (const index of node.meshes ?? []) {
      instances.push({ index, transform })
    }

    for (const child of node.children ?? []) {
      visit(child, transform)
    }
  }

  visit(root, identity())

  return instances
}

function transformPoint(point: Vec3, transform: Mat4): Vec3 {
  return [
    transform[0] * point[0] + transform[1] * point[1] + transform[2] * point[2] + transform[3],
    transform[4] * point[0] + transform[5] * point[1] + transform[6] * point[2] + transform[7],
    transform[8] * point[0] + transform[9] * point[1] + transform[10] * point[2] + transform[11],
  ]
}

function normalizeStaticMeshes(meshes: StaticMesh[], height: number, sourceUp: 'y' | 'z', turn: number): StaticMesh[] {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]

  for (const mesh of meshes) {
    for (const point of mesh.points) {
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], point[i])
        max[i] = Math.max(max[i], point[i])
      }
    }
  }

  const centerX = (min[0] + max[0]) * 0.5
  const zUp = sourceUp === 'z'
  const centerZ = (min[2] + max[2]) * 0.5
  const sourceHeight = zUp ? max[2] - min[2] : max[1] - min[1]
  const amount = height / sourceHeight
  const turnX = Math.cos(turn)
  const turnZ = Math.sin(turn)

  return meshes.map(mesh => ({
    points: mesh.points.map(point => {
      const x = (point[0] - centerX) * amount
      const y = zUp ? (point[2] - min[2]) * amount : (point[1] - min[1]) * amount
      const z = zUp ? -(point[1] - (min[1] + max[1]) * 0.5) * amount : (point[2] - centerZ) * amount

      return [
        x * turnX - z * turnZ,
        y,
        x * turnZ + z * turnX,
      ]
    }),
    faces: mesh.faces,
    color: mesh.color,
  }))
}
