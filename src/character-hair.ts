import { scale, subtract } from './math.ts'
import type { AssimpMesh, AssimpScene, HairInstance, HairMesh, HairRenderMesh, Vec3 } from './types.ts'

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

  return {
    name: `${source}:${mesh.name}`,
    points: normalizeHairPoints(points, turnRightSideForward),
    faces: mesh.faces.filter(face => face.length === 3),
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

  const data: number[] = []

  for (const face of mesh.faces) {
    const a = hairLocalPoint(mesh.points[face[0]!]!)
    const b = hairLocalPoint(mesh.points[face[1]!]!)
    const c = hairLocalPoint(mesh.points[face[2]!]!)

    data.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
  }

  context.bindVertexArray(array)
  context.bindBuffer(context.ARRAY_BUFFER, vertexBuffer)
  context.bufferData(context.ARRAY_BUFFER, new Float32Array(data), context.STATIC_DRAW)
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
    vertexCount: data.length / 3,
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
  hairInstances: HairInstance[],
) {
  const grouped = Array.from({ length: hairRenderMeshes.length }, () => [] as number[])

  for (const instance of hairInstances) {
    const data = grouped[instance.meshIndex]!

    data.push(
      instance.center[0],
      instance.center[1],
      instance.center[2],
      instance.side[0],
      instance.side[1],
      instance.side[2],
      instance.up[0],
      instance.up[1],
      instance.up[2],
      instance.forward[0],
      instance.forward[1],
      instance.forward[2],
      instance.color[0],
      instance.color[1],
      instance.color[2],
    )
  }

  for (let i = 0; i < hairRenderMeshes.length; i++) {
    const mesh = hairRenderMeshes[i]!
    const data = grouped[i]!

    mesh.instanceCount = data.length / 15
    context.bindBuffer(context.ARRAY_BUFFER, mesh.instanceBuffer)
    context.bufferData(context.ARRAY_BUFFER, new Float32Array(data), context.DYNAMIC_DRAW)
  }
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
