import { loadAssimpScene, loadAssimpScenes } from './assimp-loader.ts'
import { characterBones } from './character-data.ts'
import { createHairMeshes, createHairRenderMeshes } from './character-hair.ts'
import {
  createCharacterClip,
  createRigNodes,
  validateCharacterRig,
} from './character-rig.ts'
import { normalizeIndex } from './math.ts'
import { packedAssimpAssetPath } from './packed-assimp.ts'
import { afterNextPaint } from './startup.ts'
import type { CharacterRig } from './types.ts'

type LoadProgress = () => void

export const idleClipNames = ['stand', ...Array.from({ length: 19 }, (_, i) => `dance${i + 1}`)]
const danceClipFiles = [
  { name: 'dance1', size: 504964 },
  { name: 'dance2', size: 1814212 },
  { name: 'dance3', size: 2726176 },
  { name: 'dance4', size: 2895454 },
  { name: 'dance5', size: 274763 },
  { name: 'dance6', size: 708862 },
  { name: 'dance7', size: 2444241 },
  { name: 'dance8', size: 2012670 },
  { name: 'dance9', size: 1189908 },
  { name: 'dance10', size: 1875056 },
  { name: 'dance11', size: 1889325 },
  { name: 'dance12', size: 3447648 },
  { name: 'dance13', size: 2099605 },
  { name: 'dance14', size: 736089 },
  { name: 'dance15', size: 343541 },
  { name: 'dance16', size: 285425 },
  { name: 'dance17', size: 317935 },
  { name: 'dance18', size: 2649014 },
  { name: 'dance19', size: 1496898 },
]
const cheapDanceClipCount = 5
const danceClipFilesBySize = [...danceClipFiles].sort((a, b) => a.size - b.size)
const cheapDanceClipFiles = danceClipFilesBySize.slice(0, cheapDanceClipCount)
const remainingDanceClipFiles = danceClipFilesBySize.slice(cheapDanceClipCount)
export const danceIdleClipLoadOrder = [...cheapDanceClipFiles, ...remainingDanceClipFiles]
  .map(file => idleClipNames.indexOf(file.name))

export const characterCoreChunkCount = 9

export async function loadCharacterAssets(onProgress?: LoadProgress) {
  const [stand, run, jump, wave, breakdance, swim1, swim2] = await Promise.all([
    loadCharacterAsset(packedAssimpAssetPath('stand'), 'stand', onProgress),
    loadCharacterAsset(packedAssimpAssetPath('run'), 'run', onProgress),
    loadCharacterAsset(packedAssimpAssetPath('jump'), 'jump', onProgress),
    loadCharacterAsset(packedAssimpAssetPath('wave'), 'wave', onProgress),
    loadCharacterAsset(packedAssimpAssetPath('breakdance'), 'breakdance', onProgress),
    loadCharacterAsset(packedAssimpAssetPath('swim1'), 'swim1', onProgress),
    loadCharacterAsset(packedAssimpAssetPath('swim2'), 'swim2', onProgress),
  ])
  const standClip = createCharacterClip(stand!, 'stand')
  const waveClip = createCharacterClip(wave!, 'wave')
  const rig: CharacterRig = {
    root: stand!.rootnode,
    nodes: createRigNodes(stand!.rootnode),
    clips: {
      stand: standClip,
      run: createCharacterClip(run!, 'run'),
      jump: createCharacterClip(jump!, 'jump'),
      wave: waveClip,
      waveOut: waveClip,
      breakdance: createCharacterClip(breakdance!, 'breakdance'),
      swimStand: createCharacterClip(swim1!, 'swim1'),
      swimMove: createCharacterClip(swim2!, 'swim2'),
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
    loadCharacterAsset(packedAssimpAssetPath('man-hair'), 'man-hair', onProgress),
    loadCharacterAsset(packedAssimpAssetPath('woman-hair'), 'woman-hair', onProgress),
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
    { path: packedAssimpAssetPath('man-sitting'), name: 'man-sitting' },
    { path: packedAssimpAssetPath('woman-sitting'), name: 'woman-sitting' },
  ])

  await afterNextPaint()
  rig.clips.manSitting = createCharacterClip(manSitting!, 'man-sitting')
  rig.clips.womanSitting = createCharacterClip(womanSitting!, 'woman-sitting')
}

export async function loadCharacterSwim(rig: Awaited<ReturnType<typeof loadCharacterAssets>>['rig']) {
  const [swim1, swim2] = await loadAssimpScenes([
    { path: packedAssimpAssetPath('swim1'), name: 'swim1' },
    { path: packedAssimpAssetPath('swim2'), name: 'swim2' },
  ])

  await afterNextPaint()
  rig.clips.swimStand = createCharacterClip(swim1!, 'swim1')
  rig.clips.swimMove = createCharacterClip(swim2!, 'swim2')
}

async function loadCharacterAsset(path: string, name: string, onProgress?: LoadProgress) {
  const scene = await loadAssimpScene(path, name)

  onProgress?.()

  return scene
}

export async function loadCharacterDance(rig: Awaited<ReturnType<typeof loadCharacterAssets>>['rig'],
  idleClipIndex: number)
{
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

  const dance = await loadAssimpScene(packedAssimpAssetPath(name), name)

  await afterNextPaint()
  rig.clips.dances[idleClipIndex - 1] = createCharacterClip(dance, name)
}
