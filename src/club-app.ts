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
  maxGraffitiSplats,
  paintGraffitiSplats,
  sprayWallPoint,
} from './graffiti.ts'
import { createHelpUi } from './help-ui.ts'
import { bindKeyboardInput, setAlternativeInput } from './input.ts'
import { createLocalCharacter } from './local-character.ts'
import { lengthSq, mix } from './math.ts'
import { bindTapDestination, createMobileControls } from './mobile-controls.ts'
import { createMultiplayer, updateRemotePlayers } from './multiplayer.ts'
import { createPlayers, takeNpcSeat, updatePlayers } from './player-system.ts'
import { createWallProjector, projectWallPointInto } from './projection.ts'
import type { ProjectedPoint } from './projection.ts'
import { outsideBounds, outsideBuddha, outsidePalmTree, outsideToilets, roomBounds, tent, tentDoorAngle } from './scene-data.ts'
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
import { loadStaticFbxObject, loadStaticFbxObjects } from './static-fbx-object.ts'
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
  chatInput,
  chatBubble,
  chatLog,
  onlineCount,
  onlineIndicator,
  supportLink,
  intro,
  introBar,
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
const savedState = readClubState(saveKey)
const chatLogMax = 15
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
const localCharacter = createLocalCharacter(keys)
const characterPosition = localCharacter.position
const hairController = createCharacterHairController()
const styleController = createCharacterStyleController()
const chatUi = createChatUi(chatForm, chatInput, chatBubble, characterPosition)
let nickname = savedState?.nickname ?? ''
const adminIdRoot = document.createElement('div')
const videoAuthorityZones = new Set<VideoZone>()
let sendVideoStateNow = () => {}
let sendVideoPlaylistNow = (_zone: VideoZone, _ids: string[]) => {}
const djVideoUi = createDjVideoUi(djVideo, characterPosition, {
  recoverFocus: () => canvas.focus(),
  isAuthority: zone => videoAuthorityZones.has(zone),
  onPlaylistDiscovered: (zone, ids) => sendVideoPlaylistNow(zone, ids),
  onStateChanged: () => sendVideoStateNow(),
})
const helpUi = createHelpUi()
const helpSeen = localStorage.getItem(helpSeenKey) === 'true'
const cameraController = createCameraController(canvas, characterPosition)
function syncOnlineIndicator() {
  onlineIndicator.dataset.hidden = String(helpUi.root.dataset.open === 'true')
  supportLink.dataset.hidden = String(helpUi.root.dataset.open === 'true')
}
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
  message.textContent = text
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

  while (chatLog.childElementCount > chatLogMax) {
    chatLog.firstElementChild!.remove()
  }

  return color
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
const adminRandomTrackSubmit = document.createElement('button')
const banDialog = document.createElement('dialog')
const banForm = document.createElement('form')
const banMessage = document.createElement('p')
const banCancel = document.createElement('button')
const banSubmit = document.createElement('button')

adminDialog.id = 'admin-dialog'
adminForm.method = 'dialog'
adminInput.type = 'password'
adminInput.autocomplete = 'current-password'
adminInput.placeholder = 'admin pass'
adminSubmit.type = 'submit'
adminSubmit.textContent = 'enter'
adminBanIdInput.type = 'number'
adminBanIdInput.min = '1'
adminBanIdInput.step = '1'
adminBanIdInput.placeholder = 'id'
adminBanIdSubmit.type = 'button'
adminBanIdSubmit.textContent = 'ban id'
adminRandomTrackSubmit.type = 'button'
adminRandomTrackSubmit.textContent = 'random track'
adminForm.append(adminInput, adminSubmit, adminBanIdInput, adminBanIdSubmit, adminRandomTrackSubmit)
adminDialog.append(adminForm)
banDialog.id = 'ban-dialog'
banForm.method = 'dialog'
banCancel.type = 'button'
banSubmit.type = 'submit'
banCancel.textContent = 'cancel'
banSubmit.textContent = 'ban'
banForm.append(banMessage, banCancel, banSubmit)
banDialog.append(banForm)
document.body.append(adminDialog, banDialog)
for (const eventName of ['keydown', 'keyup', 'pointerdown']) {
  adminInput.addEventListener(eventName, event => event.stopPropagation())
  adminBanIdInput.addEventListener(eventName, event => event.stopPropagation())
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
  const playlists = djVideoUi.playlists()

  if (playlists.length > 0) {
    multiplayer.sendVideoPlaylist(playlists)
  }

  multiplayer.sendAdmin(adminPass, 'randomTrack', videoZoneRoom(djVideoUi.zone))
})

function videoZoneRoom(zone: VideoZone) {
  return zone === 'inside' ? 1 : zone === 'tent' ? 2 : 0
}

banCancel.addEventListener('click', () => {
  pendingBan = undefined
  banDialog.close()
})

banForm.addEventListener('submit', () => {
  if (!pendingBan) {
    throw new Error('Missing pending ban')
  }

  const { id } = pendingBan

  pendingBan = undefined
  deleteChatLogMessages(id)
  chatUi.removeMessages(id)
  multiplayer.sendAdmin(adminPass, 'ban', id)
})

function openBanDialog(id: number, message: string) {
  pendingBan = { id, message }
  banMessage.textContent = `Are you sure you want to ban ${message}`
  banDialog.showModal()
}

function openAdminDialog() {
  adminInput.value = adminPass
  adminDialog.showModal()
  adminInput.focus()
}

function setAdminView(value: boolean) {
  adminView = value
  chatLog.dataset.admin = String(adminView)
  adminIdRoot.dataset.admin = String(adminView)
  onlineIndicator.style.pointerEvents = adminView ? 'auto' : ''
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
  const name = chatMessageNickname(text)

  return chatPalette[(name ? chatNicknameHash(name) : id) % chatPalette.length]!
}

function chatMessageNickname(text: string) {
  return /^<([^>\n]+)> /.exec(text)?.[1]
}

function chatNicknameHash(name: string) {
  let hash = 2166136261

  for (const char of name) {
    hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619) >>> 0
  }

  return hash
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

function startIntro() {
  videoPlaying = djVideoUi.play()
  introStart.dataset.playing = String(videoPlaying)
}

introStart.addEventListener('click', startIntro)
addEventListener('keydown', event => {
  if (!introHidden && event.key === 'Enter') {
    event.preventDefault()
    startIntro()
  }
})
let wasOutside = isOutside(characterPosition)
let doorCoverReleased = true
let activeRoom = savedState ? roomIndex(roomAt(savedState.character)) : 0
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
  return zone === 'inside' ? 1 : zone === 'tent' ? 2 : 0
}

function renderZoneIndex(zone: VideoZone) {
  return zone === 'inside' ? 0 : zone === 'tent' ? 2 : 1
}

addRoom(vertices)
addWallStrips(lights)
addRoomSmoke(smoke)
const graffitiWallVertices: Vertex[] = []
addGraffitiWallGeometry(graffitiWallVertices)

let points = new Float32Array(vertices.flat())
let lightPoints = new Float32Array(lights.flat())
const smokePoints = new Float32Array(smoke.flat())
const graffitiPoints = new Float32Array(graffitiWallVertices.flat())
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
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, graffitiCanvas)

setupVertexArray({ array, buffer, data: points, gl, stride, usage: gl.STATIC_DRAW })

function refreshRoomBuffer() {
  points = new Float32Array(vertices.flat())
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW)
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
  djVideoUi,
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

if (activeRoom !== roomIndex(roomAt(characterPosition))) {
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
const predictedMessages = new Map<string, number>()
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

multiplayer = createMultiplayer({
  localPosition: characterPosition,
  localTurn: () => localCharacter.turn,
  localMoveAngle,
  localInput: localCharacter.input,
  localMode: () => localCharacter.mode,
  localIdleClipIndex: () => idleClipIndex,
  localStyle: () => ({
    topStyleIndex: styleController.topStyleIndex,
    bottomStyleIndex: styleController.bottomStyleIndex,
    hairIndex: hairController.index,
    hairColorIndex: hairController.colorIndex,
    skinColorIndex: styleController.skinColorIndex,
    accessoryIndex: styleController.accessoryIndex,
  }),
  initialRoom: activeRoom,
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
  onLeave: id => chatUi.remove(id),
  onOnlineCount: count => {
    onlineCount.textContent = `${count} online`
  },
  onVideoAuthority: entries => {
    videoAuthorityZones.clear()
    for (const entry of entries) {
      if (entry.id === multiplayer.selfId) {
        videoAuthorityZones.add(entry.zone)
      }
    }
  },
  onVideoPlaylist: entries => djVideoUi.applyPlaylists(entries),
  onVideoState: (entries, preserveSameTrack, immediate) => djVideoUi.applyStates(entries, preserveSameTrack, immediate),
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
  videoState: () => [djVideoUi.state()],
})
sendVideoStateNow = () => multiplayer.sendVideoState()
sendVideoPlaylistNow = (zone, ids) => multiplayer.sendVideoPlaylist([{ zone, ids }])
clubGlobal.clubMultiplayerClose = () => multiplayer.close()

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

function promptNickname() {
  const next = prompt('nickname', nickname)

  if (next !== null) {
    nickname = next.trim()
    saveCurrentClubState(true)
  }
}

function messageWithNickname(text: string) {
  return nickname && text ? `<${nickname}> ${text}` : text
}

function saveCurrentClubState(characterAssetsLoaded: boolean, room = roomIndex(roomAt(characterPosition))) {
  saveClubState({
    camera: cameraController,
    characterAssetsLoaded,
    characterPosition,
    djVideoUi,
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
  activeInput: chatInput,
  keys,
  startJumping: () => localCharacter.startJumping(),
  stopJumping: () => localCharacter.stopJumping(),
  startWave: () => localCharacter.startWave(),
  stopWave: () => localCharacter.stopWave(),
  openChatInput: () => chatUi.open(),
  promptNickname,
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
  openChatInput: () => chatUi.open(),
})
bindTapDestination({
  canvas,
  ignorePointer: event => styleController.accessoryIndex > glowstickColors.length,
  jump: () => localCharacter.jump(),
  projector: wallProjector,
  setDestination: value => localCharacter.setDestination(value, seatAt(value, occupiedSeats, 0.46, true)),
})

canvas.addEventListener('pointerdown', event => {
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
    radius: graffitiRadius(hit.distance),
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

function graffitiRadius(distance: number) {
  const start = 1.5
  const range = 10
  const t = Math.max(0, Math.min(1, (distance - start) / range))

  return Math.round(Math.pow(t, 5) * 255)
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

chatForm.addEventListener('submit', event => {
  event.preventDefault()
  const text = multiplayer.sendMessage(messageWithNickname(chatUi.submit()))

  if (text) {
    predictedMessages.set(text, (predictedMessages.get(text) ?? 0) + 1)
    const color = addChatLogMessage(multiplayer.selfId, text)

    chatUi.show(multiplayer.selfId, text, characterPosition, performance.now(), color)
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
  localCharacter.update(delta, cameraController.turn, outsideTree, styleController.bottomMode, occupiedSeats,
    seat => takeNpcSeat(npcPlayers, seat, stamp * 0.001, outsideTree, occupiedSeats))
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
  updateBeachBalls(beachBalls, delta, outsideTree)
  const hits = hitBeachBalls(beachBalls, characterPosition)

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
  const zone = roomAt(characterPosition)
  const room = roomIndex(zone)

  if (room !== requestedRoom) {
    requestedRoom = room
    multiplayer.sendMotion()
    multiplayer.sendRoomChange(room)
    activeRoom = room
  }
  else {
    multiplayer.sendMotionIfKeysChanged()
  }

  updatePlayers(npcPlayers, delta, stamp * 0.001, outsideTree, occupiedSeats)
  updateRemotePlayers(multiplayer.players.values(), delta, outsideTree)
  takeRemoteSeats()
  renderPlayers.length = 0
  renderPlayers.push(...npcPlayers, ...multiplayer.players.values())
  const dancing = zone !== 'tent' && localCharacter.mode === 'stand' && idleClipIndex > 0
  cameraController.update(delta, localCharacter.input, localCharacter.turn, lengthSq(localCharacter.input) > 0
    || dancing, localCharacter.jumping)
  saveTimer.update(delta, () => saveCurrentClubState(characterRenderSystem.assetsLoaded))
  const camera = cameraController.get()
  strobeController.updateInstances(stamp * 0.001, zone)
  const lightCount = lightPoints.length / vertexSize

  const projector = createWallProjector(camera, canvas, wallProjector)

  if (introHidden) {
    djVideoUi.update(camera, projector)
  }
  chatUi.update(projector, stamp)
  updateAdminIdLabels(projector)

  const outside = isOutside(characterPosition)
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
  const sky = zone === 'outside' && usesSkyBackground(camera)

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
    graffitiPoints,
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
  const points: Vertex[] = []

  addBeachBallGeometry(points, beachBalls)
  beachBallPoints = new Float32Array(points.flat())
  gl.bindBuffer(gl.ARRAY_BUFFER, beachBallBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, beachBallPoints, gl.DYNAMIC_DRAW)
}

function repaintGraffitiTexture() {
  graffitiContext.clearRect(0, 0, graffitiCanvas.width, graffitiCanvas.height)
  paintGraffitiTexture(graffitiSplats)
}

function scheduleGraffitiTexturePaint(splats: import('./types.ts').GraffitiSplat[], clear: boolean) {
  const paintId = ++graffitiPaintId
  const chunk = 1400
  let index = 0

  if (clear) {
    graffitiContext.clearRect(0, 0, graffitiCanvas.width, graffitiCanvas.height)
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
