import { uploadFloatBuffer } from './character-gpu.ts'
import type { NumberBufferCache } from './character-gpu.ts'
import { scale, subtract } from './math.ts'
import type { AssimpMesh, AssimpScene, HairMesh, HairRenderMesh, Vec3 } from './types.ts'

export type HairInstanceUploadCache = {
  buffers: Float32Array[]
  counts: number[]
  uploads: NumberBufferCache[]
}
type HairInstanceRange = {
  data: Float32Array
  length: number
}

export function createHairMeshes(scene: AssimpScene, source: string): HairMesh[] {
  const meshes = scene.meshes!.filter(mesh => mesh.name.toLowerCase().includes('hair'))
    .filter((_, index) => !removedHairStyles.has(`${source}:${index}`))
    .map(mesh => createHairMesh(mesh, source))

  if (meshes.length === 0) {
    throw new Error('Hair FBX has no hair meshes')
  }

  return meshes
}

const removedHairStyles = new Set([
  'man:1',
  'man:2',
  'man:5',
  'woman:2',
])

function createHairMesh(mesh: AssimpMesh, source: string): HairMesh {
  const points: Vec3[] = []
  const turnRightSideForward = source === 'man' && mesh.name === 'Wolf3D_Hair.009'

  for (let i = 0; i < mesh.vertices.length; i += 3) {
    points.push([mesh.vertices[i]!, mesh.vertices[i + 1]!, mesh.vertices[i + 2]!])
  }

  const localPoints = normalizeHairPoints(points, turnRightSideForward).map(hairLocalPoint)
  const localTriangles: number[] = []

  for (const face of mesh.faces) {
    if (face.length === 3) {
      const a = localPoints[face[0]!]!
      const b = localPoints[face[1]!]!
      const c = localPoints[face[2]!]!

      localTriangles.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
    }
  }

  return {
    index: -1,
    name: `${source}:${mesh.name}`,
    localTriangles: new Float32Array(localTriangles),
  }
}

export function createHairRenderMeshes(context: WebGL2RenderingContext, meshes: HairMesh[]) {
  return meshes.map(mesh => createHairRenderMesh(context, mesh))
}

function createHairRenderMesh(context: WebGL2RenderingContext, mesh: HairMesh): HairRenderMesh {
  const array = context.createVertexArray()
  const vertexBuffer = context.createBuffer()
  const instanceBuffer = context.createBuffer()

  if (!array || !vertexBuffer || !instanceBuffer) {
    throw new Error('Failed to create hair render mesh')
  }

  context.bindVertexArray(array)
  context.bindBuffer(context.ARRAY_BUFFER, vertexBuffer)
  context.bufferData(context.ARRAY_BUFFER, mesh.localTriangles, context.STATIC_DRAW)
  context.enableVertexAttribArray(0)
  context.vertexAttribPointer(0, 3, context.FLOAT, false, 0, 0)

  context.bindBuffer(context.ARRAY_BUFFER, instanceBuffer)
  context.bufferData(context.ARRAY_BUFFER, 0, context.DYNAMIC_DRAW)

  for (let i = 0; i < 5; i++) {
    const location = i + 1

    context.enableVertexAttribArray(location)
    context.vertexAttribPointer(location, 3, context.FLOAT, false, 15 * Float32Array.BYTES_PER_ELEMENT,
      i * 3 * Float32Array.BYTES_PER_ELEMENT)
    context.vertexAttribDivisor(location, 1)
  }

  context.bindVertexArray(null)

  return {
    array,
    vertexBuffer,
    instanceBuffer,
    vertexCount: mesh.localTriangles.length / 3,
    instanceCount: 0,
  }
}

export function hairLocalPoint(point: Vec3): Vec3 {
  const scaleAmount = 1.4
  const x = point[0] * scaleAmount
  const z = -(point[2] - 0.02) * scaleAmount - 0.055
  const y = (point[1] + 0.08) * scaleAmount - Math.max(0, z) * 0.28

  return [x, y, z]
}

export function updateHairInstances(
  context: WebGL2RenderingContext,
  hairRenderMeshes: HairRenderMesh[],
  hairInstances: HairInstanceRange,
  cache?: HairInstanceUploadCache,
) {
  const uploadCache = cache ?? {
    buffers: Array.from({ length: hairRenderMeshes.length }, () => new Float32Array(0)),
    counts: new Array<number>(hairRenderMeshes.length).fill(0),
    uploads: [],
  }

  resizeHairInstanceBuffers(uploadCache, hairRenderMeshes.length)

  const data = hairInstances.data

  for (let i = 0; i < hairInstances.length; i += 16) {
    const meshIndex = data[i]!
    const offset = uploadCache.counts[meshIndex]!
    const buffer = growHairInstanceBuffer(uploadCache, meshIndex, offset + 15)

    buffer[offset] = data[i + 1]!
    buffer[offset + 1] = data[i + 2]!
    buffer[offset + 2] = data[i + 3]!
    buffer[offset + 3] = data[i + 4]!
    buffer[offset + 4] = data[i + 5]!
    buffer[offset + 5] = data[i + 6]!
    buffer[offset + 6] = data[i + 7]!
    buffer[offset + 7] = data[i + 8]!
    buffer[offset + 8] = data[i + 9]!
    buffer[offset + 9] = data[i + 10]!
    buffer[offset + 10] = data[i + 11]!
    buffer[offset + 11] = data[i + 12]!
    buffer[offset + 12] = data[i + 13]!
    buffer[offset + 13] = data[i + 14]!
    buffer[offset + 14] = data[i + 15]!
    uploadCache.counts[meshIndex] = offset + 15
  }

  for (let i = 0; i < hairRenderMeshes.length; i++) {
    const mesh = hairRenderMeshes[i]!
    const count = uploadCache.counts[i]!

    mesh.instanceCount = count / 15
    if (count === 0) {
      continue
    }

    const buffer = uploadCache.buffers[i]!
    const upload = uploadCache.uploads[i] ??= { data: buffer }

    upload.data = buffer
    uploadFloatBuffer(context, mesh.instanceBuffer, buffer, upload, count)
  }
}

function resizeHairInstanceBuffers(cache: HairInstanceUploadCache, length: number) {
  while (cache.buffers.length < length) {
    cache.buffers.push(new Float32Array(0))
    cache.counts.push(0)
  }

  for (let i = 0; i < length; i++) {
    cache.counts[i] = 0
  }
}

function growHairInstanceBuffer(cache: HairInstanceUploadCache, index: number, length: number) {
  if (cache.buffers[index]!.length < length) {
    cache.buffers[index] = new Float32Array(length)
  }

  return cache.buffers[index]!
}

export function normalizeHairPoints(points: Vec3[], turnRightSideForward: boolean): Vec3[] {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]

  for (const point of points) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], point[i])
      max[i] = Math.max(max[i], point[i])
    }
  }

  const center: Vec3 = [
    (min[0] + max[0]) * 0.5,
    (min[1] + max[1]) * 0.5,
    (min[2] + max[2]) * 0.5,
  ]
  const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2])
  const amount = Math.min(1, 0.45 / span)

  return points.map(point => {
    const next = scale(subtract(point, center), amount)

    return turnRightSideForward ? [-next[2], -next[1], next[0]] : next
  })
}
