import type { Vec3 } from './types.ts'

export type ClubState = {
  character: Vec3
  camera: Vec3
  cameraTurn: number
  characterTurn: number
  velocityY: number
  characterHairIndex?: number
  characterHairColorIndex?: number
  characterSkinColorIndex?: number
  idleClipIndex?: number
  shirtColorIndex?: number
  topStyleIndex?: number
  pantsColorIndex?: number
  bottomStyleIndex?: number
  accessoryIndex?: number
  alternativeInput?: boolean
  nickname?: string
  room?: number
}

export function readClubState(key: string) {
  return JSON.parse(localStorage.getItem(key) ?? 'null') as ClubState | null
}

export function writeClubState(key: string, state: ClubState) {
  localStorage.setItem(key, JSON.stringify(state))
}

export function createSaveTimer(interval: number) {
  let time = 0

  return {
    update(delta: number, save: () => void) {
      time += delta

      if (time >= interval) {
        save()
        time = 0
      }
    },
  }
}
