import { createAdaptiveBloomScale, createAdaptivePixelRatio } from './adaptive-pixel-ratio.ts'
import { createArcadeUi } from './arcade-ui.ts'
import { createBeachBalls, hitBeachBalls, updateBeachBalls, writeBeachBallGeometry } from './beach-balls.ts'
import { createBubbleSystem, writeBubbleGeometry } from './bubbles.ts'
import { characterCoreChunkCount, idleClipNames } from './character-assets.ts'
import { resetVertexWriter, vertexWriterData } from './character-geometry.ts'
import { createCharacterStyleController, glowstickColors, resolveAccessoryKind } from './character-style.ts'
import { cigaretteExhale, cigaretteHeldSmoke, cigaretteTipSmoke } from './cigarette.ts'
import { restoreClubState, saveClubState } from './club-persistence.ts'
import { createSaveTimer, readClubState } from './club-state.ts'
import { addRoom, addRoomSmoke, addWallStrips } from './environment-object.ts'
import { createFoamSystem, writeFoamGeometry } from './foam.ts'
import {
  canRenderGraffitiTextureInWorker,
  renderGraffitiTextureInWorker,
} from './graffiti-loader.ts'
import {
  addGraffitiWallGeometry,
  createGraffitiCanvas,
  foodTruckGraffitiTriangle,
  graffitiColors,
  graffitiRadiusForScreenDistance,
  graffitiTextureSize,
  maxGraffitiSplats,
  paintGraffitiSplats,
  paintLoftPaintingTextures,
  paintTShirtLogoTexture,
  sprayWallPoint,
} from './graffiti.ts'
import { bindKeyboardInput, setAlternativeInput } from './input.ts'
import { createInstagramLink } from './instagram-link.ts'
import { addLoftLightGeometry, addLoftRoom, addLoftSmoke, loftSpawn } from './loft-scene.ts'
import { lengthSq, mix } from './math.ts'
import { bindTapDestination, createMobileControls } from './mobile-controls.ts'
import { createMultiplayer, updateRemotePlayers } from './multiplayer.ts'
import { createPlayers, takeNpcSeat, updatePlayers } from './player-system.ts'
import type { ProjectedPoint, Viewport, WallProjector } from './projection.ts'
import { createWallProjector, projectWallPointInto, projectWallPointWithMinDepthInto } from './projection.ts'
import { ACTION_BUBBLING, ACTION_FOAMING, instagramMaxLength } from './protocol.ts'
import { emojiReactionFromMessage, pickerEmojis, reactionEmojis } from './reactions.ts'
import {
  bartenderDrinkWall,
  insideArcade,
  insideArcadeScreenWall,
  loftBounds,
  loftCornerFigures,
  loftDjBooth,
  loftDoor,
  loftPlants,
  loftVideoWall,
  outsideBounds,
  outsideBuddha,
  outsideFoodTruck,
  outsideFoodTruckFoodWall,
  outsideFoodTruckTurn,
  outsideHutDrinkWall,
  outsidePalmTree,
  outsideToilets,
  outsideTShirtStands,
  roomBounds,
  tent,
  tentDoorAngle,
} from './scene-data.ts'
import {
  isOutside,
  nearInsideArcade,
  roomAt,
  seatAt,
  usesSkyBackground,
  walkHeight,
  walkLoftHeight,
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
import { createSmokeSystem, writeSmokeGeometry } from './smoke-puff.ts'
import { loadStaticFbxObject, loadStaticFbxObjects, loadStaticFbxObjectWithPose } from './static-fbx-object.ts'
import type {
  CharacterMode,
  CircleBounds,
  ClubGlobal,
  GraffitiSplat,
  Player,
  Vec3,
  Vertex,
  VideoPreview,
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
  createImageTexture,
  createProgram,
  createSmokeMap,
  createStrobeGeometry,
  createTarget,
  createTreeShadowMap,
  resizeTarget,
} from './webgl.ts'

import { createCameraController } from './camera-controller.ts'
import { characterFloor } from './character-data.ts'
import type { VertexWriter } from './character-geometry.ts'
import { createCharacterHairController } from './character-hair-control.ts'
import { createCharacterRenderSystem } from './character-render-system.ts'
import { createChatUi } from './chat-ui.ts'
import { renderClubFrame } from './club-renderer.ts'
import { dayCycleAt } from './constants.ts'
import { createDjVideoUi } from './dj-video-ui.ts'
import { getDomElements } from './dom-elements.ts'
import { createDomWallProjection, domWallCorners } from './dom-wall.ts'
import { createHelpUi } from './help-ui.ts'
import { createIntroEffect } from './intro-effect.ts'
import { createLocalCharacter } from './local-character.ts'
import { createPhotoWallRenderer } from './photo-wall-renderer.ts'
import { createPhotoWallUi } from './photo-wall-ui.ts'
import type { MessagePacket, VideoEndedEntry } from './protocol.ts'
import { createSceneLighting } from './scene-lighting.ts'
import { createStrobeDrawController } from './strobe-draw.ts'
import { createStrobeLights } from './strobe-object.ts'
import { loadOutsideTree, updateOutsideTreeShadowMap } from './tree-world.ts'
import { createVideoPreviewRenderer } from './video-preview-renderer.ts'

const clubGlobal = globalThis as ClubGlobal

if (clubGlobal.clubFrameId !== undefined) {
  cancelAnimationFrame(clubGlobal.clubFrameId)
}

clubGlobal.clubMultiplayerClose?.()

const {
  canvas,
  djVideo,
  photoWall,
  chatForm,
  chatInput,
  chatBubble,
  chatLog,
  onlineCount,
  onlineIndicator,
  onlineSelf,
  onlineText,
  reactionButtons,
  breakdanceButton,
  waveButton,
  bubbleButton,
  foamButton,
  photoButton,
  roomsButton,
  supportLink,
  merchCards,
  intro,
  introEffect,
  introBar,
  introInstagramInput,
  introNicknameInput,
  introProgress,
  introStart,
} = getDomElements()

let resizeDirty = true

function syncViewportSize() {
  const viewport = visualViewport
  const offsetLeft = viewport?.offsetLeft ?? 0
  const offsetTop = viewport?.offsetTop ?? 0
  const width = viewport?.width ?? innerWidth
  const height = viewport?.height ?? innerHeight

  document.documentElement.style.setProperty('--app-bottom', `${Math.max(0, innerHeight - height - offsetTop)}px`)
  document.documentElement.style.setProperty('--app-height', `${height}px`)
  document.documentElement.style.setProperty('--app-left', `${offsetLeft}px`)
  document.documentElement.style.setProperty('--app-top', `${offsetTop}px`)
  document.documentElement.style.setProperty('--app-width', `${width}px`)
  scrollTo(0, 0)
  resizeDirty = true
}

syncViewportSize()
addEventListener('resize', syncViewportSize)
visualViewport?.addEventListener('resize', syncViewportSize)
visualViewport?.addEventListener('scroll', syncViewportSize)

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
let onlineIdleValue = 0
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
let instagram = normalizeInstagram(savedState?.instagram ?? '')
introNicknameInput.value = nickname
introInstagramInput.value = instagram
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
const photoWallUi = createPhotoWallUi(photoWall, {
  admin: () => ({ enabled: adminView, pass: adminPass }),
  alternativeInput: () => alternativeInput,
  recoverFocus: () => canvas.focus(),
})
const helpUi = createHelpUi()
const helpSeen = localStorage.getItem(helpSeenKey) === 'true'
const cameraController = createCameraController(canvas, characterPosition)
let arcadeReady = true
const arcadeUi = createArcadeUi({
  onClose: exitArcadeMode,
})
const reactionSlotEmojis = loadReactionSlotEmojis()
const foodTruckEmojis = [
  '🍕',
  '🍔',
  '🌭',
  '🌮',
  '🌯',
  '🥙',
  '🍟',
  '🍗',
  '🍖',
  '🥨',
  '🥐',
  '🥯',
  '🍩',
  '🍪',
  '🧁',
  '🍰',
  '🍦',
  '🍧',
  '🍉',
  '🍌',
  '🍓',
  '🥝',
  '🍍',
  '🥤',
] as const
const drinkWallEmojis = [
  '🍺',
  '🍻',
  '🥂',
  '🍷',
  '🍸',
  '🍹',
  '🍾',
  '🥃',
  '🧉',
  '🍶',
  '☕',
  '🧃',
  '🥤',
  '🧋',
  '🍵',
  '🫖',
  '🥛',
  '💧',
] as const
const foodTruckWall = createEmojiDomWall('food-truck-wall', 'food-truck-emoji', foodTruckEmojis)
const foodTruckWallProjection = createDomWallProjection(foodTruckWall, {
  opacity: '0.94',
  pointerEvents: 'auto',
  scale: 112,
})
const bartenderDrinkWallElement = createEmojiDomWall('bartender-drink-wall', 'drink-wall-emoji', drinkWallEmojis)
const bartenderDrinkWallProjection = createDomWallProjection(bartenderDrinkWallElement, {
  opacity: '0.94',
  pointerEvents: 'auto',
  scale: 112,
})
const outsideHutDrinkWallElement = createEmojiDomWall('outside-hut-drink-wall', 'drink-wall-emoji', drinkWallEmojis)
const outsideHutDrinkWallProjection = createDomWallProjection(outsideHutDrinkWallElement, {
  opacity: '0.94',
  pointerEvents: 'auto',
  scale: 112,
})
const merchStandDistance = 2.4

function syncMerchCards(outside: boolean) {
  const nearStand = outsideTShirtStands.some(stand => {
    const x = characterPosition[0] - stand.x
    const z = characterPosition[2] - stand.z

    return x * x + z * z < merchStandDistance * merchStandDistance
  })
  const open = introHidden && outside && helpUi.root.dataset.open !== 'true'
    && nearStand

  merchCards.dataset.open = String(open)
}

function syncOnlineIndicator() {
  onlineIndicator.dataset.hidden = String(helpUi.root.dataset.open === 'true')
  reactionButtons.dataset.hidden = String(helpUi.root.dataset.open === 'true')
  breakdanceButton.dataset.hidden = String(helpUi.root.dataset.open === 'true')
  waveButton.dataset.hidden = String(helpUi.root.dataset.open === 'true')
  bubbleButton.dataset.hidden = String(helpUi.root.dataset.open === 'true')
  foamButton.dataset.hidden = String(helpUi.root.dataset.open === 'true')
  photoButton.dataset.hidden = String(helpUi.root.dataset.open === 'true')
  roomsButton.dataset.hidden = String(helpUi.root.dataset.open === 'true')
  supportLink.dataset.hidden = String(helpUi.root.dataset.open === 'true')
}

function setupReactionButtons() {
  const picker = createReactionPicker()

  reactionSlotEmojis.forEach((emoji, index) => {
    const button = document.createElement('button')
    let longPress: ReturnType<typeof setTimeout> | undefined
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

function createEmojiDomWall(id: string, buttonClass: string, emojis: readonly string[]) {
  const wall = document.createElement('div')

  wall.id = id
  wall.className = 'emoji-dom-wall'
  for (const emoji of emojis) {
    const button = document.createElement('button')

    button.type = 'button'
    button.className = buttonClass
    button.textContent = emoji
    button.setAttribute('aria-label', emoji)
    button.addEventListener('pointerdown', event => event.stopPropagation())
    button.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      sendChatMessage(emoji)
      canvas.focus()
    })
    wall.append(button)
  }

  document.body.append(wall)

  return wall
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

type ChatLogEntry = MessagePacket & {
  color: string
  emoji?: string
}

const chatLogRows = new WeakMap<HTMLElement, ChatLogEntry[]>()

function addChatLogMessage(packet: MessagePacket) {
  const color = chatMessageColor(packet)
  const emoji = emojiReactionFromMessage(packet.text)
  const last = chatLog.lastElementChild

  if (emoji && last instanceof HTMLElement) {
    const entries = chatLogRows.get(last)
    const entry = { ...packet, color, emoji }

    if (entries?.every(entry => entry.emoji) && chatLogEntryKey(entries[0]!) === chatLogEntryKey(entry)) {
      entries.push(entry)
      renderChatLogRow(last)
      chatLog.scrollTop = chatLog.scrollHeight

      return color
    }
  }

  const row = document.createElement('div')
  const message = document.createElement('span')
  const ban = document.createElement('button')

  row.className = 'chat-log-message'
  row.style.color = color
  ban.type = 'button'
  ban.className = 'chat-ban-button'
  ban.textContent = 'ban'
  let pointerBanAt = 0
  const sendBan = (event: Event) => {
    const entry = chatLogRows.get(row)![0]!

    console.log(`Ban ${event.type}: id=${entry.id}`)
    event.preventDefault()
    event.stopPropagation()
    if (event.type === 'click' && performance.now() - pointerBanAt < 500) {
      return
    }
    if (event.type === 'pointerdown') {
      pointerBanAt = performance.now()
    }
    openBanDialog(entry.id, `user with message: ${entry.text}`)
  }
  ban.addEventListener('pointerdown', sendBan, { capture: true })
  ban.addEventListener('click', sendBan)
  row.append(ban, message)
  chatLogRows.set(row, [{ ...packet, color, emoji }])
  renderChatLogRow(row)
  chatLog.append(row)
  chatLog.scrollTop = chatLog.scrollHeight

  return color
}

function renderChatLogRow(row: HTMLElement) {
  const entries = chatLogRows.get(row)!
  const message = row.querySelector('span')!
  const first = entries[0]!

  row.style.color = first.color
  row.dataset.userIds = entries.map(entry => entry.id).join(' ')
  if (entries.every(entry => entry.emoji)) {
    message.replaceChildren()
    renderChatLogEntryLabel(message, first)
    message.append(document.createTextNode(` ${entries.map(entry => entry.emoji).join(' ')}`))
  }
  else {
    renderChatLogText(message, first)
  }
}

function chatLogEntryLabel(entry: ChatLogEntry) {
  return nicknameLabel(identityName(entry.id, entry.nick))
}

function chatLogEntryKey(entry: ChatLogEntry) {
  return `${chatLogEntryLabel(entry)}\n${entry.insta}`
}

function renderChatLogEntryLabel(target: HTMLElement, entry: ChatLogEntry) {
  renderChatNickname(target, chatLogEntryLabel(entry), entry.insta)
}

function renderChatLogText(target: HTMLElement, entry: ChatLogEntry) {
  target.replaceChildren()
  const text = entry.text

  renderChatNickname(target, chatLogEntryLabel(entry), entry.insta)
  target.append(document.createTextNode(' '))
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

function renderChatNickname(target: HTMLElement, label: string, instagram: string) {
  if (!instagram) {
    target.append(document.createTextNode(label))
    return
  }

  target.append(createInstagramLink(label, instagram))
}

function roomSlugMatches(text: string) {
  const matches: { display: string; end: number; slug: string; start: number }[] = []
  const pattern = /https?:\/\/[^\s]+|\/[A-Za-z0-9_-]+/g

  for (const match of text.matchAll(pattern)) {
    const value = match[0]
    const start = match.index
    const room = value.startsWith('/')
      ? bareRoomSlugMatch(value, text, start)
      : roomUrlMatch(value, start)

    if (room) {
      matches.push(room)
    }
  }

  return matches
}

function bareRoomSlugMatch(value: string, text: string, start: number) {
  if (text[start - 1] !== ' ') {
    return
  }

  return { display: value.slice(1), end: start + value.length, slug: value.slice(1), start }
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
    if (row instanceof HTMLElement) {
      const entries = chatLogRows.get(row)

      if (entries?.some(entry => entry.id === id)) {
        const next = entries.filter(entry => entry.id !== id)

        if (next.length) {
          chatLogRows.set(row, next)
          renderChatLogRow(row)
        }
        else {
          row.remove()
        }
      }
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
const photoPreviewDialog = document.createElement('dialog')
const photoPreviewPolaroid = document.createElement('div')
const photoPreviewImage = document.createElement('img')
const photoPreviewMessage = document.createElement('div')
const photoPreviewActions = document.createElement('div')
const photoPreviewCancel = document.createElement('button')
const photoPreviewSave = document.createElement('button')

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
adminMusicInput.placeholder = 'youtube url or id'
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
loftMusicSource.placeholder = 'youtube url or id'
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
photoPreviewDialog.id = 'photo-preview-dialog'
photoPreviewPolaroid.id = 'photo-preview-polaroid'
photoPreviewImage.id = 'photo-preview-image'
photoPreviewImage.alt = 'photo preview'
photoPreviewMessage.id = 'photo-preview-message'
photoPreviewMessage.setAttribute('role', 'status')
photoPreviewMessage.setAttribute('aria-live', 'polite')
photoPreviewActions.id = 'photo-preview-actions'
photoPreviewCancel.type = 'button'
photoPreviewCancel.textContent = '✕'
photoPreviewCancel.setAttribute('aria-label', 'discard photo')
photoPreviewSave.type = 'button'
photoPreviewSave.textContent = '✓'
photoPreviewSave.setAttribute('aria-label', 'save photo')
photoPreviewActions.append(photoPreviewCancel, photoPreviewSave)
photoPreviewPolaroid.append(photoPreviewImage, photoPreviewMessage, photoPreviewActions)
photoPreviewDialog.append(photoPreviewPolaroid)
document.body.append(adminDialog, loftMusicDialog, banDialog, photoPreviewDialog)
for (const eventName of ['keydown', 'keyup', 'pointerdown']) {
  adminInput.addEventListener(eventName, event => event.stopPropagation())
  adminBanIdInput.addEventListener(eventName, event => event.stopPropagation())
  adminMusicInput.addEventListener(eventName, event => event.stopPropagation())
  loftMusicPassword.addEventListener(eventName, event => event.stopPropagation())
  loftMusicSource.addEventListener(eventName, event => event.stopPropagation())
}

let pendingBan: { id: number; message: string } | undefined
let pendingPhoto: { blob: Blob; url: string } | undefined

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

photoPreviewCancel.addEventListener('click', () => {
  dismissPhotoPreview()
})

photoPreviewDialog.addEventListener('cancel', event => {
  event.preventDefault()
  dismissPhotoPreview()
})

photoPreviewDialog.addEventListener('click', event => {
  if (event.target === photoPreviewDialog) {
    dismissPhotoPreview()
  }
})

photoPreviewSave.addEventListener('click', () => {
  void savePhotoPreview()
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
  photoWallUi.syncAdmin()
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

function chatMessageColor(message: MessagePacket) {
  const name = identityName(message.id, message.nick)

  return identityColor(name)
}

function chatMessageKey(message: Pick<MessagePacket, 'id' | 'text'>) {
  return `${message.id}\n${message.text}`
}

function mentionsNickname(text: string) {
  const name = nickname.trim()

  if (!name) {
    return false
  }

  return new RegExp(`(^|\\s)${escapeRegExp(name)}(?=$|\\s|[^\\p{L}\\p{N}_])`, 'iu').test(text)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function playMentionDing() {
  mentionDing.currentTime = 0
  mentionDing.play().catch((e: unknown) => console.error(e))
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

function syncOnlineSelf() {
  const name = identityName(multiplayer?.selfId || 0, nickname)
  if (
    name === lastOnlineSelfName
    && onlineCountValue === lastOnlineCountValue
    && onlineIdleValue === lastOnlineIdleValue
  ) {
    return
  }

  lastOnlineSelfName = name
  lastOnlineCountValue = onlineCountValue
  lastOnlineIdleValue = onlineIdleValue

  const label = nicknameLabel(name)
  const color = identityColor(name)
  const text = ` ${onlineCountValue} online (${onlineIdleValue} idle)`

  if (label !== lastOnlineSelfLabel) {
    onlineSelf.textContent = label
    lastOnlineSelfLabel = label
  }
  if (color !== lastOnlineSelfColor) {
    onlineSelf.style.color = color
    lastOnlineSelfColor = color
  }
  if (text !== lastOnlineText) {
    onlineText.textContent = text
    lastOnlineText = text
  }
}

function syncChatFormColor() {
  const next = introHidden ? nickname : normalizeNickname(introNicknameInput.value)
  const selfId = multiplayer?.selfId || 0

  if (next === lastChatFormIdentity && selfId === lastChatFormSelfId) {
    if (selfId > 0) {
      syncOnlineSelf()
    }
    return
  }

  lastChatFormIdentity = next
  lastChatFormSelfId = selfId

  const color = identityColor(identityName(selfId, next))

  if (color !== lastChatFormColor) {
    chatForm.style.color = color
    lastChatFormColor = color
  }
  if (color !== lastIntroNicknameColor) {
    introNicknameInput.style.color = color
    lastIntroNicknameColor = color
  }
  if (selfId > 0) {
    syncOnlineSelf()
  }
}

function syncNicknameLabels() {
  syncChatFormColor()

  for (const [id, player] of multiplayer.players) {
    const name = identityName(id, playerNicknames.get(id))
    const cached = cachedNicknameLabel(id, name, playerInstagrams.get(id) ?? '')

    chatUi.setLabel(id, cached.label, player.position, cached.color, cached.instagram)
  }
}

function syncRemoteNicknameLabel(id: number) {
  const player = multiplayer.players.get(id)

  if (player) {
    const name = identityName(id, playerNicknames.get(id))
    const cached = cachedNicknameLabel(id, name, playerInstagrams.get(id) ?? '')

    chatUi.setLabel(id, cached.label, player.position, cached.color, cached.instagram)
  }
}

function rememberPlayerProfile(id: number, nick: string, instagram: string) {
  if (nick) {
    playerNicknames.set(id, nick)
  }
  else {
    playerNicknames.delete(id)
  }

  if (instagram) {
    playerInstagrams.set(id, instagram)
  }
  else {
    playerInstagrams.delete(id)
  }

  nicknameLabelCache.delete(id)
}

function cachedNicknameLabel(id: number, name: string, instagram: string) {
  const cached = nicknameLabelCache.get(id)

  if (cached?.name === name && cached.instagram === instagram) {
    return cached
  }

  const next = {
    color: identityColor(name),
    instagram,
    label: nicknameLabel(name),
    name,
  }

  nicknameLabelCache.set(id, next)

  return next
}

function cycleIdle(direction: number) {
  idleClipIndex = (idleClipIndex + direction + idleClipNames.length) % idleClipNames.length
  loadCurrentDance()
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

function outsidePlantMeshColor(meshIndex: number): Vec3 {
  const lift = (meshIndex % 4) * 0.025

  return [0.07 + lift * 0.3, 0.44 + lift, 0.12 + lift * 0.5]
}

const arcadeMeshColors: Vec3[] = [
  [0.015, 0.014, 0.018],
  [0.12, 0.018, 0.08],
  [0.42, 0.035, 0.14],
  [0.012, 0.018, 0.028],
  [0.08, 0.8, 0.9],
  [0.18, 0.025, 0.28],
  [0.95, 0.12, 0.58],
  [0.02, 0.9, 0.74],
  [0.02, 0.35, 0.95],
  [0.98, 0.18, 0.04],
  [1, 0.88, 0.08],
]

function arcadeMeshColor(index: number): Vec3 {
  return arcadeMeshColors[index]!
}

function outsidePlantPlacements() {
  const meshIndices = [0, 1, 4, 5, 6, 7]
  const placements: Array<{
    height: number
    meshIndex: number
    position: Vec3
    turn: number
  }> = [{
    height: 0.56,
    meshIndex: 0,
    position: [4.2, characterFloor, 22.8],
    turn: 0,
  }]
  const count = 176
  const inset = 2.2

  for (let i = 0; i < count; i++) {
    const x = mix(outsideBounds.left + inset, outsideBounds.right - inset, seededPlantRandom(i, 1))
    const z = mix(outsideBounds.back + inset, outsideBounds.front - inset, seededPlantRandom(i, 2))

    if (inOutsidePlantClearance(x, z)) {
      continue
    }

    placements.push({
      height: mix(0.34, 0.78, seededPlantRandom(i, 3)),
      meshIndex: meshIndices[Math.floor(seededPlantRandom(i, 4) * meshIndices.length)]!,
      position: [x, characterFloor, z],
      turn: seededPlantRandom(i, 5) * Math.PI * 2,
    })
  }

  return placements
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

function inOutsidePlantClearance(x: number, z: number) {
  const tentDistanceX = x - tent.x
  const tentDistanceZ = z - tent.z
  const buddhaDistanceX = x - outsideBuddha.x
  const buddhaDistanceZ = z - outsideBuddha.z
  const palmDistanceX = x - outsidePalmTree.x
  const palmDistanceZ = z - outsidePalmTree.z
  const roomPadding = 1.4

  return inToiletBounds(x, z, 2.6)
    || (x > roomBounds.left - roomPadding && x < roomBounds.right + roomPadding
      && z > roomBounds.back - roomPadding && z < roomBounds.front + roomPadding)
    || (tentDistanceX * tentDistanceX + tentDistanceZ * tentDistanceZ) < (tent.radius + 1.6) * (tent.radius + 1.6)
    || (buddhaDistanceX * buddhaDistanceX + buddhaDistanceZ * buddhaDistanceZ) < 5.6
    || (palmDistanceX * palmDistanceX + palmDistanceZ * palmDistanceZ) < 3.2
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

function seededPlantRandom(seed: number, salt: number) {
  const value = Math.sin(seed * 191.9 + salt * 271.3) * 91721.3371

  return value - Math.floor(value)
}

useAlternativeInput(alternativeInput)
const projectorViewport: Viewport = {
  clientHeight: canvas.clientHeight,
  clientWidth: canvas.clientWidth,
  height: canvas.height || 1,
  width: canvas.width || 1,
}
const wallProjector = createWallProjector({ eye: [0, 0, 1], center: [0, 0, 0] }, projectorViewport)
const arcadeScreenCorners: [Vec3, Vec3, Vec3, Vec3] = [
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
]
const arcadeScreenPoints: [ProjectedPoint, ProjectedPoint, ProjectedPoint, ProjectedPoint] = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
]
const pixelRatio = createAdaptivePixelRatio()
const bloomScale = createAdaptiveBloomScale()
const introEffectRenderer = createIntroEffect(introEffect)
const mentionDing = new Audio('/ding.mp3')
const feedbackMaxAmount = 0.91
const feedbackToiletRampSeconds = 60
const feedbackSitResetSeconds = 3
const tripKinds = [0, 1, 2] as const
let outsideTree: CircleBounds = { x: 0, z: 20.5, radius: 0.75 }
let lastStamp = 0
let graphicsPaused = document.hidden
let coreLoadStarted = false
let postEntryLoadsStarted = false
let mainWorldLoad: Promise<void> | undefined
let loftPlantsLoad: Promise<void> | undefined
let feedbackToiletStartStamp = 0
let feedbackToiletStartAmount = 0
let feedbackInToilets = false
let feedbackSitSeconds = 0
let feedbackSitReset = false
let tripCycle = shuffledTripKinds()
let tripCycleIndex = 0
let buddhaLoaded = false
let palmTreeLoaded = false
let rocksLoaded = false
let treeLoaded = false
let introHidden = false
document.body.dataset.introVisible = String(!introHidden)
let videoPlaying = false
let lastPixelRatio = 0
let lastBloomScale = 0
let forcedPixelRatio: number | undefined
let forcedBloomScale: number | undefined
let lastIntroProgress = -1
let lastIntroStartReady = false
let lastChatFormIdentity = ''
let lastChatFormSelfId = -1
let lastChatFormColor = ''
let lastIntroNicknameColor = ''
let lastOnlineSelfColor = ''
let lastOnlineSelfName = ''
let lastOnlineSelfLabel = ''
let lastOnlineText = ''
let lastOnlineCountValue = -1
let lastOnlineIdleValue = -1
let introWaveSent = false
let profileSubmitted = false

intro.addEventListener('touchmove', event => {
  if (!introHidden) {
    event.preventDefault()
    scrollTo(0, 0)
  }
}, { passive: false })
intro.addEventListener('pointermove', event => {
  setIntroEffectPointer(event)
})
intro.addEventListener('pointerdown', event => {
  setIntroEffectPointer(event)
})

function setIntroEffectPointer(event: PointerEvent) {
  const bounds = intro.getBoundingClientRect()

  introEffectRenderer.setPointer((event.clientX - bounds.left) / bounds.width,
    (event.clientY - bounds.top) / bounds.height)
}

function startIntro() {
  if (!submitIntroProfile()) {
    return
  }

  if (!introWaveSent) {
    introWaveSent = true
    sendChatMessage('👋')
  }
  videoPlaying = djVideoUi.play()
  introStart.dataset.playing = String(videoPlaying)
}

function submitIntroProfile() {
  if (!introNicknameInput.reportValidity()) {
    introNicknameInput.focus()
    return false
  }

  syncNickname(introNicknameInput.value)
  syncInstagram(introInstagramInput.value)
  profileSubmitted = true
  multiplayer.sendProfile()
  introNicknameInput.blur()
  introInstagramInput.blur()
  canvas.focus()

  return true
}

introStart.addEventListener('click', startIntro)
introNicknameInput.addEventListener('change', () => syncNickname(introNicknameInput.value))
introNicknameInput.addEventListener('input', syncChatFormColor)
introInstagramInput.addEventListener('change', () => syncInstagram(introInstagramInput.value))

function handleIntroProfileKey(event: KeyboardEvent) {
  if (event.key !== 'Enter') {
    return
  }

  event.preventDefault()
  startIntro()
}
introNicknameInput.addEventListener('keydown', handleIntroProfileKey)
introInstagramInput.addEventListener('keydown', handleIntroProfileKey)
addEventListener('keydown', handleIntroStartKey)

function handleIntroStartKey(event: KeyboardEvent) {
  if (introHidden) {
    removeEventListener('keydown', handleIntroStartKey)
    return
  }

  if (event.key !== 'Enter' || document.activeElement === chatInput) {
    return
  }

  event.preventDefault()
  if (document.activeElement === introNicknameInput || document.activeElement === introInstagramInput) {
    submitIntroProfile()
    return
  }

  startIntro()
}
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
const buddhaTexture = createImageTexture(gl, '/buddha.webp')
const graffitiCanvas = createGraffitiCanvas()
const graffitiContext = graffitiCanvas.getContext('2d')!
const graffitiTexture = gl.createTexture()
const tShirtLogoImage = new Image()
let tShirtLogoLoaded = false
const viewProjection = gl.getUniformLocation(program, 'viewProjection')
const cameraEye = gl.getUniformLocation(program, 'cameraEye')
const renderZone = gl.getUniformLocation(program, 'renderZone')
const bloomPass = gl.getUniformLocation(program, 'bloomPass')
const doorCoverVisible = gl.getUniformLocation(program, 'doorCoverVisible')
const treeShadowSampler = gl.getUniformLocation(program, 'treeShadowMap')
const graffitiMap = gl.getUniformLocation(program, 'graffitiMap')
const objectTextureMap = gl.getUniformLocation(program, 'objectTextureMap')
const outsideNight = gl.getUniformLocation(program, 'outsideNight')
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
const postMoonDirection = gl.getUniformLocation(postProgram, 'moonDirection')
const postMoonProgress = gl.getUniformLocation(postProgram, 'moonProgress')
const postSunDirection = gl.getUniformLocation(postProgram, 'sunDirection')
const postSunProgress = gl.getUniformLocation(postProgram, 'sunProgress')
const postDaylight = gl.getUniformLocation(postProgram, 'daylight')
const postTime = gl.getUniformLocation(postProgram, 'time')!
const postTripKind = gl.getUniformLocation(postProgram, 'tripKind')!
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
const bubbleArray = gl.createVertexArray()
const bubbleBuffer = gl.createBuffer()
const foamArray = gl.createVertexArray()
const foamBuffer = gl.createBuffer()
const smokePuffArray = gl.createVertexArray()
const smokePuffBuffer = gl.createBuffer()
const graffitiArray = gl.createVertexArray()
const graffitiBuffer = gl.createBuffer()
const target = createTarget(gl, 1, 1)
const bloomTarget = createTarget(gl, 1, 1)
const feedback = {
  amount: 0,
  current: createTarget(gl, 1, 1),
  next: createTarget(gl, 1, 1),
  tripKind: 0,
}
const stride = vertexSize * Float32Array.BYTES_PER_ELEMENT
const strobeGeometry = createStrobeGeometry()
const strobeInstanceSize = 14
const strobeInstanceStride = strobeInstanceSize * Float32Array.BYTES_PER_ELEMENT
const characterBoxGeometry = createCharacterBoxGeometry()
const characterBoxInstanceSize = 17
const characterBoxInstanceStride = characterBoxInstanceSize * Float32Array.BYTES_PER_ELEMENT

if (!viewProjection || !cameraEye || !renderZone || !bloomPass || !doorCoverVisible || !treeShadowSampler
  || !graffitiMap || !objectTextureMap || !outsideNight || !graffitiTexture
  || !characterBoxViewProjection
  || !characterBoxRenderZone || !characterBoxBloomPass || !lightTime || !lightSmokeMap || !lightRenderZone
  || !lightViewProjection
  || !strobeTime || !strobeSmokeMap || !strobeRenderZone || !strobeViewProjection || !hairViewProjection
  || !hairRenderZone || !roomSmokeTime || !roomSmokeMap || !roomSmokeViewProjection || !roomSmokeCameraRight
  || !roomSmokeCameraUp || !postScene || !postBloom || !postFeedback || !postBloomResolution || !postFeedbackAmount
  || !postRenderSky
  || !postSkyForward || !postSkyRight || !postSkyUp || !postMoonDirection || !postMoonProgress || !postSunDirection
  || !postSunProgress || !postDaylight || !array
  || !buffer || !lightArray || !lightBuffer || !strobeArray || !strobeGeometryBuffer || !strobeInstanceBuffer
  || !smokeArray || !smokeBuffer || !characterArray || !characterBuffer
  || !characterBoxArray || !characterBoxGeometryBuffer || !characterBoxInstanceBuffer || !postArray || !postBuffer
  || !beachBallArray || !beachBallBuffer || !bubbleArray || !bubbleBuffer || !foamArray || !foamBuffer
  || !smokePuffArray || !smokePuffBuffer || !graffitiArray || !graffitiBuffer)
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
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, graffitiTextureSize, graffitiTextureSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)

tShirtLogoImage.onload = () => {
  tShirtLogoLoaded = true
  paintTShirtLogo()
  uploadGraffitiTexture()
}
tShirtLogoImage.onerror = () => console.error(new Error('Failed to load t-shirt logo texture'))
tShirtLogoImage.src = '/hallucinate-logo-t-shirt.png'

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
setupVertexArray({ array: bubbleArray, buffer: bubbleBuffer, data: 0, gl, stride, usage: gl.DYNAMIC_DRAW })
setupVertexArray({ array: foamArray, buffer: foamBuffer, data: 0, gl, stride, usage: gl.DYNAMIC_DRAW })
setupVertexArray({ array: smokePuffArray, buffer: smokePuffBuffer, data: 0, gl, stride, usage: gl.DYNAMIC_DRAW })
setupVertexArray({ array: graffitiArray, buffer: graffitiBuffer, data: graffitiPoints, gl, stride,
  usage: gl.STATIC_DRAW })

gl.enable(gl.DEPTH_TEST)
gl.clearColor(0.01, 0.01, 0.014, 1.0)

const videoPreviewRenderer = createVideoPreviewRenderer(gl)
const photoWallRenderer = createPhotoWallRenderer(gl)

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
const playerInstagrams = new Map<number, string>()
const playerNicknames = new Map<number, string>()
const nicknameLabelCache = new Map<number, { color: string; instagram: string; label: string; name: string }>()
const beachBalls = createBeachBalls()
let beachBallPoints: Float32Array<ArrayBufferLike> = new Float32Array()
const beachBallWriter: VertexWriter = { data: new Float32Array(0), length: 0 }
const beachBallAuthorityUntil = new Map<number, number>()
const beachBallAuthorityDuration = 2000
const bubbleSystem = createBubbleSystem()
let bubblePoints: Float32Array<ArrayBufferLike> = new Float32Array()
const bubbleWriter: VertexWriter = { data: new Float32Array(0), length: 0 }
const bubbleMuzzle: Vec3 = [0, 0, 0]
const bubbleForward: Vec3 = [0, 0, 0]
const bubbleInterval = 55
let bubbling = false
const foamSystem = createFoamSystem()
let foamPoints: Float32Array<ArrayBufferLike> = new Float32Array()
const foamWriter: VertexWriter = { data: new Float32Array(0), length: 0 }
const foamMuzzle: Vec3 = [0, 0, 0]
const foamForward: Vec3 = [0, 0, 0]
const foamInterval = 250
const foamBurstCount = 22
let foaming = false
const smokeSystem = createSmokeSystem()
let smokePuffPoints: Float32Array<ArrayBufferLike> = new Float32Array()
const smokeWriter: VertexWriter = { data: new Float32Array(0), length: 0 }
const smokeTip: Vec3 = [0, 0, 0]
const smokeMouth: Vec3 = [0, 0, 0]
const smokeForward: Vec3 = [0, 0, 0]
const smokeInterval = 900
const smokeHeldInterval = 80
const smokeExhaleInterval = 45
type ParticleTimers = { bubble: number; foam: number; smokeWisp: number; smokeHeld: number; smokeExhale: number }
type ParticlePlayer = {
  position: Vec3
  turn: number
  actionTurn?: number
  motionBlend: number
  idleClipIndex: number
  mode?: CharacterMode
  modeTime?: number
}
const particleTimers = new Map<number, ParticleTimers>()
const localParticleSource = -1
const localParticlePlayer: ParticlePlayer = {
  position: characterPosition,
  turn: 0,
  motionBlend: 0,
  idleClipIndex: 0,
  mode: 'stand',
  modeTime: 0,
}
const graffitiSplats: GraffitiSplat[] = []
const graffitiIds = new Set<number>()
let nextRemoteSeatSyncAt = 0
let graffitiSeed = Math.floor(Math.random() * 65536)
let lastSprayAt = 0
let sprayPointer = 0
const sprayInterval = 55
const graffitiPaintChunk = 1400
const graffitiAppendQueue: GraffitiSplat[] = []
let graffitiAppendIndex = 0
let graffitiPaintFrame = 0
let graffitiSyncing = false
let graffitiWorkerAvailable = canRenderGraffitiTextureInWorker()
let graffitiTextureRenderId = 0
let graffitiTextureRenderPending = false

renderGraffitiTexture([])

function connectMultiplayer(spaceSlug?: string) {
  if (hasMultiplayer) {
    multiplayer.close()
  }

  hasMultiplayer = true
  predictedMessages.clear()
  playerInstagrams.clear()
  playerNicknames.clear()
  nicknameLabelCache.clear()
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
    localActions: () => (bubbling ? ACTION_BUBBLING : 0) | (foaming ? ACTION_FOAMING : 0),
    localInstagram: () => instagram,
    localNickname: () => nickname,
    localProfileReady: () => profileSubmitted,
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
    onMessage: message => {
      const key = chatMessageKey(message)

      if (message.id === multiplayer.selfId && predictedMessages.has(key)) {
        const count = predictedMessages.get(key)!

        if (count === 1) {
          predictedMessages.delete(key)
        }
        else {
          predictedMessages.set(key, count - 1)
        }

        return
      }

      const position = message.id === multiplayer.selfId
        ? characterPosition
        : multiplayer.players.get(message.id)?.position

      rememberPlayerProfile(message.id, message.nick, message.insta)

      if (message.id !== multiplayer.selfId && graphicsPaused && mentionsNickname(message.text)) {
        playMentionDing()
      }

      const color = addChatLogMessage(message)
      if (position) {
        chatUi.show(message.id, message.text, position, performance.now(), color,
          nicknameLabel(identityName(message.id, message.nick)))
      }
    },
    onDeleteMessages: id => {
      deleteChatLogMessages(id)
      chatUi.removeMessages(id)
    },
    onProfile: profile => {
      rememberPlayerProfile(profile.id, profile.nick, profile.insta)
      syncRemoteNicknameLabel(profile.id)
    },
    onLeave: id => {
      playerInstagrams.delete(id)
      playerNicknames.delete(id)
      nicknameLabelCache.delete(id)
      chatUi.remove(id)
      particleTimers.delete(id)
    },
    onOnlineCount: online => {
      onlineCountValue = online.count
      onlineIdleValue = online.idle
      syncOnlineSelf()
    },
    onVideoPlaylistRequest: zones => djVideoUi.requestPlaylists(zones),
    onVideoSync: entries => {
      djVideoUi.applySync(entries)
      videoPreviewRenderer.prepareAll(entries.map(entry => ({ id: entry.currentId, zone: entry.zone })))
        .catch((error: unknown) => console.error(error))
    },
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
    onGraffiti: packet => {
      if (packet.reset) {
        beginGraffitiSync()
      }

      const appended: GraffitiSplat[] = []
      const optimisticSplats = new Map(graffitiSplats
        .map((splat, index) => [splat.id === 0 ? graffitiKey(splat) : '', index] as const)
        .filter(([key]) => key !== ''))

      for (const splat of packet.splats) {
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

      trimGraffitiSplats()

      if (graffitiSyncing) {
        if (packet.complete) {
          graffitiSyncing = false
          renderGraffitiTexture(graffitiSplats)
        }

        return
      }

      if (appended.length > 0) {
        scheduleGraffitiTexturePaint(appended)
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
let loftRouteToken = 0
let claimSubmitting = false

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
  if (claimSubmitting) {
    return
  }

  claimSubmitting = true
  claimNext.disabled = true
  const slug = pendingClaimSlug
  const token = ++loftRouteToken

  try {
    const room = await claimLoftRoom(slug, claimPassword.value)

    if (token !== loftRouteToken) {
      return
    }

    claimDialog.close()
    activateLoft(room, true)
  }
  finally {
    if (token === loftRouteToken && claimDialog.open) {
      claimSubmitting = false
      claimNext.disabled = false
    }
  }
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

  loftRouteToken++
  enterMain(push)
}

async function openLoftRoute(slug: string, push: boolean) {
  const token = ++loftRouteToken
  const room = await fetchLoftRoom(slug)

  if (token !== loftRouteToken) {
    return
  }

  if (!room.claimed) {
    if (push && location.pathname !== `/${slug}`) {
      history.pushState(null, '', `/${slug}`)
    }

    showClaimWizard(slug)
    return
  }

  activateLoft(room, push)
}

function showClaimWizard(slug: string) {
  claimSubmitting = false
  claimNext.disabled = false
  pendingClaimSlug = slug
  claimPassword.value = 'admin'
  syncClaimStep()
  if (!claimDialog.open) {
    claimDialog.showModal()
  }
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
  closeClaimDialog()
  if (appSpace.kind === 'main') {
    rememberMainPose()
  }
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
  if (postEntryLoadsStarted) {
    loadLoftDecorOnce()
  }
}

function enterMain(push: boolean) {
  closeClaimDialog()
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

function closeClaimDialog() {
  pendingClaimSlug = ''
  claimSubmitting = false
  claimNext.disabled = false
  if (claimDialog.open) {
    claimDialog.close()
  }
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

function syncNickname(value = introNicknameInput.value) {
  const next = normalizeNickname(value)

  if (next !== nickname) {
    nickname = next
    introNicknameInput.value = nickname
    saveCurrentClubState(true)
  }
}

function normalizeNickname(value: string) {
  return value.trim()
}

function syncInstagram(value = introInstagramInput.value) {
  const next = normalizeInstagram(value)

  if (next !== instagram || introInstagramInput.value !== next) {
    instagram = next
    introInstagramInput.value = instagram
    saveCurrentClubState(true)
  }
}

function normalizeInstagram(value: string) {
  return [...value.trim().replace(/^@+/, '').replace(/[^0-9A-Za-z._]/g, '')].slice(0, instagramMaxLength).join('')
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
    instagram,
    key: saveKey,
    localCharacter,
    nickname,
    room,
    styleController,
  })
}

bindKeyboardInput({
  activeInputs: [introNicknameInput, introInstagramInput, chatInput, rentRoomInput, claimPassword,
    loftMusicPassword, loftMusicSource],
  keys,
  startJumping: () => localCharacter.startJumping(),
  stopJumping: () => localCharacter.stopJumping(),
  startWave: () => localCharacter.startWave(),
  stopWave: () => localCharacter.stopWave(),
  startBubbles: () => {
    bubbling = true
  },
  stopBubbles: () => {
    bubbling = false
  },
  startFoam: () => {
    foaming = true
  },
  stopFoam: () => {
    foaming = false
  },
  startBreakdance: () => localCharacter.startBreakdance(),
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

window.addEventListener('keydown', event => {
  if (event.key !== '`' || adminDialog.open || document.activeElement instanceof HTMLInputElement) {
    return
  }

  event.preventDefault()
  openAdminDialog()
})

createMobileControls({
  ...styleActions,
  openChatInput: () => toggleChatInput(false),
  dismissVideoHint: helpUi.dismissVideoHint,
})
bindTapDestination({
  canvas,
  ignorePointer: event => resolveAccessoryKind(styleController.accessoryIndex) === 'spray',
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

  if (resolveAccessoryKind(styleController.accessoryIndex) !== 'spray') {
    return
  }

  if (!sprayAt(event.clientX, event.clientY)) {
    return
  }

  event.preventDefault()
  event.stopImmediatePropagation()
  sprayPointer = event.pointerId
  canvas.setPointerCapture(event.pointerId)
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
    return false
  }

  const stamp = performance.now()

  if (stamp < lastSprayAt + sprayInterval) {
    return false
  }

  const hit = sprayWallPoint(clientX, clientY, wallProjector)

  if (!hit) {
    return false
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
  trimGraffitiSplats()
  scheduleGraffitiTexturePaint([splat])
  multiplayer.sendGraffiti([splat])

  return true
}

function beginGraffitiSync() {
  const optimistic = graffitiSplats.filter(splat => splat.id === 0)

  graffitiSplats.length = 0
  graffitiSplats.push(...optimistic)
  graffitiIds.clear()
  graffitiSyncing = true
  clearGraffitiPaintQueue()
}

function addGraffitiId(splat: GraffitiSplat) {
  if (splat.id !== 0) {
    graffitiIds.add(splat.id)
  }
}

function deleteGraffitiId(splat: GraffitiSplat) {
  if (splat.id !== 0) {
    graffitiIds.delete(splat.id)
  }
}

function trimGraffitiSplats() {
  if (graffitiSplats.length <= maxGraffitiSplats) {
    return
  }

  const removed = graffitiSplats.splice(0, graffitiSplats.length - maxGraffitiSplats)

  for (const splat of removed) {
    deleteGraffitiId(splat)
  }
}

function graffitiKey(splat: GraffitiSplat) {
  return `${splat.wall}:${splat.x}:${splat.y}:${splat.seed}:${splat.colorIndex}:${splat.radius}`
}

function sendChatMessage(message: string) {
  const packet = multiplayer.sendMessage(message)

  if (packet) {
    const entry = { id: multiplayer.selfId, insta: instagram, nick: nickname, ...packet }
    const key = chatMessageKey(entry)

    predictedMessages.set(key, (predictedMessages.get(key) ?? 0) + 1)
    const color = addChatLogMessage(entry)

    chatUi.show(multiplayer.selfId, entry.text, characterPosition, performance.now(), color,
      nicknameLabel(identityName(entry.id, entry.nick)))
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

chatInput.addEventListener('keydown', event => {
  if (event.key !== 'Enter') {
    return
  }

  event.preventDefault()
  chatForm.requestSubmit()
})

chatForm.addEventListener('submit', event => {
  event.preventDefault()
  sendChatMessage(chatUi.submit(document.documentElement.dataset.touchControls !== 'true'))
})

photoButton.addEventListener('click', () => {
  void takePhoto()
})

breakdanceButton.addEventListener('click', () => {
  localCharacter.startBreakdance()
  multiplayer.sendMotion()
  canvas.focus()
})

waveButton.addEventListener('pointerdown', event => {
  event.preventDefault()
  waveButton.setPointerCapture(event.pointerId)
  localCharacter.startWave()
  multiplayer.sendMotion()
  canvas.focus()
})

for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  waveButton.addEventListener(eventName, () => {
    localCharacter.stopWave()
    multiplayer.sendMotion()
  })
}

bubbleButton.addEventListener('pointerdown', event => {
  event.preventDefault()
  bubbleButton.setPointerCapture(event.pointerId)
  bubbling = true
  canvas.focus()
})

for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  bubbleButton.addEventListener(eventName, () => {
    bubbling = false
  })
}

foamButton.addEventListener('pointerdown', event => {
  event.preventDefault()
  foamButton.setPointerCapture(event.pointerId)
  foaming = true
  canvas.focus()
})

for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  foamButton.addEventListener(eventName, () => {
    foaming = false
  })
}

window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && chatUi.isOpen()) {
    event.preventDefault()
    chatUi.close()
    canvas.focus()
  }
})

async function takePhoto() {
  if (photoButton.disabled) {
    return
  }

  photoButton.disabled = true
  photoButton.dataset.loading = 'true'
  try {
    showPhotoPreview(await capturePhoto())
  }
  catch (e) {
    console.error(e)
  }
  finally {
    photoButton.disabled = false
    delete photoButton.dataset.loading
    if (!photoPreviewDialog.open) {
      canvas.focus()
    }
  }
}

async function capturePhoto() {
  const videoPreview = djVideoUi.preview(currentVideoZone())
  const photoWallPreviewUrls = await photoWallUi.previewUrls()
  const resume = !graphicsPaused
  const previousPixelRatio = forcedPixelRatio
  const previousBloomScale = forcedBloomScale

  try {
    await videoPreviewRenderer.prepare(videoPreview)
  }
  catch (e) {
    console.error(e)
  }

  try {
    await photoWallRenderer.prepare(photoWallPreviewUrls)
  }
  catch (e) {
    console.error(e)
  }

  if (resume) {
    pauseGraphics()
  }

  try {
    forcedPixelRatio = window.devicePixelRatio
    forcedBloomScale = 1
    resize()
    renderPhotoFrame(lastStamp || performance.now(), videoPreview, photoWallPreviewUrls.length > 0)
    return await canvasWebpBlob(canvas, 0.94)
  }
  finally {
    forcedPixelRatio = previousPixelRatio
    forcedBloomScale = previousBloomScale
    resizeDirty = true
    if (resume) {
      resumeGraphics()
    }
  }
}

function showPhotoPreview(blob: Blob) {
  dismissPhotoPreview(false)
  const url = URL.createObjectURL(blob)

  pendingPhoto = { blob, url }
  photoPreviewImage.src = url
  photoPreviewMessage.textContent = ''
  photoPreviewSave.disabled = false
  photoPreviewDialog.showModal()
  photoPreviewSave.focus()
}

function dismissPhotoPreview(focus = true) {
  if (pendingPhoto) {
    URL.revokeObjectURL(pendingPhoto.url)
    pendingPhoto = undefined
  }

  photoPreviewImage.removeAttribute('src')
  photoPreviewMessage.textContent = ''
  photoPreviewSave.disabled = false
  if (photoPreviewDialog.open) {
    photoPreviewDialog.close()
  }
  if (focus) {
    canvas.focus()
  }
}

async function savePhotoPreview() {
  if (!pendingPhoto) {
    throw new Error('Missing pending photo')
  }

  photoPreviewSave.disabled = true
  try {
    await uploadPhoto(pendingPhoto.blob)
    await photoWallUi.refreshLatest()
    dismissPhotoPreview()
  }
  catch (e) {
    console.error(e)
    photoPreviewMessage.textContent = e instanceof PhotoLimitError
      ? 'No more than 5 photos per hour, try again later'
      : e instanceof Error
      ? e.message
      : String(e)
    photoPreviewSave.disabled = false
  }
}

async function uploadPhoto(photo: Blob) {
  const response = await fetch('/api/photos', {
    method: 'POST',
    headers: { 'content-type': 'image/webp' },
    body: photo,
  })

  if (!response.ok) {
    const text = await response.text()

    if (response.status === 429 || response.status === 502 || text === 'Too Many Photos') {
      throw new PhotoLimitError()
    }

    throw new Error(`Photo upload failed ${response.status}`)
  }

  return await jsonApiResponse<{ createdAt: number; thumbnailUrl: string; timestamp: number; url: string }>(
    response,
    'Photo upload',
  )
}

class PhotoLimitError extends Error {
  constructor() {
    super('No more than 5 photos per hour, try again later')
  }
}

function renderPhotoFrame(stamp: number, videoPreview: VideoPreview | undefined, photoWallPreview: boolean) {
  const inLoft = appSpace.kind === 'loft'
  const zone = currentVideoZone()
  const camera = cameraController.get()
  const outside = !inLoft && isOutside(characterPosition)
  const sky = !inLoft && zone === 'outside' && usesSkyBackground(camera)

  strobeController.setFrame(Math.floor(stamp / 16.6667))
  strobeController.updateInstances(stamp * 0.001, zone)
  updateBeachBallBuffer()
  renderCurrentSceneFrame({
    camera,
    characterCount: characterRenderSystem.update(stamp * 0.001),
    doorCoverVisible: outside && doorCoverReleased,
    inLoft,
    outside,
    sky,
    stamp,
    photoWallPreview,
    videoPreview,
    zone,
  })
}

function canvasWebpBlob(target: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    target.toBlob(blob => {
      if (!blob) {
        reject(new Error('Photo encoding failed'))
        return
      }

      resolve(blob)
    }, 'image/webp', quality)
  })
}

const resize = () => {
  const ratio = forcedPixelRatio ?? pixelRatio.ratio()
  const width = Math.floor(canvas.clientWidth * ratio)
  const height = Math.floor(canvas.clientHeight * ratio)
  projectorViewport.clientWidth = width / ratio
  projectorViewport.clientHeight = height / ratio
  projectorViewport.width = width
  projectorViewport.height = height
  const bloom = forcedBloomScale ?? bloomScale.scale()
  const bloomWidth = Math.max(1, Math.floor(width * bloom))
  const bloomHeight = Math.max(1, Math.floor(height * bloom))
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

  if (!inToilets && feedbackInToilets) {
    feedback.tripKind = nextTripKind()
    feedbackToiletStartStamp = stamp
    feedbackToiletStartAmount = feedbackMaxAmount
    feedback.amount = feedbackMaxAmount
  }

  feedbackInToilets = inToilets
}

function nextTripKind() {
  if (tripCycleIndex >= tripCycle.length) {
    tripCycle = shuffledTripKinds()
    tripCycleIndex = 0
  }

  return tripCycle[tripCycleIndex++]!
}

function shuffledTripKinds() {
  const next = [...tripKinds]

  for (let i = next.length - 1; i > 0; i--) {
    const index = Math.floor(Math.random() * (i + 1))
    const value = next[i]!

    next[i] = next[index]!
    next[index] = value
  }

  return next
}

function requestIdle(callback: () => void) {
  if ('requestIdleCallback' in globalThis) {
    requestIdleCallback(callback, { timeout: 5000 })
    return
  }

  setTimeout(callback, 1200)
}

function scheduleFrame() {
  if (graphicsPaused) {
    return
  }

  frameId = requestAnimationFrame(draw)
  clubGlobal.clubFrameId = frameId
}

function pauseGraphics() {
  graphicsPaused = true
  cancelAnimationFrame(frameId)
}

function resumeGraphics() {
  if (!graphicsPaused) {
    return
  }

  graphicsPaused = false
  lastStamp = 0
  scheduleFrame()
}

function renderCurrentSceneFrame(options: {
  camera: ReturnType<typeof cameraController.get>
  characterCount: number
  doorCoverVisible: boolean
  inLoft: boolean
  outside: boolean
  sky: boolean
  stamp: number
  photoWallPreview?: boolean
  videoPreview?: VideoPreview
  zone: VideoZone
}) {
  const dayCycle = dayCycleAt()

  if (treeLoaded || palmTreeLoaded) {
    updateOutsideTreeShadowMap(gl, treeShadowMap, dayCycle.sunDirection)
  }

  renderClubFrame({
    arrays: {
      character: characterArray,
      characterBox: characterBoxArray,
      light: lightArray,
      post: postArray,
      beachBalls: beachBallArray,
      bubbles: bubbleArray,
      foam: foamArray,
      smokePuff: smokePuffArray,
      graffiti: graffitiArray,
      room: array,
      smoke: smokeArray,
    },
    bloomTarget,
    camera: options.camera,
    character: {
      boxGeometry: characterBoxGeometry,
      boxInstanceCount: characterRenderSystem.boxInstanceCount,
      boxProgram: characterBoxProgram,
      boxUniforms: characterBoxUniforms,
      count: options.characterCount,
      hairProgram,
      hairRenderMeshes: characterRenderSystem.hairRenderMeshes,
      hairUniforms,
    },
    characterPosition,
    feedback,
    gl,
    height: canvas.height,
    dayCycle,
    objectTexture: buddhaTexture,
    light: {
      count: lightPoints.length / vertexSize,
      program: lightProgram,
      uniforms: {
        renderZone: lightRenderZone!,
        smokeMap: lightSmokeMap!,
        time: lightTime!,
        viewProjection: lightViewProjection!,
      },
    },
    doorCoverVisible: options.doorCoverVisible,
    outside: options.outside,
    renderZone: renderZoneIndex(options.zone),
    points,
    beachBallPoints,
    bubblePoints,
    foamPoints,
    smokePuffPoints,
    graffitiPoints: options.inLoft ? emptyPoints : graffitiPoints,
    graffitiTexture,
    post: {
      bloom: postBloom!,
      bloomResolution: postBloomResolution!,
      daylight: postDaylight!,
      feedback: postFeedback!,
      feedbackAmount: postFeedbackAmount!,
      moonDirection: postMoonDirection!,
      moonProgress: postMoonProgress!,
      program: postProgram,
      renderSky: postRenderSky!,
      scene: postScene!,
      skyForward: postSkyForward!,
      skyRight: postSkyRight!,
      skyUp: postSkyUp!,
      sunDirection: postSunDirection!,
      sunProgress: postSunProgress!,
      time: postTime,
      tripKind: postTripKind,
    },
    program,
    roomUniforms: {
      bloomPass: bloomPass!,
      cameraEye: cameraEye!,
      doorCoverVisible: doorCoverVisible!,
      graffitiMap: graffitiMap!,
      objectTextureMap: objectTextureMap!,
      outsideNight: outsideNight!,
      renderZone: renderZone!,
      treeShadowSampler: treeShadowSampler!,
      viewProjection: viewProjection!,
    },
    skyline: options.inLoft,
    sky: options.sky,
    smoke: {
      map: smokeMap,
      points: smokePoints,
      program: smokeProgram,
      uniforms: {
        cameraRight: roomSmokeCameraRight!,
        cameraUp: roomSmokeCameraUp!,
        smokeMap: roomSmokeMap!,
        time: roomSmokeTime!,
        viewProjection: roomSmokeViewProjection!,
      },
    },
    sceneOverlay: options.videoPreview || options.photoWallPreview
      ? {
        draw: cameraMatrix => {
          if (options.videoPreview && !videoPreviewRenderer.draw(options.videoPreview, cameraMatrix)) {
            console.error(new Error(`Missing video preview texture ${options.videoPreview!.id}`))
          }
          if (options.photoWallPreview && !photoWallRenderer.draw(cameraMatrix)) {
            console.error(new Error('Missing photo wall preview texture'))
          }
        },
      }
      : undefined,
    strobeController,
    target,
    time: options.stamp * 0.001,
    treeShadowMap,
    vertexSize,
    width: canvas.width,
  })
}

function updateArcadeTrigger(inLoft: boolean, projector: WallProjector) {
  const touching = introHidden && !inLoft && nearInsideArcade(characterPosition)

  if (!touching) {
    arcadeReady = true
  }
  if (!touching || !arcadeReady || arcadeUi.active) {
    return false
  }

  arcadeReady = false
  enterArcadeMode(projector)

  return true
}

function enterArcadeMode(projector: WallProjector) {
  document.body.dataset.arcadeOpen = 'true'
  hideProjectedWorldUi()
  pauseGraphics()
  arcadeUi.open(arcadeScreenRect(projector))
}

function exitArcadeMode() {
  document.body.dataset.arcadeOpen = 'false'
  arcadeReady = false
  canvas.focus()
  resumeGraphics()
}

function hideProjectedWorldUi() {
  photoWallUi.hide()
  foodTruckWallProjection.hide()
  bartenderDrinkWallProjection.hide()
  outsideHutDrinkWallProjection.hide()
  merchCards.dataset.open = 'false'
}

function arcadeScreenRect(projector: WallProjector) {
  domWallCorners(insideArcadeScreenWall, arcadeScreenCorners[0], arcadeScreenCorners[1], arcadeScreenCorners[2],
    arcadeScreenCorners[3])

  for (let i = 0; i < arcadeScreenCorners.length; i++) {
    projectWallPointWithMinDepthInto(arcadeScreenCorners[i]!, projector, arcadeScreenPoints[i]!, 0.05)
  }

  const left = Math.min(...arcadeScreenPoints.map(point => point.x))
  const right = Math.max(...arcadeScreenPoints.map(point => point.x))
  const top = Math.min(...arcadeScreenPoints.map(point => point.y))
  const bottom = Math.max(...arcadeScreenPoints.map(point => point.y))

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}

const draw = (stamp: number) => {
  if (graphicsPaused) {
    return
  }

  const delta = lastStamp === 0 ? 0 : Math.min((stamp - lastStamp) / 1000, 0.05)
  const frame = Math.floor(stamp / 16.6667)

  strobeController.setFrame(frame)
  lastStamp = stamp
  const nextPixelRatio = pixelRatio.update(delta, stamp)
  const nextBloomScale = bloomScale.update(delta, stamp)

  resizeDirty = resizeDirty || nextPixelRatio !== lastPixelRatio || nextBloomScale !== lastBloomScale
  clubGlobal.clubPixelRatio = nextPixelRatio
  if (resizeDirty) {
    resize()
    resizeDirty = false
    lastPixelRatio = nextPixelRatio
    lastBloomScale = nextBloomScale
  }
  const inLoft = appSpace.kind === 'loft'

  localCharacter.update(delta, cameraController.turn, outsideTree, styleController.bottomMode, inLoft, occupiedSeats,
    seat => takeNpcSeat(npcPlayers, seat, stamp * 0.001, outsideTree, occupiedSeats))
  if (isAtLoftExitDoor()) {
    enterMain(true)
    scheduleFrame()
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
  localParticlePlayer.turn = localCharacter.turn
  localParticlePlayer.actionTurn = cameraController.turn
  localParticlePlayer.motionBlend = localCharacter.motionBlend
  localParticlePlayer.mode = localCharacter.mode
  localParticlePlayer.modeTime = localCharacter.modeTime
  localParticlePlayer.idleClipIndex = idleClipIndex
  emitPlayerParticles(localParticleSource, localParticlePlayer, stamp, bubbling, foaming,
    introHidden && resolveAccessoryKind(styleController.accessoryIndex) === 'cigarette')
  for (const [id, player] of multiplayer.players) {
    emitPlayerParticles(id, player, stamp, player.bubbling ?? false, player.foaming ?? false,
      resolveAccessoryKind(player.style.accessoryIndex) === 'cigarette')
  }
  bubbleSystem.update(delta)
  foamSystem.update(delta, inLoft ? loftFloorAt : mainFloorAt)
  smokeSystem.update(delta)
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
  multiplayer.sendActionsIfChanged()

  if (!inLoft) {
    updatePlayers(npcPlayers, delta, stamp * 0.001, outsideTree, occupiedSeats)
  }
  updateRemotePlayers(multiplayer.players.values(), delta, outsideTree)
  syncNicknameLabels()
  takeRemoteSeats(stamp)
  renderPlayers.length = 0
  if (!inLoft) {
    for (const player of npcPlayers) {
      renderPlayers.push(player)
    }
  }
  for (const player of multiplayer.players.values()) {
    renderPlayers.push(player)
  }
  const dancing = zone !== 'tent' && localCharacter.mode === 'stand' && idleClipIndex > 0
  cameraController.update(delta, localCharacter.input, localCharacter.turn, lengthSq(localCharacter.input) > 0
    || dancing, localCharacter.jumping, inLoft)
  if (!inLoft) {
    saveTimer.update(delta, () => saveCurrentClubState(characterRenderSystem.assetsLoaded))
  }
  const camera = cameraController.get()
  strobeController.updateInstances(stamp * 0.001, zone)

  const projector = createWallProjector(camera, projectorViewport, wallProjector)
  const outside = !inLoft && isOutside(characterPosition)

  syncMerchCards(outside)

  if (introHidden) {
    djVideoUi.update(camera, projector)

    if (outside) {
      foodTruckWallProjection.update(camera, projector, outsideFoodTruckFoodWall)
      outsideHutDrinkWallProjection.update(camera, projector, outsideHutDrinkWall)
    }
    else {
      foodTruckWallProjection.hide()
      outsideHutDrinkWallProjection.hide()
    }
    if (!inLoft && !outside) {
      bartenderDrinkWallProjection.update(camera, projector, bartenderDrinkWall)
    }
    else {
      bartenderDrinkWallProjection.hide()
    }
    if (outside) {
      photoWallUi.update(camera, projector)
    }
    else {
      photoWallUi.hide()
    }
  }
  else {
    photoWallUi.hide()
    foodTruckWallProjection.hide()
    bartenderDrinkWallProjection.hide()
    outsideHutDrinkWallProjection.hide()
  }
  chatUi.update(projector, stamp)
  updateAdminIdLabels(projector)

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
  updateBubbleBuffer()
  updateFoamBuffer()
  updateSmokeBuffer()
  if (!introHidden) {
    updateIntro()
  }

  renderCurrentSceneFrame({
    camera,
    characterCount,
    doorCoverVisible: outside && doorCoverReleased,
    inLoft,
    outside,
    sky,
    stamp,
    zone,
  })

  if (updateArcadeTrigger(inLoft, projector)) {
    return
  }

  scheduleFrame()
}

// Emit each particle effect a player is currently producing, from their own
// current pose. Driven by synced state, so this runs identically for the local
// player and every remote player. Per-source timers keep the emit rates steady.
function emitPlayerParticles(
  source: number,
  player: ParticlePlayer,
  stamp: number,
  isBubbling: boolean,
  isFoaming: boolean,
  isSmoking: boolean,
) {
  if (!isBubbling && !isFoaming && !isSmoking) {
    particleTimers.delete(source)
    return
  }

  let timers = particleTimers.get(source)

  if (!timers) {
    timers = { bubble: 0, foam: 0, smokeWisp: 0, smokeHeld: 0, smokeExhale: 0 }
    particleTimers.set(source, timers)
  }

  const position = player.position
  const turn = player.turn
  const actionTurn = player.actionTurn ?? turn
  const forwardX = Math.sin(turn)
  const forwardZ = Math.cos(turn)
  const actionForwardX = Math.sin(actionTurn)
  const actionForwardZ = Math.cos(actionTurn)

  if (isBubbling && stamp >= timers.bubble) {
    timers.bubble = stamp + bubbleInterval
    bubbleMuzzle[0] = position[0] + actionForwardX * 0.35
    bubbleMuzzle[1] = position[1] + 1.15
    bubbleMuzzle[2] = position[2] + actionForwardZ * 0.35
    bubbleForward[0] = actionForwardX
    bubbleForward[1] = 0.35
    bubbleForward[2] = actionForwardZ
    bubbleSystem.spawn(bubbleMuzzle, bubbleForward, 3)
  }

  if (isFoaming && stamp >= timers.foam) {
    timers.foam = stamp + foamInterval
    foamMuzzle[0] = position[0] + actionForwardX * 0.45
    foamMuzzle[1] = position[1] + 1.1
    foamMuzzle[2] = position[2] + actionForwardZ * 0.45
    foamForward[0] = actionForwardX
    foamForward[1] = 0
    foamForward[2] = actionForwardZ
    foamSystem.burst(foamMuzzle, foamForward, foamBurstCount)
  }

  if (isSmoking) {
    const time = stamp * 0.001
    const tipSmoke = cigaretteTipSmoke(time)
    const heldSmoke = cigaretteHeldSmoke(time)
    const exhale = cigaretteExhale(time)

    if (tipSmoke > 0 && stamp >= timers.smokeWisp
      && characterRenderSystem.setCigaretteTip(player, time, smokeTip, smokeForward))
    {
      timers.smokeWisp = stamp + smokeInterval
      smokeSystem.emit(smokeTip, smokeForward, 1, false)
    }

    if (heldSmoke > 0 && stamp >= timers.smokeHeld
      && characterRenderSystem.setCigaretteTip(player, time, smokeTip, smokeForward))
    {
      timers.smokeHeld = stamp + smokeHeldInterval
      smokeSystem.emit(smokeTip, smokeForward, 2, false, 0.55)
    }

    if (exhale > 0 && stamp >= timers.smokeExhale
      && characterRenderSystem.setCigaretteMouth(player, time, smokeMouth, smokeForward))
    {
      timers.smokeExhale = stamp + smokeExhaleInterval
      smokeSystem.emit(smokeMouth, smokeForward, 1 + Math.floor(exhale * 3), true)
    }
  }
}

function updateBubbleBuffer() {
  resetVertexWriter(bubbleWriter)
  writeBubbleGeometry(bubbleWriter, bubbleSystem.bubbles)
  bubblePoints = vertexWriterData(bubbleWriter)
  gl.bindBuffer(gl.ARRAY_BUFFER, bubbleBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, bubblePoints, gl.DYNAMIC_DRAW)
}

function mainFloorAt(x: number, y: number, z: number) {
  return walkHeight(x, y, z)
}

function loftFloorAt(x: number, y: number, z: number) {
  return walkLoftHeight(x, y, z)
}

function updateFoamBuffer() {
  resetVertexWriter(foamWriter)
  writeFoamGeometry(foamWriter, foamSystem.blobs)
  foamPoints = vertexWriterData(foamWriter)
  gl.bindBuffer(gl.ARRAY_BUFFER, foamBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, foamPoints, gl.DYNAMIC_DRAW)
}

function updateSmokeBuffer() {
  resetVertexWriter(smokeWriter)
  writeSmokeGeometry(smokeWriter, smokeSystem.puffs)
  smokePuffPoints = vertexWriterData(smokeWriter)
  gl.bindBuffer(gl.ARRAY_BUFFER, smokePuffBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, smokePuffPoints, gl.DYNAMIC_DRAW)
}

function updateBeachBallBuffer() {
  if (appSpace.kind === 'loft') {
    beachBallPoints = emptyPoints
    gl.bindBuffer(gl.ARRAY_BUFFER, beachBallBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, beachBallPoints, gl.DYNAMIC_DRAW)
    return
  }

  resetVertexWriter(beachBallWriter)
  writeBeachBallGeometry(beachBallWriter, beachBalls)
  beachBallPoints = vertexWriterData(beachBallWriter)
  gl.bindBuffer(gl.ARRAY_BUFFER, beachBallBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, beachBallPoints, gl.DYNAMIC_DRAW)
}

function scheduleGraffitiTexturePaint(splats: GraffitiSplat[]) {
  graffitiAppendQueue.push(...splats)
  if (graffitiTextureRenderPending) {
    return
  }

  scheduleGraffitiTextureFrame()
}

function renderGraffitiTexture(splats: GraffitiSplat[]) {
  const id = ++graffitiTextureRenderId

  graffitiTextureRenderPending = true

  if (!graffitiWorkerAvailable) {
    paintGraffitiTextureReset(splats)
    finishGraffitiTextureRender(id)
    return
  }

  renderGraffitiTextureInWorker(splats)
    .then(bitmap => {
      if (id !== graffitiTextureRenderId) {
        bitmap.close()
        return
      }

      uploadGraffitiBitmap(bitmap)
    })
    .catch((error: unknown) => {
      if (id !== graffitiTextureRenderId) {
        return
      }

      console.error(error)
      graffitiWorkerAvailable = false
      paintGraffitiTextureReset(splats)
    })
    .finally(() => {
      finishGraffitiTextureRender(id)
    })
}

function finishGraffitiTextureRender(id: number) {
  if (id !== graffitiTextureRenderId) {
    return
  }

  graffitiTextureRenderPending = false

  if (graffitiAppendQueue.length > 0) {
    scheduleGraffitiTextureFrame()
  }
}

function paintGraffitiTextureReset(splats: GraffitiSplat[]) {
  graffitiContext.clearRect(0, 0, graffitiCanvas.width, graffitiCanvas.height)
  paintLoftPaintingTextures(graffitiContext)
  paintTShirtLogo()
  uploadGraffitiTexture()
  scheduleGraffitiTexturePaint(splats)
}

function clearGraffitiPaintQueue() {
  if (graffitiPaintFrame !== 0) {
    cancelAnimationFrame(graffitiPaintFrame)
  }

  graffitiPaintFrame = 0
  graffitiAppendQueue.length = 0
  graffitiAppendIndex = 0
}

function scheduleGraffitiTextureFrame() {
  if (graffitiPaintFrame === 0) {
    graffitiPaintFrame = requestAnimationFrame(paintGraffitiTextureFrame)
  }
}

function paintGraffitiTextureFrame() {
  graffitiPaintFrame = 0

  paintGraffitiTextureAppendFrame()
}

function paintGraffitiTextureAppendFrame() {
  if (graffitiAppendIndex >= graffitiAppendQueue.length) {
    graffitiAppendQueue.length = 0
    graffitiAppendIndex = 0
    return
  }

  const end = Math.min(graffitiAppendIndex + graffitiPaintChunk, graffitiAppendQueue.length)

  paintGraffitiSplats(graffitiContext, graffitiAppendQueue.slice(graffitiAppendIndex, end))
  graffitiAppendIndex = end
  uploadGraffitiTexture()

  if (graffitiAppendIndex < graffitiAppendQueue.length) {
    scheduleGraffitiTextureFrame()
    return
  }

  graffitiAppendQueue.length = 0
  graffitiAppendIndex = 0
}

function uploadGraffitiTexture() {
  gl.bindTexture(gl.TEXTURE_2D, graffitiTexture)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, graffitiCanvas)
}

function uploadGraffitiBitmap(bitmap: ImageBitmap) {
  graffitiContext.clearRect(0, 0, graffitiCanvas.width, graffitiCanvas.height)
  graffitiContext.drawImage(bitmap, 0, 0)
  bitmap.close()
  paintTShirtLogo()
  uploadGraffitiTexture()
}

function paintTShirtLogo() {
  if (tShirtLogoLoaded) {
    paintTShirtLogoTexture(graffitiContext, tShirtLogoImage)
  }
}

function startCoreLoads() {
  if (coreLoadStarted) {
    return
  }

  coreLoadStarted = true
  characterRenderSystem.loadCoreOnce().catch((error: unknown) => {
    console.error(error)
  })
}

function startPostEntryLoads() {
  if (postEntryLoadsStarted) {
    return
  }

  postEntryLoadsStarted = true
  characterRenderSystem.loadDetailsOnce().catch((error: unknown) => {
    console.error(error)
  })
  loadCurrentDance()
  loadMainWorldOnce()
  if (appSpace.kind === 'loft') {
    loadLoftDecorOnce()
  }
  requestIdle(() => {
    characterRenderSystem.loadRemainingDancesIdle().catch((error: unknown) => {
      console.error(error)
    })
  })
}

function loadCurrentDance() {
  if (idleClipIndex === 0) {
    return
  }

  characterRenderSystem.loadDanceOnce(idleClipIndex).catch((error: unknown) => {
    console.error(error)
  })
}

function updateIntro() {
  const coreProgress = characterRenderSystem.coreProgress
  const startReady = characterRenderSystem.assetsLoaded
    || coreProgress >= (characterCoreChunkCount - 1) / characterCoreChunkCount
  const progress = Math.round(characterRenderSystem.assetsLoaded ? 100 : coreLoadStarted
    ? Math.max(5, coreProgress * 100)
    : 0)

  if (progress !== lastIntroProgress) {
    introProgress.textContent = `${progress}%`
    introBar.style.transform = `scaleX(${progress / 100})`
    introEffectRenderer.setProgress(progress / 100)
    lastIntroProgress = progress
  }
  if (startReady !== lastIntroStartReady) {
    introStart.dataset.ready = String(startReady)
    lastIntroStartReady = startReady
  }

  if (characterRenderSystem.assetsLoaded) {
    startPostEntryLoads()
  }

  const ready = characterRenderSystem.assetsLoaded && videoPlaying

  if (ready && !introHidden) {
    introHidden = true
    document.body.dataset.introVisible = String(!introHidden)
    removeEventListener('keydown', handleIntroStartKey)
    intro.dataset.hidden = 'true'
    introEffectRenderer.stop()

    if (helpSeen) {
      helpUi.hide()
      syncOnlineIndicator()
    }
  }

  return progress
}

function takeRemoteSeats(stamp: number) {
  if (stamp < nextRemoteSeatSyncAt) {
    return
  }

  nextRemoteSeatSyncAt = stamp + 100

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
  introEffectRenderer.stop()
  multiplayer.close()
})

addEventListener('blur', pauseGraphics)
addEventListener('focus', () => {
  if (!document.hidden) {
    resumeGraphics()
  }
})
addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseGraphics()
    return
  }

  resumeGraphics()
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
const npcPlayers = createPlayers(350, outsideTree, occupiedSeats)
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

startCoreLoads()
scheduleFrame()

function loadMainWorldOnce() {
  mainWorldLoad ??= loadOutsideTree(gl, treeShadowMap, vertices, outsideTree, addSunLitTriangle)
    .then(nextTree => {
      outsideTree = nextTree
      treeLoaded = true
      refreshRoomBuffer()
    })
    .catch((error: unknown) => {
      console.error(error)
    })
    .then(() =>
      Promise.all([
        loadOutsideTree(gl, treeShadowMap, vertices, outsidePalmTree, addSunLitTriangle, {
          color: palmTreeMeshColor,
          height: 5.94,
          name: 'palmtree.fbx',
          nodeTransforms: true,
          path: '/palmtree.fbx',
          shadow: true,
          sourceUp: 'y',
        })
          .then(() => {
            palmTreeLoaded = true
            refreshRoomBuffer()
          })
          .catch((error: unknown) => {
            console.error(error)
            refreshRoomBuffer()
          }),
        loadStaticFbxObject(vertices, {
          color: arcadeMeshColor,
          height: insideArcade.height,
          lightBounds: { x: insideArcade.x, z: insideArcade.z, radius: 1.2, nightUplight: 4.8 },
          path: '/arcade.fbx',
          position: [insideArcade.x, characterFloor, insideArcade.z],
          sourceUp: 'y',
          turn: insideArcade.turn,
        }, addSunLitTriangle)
          .then(() => {
            refreshRoomBuffer()
          })
          .catch((error: unknown) => {
            console.error(error)
          }),
        loadStaticFbxObject(vertices, {
          color: [1, 1, 1],
          height: 2.9,
          lightBounds: { x: outsideBuddha.x, z: 29.3, radius: 0.95, nightUplight: 7.2 },
          path: '/buddha.fbx',
          position: [outsideBuddha.x, characterFloor, outsideBuddha.z],
          sourceUp: 'z',
          texture: true,
          turn: Math.PI,
        }, addSunLitTriangle)
          .then(() => {
            buddhaLoaded = true
            refreshRoomBuffer()
          })
          .catch((error: unknown) => {
            console.error(error)
          }),
        loadStaticFbxObject(vertices, {
          color: [0.72, 0.72, 0.68],
          height: 2.4,
          lightBounds: outsideFoodTruck,
          path: '/foodtruck.fbx',
          position: [outsideFoodTruck.x, characterFloor, outsideFoodTruck.z],
          sourceUp: 'z',
          trianglePattern: foodTruckGraffitiTriangle,
          turn: outsideFoodTruckTurn,
        }, addSunLitTriangle)
          .then(() => {
            refreshRoomBuffer()
          })
          .catch((error: unknown) => {
            console.error(error)
          }),
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
          }),
        loadStaticFbxObjects(vertices, '/plants.fbx', outsidePlantPlacements().map(plant => ({
          color: outsidePlantMeshColor,
          height: plant.height,
          lightBounds: { x: plant.position[0], z: plant.position[2], radius: 0.92 },
          meshIndex: plant.meshIndex,
          nodeTransforms: true,
          path: '/plants.fbx',
          position: plant.position,
          sourceUp: 'y',
          turn: plant.turn,
        })), addOutsidePlantTriangle)
          .then(() => {
            refreshRoomBuffer()
          })
          .catch((error: unknown) => {
            console.error(error)
          }),
      ])
    )
    .then(() => undefined)

  return mainWorldLoad
}

function addOutsidePlantTriangle(target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3) {
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
    throw new Error('Cannot shade zero-area outside plant triangle')
  }

  const heightLight = Math.min(Math.max(((a[1] + b[1] + c[1]) / 3 - characterFloor) / 0.92, 0), 1)
  const topLight = Math.max(0, ny / normalLength)
  const shade = 0.3 + heightLight * 0.72 + Math.pow(topLight, 0.7) * 0.28
  const lit: Vec3 = [
    Math.min(color[0] * shade, 1),
    Math.min(color[1] * shade, 1),
    Math.min(color[2] * shade, 1),
  ]

  target.push(
    [a[0], a[1], a[2], lit[0], lit[1], lit[2], 0, 0, 0, 0, 0],
    [b[0], b[1], b[2], lit[0], lit[1], lit[2], 0, 0, 0, 0, 0],
    [c[0], c[1], c[2], lit[0], lit[1], lit[2], 0, 0, 0, 0, 0],
  )
}

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

  return loftStatuesLoad
}

function loadLoftPlantsOnce() {
  loftPlantsLoad ??= loadStaticFbxObjects(loftVertices, '/plant.fbx', loftPlants.map((plant, index) => ({
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

  return loftPlantsLoad
}

function loadLoftDecorOnce() {
  loadLoftPlantsOnce()
  loadLoftStatuesOnce()
}
