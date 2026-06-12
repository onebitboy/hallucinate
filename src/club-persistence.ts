import { jewelPalette } from './character-data.ts'
import { createCharacterHairController } from './character-hair-control.ts'
import { createCharacterStyleController } from './character-style.ts'
import { readClubState, writeClubState } from './club-state.ts'
import { createLocalCharacter } from './local-character.ts'
import { normalizeIndex, setVec3 } from './math.ts'
import type { DuckPose } from './duck-position.ts'
import type { InputLayout } from './input.ts'
import type { Vec3 } from './types.ts'

export function restoreClubState(options: {
  camera: {
    firstPerson: boolean
    position: Vec3
    turn: number
  }
  characterPosition: Vec3
  duckTurn: number
  setDuckPose: (pose: DuckPose) => void
  hairController: ReturnType<typeof createCharacterHairController>
  setInputLayout: (value: InputLayout) => void
  idleClipIndex: {
    set(value: number): void
  }
  idleClipCount: number
  key: string
  localCharacter: ReturnType<typeof createLocalCharacter>
  styleController: ReturnType<typeof createCharacterStyleController>
}) {
  const state = readClubState(options.key)

  if (state) {
    setVec3(options.characterPosition, [
      state.character[0] ?? options.characterPosition[0],
      state.character[1] ?? options.characterPosition[1],
      state.character[2] ?? options.characterPosition[2],
    ])
    setVec3(options.camera.position, [
      state.camera[0] ?? options.camera.position[0],
      state.camera[1] ?? options.camera.position[1],
      state.camera[2] ?? options.camera.position[2],
    ])
    options.camera.turn = state.cameraTurn ?? options.camera.turn
    options.localCharacter.turn = state.characterTurn ?? options.localCharacter.turn
    options.camera.firstPerson = state.cameraFirstPerson ?? options.camera.firstPerson
    options.localCharacter.velocityY = state.velocityY ?? options.localCharacter.velocityY
    if (state.duckPosition) {
      options.setDuckPose({ position: state.duckPosition, turn: state.duckTurn ?? options.duckTurn })
    }
    options.hairController.index = state.characterHairIndex ?? options.hairController.index
    options.hairController.colorIndex = state.characterHairColorIndex ?? options.hairController.colorIndex
    options.styleController.skinColorIndex = state.characterSkinColorIndex ?? options.styleController.skinColorIndex
    options.styleController.accessoryIndex = state.accessoryIndex ?? options.styleController.accessoryIndex
    options.idleClipIndex.set(normalizeIndex(state.idleClipIndex ?? 0, options.idleClipCount))
    options.styleController.topStyleIndex = normalizeIndex(state.topStyleIndex ?? state.shirtColorIndex
      ?? options.styleController.topStyleIndex, jewelPalette.length * 2 + 2)
    options.styleController.bottomStyleIndex = normalizeIndex(state.bottomStyleIndex ?? state.pantsColorIndex
      ?? options.styleController.bottomStyleIndex, jewelPalette.length * 2)
    options.setInputLayout(state.inputLayout ?? (state.alternativeInput ?? true ? 'wasd' : 'ijkl'))
    options.styleController.setTopStyle()
    options.styleController.setBottomStyle()
  }
}

export function saveClubState(options: {
  camera: {
    firstPerson: boolean
    position: Vec3
    turn: number
  }
  characterAssetsLoaded: boolean
  characterPosition: Vec3
  duckPosition: Vec3
  duckTurn: number
  hairController: ReturnType<typeof createCharacterHairController>
  inputLayout: InputLayout
  idleClipIndex: number
  instagram: string
  key: string
  localCharacter: ReturnType<typeof createLocalCharacter>
  nickname: string
  room: number
  styleController: ReturnType<typeof createCharacterStyleController>
  sunglasses: boolean
}) {
  if (!options.characterAssetsLoaded) {
    return
  }

  writeClubState(options.key, {
    character: options.characterPosition,
    camera: options.camera.position,
    duckPosition: options.duckPosition,
    duckTurn: options.duckTurn,
    cameraTurn: options.camera.turn,
    cameraFirstPerson: options.camera.firstPerson,
    characterTurn: options.localCharacter.turn,
    velocityY: options.localCharacter.velocityY,
    characterHairIndex: options.hairController.index,
    characterHairColorIndex: options.hairController.colorIndex,
    characterSkinColorIndex: options.styleController.skinColorIndex,
    idleClipIndex: options.idleClipIndex,
    shirtColorIndex: options.styleController.shirtColorIndex,
    topStyleIndex: options.styleController.topStyleIndex,
    pantsColorIndex: options.styleController.pantsColorIndex,
    bottomStyleIndex: options.styleController.bottomStyleIndex,
    accessoryIndex: options.styleController.accessoryIndex,
    alternativeInput: options.inputLayout !== 'ijkl',
    inputLayout: options.inputLayout,
    sunglasses: options.sunglasses,
    instagram: options.instagram,
    nickname: options.nickname,
    room: options.room,
  })
}
