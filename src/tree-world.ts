import { loadAssimpScene } from './assimp-loader.ts'
import { characterFloor } from './character-data.ts'
import { triangleAreaSquared } from './character-geometry.ts'
import { outsideMotif } from './constants.ts'
import { add } from './math.ts'
import { landscapeBounds, roomBounds } from './scene-data.ts'
import { addTreeShadowReceiver, createTreeMeshes, treeCollision, treeMeshColor, uploadTreeShadowMap } from './tree-object.ts'
import type { CircleBounds, Vec3, Vertex } from './types.ts'

type OutsideTreeOptions = {
  color: (index: number) => Vec3
  height: number
  name: string
  path: string
  shadow: boolean
  sourceUp: 'y' | 'z'
}

export async function loadOutsideTree(
  gl: WebGL2RenderingContext,
  treeShadowMap: WebGLTexture,
  vertices: Vertex[],
  outsideTree: CircleBounds,
  addSunLitTriangle: (target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3, tree: CircleBounds) => void,
  options: OutsideTreeOptions = {
    color: index => treeMeshColor(index),
    height: 12.9,
    name: 'trees.fbx',
    path: '/trees.fbx',
    shadow: true,
    sourceUp: 'z',
  },
) {
  const trees = await loadAssimpScene(options.path, options.name)
  const meshes = createTreeMeshes(trees, options.name, options.height, options.color, options.sourceUp)
  const positionY = options.sourceUp === 'y' ? characterFloor : characterFloor + options.height * 0.287
  const position: Vec3 = [outsideTree.x, positionY, outsideTree.z]
  const collision = treeCollision(meshes, position)

  if (options.shadow && outsideMotif !== 'night') {
    uploadTreeShadowMap(gl, treeShadowMap, meshes, position, characterFloor, landscapeBounds, roomBounds.front)
    addTreeShadowReceiver(vertices, characterFloor, landscapeBounds)
  }

  for (const mesh of meshes) {
    for (const face of mesh.faces) {
      const a = add(position, mesh.points[face[0]!]!)
      const b = add(position, mesh.points[face[1]!]!)
      const c = add(position, mesh.points[face[2]!]!)

      if (triangleAreaSquared(a, b, c) > 0.00000001) {
        addSunLitTriangle(vertices, a, b, c, mesh.color, collision)
      }
    }
  }

  return collision
}
