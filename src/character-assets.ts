import { loadAssimpScene, loadAssimpScenes } from './assimp-loader.ts'
import { characterBones } from './character-data.ts'
import { createHairMeshes, createHairRenderMeshes } from './character-hair.ts'
import {
  createCharacterClip,
  createRigNodes,
  validateCharacterRig,
} from './character-rig.ts'
import { normalizeIndex } from './math.ts'
import type { CharacterRig } from './types.ts'

type LoadProgress = () => void

export const idleClipNames = ['stand.fbx', ...Array.from({ length: 19 }, (_, i) => `dance${i + 1}.fbx`)]
const danceClipFiles = [
  { name: 'dance1.fbx', size: 769744 },
  { name: 'dance2.fbx', size: 1446560 },
  { name: 'dance3.fbx', size: 1976080 },
  { name: 'dance4.fbx', size: 2214176 },
  { name: 'dance5.fbx', size: 515344 },
  { name: 'dance6.fbx', size: 767728 },
  { name: 'dance7.fbx', size: 1873360 },
  { name: 'dance8.fbx', size: 1576560 },
  { name: 'dance9.fbx', size: 1083520 },
  { name: 'dance10.fbx', size: 1493488 },
  { name: 'dance11.fbx', size: 1556096 },
  { name: 'dance12.fbx', size: 2497456 },
  { name: 'dance13.fbx', size: 1643456 },
  { name: 'dance14.fbx', size: 806704 },
  { name: 'dance15.fbx', size: 610384 },
  { name: 'dance16.fbx', size: 589312 },
  { name: 'dance17.fbx', size: 541264 },
  { name: 'dance18.fbx', size: 2024016 },
  { name: 'dance19.fbx', size: 1234000 },
]
const cheapDanceClipCount = 5
const danceClipFilesBySize = [...danceClipFiles].sort((a, b) => a.size - b.size)
const cheapDanceClipFiles = danceClipFilesBySize.slice(0, cheapDanceClipCount)
const remainingDanceClipFiles = danceClipFilesBySize.slice(cheapDanceClipCount)
export const danceIdleClipLoadOrder = [...cheapDanceClipFiles, ...remainingDanceClipFiles]
  .map(file => idleClipNames.indexOf(file.name))

export const characterCoreChunkCount = 6

export async function loadCharacterAssets(onProgress?: LoadProgress) {
  const [stand, run, jump, wave] = await Promise.all([
    loadCharacterAsset('/stand.fbx', 'stand.fbx', onProgress),
    loadCharacterAsset('/run.fbx', 'run.fbx', onProgress),
    loadCharacterAsset('/jump.fbx', 'jump.fbx', onProgress),
    loadCharacterAsset('/wave.fbx', 'wave.fbx', onProgress),
  ])
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
      manSitting: standClip,
      womanSitting: standClip,
      dances: [],
    },
  }

  validateCharacterRig(rig.root, characterBones)

  return {
    rig,
  }
}

export async function loadCharacterHair(
  gl: WebGL2RenderingContext,
  hairIndex: number,
  onProgress?: LoadProgress,
) {
  const [manHair, womanHair] = await Promise.all([
    loadCharacterAsset('/man-hair.fbx', 'man-hair.fbx', onProgress),
    loadCharacterAsset('/woman-hair.fbx', 'woman-hair.fbx', onProgress),
  ])
  const hairMeshes = [...createHairMeshes(manHair!, 'man'), ...createHairMeshes(womanHair!, 'woman')]

  for (let i = 0; i < hairMeshes.length; i++) {
    hairMeshes[i]!.index = i
  }

  return {
    hairMeshes,
    hairRenderMeshes: createHairRenderMeshes(gl, hairMeshes),
    hairIndex: normalizeIndex(hairIndex, hairMeshes.length + 1),
  }
}

export async function loadCharacterDetails(rig: Awaited<ReturnType<typeof loadCharacterAssets>>['rig']) {
  const [manSitting, womanSitting] = await loadAssimpScenes([
    { path: '/man-sitting.fbx', name: 'man-sitting.fbx' },
    { path: '/woman-sitting.fbx', name: 'woman-sitting.fbx' },
  ])

  rig.clips.manSitting = createCharacterClip(manSitting!, 'man-sitting.fbx')
  rig.clips.womanSitting = createCharacterClip(womanSitting!, 'woman-sitting.fbx')
}

async function loadCharacterAsset(path: string, name: string, onProgress?: LoadProgress) {
  const scene = await loadAssimpScene(path, name)

  onProgress?.()

  return scene
}

export async function loadCharacterDance(rig: Awaited<ReturnType<typeof loadCharacterAssets>>['rig'], idleClipIndex: number) {
  if (idleClipIndex <= 0) {
    return
  }

  const name = idleClipNames[idleClipIndex]

  if (!name) {
    throw new Error(`Unknown dance clip ${idleClipIndex}`)
  }

  if (rig.clips.dances[idleClipIndex - 1]) {
    return
  }

  const dance = await loadAssimpScene(`/${name}`, name)

  rig.clips.dances[idleClipIndex - 1] = createCharacterClip(dance, name)
}
