import assimpjs from 'assimpjs'
import { loadAssimpScene } from './assimp-loader.ts'
import { characterBones } from './character-data.ts'
import { createHairMeshes, createHairRenderMeshes } from './character-hair.ts'
import {
  createCharacterClip,
  createRigNodes,
  validateCharacterRig,
} from './character-rig.ts'
import { normalizeIndex } from './math.ts'

export const idleClipNames = ['stand.fbx', ...Array.from({ length: 19 }, (_, i) => `dance${i + 1}.fbx`)]

export async function loadCharacterAssets(gl: WebGL2RenderingContext, hairIndex: number) {
  const ajs = await assimpjs({
    locateFile(path) {
      return path.endsWith('.wasm') ? '/assimpjs.wasm' : path
    },
  })
  const [stand, run, manSitting, womanSitting, manHair, womanHair, ...dances] = await Promise.all([
    loadAssimpScene(ajs, '/stand.fbx', 'stand.fbx'),
    loadAssimpScene(ajs, '/run.fbx', 'run.fbx'),
    loadAssimpScene(ajs, '/man-sitting.fbx', 'man-sitting.fbx'),
    loadAssimpScene(ajs, '/woman-sitting.fbx', 'woman-sitting.fbx'),
    loadAssimpScene(ajs, '/man-hair.fbx', 'man-hair.fbx'),
    loadAssimpScene(ajs, '/woman-hair.fbx', 'woman-hair.fbx'),
    ...idleClipNames.slice(1).map(name => loadAssimpScene(ajs, `/${name}`, name)),
  ])
  const rig = {
    root: stand.rootnode,
    nodes: createRigNodes(stand.rootnode),
    clips: {
      stand: createCharacterClip(stand, 'stand.fbx'),
      run: createCharacterClip(run, 'run.fbx'),
      manSitting: createCharacterClip(manSitting, 'man-sitting.fbx'),
      womanSitting: createCharacterClip(womanSitting, 'woman-sitting.fbx'),
      dances: dances.map((dance, index) => createCharacterClip(dance, idleClipNames[index + 1]!)),
    },
  }
  const hairMeshes = [...createHairMeshes(manHair, 'man'), ...createHairMeshes(womanHair, 'woman')]

  for (let i = 0; i < hairMeshes.length; i++) {
    hairMeshes[i]!.index = i
  }

  validateCharacterRig(rig.root, characterBones)

  return {
    rig,
    hairMeshes,
    hairRenderMeshes: createHairRenderMeshes(gl, hairMeshes),
    hairIndex: normalizeIndex(hairIndex, hairMeshes.length + 1),
  }
}
