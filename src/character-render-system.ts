import { loadCharacterAssets } from './character-assets.ts'
import { buildCharacterDrawData } from './character-draw.ts'
import type { CharacterDrawCache } from './character-draw.ts'
import { uploadCharacterBoxInstances } from './character-gpu.ts'
import type { NumberBufferCache } from './character-gpu.ts'
import { createCharacterHairController } from './character-hair-control.ts'
import { updateHairInstances } from './character-hair.ts'
import type { HairInstanceUploadCache } from './character-hair.ts'
import { createCharacterStyleController } from './character-style.ts'
import { createLocalCharacter } from './local-character.ts'
import type { CharacterRig, HairRenderMesh, Player, Vec3 } from './types.ts'
import type { VertexBufferCache } from './character-geometry.ts'

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
  light: (color: Vec3, point: Vec3, normal: Vec3) => Vec3
  localCharacter: ReturnType<typeof createLocalCharacter>
  players: Player[]
  styleController: ReturnType<typeof createCharacterStyleController>
  vertexSize: number
}) {
  let rig: CharacterRig | undefined
  let hairRenderMeshes: HairRenderMesh[] = []
  let rigLoad: Promise<CharacterRig> | undefined
  let boxInstances: number[] = []
  let boxInstanceCount = 0
  let assetsLoaded = false
  const boxInstanceCache: NumberBufferCache = { data: new Float32Array(0) }
  const drawCache: CharacterDrawCache = {
    boxInstances: [],
    hairInstances: [],
    npcBlendCache: new Map(),
    vertices: [],
  }
  const hairInstanceCache: HairInstanceUploadCache = { buffers: [], grouped: [] }
  const vertexCache: VertexBufferCache = { data: new Float32Array(0) }

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
      vertexCache,
      width: options.canvas.width,
    })

    boxInstances = data.boxInstances
    updateHairInstances(options.gl, hairRenderMeshes, data.hairInstances, hairInstanceCache)
    boxInstanceCount = uploadCharacterBoxInstances({
      buffer: options.boxInstanceBuffer,
      cache: boxInstanceCache,
      gl: options.gl,
      instances: boxInstances,
      instanceSize: options.boxInstanceSize,
    })

    options.gl.bindBuffer(options.gl.ARRAY_BUFFER, options.buffer)
    options.gl.bufferData(options.gl.ARRAY_BUFFER, data.vertices, options.gl.DYNAMIC_DRAW)

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
