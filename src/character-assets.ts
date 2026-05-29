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

export async function loadCharacterAssets() {
  const [stand, run, jump, wave] = await loadAssimpScenes([
    { path: '/stand.fbx', name: 'stand.fbx' },
    { path: '/run.fbx', name: 'run.fbx' },
    { path: '/jump.fbx', name: 'jump.fbx' },
    { path: '/wave.fbx', name: 'wave.fbx' },
  ])
  const standClip = createCharacterClip(stand!, 'stand.fbx')
  const rig: CharacterRig = {
    root: stand!.rootnode,
    nodes: createRigNodes(stand!.rootnode),
    clips: {
      stand: standClip,
      run: createCharacterClip(run!, 'run.fbx'),
      jump: createCharacterClip(jump!, 'jump.fbx'),
      wave: createCharacterClip(wave!, 'wave.fbx'),
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

export async function loadCharacterDetails(
  gl: WebGL2RenderingContext,
  rig: Awaited<ReturnType<typeof loadCharacterAssets>>['rig'],
  hairIndex: number,
) {
  const [manSitting, womanSitting, manHair, womanHair] = await loadAssimpScenes([
    { path: '/man-sitting.fbx', name: 'man-sitting.fbx' },
    { path: '/woman-sitting.fbx', name: 'woman-sitting.fbx' },
    { path: '/man-hair.fbx', name: 'man-hair.fbx' },
    { path: '/woman-hair.fbx', name: 'woman-hair.fbx' },
  ])
  const hairMeshes = [...createHairMeshes(manHair!, 'man'), ...createHairMeshes(womanHair!, 'woman')]

  for (let i = 0; i < hairMeshes.length; i++) {
    hairMeshes[i]!.index = i
  }

  rig.clips.manSitting = createCharacterClip(manSitting!, 'man-sitting.fbx')
  rig.clips.womanSitting = createCharacterClip(womanSitting!, 'woman-sitting.fbx')

  return {
    hairMeshes,
    hairRenderMeshes: createHairRenderMeshes(gl, hairMeshes),
    hairIndex: normalizeIndex(hairIndex, hairMeshes.length + 1),
  }
}

export async function loadCheapCharacterDances(rig: Awaited<ReturnType<typeof loadCharacterAssets>>['rig']) {
  await loadCharacterDanceFiles(rig, cheapDanceClipFiles)
}

export async function loadCharacterDances(rig: Awaited<ReturnType<typeof loadCharacterAssets>>['rig']) {
  await loadCharacterDanceFiles(rig, remainingDanceClipFiles)
}

async function loadCharacterDanceFiles(
  rig: Awaited<ReturnType<typeof loadCharacterAssets>>['rig'],
  files: typeof danceClipFiles,
) {
  for (const file of files) {
    await loadCharacterDance(rig, file.name)
  }
}

async function loadCharacterDance(rig: Awaited<ReturnType<typeof loadCharacterAssets>>['rig'], name: string) {
  const dance = await loadAssimpScene(`/${name}`, name)
  const index = idleClipNames.indexOf(name) - 1

  rig.clips.dances[index] = createCharacterClip(dance, name)
}
