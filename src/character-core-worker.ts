import { characterBones } from './character-data.ts'
import { createHairMeshes } from './character-hair.ts'
import {
  createCharacterClip,
  createRigNodes,
  validateCharacterRig,
} from './character-rig.ts'
import { normalizeIndex } from './math.ts'
import { loadPackedAssimpScene } from './packed-assimp.ts'
import type { AssimpScene, CharacterRig, HairMesh } from './types.ts'
import type assimpjs from 'assimpjs'

type CoreRequest = {
  id: number
  hairIndex: number
}

type CoreProgressResponse = {
  id: number
  progress: number
}

type CoreLoadedResponse = {
  hairIndex: number
  hairMeshes: HairMesh[]
  id: number
  rig: CharacterRig
}

type CoreErrorResponse = {
  error: string
  id: number
}

const coreFiles = [
  { path: '/stand.fbx', name: 'stand.fbx' },
  { path: '/run.fbx', name: 'run.fbx' },
  { path: '/jump.fbx', name: 'jump.fbx' },
  { path: '/wave.fbx', name: 'wave.fbx' },
  { path: '/breakdance.fbx', name: 'breakdance.fbx' },
  { path: '/man-hair.fbx', name: 'man-hair.fbx' },
  { path: '/woman-hair.fbx', name: 'woman-hair.fbx' },
] as const

let assimp: Promise<Awaited<ReturnType<typeof assimpjs>>> | undefined

self.onmessage = (event: MessageEvent<CoreRequest>) => {
  loadCore(event.data)
    .then(response => {
      postTransfer(response, hairTransfers(response.hairMeshes))
    })
    .catch((error: unknown) => {
      self.postMessage({
        id: event.data.id,
        error: error instanceof Error ? error.message : String(error),
      } satisfies CoreErrorResponse)
    })
}

async function loadCore(request: CoreRequest): Promise<CoreLoadedResponse> {
  const scenes: AssimpScene[] = []

  for (let i = 0; i < coreFiles.length; i++) {
    const file = coreFiles[i]!

    scenes.push(await loadAssimpScene(file.path, file.name))
    self.postMessage({ id: request.id, progress: (i + 1) / (coreFiles.length + 2) } satisfies CoreProgressResponse)
  }

  const [stand, run, jump, wave, breakdance, manHair, womanHair] = scenes
  const standClip = createCharacterClip(stand!, 'stand.fbx')
  const waveClip = createCharacterClip(wave!, 'wave.fbx')
  const rig: CharacterRig = {
    root: stand!.rootnode,
    nodes: createRigNodes(stand!.rootnode),
    clips: {
      stand: standClip,
      run: createCharacterClip(run!, 'run.fbx'),
      jump: createCharacterClip(jump!, 'jump.fbx'),
      wave: waveClip,
      waveOut: waveClip,
      breakdance: createCharacterClip(breakdance!, 'breakdance.fbx'),
      manSitting: standClip,
      womanSitting: standClip,
      dances: [],
    },
  }

  validateCharacterRig(rig.root, characterBones)
  self.postMessage({ id: request.id, progress: 8 / 9 } satisfies CoreProgressResponse)

  const hairMeshes = [...createHairMeshes(manHair!, 'man'), ...createHairMeshes(womanHair!, 'woman')]

  for (let i = 0; i < hairMeshes.length; i++) {
    hairMeshes[i]!.index = i
  }

  self.postMessage({ id: request.id, progress: 1 } satisfies CoreProgressResponse)

  return {
    hairIndex: normalizeIndex(request.hairIndex, hairMeshes.length + 1),
    hairMeshes,
    id: request.id,
    rig,
  }
}

async function loadAssimpScene(path: string, name: string) {
  const packed = await loadPackedAssimpScene(path)

  if (packed) {
    return packed
  }

  const ajs = await assimpModule()
  const response = await fetch(path)

  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`)
  }

  const files = new ajs.FileList()

  files.AddFile(name, new Uint8Array(await response.arrayBuffer()))

  const result = ajs.ConvertFileList(files, 'assjson')

  if (!result.IsSuccess() || result.FileCount() === 0) {
    throw new Error(`Assimp failed to convert ${name}: ${result.GetErrorCode()}`)
  }

  return JSON.parse(new TextDecoder().decode(result.GetFile(0).GetContent())) as AssimpScene
}

function assimpModule() {
  assimp ??= import('assimpjs').then(module =>
    module.default({
      locateFile(path) {
        return path.endsWith('.wasm') ? '/assimpjs.wasm' : path
      },
    })
  )

  return assimp
}

function hairTransfers(hairMeshes: HairMesh[]) {
  return hairMeshes.flatMap(mesh => [
    mesh.localTriangleCenters.buffer,
    mesh.localTriangleNormals.buffer,
    mesh.localTriangles.buffer,
  ])
}

function postTransfer(message: CoreLoadedResponse, transfer: unknown[]) {
  ;(self.postMessage as (message: CoreLoadedResponse, transfer: unknown[]) => void)(message, transfer)
}
