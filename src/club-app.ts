import { createAdaptiveBloomScale, createAdaptivePixelRatio } from './adaptive-pixel-ratio.ts'
import { addBeachBallGeometry, createBeachBalls, hitBeachBalls, updateBeachBalls } from './beach-balls.ts'
import { createCameraController } from './camera-controller.ts'
import { idleClipNames } from './character-assets.ts'
import { characterFloor } from './character-data.ts'
import { createCharacterHairController } from './character-hair-control.ts'
import { createCharacterRenderSystem } from './character-render-system.ts'
import { createCharacterStyleController, glowstickColors } from './character-style.ts'
import { createChatUi } from './chat-ui.ts'
import { restoreClubState, saveClubState } from './club-persistence.ts'
import { renderClubFrame } from './club-renderer.ts'
import { createSaveTimer, readClubState } from './club-state.ts'
import { createDjVideoUi } from './dj-video-ui.ts'
import { getDomElements } from './dom-elements.ts'
import { addRoom, addRoomSmoke, addWallStrips } from './environment-object.ts'
import {
  addGraffitiWallGeometry,
  createGraffitiCanvas,
  graffitiColors,
  graffitiRadiusForScreenDistance,
  maxGraffitiSplats,
  paintGraffitiSplats,
  paintLoftPaintingTextures,
  sprayWallPoint,
} from './graffiti.ts'
import { createHelpUi } from './help-ui.ts'
import { bindKeyboardInput, setAlternativeInput } from './input.ts'
import { createLocalCharacter } from './local-character.ts'
import { addLoftLightGeometry, addLoftRoom, addLoftSmoke, loftSpawn } from './loft-scene.ts'
import { lengthSq, mix } from './math.ts'
import { bindTapDestination, createMobileControls } from './mobile-controls.ts'
import { createMultiplayer, updateRemotePlayers } from './multiplayer.ts'
import { createPlayers, takeNpcSeat, updatePlayers } from './player-system.ts'
import { createWallProjector, projectWallPointInto } from './projection.ts'
import type { ProjectedPoint } from './projection.ts'
import type { VideoEndedEntry } from './protocol.ts'
import { emojiReactionFromMessage, pickerEmojis, reactionEmojis } from './reactions.ts'
import { loftBounds, loftCornerFigures, loftDjBooth, loftDoor, loftPlants, loftVideoWall, outsideBounds, outsideBuddha,
  outsidePalmTree, outsideToilets, roomBounds, tent, tentDoorAngle } from './scene-data.ts'
import { createSceneLighting } from './scene-lighting.ts'
import {
  isOutside,
  roomAt,
  seatAt,
  usesSkyBackground,
} from './scene.ts'
import {
  characterBoxFragment,
  characterBoxVertex,
  fragment,
  hairFragment,
  hairVertex,
  lightFragment,
  postFragment,
  postVertex,
  smokeFragment,
  smokeVertex,
  strobeVertex,
  vertex,
} from './shaders.ts'
import { loadStaticFbxObject, loadStaticFbxObjects, loadStaticFbxObjectWithPose } from './static-fbx-object.ts'
import { createStrobeDrawController } from './strobe-draw.ts'
import { createStrobeLights } from './strobe-object.ts'
import { loadOutsideTree } from './tree-world.ts'
import type {
  CircleBounds,
  ClubGlobal,
  Player,
  Vec3,
  Vertex,
  VideoZone,
} from './types.ts'
import {
  setupCharacterBoxArray,
  setupPostArray,
  setupStrobeArray,
  setupVertexArray,
} from './vertex-array-setup.ts'
import {
  createCharacterBoxGeometry,
  createProgram,
  createSmokeMap,
  createStrobeGeometry,
  createTarget,
  createTreeShadowMap,
  resizeTarget,
} from './webgl.ts'

const clubGlobal = globalThis as ClubGlobal

if (clubGlobal.clubFrameId !== undefined) {
  cancelAnimationFrame(clubGlobal.clubFrameId)
}

clubGlobal.clubMultiplayerClose?.()

const {
  canvas,
  djVideo,
  chatForm,
  nicknameInput,
  chatInput,
  chatBubble,
  chatLog,
  onlineCount,
  onlineIndicator,
  onlineSelf,
  onlineText,
  reactionButtons,
  roomsButton,
  supportLink,
  intro,
  introBar,
  introNicknameInput,
  introProgress,
  introStart,
} = getDomElements()

const gl = canvas.getContext('webgl2', {
  antialias: false,
  alpha: false,
})!

if (!gl) {
  throw new Error('WebGL2 is not available')
}

const vertices: Vertex[] = []
const lights: Vertex[] = []
const smoke: Vertex[] = []
const vertexSize = 11
let frameId = 0
const saveKey = 'club-state'
const helpSeenKey = 'club-help-seen'
const reactionSlotsKey = 'club-reaction-slots'
const savedState = readClubState(saveKey)
let adminPass = ''
let adminView = false
const adminIdLabels = new Map<number, HTMLDivElement>()
const adminLabelAnchor: Vec3 = [0, 0, 0]
const adminLabelPoint: ProjectedPoint = { x: 0, y: 0 }
const chatPalette = [
  '#ff4fd8',
  '#00f5ff',
  '#ffe45e',
  '#7cff4f',
  '#ff6b35',
  '#9b7cff',
  '#46ffb0',
  '#ff4f6d',
  '#4fa3ff',
  '#f8ff4f',
  '#ff8cff',
  '#35ff6b',
  '#ffb84f',
  '#6bffea',
  '#ff5ef1',
  '#b7ff35',
  '#ff3d81',
  '#39ffbd',
  '#d6ff4f',
  '#7aa2ff',
  '#ff7a3d',
  '#c77dff',
  '#4fff9f',
  '#ffef5a',
  '#58d6ff',
  '#ff5a5f',
  '#a6ff7a',
  '#ff9df2',
  '#70ffdc',
  '#ffd166',
  '#8ea7ff',
  '#ff6bd6',
  '#64ff6a',
  '#ffb3a7',
  '#55b8ff',
  '#e7ff65',
  '#ff47c8',
  '#42ffc6',
  '#f6a6ff',
  '#baff8f',
  '#ff8f52',
  '#5ee2ff',
  '#ffda3d',
  '#b08cff',
  '#45ff82',
  '#ff6f91',
  '#9dffef',
  '#ffca7a',
]
const keys = new Set<string>()
const occupiedSeats = new Set<string>()
const remoteSeats = new Set<string>()
let idleClipIndex = 0
let alternativeInput = true
let onlineCountValue = 0
const localCharacter = createLocalCharacter(keys)
const characterPosition = localCharacter.position
const hairController = createCharacterHairController()
const styleController = createCharacterStyleController()
const chatUi = createChatUi(chatForm, chatInput, chatBubble, characterPosition)
type AppSpace = {
  kind: 'main'
} | {
  displaySlug: string
  kind: 'loft'
  musicKind: 'playlist' | 'video'
  musicSource: string
  slug: string
}
let appSpace: AppSpace = { kind: 'main' }
type MainPose = {
  room: number
  turn: number
  x: number
  y: number
  z: number
}
let lastMainPose: MainPose | undefined
let nickname = savedState?.nickname ?? ''
nicknameInput.value = nickname
introNicknameInput.value = nickname
const adminIdRoot = document.createElement('div')
let sendVideoEndedNow = (_entry: VideoEndedEntry) => {}
let sendVideoPlaylistNow = (_zone: VideoZone, _ids: string[]) => {}
const djVideoUi = createDjVideoUi(djVideo, characterPosition, {
  recoverFocus: () => canvas.focus(),
  onEnded: entry => sendVideoEndedNow(entry),
  onPlaylistDiscovered: (zone, ids) => sendVideoPlaylistNow(zone, ids),
  playlistSource: zone =>
    appSpace.kind === 'loft' && zone === 'loft' && appSpace.musicKind === 'playlist'
      ? appSpace.musicSource
      : undefined,
  zone: () => currentVideoZone(),
})
const helpUi = createHelpUi()
const helpSeen = localStorage.getItem(helpSeenKey) === 'true'
const cameraController = createCameraController(canvas, characterPosition)
const reactionSlotEmojis = loadReactionSlotEmojis()
function syncOnlineIndicator() {
  onlineIndicator.dataset.hidden = String(helpUi.root.dataset.open === 'true')
  reactionButtons.dataset.hidden = String(helpUi.root.dataset.open === 'true')
  roomsButton.dataset.hidden = String(helpUi.root.dataset.open === 'true')
  supportLink.dataset.hidden = String(helpUi.root.dataset.open === 'true')
}

function setupReactionButtons() {
  const picker = createReactionPicker()

  reactionSlotEmojis.forEach((emoji, index) => {
    const button = document.createElement('button')
    let longPress = 0
    let pickerOpened = false

    button.type = 'button'
    button.className = 'reaction-button'
    button.textContent = emoji
    button.setAttribute('aria-label', emoji)
    button.addEventListener('pointerdown', () => {
      pickerOpened = false
      clearTimeout(longPress)
      longPress = setTimeout(() => {
        pickerOpened = true
        picker.open(index, button)
      }, 450)
    })
    button.addEventListener('pointerup', () => clearTimeout(longPress))
    button.addEventListener('pointercancel', () => clearTimeout(longPress))
    button.addEventListener('pointerleave', () => clearTimeout(longPress))
    button.addEventListener('contextmenu', event => event.preventDefault())
    button.addEventListener('click', event => {
      event.preventDefault()
      if (pickerOpened) {
        pickerOpened = false
        return
      }

      sendChatMessage(reactionSlotEmojis[index]!)
      canvas.focus()
    })
    reactionButtons.append(button)
  })
}

function createReactionPicker() {
  const dialog = document.createElement('dialog')
  const grid = document.createElement('div')
  let slot = 0
  let button: HTMLButtonElement | undefined

  dialog.id = 'reaction-picker'
  grid.id = 'reaction-picker-grid'
  for (const emoji of pickerEmojis) {
    const option = document.createElement('button')

    option.type = 'button'
    option.className = 'reaction-picker-option'
    option.textContent = emoji
    option.setAttribute('aria-label', emoji)
    option.addEventListener('click', () => {
      reactionSlotEmojis[slot] = emoji
      button!.textContent = emoji
      button!.setAttribute('aria-label', emoji)
      localStorage.setItem(reactionSlotsKey, JSON.stringify(reactionSlotEmojis))
      dialog.close()
      canvas.focus()
    })
    grid.append(option)
  }
  dialog.append(grid)
  dialog.addEventListener('click', event => {
    if (event.target === dialog) {
      dialog.close()
    }
  })
  document.body.append(dialog)

  return {
    open(index: number, target: HTMLButtonElement) {
      slot = index
      button = target
      dialog.showModal()
    },
  }
}

function loadReactionSlotEmojis() {
  const saved = localStorage.getItem(reactionSlotsKey)

  if (!saved) {
    return [...reactionEmojis]
  }

  const next = JSON.parse(saved) as string[]

  if (next.length !== reactionEmojis.length || next.some(emoji => !emojiReactionFromMessage(emoji))) {
    throw new Error('Invalid saved reaction emojis')
  }

  return next
}

setupReactionButtons()
syncOnlineIndicator()
adminIdRoot.id = 'admin-id-root'
document.body.append(adminIdRoot)

function addChatLogMessage(id: number, text: string) {
  const row = document.createElement('div')
  const message = document.createElement('span')
  const ban = document.createElement('button')
  const color = chatMessageColor(id, text)

  row.className = 'chat-log-message'
  row.style.color = color
  row.dataset.userId = String(id)
  renderChatLogText(message, text)
  ban.type = 'button'
  ban.className = 'chat-ban-button'
  ban.textContent = 'ban'
  let pointerBanAt = 0
  const sendBan = (event: Event) => {
    console.log(`Ban ${event.type}: id=${id}`)
    event.preventDefault()
    event.stopPropagation()
    if (event.type === 'click' && performance.now() - pointerBanAt < 500) {
      return
    }
    if (event.type === 'pointerdown') {
      pointerBanAt = performance.now()
    }
    openBanDialog(id, `user with message: ${text}`)
  }
  ban.addEventListener('pointerdown', sendBan, { capture: true })
  ban.addEventListener('click', sendBan)
  row.append(ban, message)
  chatLog.append(row)
  chatLog.scrollTop = chatLog.scrollHeight

  return color
}

function renderChatLogText(target: HTMLElement, text: string) {
  target.replaceChildren()
  let index = 0

  for (const match of roomSlugMatches(text)) {
    target.append(document.createTextNode(text.slice(index, match.start)))

    const slug = match.slug
    const display = match.display

    const link = document.createElement('a')

    link.href = `/${slug}`
    link.className = 'chat-room-link'
    link.textContent = `🏘️ /${display}`
    link.addEventListener('click', event => {
      event.preventDefault()
      void openLoftRoute(slug, true)
    })
    target.append(link)
    index = match.end
  }

  target.append(document.createTextNode(text.slice(index)))
}

function roomSlugMatches(text: string) {
  const matches: { display: string; end: number; slug: string; start: number }[] = []
  const pattern = /https?:\/\/[^\s]+|\/[A-Za-z0-9_-]+/g

  for (const match of text.matchAll(pattern)) {
    const value = match[0]
    const start = match.index
    const room = value.startsWith('/')
      ? { display: value.slice(1), end: start + value.length, slug: value.slice(1), start }
      : roomUrlMatch(value, start)

    if (room) {
      matches.push(room)
    }
  }

  return matches
}

function roomUrlMatch(value: string, start: number) {
  const trimmed = value.replace(/[.,!?;:)]*$/, '')
  const end = start + trimmed.length
  const url = new URL(trimmed)

  if (url.origin !== location.origin || !/^\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
    return
  }

  const slug = url.pathname.slice(1)

  return { display: slug, end, slug, start }
}

function deleteChatLogMessages(id: number) {
  for (const row of [...chatLog.children]) {
    if (row instanceof HTMLElement && row.dataset.userId === String(id)) {
      row.remove()
    }
  }
}

const adminDialog = document.createElement('dialog')
const adminForm = document.createElement('form')
const adminInput = document.createElement('input')
const adminSubmit = document.createElement('button')
const adminBanIdInput = document.createElement('input')
const adminBanIdSubmit = document.createElement('button')
const adminMusicInput = document.createElement('input')
const adminMusicSubmit = document.createElement('button')
const adminRandomTrackSubmit = document.createElement('button')
const loftMusicDialog = document.createElement('dialog')
const loftMusicForm = document.createElement('form')
const loftMusicPassword = document.createElement('input')
const loftMusicSource = document.createElement('input')
const loftMusicCancel = document.createElement('button')
const loftMusicSubmit = document.createElement('button')
const banDialog = document.createElement('dialog')
const banForm = document.createElement('form')
const banMessage = document.createElement('p')
const banCancel = document.createElement('button')
const banSubmit = document.createElement('button')
const banSubnetSubmit = document.createElement('button')

adminDialog.id = 'admin-dialog'
adminForm.method = 'dialog'
adminInput.type = 'password'
adminInput.autocomplete = 'current-password'
adminInput.placeholder = 'admin pass'
adminSubmit.type = 'submit'
adminSubmit.textContent = '🔓'
adminSubmit.setAttribute('aria-label', 'enter admin')
adminBanIdInput.type = 'number'
adminBanIdInput.min = '1'
adminBanIdInput.step = '1'
adminBanIdInput.placeholder = 'id'
adminBanIdSubmit.type = 'button'
adminBanIdSubmit.textContent = '🚫 id'
adminBanIdSubmit.setAttribute('aria-label', 'ban id')
adminMusicInput.placeholder = 'room music'
adminMusicSubmit.type = 'button'
adminMusicSubmit.textContent = '🎵'
adminMusicSubmit.setAttribute('aria-label', 'set room music')
adminRandomTrackSubmit.type = 'button'
adminRandomTrackSubmit.textContent = '🔀'
adminRandomTrackSubmit.setAttribute('aria-label', 'random track')
adminForm.append(adminInput, adminSubmit, adminBanIdInput, adminBanIdSubmit, adminMusicInput, adminMusicSubmit,
  adminRandomTrackSubmit)
adminDialog.append(adminForm)
loftMusicDialog.id = 'loft-music-dialog'
loftMusicForm.method = 'dialog'
loftMusicPassword.type = 'password'
loftMusicPassword.autocomplete = 'current-password'
loftMusicPassword.placeholder = 'room password'
loftMusicSource.placeholder = 'youtube id'
loftMusicSource.autocomplete = 'off'
loftMusicCancel.type = 'button'
loftMusicCancel.textContent = '✕'
loftMusicCancel.setAttribute('aria-label', 'cancel')
loftMusicSubmit.type = 'submit'
loftMusicSubmit.textContent = '📺'
loftMusicSubmit.setAttribute('aria-label', 'set video')
loftMusicForm.append(loftMusicPassword, loftMusicSource, loftMusicCancel, loftMusicSubmit)
loftMusicDialog.append(loftMusicForm)
banDialog.id = 'ban-dialog'
banForm.method = 'dialog'
banCancel.type = 'button'
banSubmit.type = 'submit'
banSubnetSubmit.type = 'button'
banCancel.textContent = '✕'
banCancel.setAttribute('aria-label', 'cancel')
banSubmit.textContent = '🚫'
banSubmit.setAttribute('aria-label', 'ban')
banSubnetSubmit.textContent = '🌐'
banSubnetSubmit.setAttribute('aria-label', 'ban subnet')
banForm.append(banMessage, banCancel, banSubmit, banSubnetSubmit)
banDialog.append(banForm)
document.body.append(adminDialog, loftMusicDialog, banDialog)
for (const eventName of ['keydown', 'keyup', 'pointerdown']) {
  adminInput.addEventListener(eventName, event => event.stopPropagation())
  adminBanIdInput.addEventListener(eventName, event => event.stopPropagation())
  adminMusicInput.addEventListener(eventName, event => event.stopPropagation())
  loftMusicPassword.addEventListener(eventName, event => event.stopPropagation())
  loftMusicSource.addEventListener(eventName, event => event.stopPropagation())
}

let pendingBan: { id: number; message: string } | undefined

adminForm.addEventListener('submit', () => {
  adminPass = adminInput.value
  setAdminView(adminPass.length > 0)
})

adminBanIdSubmit.addEventListener('click', () => {
  const id = Number(adminBanIdInput.value)

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid ban id ${adminBanIdInput.value}`)
  }

  adminPass = adminInput.value
  setAdminView(adminPass.length > 0)
  openBanDialog(id, `id: ${id}`)
})

adminRandomTrackSubmit.addEventListener('click', () => {
  adminPass = adminInput.value
  setAdminView(adminPass.length > 0)
  multiplayer.sendAdmin(adminPass, 'randomTrack', videoZoneRoom(djVideoUi.zone))
})

adminMusicSubmit.addEventListener('click', async () => {
  adminPass = adminInput.value
  setAdminView(adminPass.length > 0)
  await updateLoftMusic(adminPass, adminMusicInput.value)
})

loftMusicCancel.addEventListener('click', () => {
  loftMusicDialog.close()
  canvas.focus()
})

loftMusicDialog.addEventListener('click', event => {
  if (event.target === loftMusicDialog) {
    loftMusicDialog.close()
    canvas.focus()
  }
})

loftMusicForm.addEventListener('submit', event => {
  event.preventDefault()
  void submitLoftMusicDialog()
})

function videoZoneRoom(zone: VideoZone) {
  if (zone === 'loft') {
    return 0
  }

  return zone === 'inside' ? 1 : zone === 'tent' ? 2 : 0
}

banCancel.addEventListener('click', () => {
  pendingBan = undefined
  banDialog.close()
})

banForm.addEventListener('submit', event => {
  event.preventDefault()
  sendPendingBan('ban')
})

banSubnetSubmit.addEventListener('click', () => {
  sendPendingBan('banSubnet')
})

function sendPendingBan(command: 'ban' | 'banSubnet') {
  if (!pendingBan) {
    throw new Error('Missing pending ban')
  }

  const { id } = pendingBan

  pendingBan = undefined
  deleteChatLogMessages(id)
  chatUi.removeMessages(id)
  multiplayer.sendAdmin(adminPass, command, id)
  banDialog.close()
}

function openBanDialog(id: number, message: string) {
  pendingBan = { id, message }
  banMessage.textContent = `Are you sure you want to ban ${message}`
  banDialog.showModal()
}

function openAdminDialog() {
  adminInput.value = adminPass
  adminMusicInput.value = appSpace.kind === 'loft' ? appSpace.musicSource : ''
  adminDialog.showModal()
  adminInput.focus()
}

function setAdminView(value: boolean) {
  adminView = value
  chatLog.dataset.admin = String(adminView)
  adminIdRoot.dataset.admin = String(adminView)
  onlineIndicator.style.pointerEvents = adminView ? 'auto' : ''
  if (roomsDialog.open) {
    void refreshRoomsList()
  }
  if (!adminView) {
    clearAdminIdLabels()
  }
}

function updateAdminIdLabels(projector: ReturnType<typeof createWallProjector>) {
  if (!adminView) {
    return
  }

  const active = new Set<number>()

  if (multiplayer.selfId > 0) {
    updateAdminIdLabel(multiplayer.selfId, characterPosition, projector, active)
  }
  for (const [id, player] of multiplayer.players) {
    updateAdminIdLabel(id, player.position, projector, active)
  }
  for (const [id, element] of adminIdLabels) {
    if (!active.has(id)) {
      element.remove()
      adminIdLabels.delete(id)
    }
  }
}

function updateAdminIdLabel(
  id: number,
  position: Vec3,
  projector: ReturnType<typeof createWallProjector>,
  active: Set<number>,
) {
  active.add(id)
  let label = adminIdLabels.get(id)

  if (!label) {
    label = document.createElement('div')
    label.className = 'admin-id-label'
    label.textContent = String(id)
    adminIdRoot.append(label)
    adminIdLabels.set(id, label)
  }

  adminLabelAnchor[0] = position[0]
  adminLabelAnchor[1] = position[1] + 1.75
  adminLabelAnchor[2] = position[2]
  if (!adminLabelVisible(adminLabelAnchor, projector)) {
    label.dataset.visible = 'false'
    return
  }

  projectWallPointInto(adminLabelAnchor, projector, adminLabelPoint)
  label.dataset.visible = 'true'
  label.style.transform = `translate(-50%, -100%) translate(${Math.round(adminLabelPoint.x)}px, ${
    Math.round(adminLabelPoint.y)
  }px)`
}

function adminLabelVisible(position: Vec3, projector: ReturnType<typeof createWallProjector>) {
  const relativeX = position[0] - projector.eyeX
  const relativeY = position[1] - projector.eyeY
  const relativeZ = position[2] - projector.eyeZ
  const viewX = projector.cameraXX * relativeX + projector.cameraXY * relativeY + projector.cameraXZ * relativeZ
  const viewY = projector.cameraYX * relativeX + projector.cameraYY * relativeY + projector.cameraYZ * relativeZ
  const viewZ = projector.cameraZX * relativeX + projector.cameraZY * relativeY + projector.cameraZZ * relativeZ
  const depth = -viewZ
  const ndcX = (viewX * projector.f / projector.aspect) / depth
  const ndcY = (viewY * projector.f) / depth

  return depth > 0 && ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1
}

function clearAdminIdLabels() {
  for (const label of adminIdLabels.values()) {
    label.remove()
  }

  adminIdLabels.clear()
}

function chatMessageColor(id: number, text: string) {
  const name = chatMessageNickname(text) ?? String(id)

  return identityColor(name)
}

function chatMessageNickname(text: string) {
  return /^<([^>\n]+)>(?: |$)/.exec(text)?.[1]
}

function chatNicknameHash(name: string) {
  let hash = 2166136261

  for (const char of name) {
    hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619) >>> 0
  }

  return hash
}

function nicknameLabel(name: string) {
  return `<${name}>`
}

function identityName(id: number, name?: string) {
  return name || String(id)
}

function identityColor(name: string) {
  return chatPalette[chatNicknameHash(name) % chatPalette.length]!
}

function selfLabel() {
  return nicknameLabel(identityName(multiplayer.selfId || 0, nickname))
}

function syncOnlineSelf() {
  const label = selfLabel()
  const name = identityName(multiplayer.selfId || 0, nickname)

  onlineSelf.textContent = label
  onlineSelf.style.color = identityColor(name)
  onlineText.textContent = ` ${onlineCountValue} online`
}

function syncChatFormColor() {
  const next = activeNicknameInput().value.trim()
  const color = identityColor(identityName(multiplayer.selfId || 0, next))

  chatForm.style.color = color
  introNicknameInput.style.color = color
  if (multiplayer?.selfId > 0) {
    syncOnlineSelf()
  }
}

function activeNicknameInput() {
  return document.activeElement === introNicknameInput ? introNicknameInput : nicknameInput
}

function syncNicknameLabels() {
  syncChatFormColor()

  for (const [id, player] of multiplayer.players) {
    const name = identityName(id, playerNicknames.get(id))
    const label = nicknameLabel(name)

    chatUi.setLabel(id, label, player.position, identityColor(name))
  }
}

function syncRemoteNicknameLabel(id: number) {
  const player = multiplayer.players.get(id)

  if (player) {
    const name = identityName(id, playerNicknames.get(id))
    const label = nicknameLabel(name)

    chatUi.setLabel(id, label, player.position, identityColor(name))
  }
}

function cycleIdle(direction: number) {
  idleClipIndex = (idleClipIndex + direction + idleClipNames.length) % idleClipNames.length
  // console.log(`idle animation: ${idleClipNames[idleClipIndex]}`)
}
const idleClipState = {
  set(value: number) {
    idleClipIndex = value
  },
}
function useAlternativeInput(value: boolean) {
  alternativeInput = value
  setAlternativeInput(value)
  helpUi.setAlternativeInput(value)
}

function palmTreeMeshColor(index: number): [number, number, number] {
  return index === 0 ? [0.42, 0.24, 0.1] : [0.02, 0.72 + (index % 3) * 0.08, 0.16]
}

function rockPlacements() {
  const placements: Array<{
    height: number
    meshIndex: number
    position: [number, number, number]
    turn: number
  }> = []
  const count = 92
  const inset = 1.15

  for (let i = 0; i < count; i++) {
    const random = seededRockRandom(i, 1)
    const side = Math.floor(random * 4)
    const x = side === 0
      ? outsideBounds.left + inset
      : side === 1
      ? outsideBounds.right - inset
      : mix(outsideBounds.left + 1.5, outsideBounds.right - 1.5, seededRockRandom(i, 2))
    const z = side === 2
      ? outsideBounds.back + inset
      : side === 3
      ? outsideBounds.front - inset
      : mix(outsideBounds.back + 1.5, outsideBounds.front - 1.5, seededRockRandom(i, 3))
    const edgeJitter = seededRockRandom(i, 4) * 3.4

    const position: [number, number, number] = [
      side === 0 ? x - edgeJitter : side === 1 ? x + edgeJitter : x,
      characterFloor,
      side === 2 ? z - edgeJitter : side === 3 ? z + edgeJitter : z,
    ]

    if (inRockClearance(position[0], position[2])) {
      continue
    }

    placements.push({
      height: mix(0.28, 0.9, seededRockRandom(i, 5)),
      meshIndex: Math.floor(seededRockRandom(i, 6) * 24),
      position,
      turn: seededRockRandom(i, 7) * Math.PI * 2,
    })
  }

  return placements
}

function inRockClearance(x: number, z: number) {
  return inToiletBounds(x, z, 1.8)
}

function inToiletBounds(x: number, z: number, padding = 0) {
  return x > outsideToilets.x - outsideToilets.width / 2 - padding
    && x < outsideToilets.x + outsideToilets.width / 2 + padding
    && z > outsideToilets.z - outsideToilets.depth / 2 - padding
    && z < outsideToilets.z + outsideToilets.depth / 2 + padding
}

function seededRockRandom(seed: number, salt: number) {
  const value = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453123

  return value - Math.floor(value)
}

useAlternativeInput(alternativeInput)
const wallProjector = createWallProjector({ eye: [0, 0, 1], center: [0, 0, 0] }, canvas)
const pixelRatio = createAdaptivePixelRatio()
const bloomScale = createAdaptiveBloomScale()
const feedbackMaxAmount = 0.91
const feedbackToiletRampSeconds = 60
const feedbackSitResetSeconds = 3
let outsideTree: CircleBounds = { x: 0, z: 20.5, radius: 0.75 }
let lastStamp = 0
let feedbackToiletStartStamp = 0
let feedbackToiletStartAmount = 0
let feedbackInToilets = false
let feedbackSitSeconds = 0
let feedbackSitReset = false
let buddhaLoaded = false
let palmTreeLoaded = false
let rocksLoaded = false
let treeLoaded = false
let introHidden = false
let videoPlaying = false
let introWaveSent = false

function startIntro() {
  syncNickname(introNicknameInput.value)
  if (!introWaveSent) {
    introWaveSent = true
    sendChatMessage('👋')
  }
  videoPlaying = djVideoUi.play()
  introStart.dataset.playing = String(videoPlaying)
}

introStart.addEventListener('click', startIntro)
introNicknameInput.addEventListener('change', () => syncNickname(introNicknameInput.value))
introNicknameInput.addEventListener('input', syncChatFormColor)
addEventListener('keydown', event => {
  if (!introHidden && event.key === 'Enter' && document.activeElement !== chatInput) {
    event.preventDefault()
    startIntro()
  }
})
let wasOutside = isOutside(characterPosition)
let wasInLoftMusicSpot = false
let doorCoverReleased = true
let activeRoom = routeSlug() ? 0 : savedState ? roomIndex(roomAt(savedState.character)) : 0
let requestedRoom = activeRoom
let lastPoseLog = 0
const saveTimer = createSaveTimer(0.5)
const roomStarts = [
  { x: -8.61, z: 9.64, angle: 0.505 },
  { x: -4.75, z: roomBounds.front - 0.85, angle: 0 },
  {
    x: tent.x + Math.sin(tentDoorAngle) * (tent.radius - 1.35),
    z: tent.z + Math.cos(tentDoorAngle) * (tent.radius - 1.35),
    angle: tentDoorAngle + Math.PI,
  },
]

function roomIndex(zone: VideoZone) {
  if (zone === 'loft') {
    return 0
  }

  return zone === 'inside' ? 1 : zone === 'tent' ? 2 : 0
}

function renderZoneIndex(zone: VideoZone) {
  if (zone === 'loft') {
    return 3
  }

  return zone === 'inside' ? 0 : zone === 'tent' ? 2 : 1
}

function currentVideoZone(): VideoZone {
  return appSpace.kind === 'loft' ? 'loft' : roomAt(characterPosition)
}

function currentRoomIndex() {
  return appSpace.kind === 'loft' ? 0 : roomIndex(roomAt(characterPosition))
}

function routeSlug() {
  const slug = decodeURIComponent(location.pathname.slice(1))

  return slug && /^[A-Za-z0-9_-]+$/.test(slug) ? slug : ''
}

addRoom(vertices)
addWallStrips(lights)
addRoomSmoke(smoke)
const loftVertices: Vertex[] = []
const loftLights: Vertex[] = []
const loftSmoke: Vertex[] = []
addLoftRoom(loftVertices)
addLoftLightGeometry(loftLights)
addLoftSmoke(loftSmoke)
const graffitiWallVertices: Vertex[] = []
addGraffitiWallGeometry(graffitiWallVertices)

let mainPoints = new Float32Array(vertices.flat())
const mainLightPoints = new Float32Array(lights.flat())
const mainSmokePoints = new Float32Array(smoke.flat())
let loftRoomPoints = new Float32Array(loftVertices.flat())
const loftLightPoints = new Float32Array(loftLights.flat())
const loftSmokePoints = new Float32Array(loftSmoke.flat())
let points = mainPoints
let lightPoints = mainLightPoints
let smokePoints = mainSmokePoints
const graffitiPoints = new Float32Array(graffitiWallVertices.flat())
const emptyPoints = new Float32Array()
const program = createProgram(gl, vertex, fragment)
const lightProgram = createProgram(gl, vertex, lightFragment)
const strobeProgram = createProgram(gl, strobeVertex, lightFragment)
const characterBoxProgram = createProgram(gl, characterBoxVertex, characterBoxFragment)
const hairProgram = createProgram(gl, hairVertex, hairFragment)
const smokeProgram = createProgram(gl, smokeVertex, smokeFragment)
const postProgram = createProgram(gl, postVertex, postFragment)
const smokeMap = createSmokeMap(gl)
const treeShadowMap = createTreeShadowMap(gl)
const graffitiCanvas = createGraffitiCanvas()
const graffitiContext = graffitiCanvas.getContext('2d')!
const graffitiTexture = gl.createTexture()
const viewProjection = gl.getUniformLocation(program, 'viewProjection')
const cameraEye = gl.getUniformLocation(program, 'cameraEye')
const renderZone = gl.getUniformLocation(program, 'renderZone')
const bloomPass = gl.getUniformLocation(program, 'bloomPass')
const doorCoverVisible = gl.getUniformLocation(program, 'doorCoverVisible')
const treeShadowSampler = gl.getUniformLocation(program, 'treeShadowMap')
const graffitiMap = gl.getUniformLocation(program, 'graffitiMap')
const characterBoxViewProjection = gl.getUniformLocation(characterBoxProgram, 'viewProjection')
const characterBoxRenderZone = gl.getUniformLocation(characterBoxProgram, 'renderZone')
const characterBoxBloomPass = gl.getUniformLocation(characterBoxProgram, 'bloomPass')
const lightTime = gl.getUniformLocation(lightProgram, 'time')
const lightSmokeMap = gl.getUniformLocation(lightProgram, 'smokeMap')
const lightRenderZone = gl.getUniformLocation(lightProgram, 'renderZone')
const lightViewProjection = gl.getUniformLocation(lightProgram, 'viewProjection')
const strobeTime = gl.getUniformLocation(strobeProgram, 'time')
const strobeSmokeMap = gl.getUniformLocation(strobeProgram, 'smokeMap')
const strobeRenderZone = gl.getUniformLocation(strobeProgram, 'renderZone')
const strobeViewProjection = gl.getUniformLocation(strobeProgram, 'viewProjection')
const hairViewProjection = gl.getUniformLocation(hairProgram, 'viewProjection')
const hairRenderZone = gl.getUniformLocation(hairProgram, 'renderZone')
const roomSmokeTime = gl.getUniformLocation(smokeProgram, 'time')
const roomSmokeMap = gl.getUniformLocation(smokeProgram, 'smokeMap')
const roomSmokeViewProjection = gl.getUniformLocation(smokeProgram, 'viewProjection')
const roomSmokeCameraRight = gl.getUniformLocation(smokeProgram, 'cameraRight')
const roomSmokeCameraUp = gl.getUniformLocation(smokeProgram, 'cameraUp')
const postScene = gl.getUniformLocation(postProgram, 'scene')
const postBloom = gl.getUniformLocation(postProgram, 'bloom')
const postFeedback = gl.getUniformLocation(postProgram, 'feedback')
const postBloomResolution = gl.getUniformLocation(postProgram, 'bloomResolution')
const postFeedbackAmount = gl.getUniformLocation(postProgram, 'feedbackAmount')
const postRenderSky = gl.getUniformLocation(postProgram, 'renderSky')
const postSkyForward = gl.getUniformLocation(postProgram, 'skyForward')
const postSkyRight = gl.getUniformLocation(postProgram, 'skyRight')
const postSkyUp = gl.getUniformLocation(postProgram, 'skyUp')
const array = gl.createVertexArray()
const buffer = gl.createBuffer()
const lightArray = gl.createVertexArray()
const lightBuffer = gl.createBuffer()
const strobeArray = gl.createVertexArray()
const strobeGeometryBuffer = gl.createBuffer()
const strobeInstanceBuffer = gl.createBuffer()
const smokeArray = gl.createVertexArray()
const smokeBuffer = gl.createBuffer()
const characterArray = gl.createVertexArray()
const characterBuffer = gl.createBuffer()
const characterBoxArray = gl.createVertexArray()
const characterBoxGeometryBuffer = gl.createBuffer()
const characterBoxInstanceBuffer = gl.createBuffer()
const postArray = gl.createVertexArray()
const postBuffer = gl.createBuffer()
const beachBallArray = gl.createVertexArray()
const beachBallBuffer = gl.createBuffer()
const graffitiArray = gl.createVertexArray()
const graffitiBuffer = gl.createBuffer()
const target = createTarget(gl, 1, 1)
const bloomTarget = createTarget(gl, 1, 1)
const feedback = {
  amount: 0,
  current: createTarget(gl, 1, 1),
  next: createTarget(gl, 1, 1),
}
const stride = vertexSize * Float32Array.BYTES_PER_ELEMENT
const strobeGeometry = createStrobeGeometry()
const strobeInstanceSize = 14
const strobeInstanceStride = strobeInstanceSize * Float32Array.BYTES_PER_ELEMENT
const characterBoxGeometry = createCharacterBoxGeometry()
const characterBoxInstanceSize = 17
const characterBoxInstanceStride = characterBoxInstanceSize * Float32Array.BYTES_PER_ELEMENT

if (!viewProjection || !cameraEye || !renderZone || !bloomPass || !doorCoverVisible || !treeShadowSampler
  || !graffitiMap || !graffitiTexture
  || !characterBoxViewProjection
  || !characterBoxRenderZone || !characterBoxBloomPass || !lightTime || !lightSmokeMap || !lightRenderZone
  || !lightViewProjection
  || !strobeTime || !strobeSmokeMap || !strobeRenderZone || !strobeViewProjection || !hairViewProjection
  || !hairRenderZone || !roomSmokeTime || !roomSmokeMap || !roomSmokeViewProjection || !roomSmokeCameraRight
  || !roomSmokeCameraUp || !postScene || !postBloom || !postFeedback || !postBloomResolution || !postFeedbackAmount
  || !postRenderSky
  || !postSkyForward || !postSkyRight || !postSkyUp || !array
  || !buffer || !lightArray || !lightBuffer || !strobeArray || !strobeGeometryBuffer || !strobeInstanceBuffer
  || !smokeArray || !smokeBuffer || !characterArray || !characterBuffer
  || !characterBoxArray || !characterBoxGeometryBuffer || !characterBoxInstanceBuffer || !postArray || !postBuffer
  || !beachBallArray || !beachBallBuffer || !graffitiArray || !graffitiBuffer)
{
  throw new Error('Failed to initialize WebGL resources')
}

const characterBoxUniforms = {
  bloomPass: characterBoxBloomPass,
  renderZone: characterBoxRenderZone,
  viewProjection: characterBoxViewProjection,
}
const hairUniforms = {
  renderZone: hairRenderZone,
  viewProjection: hairViewProjection,
}

gl.bindTexture(gl.TEXTURE_2D, graffitiTexture)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
paintLoftPaintingTextures(graffitiContext)
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, graffitiCanvas)

setupVertexArray({ array, buffer, data: points, gl, stride, usage: gl.STATIC_DRAW })

function applySceneBuffers() {
  points = appSpace.kind === 'loft' ? loftRoomPoints : mainPoints
  lightPoints = appSpace.kind === 'loft' ? loftLightPoints : mainLightPoints
  smokePoints = appSpace.kind === 'loft' ? loftSmokePoints : mainSmokePoints
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW)
  gl.bindBuffer(gl.ARRAY_BUFFER, lightBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, lightPoints, gl.DYNAMIC_DRAW)
  gl.bindBuffer(gl.ARRAY_BUFFER, smokeBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, smokePoints, gl.STATIC_DRAW)
}

function refreshRoomBuffer() {
  mainPoints = new Float32Array(vertices.flat())
  loftRoomPoints = new Float32Array(loftVertices.flat())
  if (appSpace.kind === 'main') {
    applySceneBuffers()
  }
  if (appSpace.kind === 'loft') {
    applySceneBuffers()
  }
}

setupVertexArray({ array: lightArray, buffer: lightBuffer, data: lightPoints, gl, stride, usage: gl.DYNAMIC_DRAW })
setupStrobeArray({
  array: strobeArray,
  geometry: strobeGeometry,
  geometryBuffer: strobeGeometryBuffer,
  gl,
  instanceBuffer: strobeInstanceBuffer,
  instanceStride: strobeInstanceStride,
})
setupVertexArray({ array: smokeArray, buffer: smokeBuffer, data: smokePoints, gl, stride, usage: gl.STATIC_DRAW })
setupVertexArray({ array: characterArray, buffer: characterBuffer, data: 0, gl, stride, usage: gl.DYNAMIC_DRAW })
setupCharacterBoxArray({
  array: characterBoxArray,
  geometry: characterBoxGeometry,
  geometryBuffer: characterBoxGeometryBuffer,
  gl,
  instanceBuffer: characterBoxInstanceBuffer,
  instanceStride: characterBoxInstanceStride,
})
setupPostArray({ array: postArray, buffer: postBuffer, gl })
setupVertexArray({ array: beachBallArray, buffer: beachBallBuffer, data: 0, gl, stride, usage: gl.DYNAMIC_DRAW })
setupVertexArray({ array: graffitiArray, buffer: graffitiBuffer, data: graffitiPoints, gl, stride,
  usage: gl.STATIC_DRAW })

gl.enable(gl.DEPTH_TEST)
gl.clearColor(0.01, 0.01, 0.014, 1.0)

restoreClubState({
  camera: cameraController,
  characterPosition,
  hairController,
  idleClipCount: idleClipNames.length,
  idleClipIndex: idleClipState,
  key: saveKey,
  localCharacter,
  setAlternativeInput: useAlternativeInput,
  styleController,
})
djVideoUi.setZoneFromPosition()
djVideoUi.load()

function moveToRoom(room: number) {
  if (appSpace.kind === 'loft') {
    moveToLoft()
    return
  }

  const start = roomStarts[room]!

  characterPosition[0] = start.x
  characterPosition[1] = characterFloor
  characterPosition[2] = start.z
  localCharacter.turn = start.angle
  cameraController.turn = start.angle
  localCharacter.velocityY = 0
  djVideoUi.setZoneFromPosition()
  logPlayerPose(`room ${room}`)
}

function rememberMainPose() {
  lastMainPose = {
    room: currentRoomIndex(),
    turn: localCharacter.turn,
    x: characterPosition[0],
    y: characterPosition[1],
    z: characterPosition[2],
  }
}

function restoreMainPose() {
  if (!lastMainPose) {
    moveToRoom(activeRoom)
    return
  }

  activeRoom = lastMainPose.room
  requestedRoom = lastMainPose.room
  characterPosition[0] = lastMainPose.x
  characterPosition[1] = lastMainPose.y
  characterPosition[2] = lastMainPose.z
  localCharacter.turn = lastMainPose.turn
  cameraController.turn = lastMainPose.turn
  localCharacter.velocityY = 0
  djVideoUi.setZoneFromPosition()
  logPlayerPose(`room ${activeRoom}`)
}

function moveToLoft() {
  characterPosition[0] = loftSpawn.x
  characterPosition[1] = characterFloor
  characterPosition[2] = loftSpawn.z
  localCharacter.turn = loftSpawn.angle
  cameraController.turn = loftSpawn.angle
  localCharacter.velocityY = 0
  djVideoUi.setZoneFromPosition()
  logPlayerPose(`loft ${appSpace.kind === 'loft' ? appSpace.slug : ''}`)
}

function logPlayerPose(label: string) {
  // console.log(
  //   `${label}: x=${characterPosition[0].toFixed(2)} y=${characterPosition[1].toFixed(2)} z=${
  //     characterPosition[2].toFixed(2)
  //   } angle=${localCharacter.turn.toFixed(3)}`,
  // )
}

function logPlayerPoseEvery(stamp: number) {
  if (stamp >= lastPoseLog + 250) {
    lastPoseLog = stamp
    logPlayerPose(`room ${activeRoom}`)
  }
}

if (activeRoom !== currentRoomIndex()) {
  moveToRoom(activeRoom)
}
else {
  logPlayerPose(`room ${activeRoom}`)
}

function localMoveAngle() {
  const input = localCharacter.input
  const sin = Math.sin(cameraController.turn)
  const cos = Math.cos(cameraController.turn)
  const x = sin * input[2] - cos * input[0]
  const z = cos * input[2] + sin * input[0]

  return Math.atan2(x, z)
}

let multiplayer: ReturnType<typeof createMultiplayer>
let hasMultiplayer = false
const predictedMessages = new Map<string, number>()
const playerNicknames = new Map<number, string>()
const beachBalls = createBeachBalls()
let beachBallPoints = new Float32Array()
const beachBallAuthorityUntil = new Map<number, number>()
const beachBallAuthorityDuration = 2000
const graffitiSplats: import('./types.ts').GraffitiSplat[] = []
const graffitiIds = new Set<number>()
let graffitiSeed = Math.floor(Math.random() * 65536)
let lastSprayAt = 0
let sprayPointer = 0
const sprayInterval = 55
let graffitiPaintId = 0

function connectMultiplayer(spaceSlug?: string) {
  if (hasMultiplayer) {
    multiplayer.close()
  }

  hasMultiplayer = true
  predictedMessages.clear()
  playerNicknames.clear()
  chatUi.clear()
  chatLog.replaceChildren()
  clearAdminIdLabels()
  multiplayer = createMultiplayer({
    localPosition: characterPosition,
    localTurn: () => localCharacter.turn,
    localMoveAngle,
    localInput: localCharacter.input,
    localMode: () => localCharacter.mode,
    localIdleClipIndex: () => idleClipIndex,
    localNickname: () => nickname,
    localStyle: () => ({
      topStyleIndex: styleController.topStyleIndex,
      bottomStyleIndex: styleController.bottomStyleIndex,
      hairIndex: hairController.index,
      hairColorIndex: hairController.colorIndex,
      skinColorIndex: styleController.skinColorIndex,
      accessoryIndex: styleController.accessoryIndex,
    }),
    initialRoom: activeRoom,
    spaceSlug,
    onRoomState: room => {
      activeRoom = room
      requestedRoom = room
      saveCurrentClubState(true, room)
    },
    onMessage: (id, text) => {
      if (id === multiplayer.selfId && predictedMessages.has(text)) {
        const count = predictedMessages.get(text)!

        if (count === 1) {
          predictedMessages.delete(text)
        }
        else {
          predictedMessages.set(text, count - 1)
        }

        return
      }

      const position = id === multiplayer.selfId
        ? characterPosition
        : multiplayer.players.get(id)?.position

      const color = addChatLogMessage(id, text)
      if (position) {
        chatUi.show(id, text, position, performance.now(), color)
      }
    },
    onDeleteMessages: id => {
      deleteChatLogMessages(id)
      chatUi.removeMessages(id)
    },
    onNickname: (id, text) => {
      if (text) {
        playerNicknames.set(id, text)
      }
      else {
        playerNicknames.delete(id)
      }

      syncRemoteNicknameLabel(id)
    },
    onLeave: id => chatUi.remove(id),
    onOnlineCount: count => {
      onlineCountValue = count
      syncOnlineSelf()
    },
    onVideoPlaylistRequest: zones => djVideoUi.requestPlaylists(zones),
    onVideoSync: entries => djVideoUi.applySync(entries),
    onBeachBalls: balls => {
      const stamp = performance.now()

      for (const ball of balls) {
        if ((beachBallAuthorityUntil.get(ball.id) ?? 0) > stamp) {
          continue
        }

        const target = beachBalls[ball.id]!

        target.position[0] = ball.position[0]
        target.position[1] = ball.position[1]
        target.position[2] = ball.position[2]
        target.velocity[0] = ball.velocity[0]
        target.velocity[1] = ball.velocity[1]
        target.velocity[2] = ball.velocity[2]
      }
    },
    onGraffiti: splats => {
      const appended: import('./types.ts').GraffitiSplat[] = []
      const optimisticSplats = new Map(graffitiSplats
        .map((splat, index) => [splat.id === 0 ? graffitiKey(splat) : '', index] as const)
        .filter(([key]) => key !== ''))
      let rebuild = false

      for (const splat of splats) {
        if (graffitiIds.has(splat.id)) {
          continue
        }

        const optimistic = optimisticSplats.get(graffitiKey(splat)) ?? -1

        if (optimistic >= 0) {
          graffitiSplats[optimistic] = splat
          addGraffitiId(splat)
        }
        else {
          graffitiSplats.push(splat)
          addGraffitiId(splat)
          appended.push(splat)
        }
      }

      rebuild ||= enforceGraffitiCap()

      if (rebuild) {
        scheduleGraffitiTexturePaint(graffitiSplats, true)
      }
      else if (appended.length > 0) {
        scheduleGraffitiTexturePaint(appended, false)
      }
    },
    videoProgress: () => djVideoUi.progress(),
  })
  sendVideoEndedNow = entry => multiplayer.sendVideoEnded(entry)
  sendVideoPlaylistNow = (zone, ids) => multiplayer.sendVideoPlaylist([{ zone, ids }])
  clubGlobal.clubMultiplayerClose = () => multiplayer.close()
}

connectMultiplayer()

type LoftRoomPayload = {
  claimed: boolean
  displaySlug: string
  expired: boolean
  expiresAt: number
  musicKind: 'playlist' | 'video'
  musicSource: string
  slug: string
}

type LoftRoomListEntry = {
  displaySlug: string
  expiresAt: number
  musicKind: 'playlist' | 'video'
  musicSource: string
  players: number
  slug: string
}

const loftSlugInputPattern = /^[A-Za-z0-9_-]+$/
const loftExit = document.createElement('button')
const roomsDialog = document.createElement('dialog')
const roomsPanel = document.createElement('div')
const roomsHeader = document.createElement('div')
const roomsTitle = document.createElement('h2')
const roomsClose = document.createElement('button')
const roomsList = document.createElement('div')
const roomsActions = document.createElement('div')
const roomsRent = document.createElement('button')
const rentRoomDialog = document.createElement('dialog')
const rentRoomForm = document.createElement('form')
const rentRoomTitle = document.createElement('h2')
const rentRoomInput = document.createElement('input')
const rentRoomActions = document.createElement('div')
const rentRoomCancel = document.createElement('button')
const rentRoomSubmit = document.createElement('button')
const claimDialog = document.createElement('dialog')
const claimForm = document.createElement('form')
const claimTitle = document.createElement('h2')
const claimText = document.createElement('p')
const claimPassword = document.createElement('input')
const claimNext = document.createElement('button')
let pendingClaimSlug = ''

loftExit.id = 'loft-exit'
loftExit.type = 'button'
loftExit.textContent = '🚪'
loftExit.setAttribute('aria-label', 'exit loft')
loftExit.hidden = true
loftExit.addEventListener('click', () => enterMain(true))
roomsDialog.id = 'rooms-dialog'
roomsPanel.id = 'rooms-panel'
roomsHeader.id = 'rooms-header'
roomsTitle.textContent = 'rooms'
roomsClose.type = 'button'
roomsClose.textContent = '✕'
roomsClose.setAttribute('aria-label', 'close rooms')
roomsList.id = 'rooms-list'
roomsActions.id = 'rooms-actions'
roomsRent.type = 'button'
roomsRent.textContent = '🏘️ create'
roomsRent.setAttribute('aria-label', 'create a room')
roomsHeader.append(roomsTitle, roomsClose)
roomsActions.append(roomsRent)
roomsPanel.append(roomsHeader, roomsList, roomsActions)
roomsDialog.append(roomsPanel)
rentRoomDialog.id = 'rent-room-dialog'
rentRoomForm.method = 'dialog'
rentRoomTitle.textContent = 'create a room'
rentRoomActions.id = 'rent-room-actions'
rentRoomInput.placeholder = 'room-name'
rentRoomInput.maxLength = 64
rentRoomInput.autocomplete = 'off'
rentRoomSubmit.type = 'submit'
rentRoomSubmit.textContent = '👉'
rentRoomSubmit.setAttribute('aria-label', 'continue')
rentRoomCancel.type = 'button'
rentRoomCancel.textContent = '✕'
rentRoomCancel.setAttribute('aria-label', 'cancel')
rentRoomActions.append(rentRoomCancel, rentRoomSubmit)
rentRoomForm.append(rentRoomTitle, rentRoomInput, rentRoomActions)
rentRoomDialog.append(rentRoomForm)
claimDialog.id = 'loft-claim-dialog'
claimForm.method = 'dialog'
claimTitle.textContent = 'claim room'
claimPassword.type = 'password'
claimPassword.autocomplete = 'new-password'
claimPassword.value = 'admin'
claimPassword.placeholder = 'room password'
claimNext.type = 'submit'
claimNext.textContent = '🔑'
claimNext.setAttribute('aria-label', 'claim room')
claimForm.append(claimTitle, claimText, claimPassword, claimNext)
claimDialog.append(claimForm)
document.body.append(loftExit, roomsDialog, rentRoomDialog, claimDialog)
for (const input of [rentRoomInput, claimPassword]) {
  for (const eventName of ['keydown', 'keyup', 'pointerdown']) {
    input.addEventListener(eventName, event => event.stopPropagation())
  }
}

roomsButton.addEventListener('click', () => {
  void openRoomsDialog()
})

roomsClose.addEventListener('click', () => {
  roomsDialog.close()
  canvas.focus()
})

roomsDialog.addEventListener('click', event => {
  if (event.target === roomsDialog) {
    roomsDialog.close()
    canvas.focus()
  }
})

roomsRent.addEventListener('click', () => {
  roomsDialog.close()
  rentRoomInput.value = ''
  rentRoomDialog.showModal()
  rentRoomInput.focus()
})

rentRoomCancel.addEventListener('click', () => {
  rentRoomDialog.close()
  canvas.focus()
})

rentRoomDialog.addEventListener('click', event => {
  if (event.target === rentRoomDialog) {
    rentRoomDialog.close()
    canvas.focus()
  }
})

rentRoomForm.addEventListener('submit', event => {
  event.preventDefault()
  const slug = rentRoomInput.value.trim()

  if (!loftSlugInputPattern.test(slug)) {
    throw new Error(`Invalid room slug ${slug}`)
  }

  rentRoomDialog.close()
  void openLoftRoute(slug, true)
})

claimForm.addEventListener('submit', async event => {
  event.preventDefault()
  const room = await claimLoftRoom(pendingClaimSlug, claimPassword.value)

  claimDialog.close()
  activateLoft(room, true)
})

addEventListener('popstate', () => {
  void openCurrentRoute(false)
})

void openCurrentRoute(false)

async function openCurrentRoute(push: boolean) {
  const slug = routeSlug()

  if (slug) {
    await openLoftRoute(slug, push)
    return
  }

  enterMain(push)
}

async function openLoftRoute(slug: string, push: boolean) {
  const room = await fetchLoftRoom(slug)

  if (!room.claimed) {
    if (push && location.pathname !== `/${slug}`) {
      history.pushState(null, '', `/${slug}`)
    }

    await showClaimWizard(slug)
    return
  }

  activateLoft(room, push)
}

async function showClaimWizard(slug: string) {
  pendingClaimSlug = slug
  claimPassword.value = 'admin'
  syncClaimStep()
  claimDialog.showModal()
  claimPassword.focus()
}

async function openRoomsDialog() {
  roomsDialog.showModal()
  await refreshRoomsList()
}

async function refreshRoomsList() {
  roomsList.textContent = 'loading...'
  try {
    renderLoftRooms(await fetchLoftRooms())
  }
  catch (e) {
    console.error(e)
    roomsList.textContent = e instanceof Error ? e.message : String(e)
  }
}

function renderLoftRooms(rooms: LoftRoomListEntry[]) {
  roomsList.replaceChildren()
  if (rooms.length === 0) {
    const empty = document.createElement('p')

    empty.className = 'rooms-empty'
    empty.textContent = 'no rooms yet'
    roomsList.append(empty)
  }
  else {
    for (const room of rooms) {
      const row = document.createElement('div')
      const name = document.createElement('span')
      const count = document.createElement('span')
      const join = document.createElement('button')

      row.className = 'rooms-row'
      row.dataset.admin = String(adminView)
      name.className = 'rooms-name'
      count.className = 'rooms-count'
      join.type = 'button'
      name.textContent = `/${room.displaySlug}`
      count.textContent = `${room.players} online`
      join.textContent = '👉'
      join.setAttribute('aria-label', `join ${room.displaySlug}`)
      join.addEventListener('click', () => {
        roomsDialog.close()
        void openLoftRoute(room.displaySlug, true)
      })
      row.append(name, count, join)
      if (adminView) {
        const remove = document.createElement('button')

        remove.type = 'button'
        remove.textContent = '🗑️'
        remove.setAttribute('aria-label', `delete ${room.displaySlug}`)
        remove.addEventListener('click', async () => {
          adminPass = adminInput.value
          await deleteLoftRoom(room.slug, adminPass)
          renderLoftRooms(await fetchLoftRooms())
        })
        row.append(remove)
      }
      roomsList.append(row)
    }
  }
}

function syncClaimStep() {
  claimText.textContent = `Choose the admin password for /${pendingClaimSlug}.`
}

async function fetchLoftRoom(slug: string): Promise<LoftRoomPayload> {
  const response = await fetch(`/api/rooms/${encodeURIComponent(slug)}`)

  if (!response.ok) {
    throw new Error(`Room lookup failed ${response.status}`)
  }

  return await jsonApiResponse<LoftRoomPayload>(response, 'Room lookup')
}

async function fetchLoftRooms(): Promise<LoftRoomListEntry[]> {
  const response = await fetch('/api/rooms')

  if (!response.ok) {
    throw new Error(`Room list failed ${response.status}`)
  }

  return (await jsonApiResponse<{ rooms: LoftRoomListEntry[] }>(response, 'Room list')).rooms
}

async function claimLoftRoom(slug: string, password: string): Promise<LoftRoomPayload> {
  const response = await fetch(`/api/rooms/${encodeURIComponent(slug)}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })

  if (!response.ok) {
    throw new Error(`Room claim failed ${response.status}`)
  }

  return await jsonApiResponse<LoftRoomPayload>(response, 'Room claim')
}

async function deleteLoftRoom(slug: string, pass: string) {
  const response = await fetch(`/api/rooms/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pass }),
  })

  if (!response.ok) {
    throw new Error(`Room delete failed ${response.status}`)
  }
}

async function setLoftMusic(slug: string, pass: string, source: string): Promise<LoftRoomPayload> {
  const response = await fetch(`/api/rooms/${encodeURIComponent(slug)}/music`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pass, source }),
  })

  if (!response.ok) {
    throw new Error(`Room music failed ${response.status}`)
  }

  return await jsonApiResponse<LoftRoomPayload>(response, 'Room music')
}

async function jsonApiResponse<T>(response: Response, label: string): Promise<T> {
  const type = response.headers.get('content-type') ?? ''

  if (!type.includes('application/json')) {
    throw new Error(`${label} returned ${type || 'unknown content-type'}`)
  }

  return await response.json() as T
}

async function updateLoftMusic(pass: string, source: string) {
  if (appSpace.kind !== 'loft') {
    throw new Error('Room music can only be set inside a loft')
  }

  const room = await setLoftMusic(appSpace.slug, pass, source)

  appSpace = {
    displaySlug: room.displaySlug,
    kind: 'loft',
    musicKind: room.musicKind,
    musicSource: room.musicSource,
    slug: room.slug,
  }
  adminMusicInput.value = room.musicSource
  loftMusicSource.value = room.musicSource
  djVideoUi.setZoneFromPosition()
}

async function submitLoftMusicDialog() {
  await updateLoftMusic(loftMusicPassword.value, loftMusicSource.value)
  loftMusicDialog.close()
  canvas.focus()
}

function openLoftMusicDialog() {
  if (appSpace.kind !== 'loft') {
    throw new Error('Loft music dialog can only open inside a loft')
  }

  localCharacter.stopMoving()
  multiplayer.sendMotion()
  loftMusicSource.value = appSpace.musicSource
  loftMusicDialog.showModal()
  loftMusicPassword.focus()
}

function isInLoftMusicSpot() {
  return appSpace.kind === 'loft'
    && Math.abs(characterPosition[0] - loftVideoWall.x) <= loftVideoWall.width * 0.5
    && characterPosition[2] >= loftVideoWall.z + 0.35
    && characterPosition[2] <= loftDjBooth.z - loftDjBooth.depth * 0.18
}

function isAtLoftExitDoor() {
  return appSpace.kind === 'loft'
    && Math.abs(characterPosition[0] - loftDoor.x) <= loftDoor.width * 0.5
    && characterPosition[2] >= loftBounds.front - 1.05
}

function activateLoft(room: LoftRoomPayload, push: boolean) {
  if (appSpace.kind === 'main') {
    rememberMainPose()
  }
  loadLoftStatuesOnce()
  appSpace = {
    displaySlug: room.displaySlug,
    kind: 'loft',
    musicKind: room.musicKind,
    musicSource: room.musicSource,
    slug: room.slug,
  }
  if (push && location.pathname !== `/${room.displaySlug}`) {
    history.pushState(null, '', `/${room.displaySlug}`)
  }
  activeRoom = 0
  requestedRoom = 0
  applySceneBuffers()
  moveToLoft()
  resetLocalSpaceState()
  connectMultiplayer(room.slug)
  syncSpaceUi()
}

function enterMain(push: boolean) {
  if (appSpace.kind === 'main' && !push) {
    return
  }

  appSpace = { kind: 'main' }
  if (push && location.pathname !== '/') {
    history.pushState(null, '', '/')
  }
  applySceneBuffers()
  restoreMainPose()
  resetLocalSpaceState()
  connectMultiplayer()
  syncSpaceUi()
}

function resetLocalSpaceState() {
  const freshBalls = createBeachBalls()

  for (const ball of freshBalls) {
    const target = beachBalls[ball.id]!

    target.position[0] = ball.position[0]
    target.position[1] = ball.position[1]
    target.position[2] = ball.position[2]
    target.velocity[0] = ball.velocity[0]
    target.velocity[1] = ball.velocity[1]
    target.velocity[2] = ball.velocity[2]
  }
  beachBallAuthorityUntil.clear()
  updateBeachBallBuffer()
}

function syncSpaceUi() {
  loftExit.hidden = appSpace.kind !== 'loft'
  document.documentElement.dataset.space = appSpace.kind
  wasInLoftMusicSpot = false
  djVideoUi.setZoneFromPosition()
}

const styleActions: Record<
  'cycleHair' | 'cycleHairColor' | 'cycleSkin' | 'cycleIdle' | 'cycleShirt' | 'cyclePants' | 'cycleAccessory',
  (direction: number) => void
> = {
  cycleHair: direction => {
    hairController.cycleHair(direction)
    multiplayer.sendMotion()
  },
  cycleHairColor: direction => {
    hairController.cycleColor(direction)
    multiplayer.sendMotion()
  },
  cycleSkin: direction => {
    styleController.cycleSkin(direction)
    multiplayer.sendMotion()
  },
  cycleIdle: direction => {
    cycleIdle(direction)
    multiplayer.sendMotion()
  },
  cycleShirt: direction => {
    styleController.cycleShirt(direction)
    multiplayer.sendMotion()
  },
  cyclePants: direction => {
    styleController.cyclePants(direction)
    multiplayer.sendMotion()
  },
  cycleAccessory: direction => {
    styleController.cycleAccessory(direction)
    multiplayer.sendMotion()
  },
}

function messageWithNickname(text: string) {
  return text ? `${nicknameLabel(identityName(multiplayer.selfId, nickname))} ${text}` : text
}

function syncNickname(value = activeNicknameInput().value) {
  const next = value.trim()

  if (next !== nickname) {
    nickname = next
    nicknameInput.value = nickname
    introNicknameInput.value = nickname
    saveCurrentClubState(true)
    multiplayer.sendNickname()
  }
}

function saveCurrentClubState(characterAssetsLoaded: boolean, room = currentRoomIndex()) {
  if (appSpace.kind === 'loft') {
    return
  }

  saveClubState({
    camera: cameraController,
    characterAssetsLoaded,
    characterPosition,
    alternativeInput,
    hairController,
    idleClipIndex,
    key: saveKey,
    localCharacter,
    nickname,
    room,
    styleController,
  })
}

bindKeyboardInput({
  activeInputs: [introNicknameInput, nicknameInput, chatInput, rentRoomInput, claimPassword, loftMusicPassword,
    loftMusicSource],
  keys,
  startJumping: () => localCharacter.startJumping(),
  stopJumping: () => localCharacter.stopJumping(),
  startWave: () => localCharacter.startWave(),
  stopWave: () => localCharacter.stopWave(),
  openChatInput: () => openChatInput(),
  setAlternativeInput: useAlternativeInput,
  toggleHelp: () => {
    const open = helpUi.toggle()
    syncOnlineIndicator()

    if (!open) {
      localStorage.setItem(helpSeenKey, 'true')
    }
  },
  ...styleActions,
})

addEventListener('keydown', event => {
  if (event.key !== '`' || adminDialog.open || document.activeElement instanceof HTMLInputElement) {
    return
  }

  event.preventDefault()
  openAdminDialog()
})

createMobileControls({
  ...styleActions,
  openChatInput: () => toggleChatInput(false),
})
bindTapDestination({
  canvas,
  ignorePointer: event => styleController.accessoryIndex > glowstickColors.length,
  jump: target => {
    localCharacter.jumpToward(target)
    multiplayer.sendMotion()
  },
  projector: wallProjector,
  setDestination: value => localCharacter.setDestination(value, seatAt(value, occupiedSeats, 0.46, true)),
})

canvas.addEventListener('contextmenu', event => event.preventDefault())

canvas.addEventListener('pointerdown', event => {
  if (appSpace.kind === 'loft') {
    return
  }

  if (event.pointerType === 'mouse' && event.button !== 0) {
    return
  }

  if (styleController.accessoryIndex <= glowstickColors.length) {
    return
  }

  event.preventDefault()
  event.stopImmediatePropagation()
  sprayPointer = event.pointerId
  canvas.setPointerCapture(event.pointerId)
  sprayAt(event.clientX, event.clientY)
}, { capture: true })

canvas.addEventListener('pointermove', event => {
  if (event.pointerId !== sprayPointer) {
    return
  }

  if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
    return
  }

  event.preventDefault()
  event.stopImmediatePropagation()
  sprayAt(event.clientX, event.clientY)
}, { capture: true })

canvas.addEventListener('pointerup', event => {
  if (event.pointerId === sprayPointer) {
    sprayPointer = 0
    canvas.releasePointerCapture(event.pointerId)
  }
}, { capture: true })

canvas.addEventListener('pointercancel', event => {
  if (event.pointerId === sprayPointer) {
    sprayPointer = 0
    canvas.releasePointerCapture(event.pointerId)
  }
}, { capture: true })

function sprayAt(clientX: number, clientY: number) {
  if (appSpace.kind === 'loft') {
    return
  }

  const stamp = performance.now()

  if (stamp < lastSprayAt + sprayInterval) {
    return
  }

  const hit = sprayWallPoint(clientX, clientY, wallProjector)

  if (!hit) {
    return
  }

  lastSprayAt = stamp

  const splat = {
    id: 0,
    wall: hit.wall,
    x: hit.x,
    y: hit.y,
    seed: graffitiSeed++ & 0xffff,
    colorIndex: (styleController.accessoryIndex - glowstickColors.length - 1) % graffitiColors.length,
    radius: graffitiRadiusForScreenDistance(hit.distance),
  }

  graffitiSplats.push(splat)
  addGraffitiId(splat)
  if (enforceGraffitiCap()) {
    repaintGraffitiTexture()
  }
  else {
    paintGraffitiTexture([splat])
  }
  multiplayer.sendGraffiti([splat])
}

function addGraffitiId(splat: import('./types.ts').GraffitiSplat) {
  if (splat.id !== 0) {
    graffitiIds.add(splat.id)
  }
}

function deleteGraffitiId(splat: import('./types.ts').GraffitiSplat) {
  if (splat.id !== 0) {
    graffitiIds.delete(splat.id)
  }
}

function enforceGraffitiCap() {
  if (graffitiSplats.length <= maxGraffitiSplats) {
    return false
  }

  const removed = graffitiSplats.splice(0, graffitiSplats.length - maxGraffitiSplats)

  for (const splat of removed) {
    deleteGraffitiId(splat)
  }

  return true
}

function graffitiKey(splat: import('./types.ts').GraffitiSplat) {
  return `${splat.wall}:${splat.x}:${splat.y}:${splat.seed}:${splat.colorIndex}:${splat.radius}`
}

function sendChatMessage(message: string) {
  syncNickname()
  const text = multiplayer.sendMessage(messageWithNickname(message))

  if (text) {
    predictedMessages.set(text, (predictedMessages.get(text) ?? 0) + 1)
    const color = addChatLogMessage(multiplayer.selfId, text)

    chatUi.show(multiplayer.selfId, text, characterPosition, performance.now(), color)
  }
}

function scrollChatLogToBottom() {
  requestAnimationFrame(() => {
    chatLog.scrollTop = chatLog.scrollHeight
  })
}

function openChatInput(focus = true) {
  chatUi.open(focus)
  scrollChatLogToBottom()
}

function toggleChatInput(focus = true) {
  chatUi.toggle(focus)
  if (chatUi.isOpen()) {
    scrollChatLogToBottom()
  }
}

nicknameInput.addEventListener('change', () => syncNickname(nicknameInput.value))
nicknameInput.addEventListener('input', syncChatFormColor)

chatForm.addEventListener('submit', event => {
  event.preventDefault()
  sendChatMessage(chatUi.submit())
})

addEventListener('keydown', event => {
  if (event.key === 'Escape' && chatUi.isOpen()) {
    event.preventDefault()
    chatUi.close()
    canvas.focus()
  }
})

const resize = () => {
  const ratio = pixelRatio.ratio()
  const width = Math.floor(canvas.clientWidth * ratio)
  const height = Math.floor(canvas.clientHeight * ratio)
  const bloomWidth = Math.max(1, Math.floor(width * bloomScale.scale()))
  const bloomHeight = Math.max(1, Math.floor(height * bloomScale.scale()))
  const feedbackWidth = feedback.current.width
  const feedbackHeight = feedback.current.height

  if (canvas.width === width && canvas.height === height
    && bloomTarget.width === bloomWidth && bloomTarget.height === bloomHeight
    && feedbackWidth === width && feedbackHeight === height)
  {
    return
  }

  canvas.width = width
  canvas.height = height
  resizeTarget(gl, target, width, height)
  resizeTarget(gl, bloomTarget, bloomWidth, bloomHeight)
  if (feedbackWidth !== width || feedbackHeight !== height) {
    resizeTarget(gl, feedback.next, width, height)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, feedback.current.frame)
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, feedback.next.frame)
    gl.blitFramebuffer(0, 0, feedbackWidth, feedbackHeight, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.LINEAR)
    resizeTarget(gl, feedback.current, width, height)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, feedback.next.frame)
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, feedback.current.frame)
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST)
  }
  gl.viewport(0, 0, width, height)
}

function clearFeedback() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, feedback.current.frame)
  gl.clearColor(0, 0, 0, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.bindFramebuffer(gl.FRAMEBUFFER, feedback.next.frame)
  gl.clear(gl.COLOR_BUFFER_BIT)
}

function updateFeedbackAmount(stamp: number) {
  feedback.amount = feedbackToiletStartStamp === 0
    ? 0
    : feedbackRamp(stamp, feedbackToiletStartStamp, feedbackToiletStartAmount, feedbackToiletRampSeconds)
}

function feedbackRamp(stamp: number, startStamp: number, startAmount: number, seconds: number) {
  return mix(startAmount, feedbackMaxAmount, Math.min((stamp - startStamp) / (seconds * 1000), 1))
}

function updateFeedbackToiletVisit(stamp: number) {
  const inToilets = inToiletBounds(characterPosition[0], characterPosition[2])

  if (inToilets && !feedbackInToilets) {
    feedbackToiletStartStamp = stamp
    feedbackToiletStartAmount = feedback.amount
  }

  feedbackInToilets = inToilets
}

const draw = (stamp: number) => {
  const delta = lastStamp === 0 ? 0 : Math.min((stamp - lastStamp) / 1000, 0.05)
  const frame = Math.floor(stamp / 16.6667)

  strobeController.setFrame(frame)
  lastStamp = stamp
  pixelRatio.update(delta, stamp)
  bloomScale.update(delta, stamp)
  clubGlobal.clubPixelRatio = pixelRatio.ratio()
  resize()
  const inLoft = appSpace.kind === 'loft'

  localCharacter.update(delta, cameraController.turn, outsideTree, styleController.bottomMode, inLoft, occupiedSeats,
    seat => takeNpcSeat(npcPlayers, seat, stamp * 0.001, outsideTree, occupiedSeats))
  if (isAtLoftExitDoor()) {
    enterMain(true)
    frameId = requestAnimationFrame(draw)
    clubGlobal.clubFrameId = frameId
    return
  }
  const inLoftMusicSpot = isInLoftMusicSpot()

  if (inLoftMusicSpot && !wasInLoftMusicSpot && !loftMusicDialog.open) {
    openLoftMusicDialog()
  }
  wasInLoftMusicSpot = inLoftMusicSpot
  updateFeedbackToiletVisit(stamp)
  updateFeedbackAmount(stamp)
  const sitting = localCharacter.mode === 'manSitting' || localCharacter.mode === 'womanSitting'

  if (sitting) {
    feedbackSitSeconds += delta
    if (!feedbackSitReset && feedbackSitSeconds >= feedbackSitResetSeconds) {
      feedbackToiletStartStamp = 0
      feedbackToiletStartAmount = 0
      feedbackInToilets = inToiletBounds(characterPosition[0], characterPosition[2])
      feedback.amount = 0
      clearFeedback()
      feedbackSitReset = true
    }
  }
  else {
    feedbackSitSeconds = 0
    feedbackSitReset = false
  }
  if (!inLoft) {
    updateBeachBalls(beachBalls, delta, outsideTree)
  }
  const hits = inLoft ? [] : hitBeachBalls(beachBalls, characterPosition)

  for (const id of hits) {
    beachBallAuthorityUntil.set(id, stamp + beachBallAuthorityDuration)
  }
  if (hits.length > 0) {
    const activeBalls = beachBalls.filter(ball => hits.includes(ball.id))

    if (activeBalls.length > 0) {
      multiplayer.sendBeachBalls(activeBalls)
    }
  }
  // logPlayerPoseEvery(stamp)
  const zone = currentVideoZone()
  const room = currentRoomIndex()

  if (!inLoft && room !== requestedRoom) {
    requestedRoom = room
    multiplayer.sendMotion()
    multiplayer.sendRoomChange(room)
    activeRoom = room
  }
  else {
    multiplayer.sendMotionIfKeysChanged()
  }

  if (!inLoft) {
    updatePlayers(npcPlayers, delta, stamp * 0.001, outsideTree, occupiedSeats)
  }
  updateRemotePlayers(multiplayer.players.values(), delta, outsideTree)
  syncNicknameLabels()
  takeRemoteSeats()
  renderPlayers.length = 0
  renderPlayers.push(...(inLoft ? [] : npcPlayers), ...multiplayer.players.values())
  const dancing = zone !== 'tent' && localCharacter.mode === 'stand' && idleClipIndex > 0
  cameraController.update(delta, localCharacter.input, localCharacter.turn, lengthSq(localCharacter.input) > 0
    || dancing, localCharacter.jumping, inLoft)
  if (!inLoft) {
    saveTimer.update(delta, () => saveCurrentClubState(characterRenderSystem.assetsLoaded))
  }
  const camera = cameraController.get()
  strobeController.updateInstances(stamp * 0.001, zone)
  const lightCount = lightPoints.length / vertexSize

  const projector = createWallProjector(camera, canvas, wallProjector)

  if (introHidden) {
    djVideoUi.update(camera, projector)
  }
  chatUi.update(projector, stamp)
  updateAdminIdLabels(projector)

  const outside = !inLoft && isOutside(characterPosition)
  const moving = lengthSq(localCharacter.input) > 0

  if (outside && !wasOutside && moving) {
    doorCoverReleased = false
  }
  if (outside && !moving) {
    doorCoverReleased = true
  }
  if (!outside) {
    doorCoverReleased = true
  }

  wasOutside = outside
  const sky = !inLoft && zone === 'outside' && usesSkyBackground(camera)

  const characterCount = characterRenderSystem.update(stamp * 0.001)
  updateBeachBallBuffer()
  updateIntro()

  renderClubFrame({
    arrays: {
      character: characterArray,
      characterBox: characterBoxArray,
      light: lightArray,
      post: postArray,
      beachBalls: beachBallArray,
      graffiti: graffitiArray,
      room: array,
      smoke: smokeArray,
    },
    bloomTarget,
    camera,
    character: {
      boxGeometry: characterBoxGeometry,
      boxInstanceCount: characterRenderSystem.boxInstanceCount,
      boxProgram: characterBoxProgram,
      boxUniforms: characterBoxUniforms,
      count: characterCount,
      hairProgram,
      hairRenderMeshes: characterRenderSystem.hairRenderMeshes,
      hairUniforms,
    },
    characterPosition,
    feedback,
    gl,
    height: canvas.height,
    light: {
      count: lightCount,
      program: lightProgram,
      uniforms: {
        renderZone: lightRenderZone,
        smokeMap: lightSmokeMap,
        time: lightTime,
        viewProjection: lightViewProjection,
      },
    },
    doorCoverVisible: outside && doorCoverReleased,
    outside,
    renderZone: renderZoneIndex(zone),
    points,
    beachBallPoints,
    graffitiPoints: inLoft ? emptyPoints : graffitiPoints,
    graffitiTexture,
    post: {
      bloom: postBloom,
      bloomResolution: postBloomResolution,
      feedback: postFeedback,
      feedbackAmount: postFeedbackAmount,
      program: postProgram,
      renderSky: postRenderSky,
      scene: postScene,
      skyForward: postSkyForward,
      skyRight: postSkyRight,
      skyUp: postSkyUp,
    },
    program,
    roomUniforms: {
      bloomPass,
      cameraEye,
      doorCoverVisible,
      graffitiMap,
      renderZone,
      treeShadowSampler,
      viewProjection,
    },
    skyline: inLoft,
    sky,
    smoke: {
      map: smokeMap,
      points: smokePoints,
      program: smokeProgram,
      uniforms: {
        cameraRight: roomSmokeCameraRight,
        cameraUp: roomSmokeCameraUp,
        smokeMap: roomSmokeMap,
        time: roomSmokeTime,
        viewProjection: roomSmokeViewProjection,
      },
    },
    strobeController,
    target,
    time: stamp * 0.001,
    treeShadowMap,
    vertexSize,
    width: canvas.width,
  })

  frameId = requestAnimationFrame(draw)
  clubGlobal.clubFrameId = frameId
}

function updateBeachBallBuffer() {
  if (appSpace.kind === 'loft') {
    beachBallPoints = emptyPoints
    gl.bindBuffer(gl.ARRAY_BUFFER, beachBallBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, beachBallPoints, gl.DYNAMIC_DRAW)
    return
  }

  const points: Vertex[] = []

  addBeachBallGeometry(points, beachBalls)
  beachBallPoints = new Float32Array(points.flat())
  gl.bindBuffer(gl.ARRAY_BUFFER, beachBallBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, beachBallPoints, gl.DYNAMIC_DRAW)
}

function repaintGraffitiTexture() {
  graffitiContext.clearRect(0, 0, graffitiCanvas.width, graffitiCanvas.height)
  paintLoftPaintingTextures(graffitiContext)
  paintGraffitiTexture(graffitiSplats)
}

function scheduleGraffitiTexturePaint(splats: import('./types.ts').GraffitiSplat[], clear: boolean) {
  const paintId = ++graffitiPaintId
  const chunk = 1400
  let index = 0

  if (clear) {
    graffitiContext.clearRect(0, 0, graffitiCanvas.width, graffitiCanvas.height)
    paintLoftPaintingTextures(graffitiContext)
  }

  function paintNext() {
    if (paintId !== graffitiPaintId) {
      return
    }

    paintGraffitiSplats(graffitiContext, splats.slice(index, index + chunk))
    index += chunk

    if (index < splats.length) {
      requestAnimationFrame(paintNext)
      return
    }

    gl.bindTexture(gl.TEXTURE_2D, graffitiTexture)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, graffitiCanvas)
  }

  requestAnimationFrame(paintNext)
}

function paintGraffitiTexture(splats: import('./types.ts').GraffitiSplat[]) {
  graffitiPaintId++
  paintLoftPaintingTextures(graffitiContext)
  paintGraffitiSplats(graffitiContext, splats)
  gl.bindTexture(gl.TEXTURE_2D, graffitiTexture)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, graffitiCanvas)
}

function updateIntro() {
  const progress = Math.round((
    Number(characterRenderSystem.assetsLoaded)
    + Number(characterRenderSystem.detailsLoaded)
    + Number(buddhaLoaded)
    + Number(palmTreeLoaded)
    + Number(rocksLoaded)
    + Number(treeLoaded)
  ) / 6 * 100)

  introProgress.textContent = `${progress}%`
  introBar.style.transform = `scaleX(${progress / 100})`
  introStart.dataset.ready = String(progress >= 75 && !videoPlaying)

  const ready = progress === 100 && videoPlaying

  if (ready && !introHidden) {
    introHidden = true
    intro.dataset.hidden = 'true'

    if (helpSeen) {
      helpUi.hide()
      syncOnlineIndicator()
    }
  }

  return progress
}

function takeRemoteSeats() {
  for (const seat of remoteSeats) {
    occupiedSeats.delete(seat)
  }

  remoteSeats.clear()

  for (const player of multiplayer.players.values()) {
    if (lengthSq(player.input) === 0) {
      const seat = seatAt(player.position, occupiedSeats, 0.46, true)

      if (seat) {
        occupiedSeats.add(seat.id)
        remoteSeats.add(seat.id)
      }
    }
  }
}

import.meta.hot?.dispose(() => {
  cancelAnimationFrame(frameId)
  multiplayer.close()
})

const strobeLights = createStrobeLights()
const strobeController = createStrobeDrawController({
  array: strobeArray,
  characterPosition,
  geometry: strobeGeometry,
  gl,
  instanceBuffer: strobeInstanceBuffer,
  instanceSize: strobeInstanceSize,
  lights: strobeLights,
  program: strobeProgram,
  smokeMap,
  uniforms: {
    renderZone: strobeRenderZone,
    smokeMap: strobeSmokeMap,
    time: strobeTime,
    viewProjection: strobeViewProjection,
  },
})
const { addLocalReflection, addSunLitTriangle } = createSceneLighting({
  getTree: () => outsideTree,
  strobeReflection: (point, normal) => strobeController.reflection(point, normal),
})
const npcPlayers = createPlayers(250, outsideTree, occupiedSeats)
const renderPlayers: Player[] = [...npcPlayers]
const characterRenderSystem = createCharacterRenderSystem({
  boxInstanceBuffer: characterBoxInstanceBuffer,
  boxInstanceSize: characterBoxInstanceSize,
  buffer: characterBuffer,
  camera: cameraController,
  canvas,
  characterPosition,
  gl,
  hairController,
  idleClipIndex: () => idleClipIndex,
  light: addLocalReflection,
  localCharacter,
  players: renderPlayers,
  styleController,
  vertexSize,
})

frameId = requestAnimationFrame(draw)
clubGlobal.clubFrameId = frameId

characterRenderSystem.loadOnce().catch((error: unknown) => {
  void error
})

loadOutsideTree(gl, treeShadowMap, vertices, outsideTree, addSunLitTriangle)
  .then(nextTree => {
    outsideTree = nextTree
    treeLoaded = true
    refreshRoomBuffer()
  })
  .catch((error: unknown) => {
    console.error(error)
  })

loadOutsideTree(gl, treeShadowMap, vertices, outsidePalmTree, addSunLitTriangle, {
  color: palmTreeMeshColor,
  height: 5.94,
  name: 'palmtree.fbx',
  nodeTransforms: true,
  path: '/palmtree.fbx',
  shadow: false,
  sourceUp: 'y',
})
  .then(() => {
    palmTreeLoaded = true
    refreshRoomBuffer()
  })
  .catch((error: unknown) => {
    console.error(error)
  })

loadStaticFbxObject(vertices, {
  color: [0.46, 0.42, 0.36],
  height: 2.9,
  lightBounds: { x: outsideBuddha.x, z: 29.3, radius: 0.95 },
  path: '/buddha.fbx',
  position: [outsideBuddha.x, characterFloor, outsideBuddha.z],
  sourceUp: 'z',
  turn: Math.PI,
}, addSunLitTriangle)
  .then(() => {
    buddhaLoaded = true
    refreshRoomBuffer()
  })
  .catch((error: unknown) => {
    void error
  })

loadStaticFbxObjects(vertices, '/rocks.fbx', rockPlacements().map(rock => ({
  color: [0.29, 0.27, 0.24],
  height: rock.height,
  lightBounds: { x: rock.position[0], z: rock.position[2], radius: 0.7 },
  meshIndex: rock.meshIndex,
  path: '/rocks.fbx',
  position: rock.position,
  sourceUp: 'z',
  turn: rock.turn,
})), addSunLitTriangle)
  .then(() => {
    rocksLoaded = true
    refreshRoomBuffer()
  })
  .catch((error: unknown) => {
    console.error(error)
  })

function loftPlantMeshColor(meshIndex: number): Vec3 {
  const colors: Vec3[] = [
    [0.018, 0.015, 0.012],
    [0.055, 0.055, 0.05],
    [0.025, 0.018, 0.012],
    [0.05, 0.22, 0.08],
    [0.14, 0.56, 0.18],
  ]

  return colors[meshIndex] ?? [0.14, 0.56, 0.18]
}

function addLoftPlantTriangle(target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3) {
  addLoftNeutralTriangle(target, a, b, c, color, 0.18)
}

function addLoftNeutralTriangle(target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3, greenBoost = 0) {
  addLoftShadedTriangle(target, a, b, c, color, 0.44, 0.42, greenBoost)
}

function addLoftShadedTriangle(target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3, base: number, range: number,
  greenBoost = 0)
{
  const ux = c[0] - a[0]
  const uy = c[1] - a[1]
  const uz = c[2] - a[2]
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const vz = b[2] - a[2]
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const normalLength = Math.sqrt(nx * nx + ny * ny + nz * nz)

  if (normalLength === 0) {
    throw new Error('Cannot shade zero-area plant triangle')
  }

  const lift = Math.max(0, ny / normalLength)
  const light = base + lift * range
  const shade: Vec3 = [
    Math.min(color[0] * light, 1),
    Math.min(color[1] * (light + greenBoost), 1),
    Math.min(color[2] * light, 1),
  ]

  target.push(
    [a[0], a[1], a[2], shade[0], shade[1], shade[2], 0, 0, 0, 0, 0],
    [b[0], b[1], b[2], shade[0], shade[1], shade[2], 0, 0, 0, 0, 0],
    [c[0], c[1], c[2], shade[0], shade[1], shade[2], 0, 0, 0, 0, 0],
  )
}

function addLoftStatueTriangle(target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3) {
  addLoftShadedTriangle(target, a, b, c, color, 0.34, 1.18)
}

let loftStatuesLoad: Promise<void> | undefined

function loadLoftStatuesOnce() {
  loftStatuesLoad ??= Promise.all(loftCornerFigures.map((figure, index) =>
    loadStaticFbxObjectWithPose(loftVertices, {
      animationPath: '/idle.fbx',
      animationTime: 0,
      color: [0.82, 0.82, 0.78],
      height: 2.55,
      lightBounds: figure,
      nodeTransforms: true,
      path: index === 0 ? '/arissa.fbx' : '/medea.fbx',
      position: [figure.x, characterFloor + 0.43, figure.z],
      sourceUp: 'y',
      turn: Math.PI,
    }, addLoftStatueTriangle)
  ))
    .then(() => {
      refreshRoomBuffer()
    })
    .catch((error: unknown) => {
      console.error(error)
    })
}

loadStaticFbxObjects(loftVertices, '/plant.fbx', loftPlants.map((plant, index) => ({
  color: loftPlantMeshColor,
  height: 1.75,
  lightBounds: plant,
  nodeTransforms: true,
  path: '/plant.fbx',
  position: [plant.x, characterFloor, plant.z],
  sourceUp: 'y',
  turn: index === 0 ? 0.35 : -0.35,
})), addLoftPlantTriangle)
  .then(() => {
    refreshRoomBuffer()
  })
  .catch((error: unknown) => {
    console.error(error)
  })
