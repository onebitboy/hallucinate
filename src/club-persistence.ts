import { jewelPalette } from './character-data.ts'
import { createCharacterHairController } from './character-hair-control.ts'
import { createCharacterStyleController } from './character-style.ts'
import { readClubState, writeClubState } from './club-state.ts'
import { createDjVideoUi } from './dj-video-ui.ts'
import { createLocalCharacter } from './local-character.ts'
import { normalizeIndex, setVec3 } from './math.ts'
import { videoTracks } from './scene-data.ts'
import type { Vec3, VideoZone } from './types.ts'

export function restoreClubState(options: {
  camera: {
    position: Vec3
    turn: number
  }
  characterPosition: Vec3
  djVideoUi: ReturnType<typeof createDjVideoUi>
  hairController: ReturnType<typeof createCharacterHairController>
  setAlternativeInput: (value: boolean) => void
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
    options.localCharacter.velocityY = state.velocityY ?? options.localCharacter.velocityY
    options.hairController.index = state.characterHairIndex ?? options.hairController.index
    options.hairController.colorIndex = state.characterHairColorIndex ?? options.hairController.colorIndex
    options.styleController.skinColorIndex = state.characterSkinColorIndex ?? options.styleController.skinColorIndex
    options.styleController.accessoryIndex = state.accessoryIndex ?? options.styleController.accessoryIndex
    options.idleClipIndex.set(normalizeIndex(state.idleClipIndex ?? 0, options.idleClipCount))
    options.styleController.topStyleIndex = normalizeIndex(state.topStyleIndex ?? state.shirtColorIndex
      ?? options.styleController.topStyleIndex, jewelPalette.length * 2 + 2)
    options.styleController.bottomStyleIndex = normalizeIndex(state.bottomStyleIndex ?? state.pantsColorIndex
      ?? options.styleController.bottomStyleIndex, jewelPalette.length * 2)
    restoreVideoState('inside', state, options.djVideoUi)
    restoreVideoState('outside', state, options.djVideoUi)
    restoreVideoState('tent', state, options.djVideoUi)
    options.setAlternativeInput(state.alternativeInput ?? true)
    options.styleController.setTopStyle()
    options.styleController.setBottomStyle()
  }
}

export function saveClubState(options: {
  camera: {
    position: Vec3
    turn: number
  }
  characterAssetsLoaded: boolean
  characterPosition: Vec3
  djVideoUi: ReturnType<typeof createDjVideoUi>
  hairController: ReturnType<typeof createCharacterHairController>
  alternativeInput: boolean
  idleClipIndex: number
  key: string
  localCharacter: ReturnType<typeof createLocalCharacter>
  nickname: string
  room: number
  styleController: ReturnType<typeof createCharacterStyleController>
}) {
  if (!options.characterAssetsLoaded) {
    return
  }

  options.djVideoUi.syncCurrentTime()

  writeClubState(options.key, {
    character: options.characterPosition,
    camera: options.camera.position,
    cameraTurn: options.camera.turn,
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
    alternativeInput: options.alternativeInput,
    nickname: options.nickname,
    room: options.room,
    videoTrackIds: videoTracks,
    videoTimes: options.djVideoUi.times,
    videoTrackIndexes: options.djVideoUi.trackIndexes,
  })
}

function restoreVideoState(zone: VideoZone, state: NonNullable<ReturnType<typeof readClubState>>,
  djVideoUi: ReturnType<typeof createDjVideoUi>)
{
  if (state.videoTrackIds?.[zone] === videoTracks[zone]) {
    djVideoUi.times[zone] = state.videoTimes?.[zone] ?? 0
    djVideoUi.trackIndexes[zone] = state.videoTrackIndexes?.[zone] ?? 0
    return
  }

  djVideoUi.times[zone] = 0
  djVideoUi.trackIndexes[zone] = 0
}
