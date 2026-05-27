import { loadCharacterAssets } from './character-assets.ts'
import { buildCharacterDrawData } from './character-draw.ts'
import type { CharacterDrawCache } from './character-draw.ts'
import { uploadFloatBuffer } from './character-gpu.ts'
import type { NumberBufferCache } from './character-gpu.ts'
import { createCharacterHairController } from './character-hair-control.ts'
import { updateHairInstances } from './character-hair.ts'
import type { HairInstanceUploadCache } from './character-hair.ts'
import { createCharacterStyleController } from './character-style.ts'
import { createLocalCharacter } from './local-character.ts'
import type { CharacterRig, HairRenderMesh, Player, Vec3 } from './types.ts'
import type { VertexWriter } from './character-geometry.ts'

export function createCharacterRenderSystem(options: {
  boxInstanceBuffer: WebGLBuffer
  boxInstanceSize: number
  buffer: WebGLBuffer
  camera: {
    position: Vec3
    target: Vec3
  }
  canvas: HTMLCanvasElement
  characterPosition: Vec3
  gl: WebGL2RenderingContext
  hairController: ReturnType<typeof createCharacterHairController>
  idleClipIndex: () => number
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3
  localCharacter: ReturnType<typeof createLocalCharacter>
  players: Player[]
  styleController: ReturnType<typeof createCharacterStyleController>
  vertexSize: number
}) {
  let rig: CharacterRig | undefined
  let hairRenderMeshes: HairRenderMesh[] = []
  let rigLoad: Promise<CharacterRig> | undefined
  let boxInstanceCount = 0
  let assetsLoaded = false
  const boxInstanceCache: NumberBufferCache = { data: new Float32Array(0) }
  const vertexUploadCache: NumberBufferCache = { data: new Float32Array(0) }
  const drawCache: CharacterDrawCache = {
    basePose: undefined,
    basePoses: new Map(),
    boxInstances: { data: new Float32Array(0), length: 0 },
    hairInstances: { data: new Float32Array(0), length: 0 },
    npcBlendCache: new Map(),
    poses: [],
    usedBasePoseKeys: new Set(),
    usedNpcBlendKeys: new Set(),
    vertices: { data: new Float32Array(0), length: 0 },
  }
  const hairInstanceCache: HairInstanceUploadCache = { buffers: [], counts: [], uploads: [] }
  const vertexWriter: VertexWriter = drawCache.vertices

  async function loadAssets(hairIndex: number) {
    const assets = await loadCharacterAssets(options.gl, hairIndex)

    hairRenderMeshes = assets.hairRenderMeshes
    options.hairController.setMeshes(assets.hairMeshes, assets.hairIndex)
    assetsLoaded = true
    options.hairController.log()

    return assets.rig
  }

  function loadOnce(onLoaded?: () => void) {
    rigLoad ??= loadAssets(options.hairController.index).then(next => {
      rig = next
      onLoaded?.()

      return next
    })

    return rigLoad
  }

  function update(time: number) {
    if (!rig) {
      return 0
    }

    const data = buildCharacterDrawData({
      cameraPosition: options.camera.position,
      cameraTarget: options.camera.target,
      character: {
        position: options.characterPosition,
        turn: options.localCharacter.turn,
        motionBlend: options.localCharacter.motionBlend,
        mode: options.localCharacter.mode,
        idleClipIndex: options.idleClipIndex(),
        style: {
          topStyleIndex: options.styleController.topStyleIndex,
          bottomStyleIndex: options.styleController.bottomStyleIndex,
          hairIndex: options.hairController.index,
          hairColorIndex: options.hairController.colorIndex,
        },
      },
      hairMeshes: options.hairController.meshes,
      height: options.canvas.height,
      light: options.light,
      players: options.players,
      rig,
      time,
      drawCache,
      vertexWriter,
      width: options.canvas.width,
    })

    updateHairInstances(options.gl, hairRenderMeshes, data.hairInstances, hairInstanceCache)
    boxInstanceCount = data.boxInstances.length / options.boxInstanceSize
    uploadFloatBuffer(options.gl, options.boxInstanceBuffer, data.boxInstances, boxInstanceCache)

    uploadFloatBuffer(options.gl, options.buffer, data.vertices, vertexUploadCache)

    return data.vertices.length / options.vertexSize
  }

  return {
    get assetsLoaded() {
      return assetsLoaded
    },
    get boxInstanceCount() {
      return boxInstanceCount
    },
    get hairRenderMeshes() {
      return hairRenderMeshes
    },
    loadOnce,
    update,
  }
}
