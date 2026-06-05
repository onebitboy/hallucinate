import {
  characterCoreChunkCount,
  danceIdleClipLoadOrder,
  loadCharacterAssets,
  loadCharacterDance,
  loadCharacterDetails,
  loadCharacterHair,
} from './character-assets.ts'
import { buildCharacterDrawData } from './character-draw.ts'
import type { CharacterDrawCache } from './character-draw.ts'
import type { VertexWriter } from './character-geometry.ts'
import { uploadFloatBuffer } from './character-gpu.ts'
import type { NumberBufferCache } from './character-gpu.ts'
import { createCharacterHairController } from './character-hair-control.ts'
import { updateHairInstances } from './character-hair.ts'
import type { HairInstanceUploadCache } from './character-hair.ts'
import { createCharacterStyleController } from './character-style.ts'
import { createLocalCharacter } from './local-character.ts'
import type { CharacterRig, HairRenderMesh, Player, Vec3 } from './types.ts'

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
  let hairLoad: Promise<void> | undefined
  let coreLoad: Promise<CharacterRig> | undefined
  let detailLoad: Promise<void> | undefined
  let remainingDanceLoad: Promise<void> | undefined
  const danceLoads = new Map<number, Promise<void>>()
  let boxInstanceCount = 0
  let assetsLoaded = false
  let coreLoadedChunks = 0
  let detailsLoaded = false
  let renderPlayers = false
  const boxInstanceCache: NumberBufferCache = { data: new Float32Array(0) }
  const vertexUploadCache: NumberBufferCache = { data: new Float32Array(0) }
  const drawCache: CharacterDrawCache = {
    basePose: undefined,
    basePoses: new Map(),
    boxInstances: { data: new Float32Array(0), length: 0 },
    glowstickTrails: new Map(),
    hairInstances: { data: new Float32Array(0), length: 0 },
    npcBlendCache: new Map(),
    poses: [],
    usedBasePoseKeys: new Set(),
    usedNpcBlendKeys: new Set(),
    vertices: { data: new Float32Array(0), length: 0 },
  }
  const hairInstanceCache: HairInstanceUploadCache = { buffers: [], counts: [], uploads: [] }
  const vertexWriter: VertexWriter = drawCache.vertices

  function markCoreChunkLoaded() {
    coreLoadedChunks++
  }

  async function loadAssets() {
    const assets = await loadCharacterAssets(markCoreChunkLoaded)

    return assets.rig
  }

  function loadRigOnce() {
    rigLoad ??= loadAssets().then(next => {
      rig = next

      return next
    })

    return rigLoad
  }

  function loadHairOnce() {
    hairLoad ??= loadCharacterHair(options.gl, options.hairController.index, markCoreChunkLoaded)
      .then(details => {
        hairRenderMeshes = details.hairRenderMeshes
        options.hairController.setMeshes(details.hairMeshes, details.hairIndex)
        options.hairController.log()
      })

    return hairLoad
  }

  function loadCoreOnce(onLoaded?: () => void) {
    coreLoad ??= Promise.all([loadRigOnce(), loadHairOnce()])
      .then(([activeRig]) => {
        assetsLoaded = true
        onLoaded?.()

        return activeRig
      })

    return coreLoad
  }

  function loadDetailsOnce() {
    detailLoad ??= loadCoreOnce()
      .then(activeRig => loadCharacterDetails(activeRig))
      .then(() => {
        detailsLoaded = true
      })

    return detailLoad
  }

  function loadDanceOnce(idleIndex: number) {
    if (idleIndex <= 0) {
      return Promise.resolve()
    }

    let load = danceLoads.get(idleIndex)

    if (!load) {
      load = loadCoreOnce().then(activeRig => loadCharacterDance(activeRig, idleIndex))
      danceLoads.set(idleIndex, load)
    }

    return load
  }

  function loadRemainingDancesIdle() {
    remainingDanceLoad ??= loadCoreOnce().then(async () => {
      for (const idleIndex of danceIdleClipLoadOrder) {
        await loadDanceOnce(idleIndex)
      }
    })

    return remainingDanceLoad
  }

  function update(time: number) {
    if (!rig) {
      return 0
    }

    const activeRig = rig
    const data = buildCharacterDrawData({
      cameraPosition: options.camera.position,
      cameraTarget: options.camera.target,
      character: {
        position: options.characterPosition,
        turn: options.localCharacter.turn,
        motionBlend: options.localCharacter.motionBlend,
        mode: options.localCharacter.mode,
        modeTime: options.localCharacter.modeTime,
        glowstickTrailKey: 0,
        idleClipIndex: options.idleClipIndex(),
        style: {
          topStyleIndex: options.styleController.topStyleIndex,
          bottomStyleIndex: options.styleController.bottomStyleIndex,
          hairIndex: options.hairController.index,
          hairColorIndex: options.hairController.colorIndex,
          skinColorIndex: options.styleController.skinColorIndex,
          accessoryIndex: options.styleController.accessoryIndex,
        },
      },
      hairMeshes: options.hairController.meshes,
      height: options.canvas.height,
      light: options.light,
      players: renderPlayers ? options.players : [],
      rig: activeRig,
      time,
      drawCache,
      vertexWriter,
      width: options.canvas.width,
    })

    updateHairInstances(options.gl, hairRenderMeshes, data.hairInstances, hairInstanceCache)
    boxInstanceCount = data.boxInstances.length / options.boxInstanceSize
    uploadFloatBuffer(options.gl, options.boxInstanceBuffer, data.boxInstances, boxInstanceCache)

    uploadFloatBuffer(options.gl, options.buffer, data.vertices, vertexUploadCache)

    if (!renderPlayers) {
      renderPlayers = true
    }

    return data.vertices.length / options.vertexSize
  }

  return {
    get assetsLoaded() {
      return assetsLoaded
    },
    get coreProgress() {
      return assetsLoaded ? 1 : coreLoadedChunks / characterCoreChunkCount
    },
    get detailsLoaded() {
      return detailsLoaded
    },
    get boxInstanceCount() {
      return boxInstanceCount
    },
    get hairRenderMeshes() {
      return hairRenderMeshes
    },
    loadCoreOnce,
    loadDanceOnce,
    loadDetailsOnce,
    loadOnce: loadCoreOnce,
    loadRemainingDancesIdle,
    update,
  }
}
