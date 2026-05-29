import { createAdaptivePixelRatio } from './adaptive-pixel-ratio.ts'
import { addBeachBallGeometry, createBeachBalls, hitBeachBalls, updateBeachBalls } from './beach-balls.ts'
import { createCameraController } from './camera-controller.ts'
import { idleClipNames } from './character-assets.ts'
import { characterFloor } from './character-data.ts'
import { createCharacterHairController } from './character-hair-control.ts'
import { createCharacterRenderSystem } from './character-render-system.ts'
import { createCharacterStyleController } from './character-style.ts'
import { createChatUi } from './chat-ui.ts'
import { restoreClubState, saveClubState } from './club-persistence.ts'
import { renderClubFrame } from './club-renderer.ts'
import { createSaveTimer, readClubState } from './club-state.ts'
import { createDjVideoUi } from './dj-video-ui.ts'
import { getDomElements } from './dom-elements.ts'
import { addRoom, addRoomSmoke, addWallStrips } from './environment-object.ts'
import { createHelpUi } from './help-ui.ts'
import { bindKeyboardInput, setAlternativeInput } from './input.ts'
import { createLocalCharacter } from './local-character.ts'
import { lengthSq } from './math.ts'
import { bindTapDestination, createMobileControls } from './mobile-controls.ts'
import { createMultiplayer, updateRemotePlayers } from './multiplayer.ts'
import { createPlayers, takeNpcSeat, updatePlayers } from './player-system.ts'
import { createWallProjector } from './projection.ts'
import { outsideBuddha, roomBounds, tent, tentDoorAngle } from './scene-data.ts'
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
import { loadStaticFbxObject } from './static-fbx-object.ts'
import { createStrobeDrawController } from './strobe-draw.ts'
import { createStrobeLights } from './strobe-object.ts'
import { loadOutsideTree } from './tree-world.ts'
import type {
  CircleBounds,
  ClubGlobal,
  Player,
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
const bloomScale = 0.5
const chatLogMax = 15
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
const djVideoUi = createDjVideoUi(djVideo, characterPosition)
const helpUi = createHelpUi()
const helpSeen = localStorage.getItem(helpSeenKey) === 'true'
const cameraController = createCameraController(canvas, characterPosition)
function syncOnlineIndicator() {
  onlineIndicator.dataset.hidden = String(helpUi.root.dataset.open === 'true')
  supportLink.dataset.hidden = String(helpUi.root.dataset.open === 'true')
}
syncOnlineIndicator()
function addChatLogMessage(id: number, text: string) {
  const row = document.createElement('div')

  row.className = 'chat-log-message'
  row.style.color = chatUserColor(id)
  row.textContent = text
  chatLog.append(row)

  while (chatLog.childElementCount > chatLogMax) {
    chatLog.firstElementChild!.remove()
  }
}

function chatUserColor(id: number) {
  return chatPalette[id % chatPalette.length]!
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
useAlternativeInput(alternativeInput)
const wallProjector = createWallProjector({ eye: [0, 0, 1], center: [0, 0, 0] }, canvas)
const pixelRatio = createAdaptivePixelRatio()
let outsideTree: CircleBounds = { x: 0, z: 20.5, radius: 0.75 }
let lastStamp = 0
let buddhaLoaded = false
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
const savedState = readClubState(saveKey)
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

let points = new Float32Array(vertices.flat())
let lightPoints = new Float32Array(lights.flat())
const smokePoints = new Float32Array(smoke.flat())
const program = createProgram(gl, vertex, fragment)
const lightProgram = createProgram(gl, vertex, lightFragment)
const strobeProgram = createProgram(gl, strobeVertex, lightFragment)
const characterBoxProgram = createProgram(gl, characterBoxVertex, characterBoxFragment)
const hairProgram = createProgram(gl, hairVertex, hairFragment)
const smokeProgram = createProgram(gl, smokeVertex, smokeFragment)
const postProgram = createProgram(gl, postVertex, postFragment)
const smokeMap = createSmokeMap(gl)
const treeShadowMap = createTreeShadowMap(gl)
const viewProjection = gl.getUniformLocation(program, 'viewProjection')
const cameraEye = gl.getUniformLocation(program, 'cameraEye')
const renderZone = gl.getUniformLocation(program, 'renderZone')
const bloomPass = gl.getUniformLocation(program, 'bloomPass')
const doorCoverVisible = gl.getUniformLocation(program, 'doorCoverVisible')
const treeShadowSampler = gl.getUniformLocation(program, 'treeShadowMap')
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
const postBloomResolution = gl.getUniformLocation(postProgram, 'bloomResolution')
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
const target = createTarget(gl, 1, 1)
const bloomTarget = createTarget(gl, 1, 1)
const stride = vertexSize * Float32Array.BYTES_PER_ELEMENT
const strobeGeometry = createStrobeGeometry()
const strobeInstanceSize = 14
const strobeInstanceStride = strobeInstanceSize * Float32Array.BYTES_PER_ELEMENT
const characterBoxGeometry = createCharacterBoxGeometry()
const characterBoxInstanceSize = 17
const characterBoxInstanceStride = characterBoxInstanceSize * Float32Array.BYTES_PER_ELEMENT

if (!viewProjection || !cameraEye || !renderZone || !bloomPass || !doorCoverVisible || !treeShadowSampler
  || !characterBoxViewProjection
  || !characterBoxRenderZone || !characterBoxBloomPass || !lightTime || !lightSmokeMap || !lightRenderZone || !lightViewProjection
  || !strobeTime || !strobeSmokeMap || !strobeRenderZone || !strobeViewProjection || !hairViewProjection
  || !hairRenderZone || !roomSmokeTime || !roomSmokeMap || !roomSmokeViewProjection || !roomSmokeCameraRight
  || !roomSmokeCameraUp || !postScene || !postBloom || !postBloomResolution || !postRenderSky
  || !postSkyForward || !postSkyRight || !postSkyUp || !array
  || !buffer || !lightArray || !lightBuffer || !strobeArray || !strobeGeometryBuffer || !strobeInstanceBuffer
  || !smokeArray || !smokeBuffer || !characterArray || !characterBuffer
  || !characterBoxArray || !characterBoxGeometryBuffer || !characterBoxInstanceBuffer || !postArray || !postBuffer
  || !beachBallArray || !beachBallBuffer)
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
    saveClubState({
      camera: cameraController,
      characterAssetsLoaded: true,
      characterPosition,
      djVideoUi,
      alternativeInput,
      hairController,
      idleClipIndex,
      key: saveKey,
      localCharacter,
      room,
      styleController,
    })
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
      : multiplayer.players.get(id)?.position ?? characterPosition

    addChatLogMessage(id, text)
    chatUi.show(id, text, position, performance.now())
  },
  onLeave: id => chatUi.remove(id),
  onOnlineCount: count => {
    onlineCount.textContent = `${count} online`
  },
  onVideoState: (entries, preserveSameTrack) => djVideoUi.applyStates(entries, preserveSameTrack),
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
  videoState: () => djVideoUi.states(),
})
clubGlobal.clubMultiplayerClose = () => multiplayer.close()

const styleActions: Record<'cycleHair' | 'cycleHairColor' | 'cycleSkin' | 'cycleIdle' | 'cycleShirt' | 'cyclePants',
  (direction: number) => void> = {
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

bindKeyboardInput({
  activeInput: chatInput,
  keys,
  jump: () => localCharacter.jump(),
  openChatInput: () => chatUi.open(),
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

createMobileControls({
  ...styleActions,
  openChatInput: () => chatUi.open(),
})
bindTapDestination({
  canvas,
  jump: () => localCharacter.jump(),
  projector: wallProjector,
  setDestination: value => localCharacter.setDestination(value, seatAt(value, occupiedSeats, 0.46, true)),
})

chatForm.addEventListener('submit', event => {
  event.preventDefault()
  const text = multiplayer.sendMessage(chatUi.submit())

  if (text) {
    predictedMessages.set(text, (predictedMessages.get(text) ?? 0) + 1)
    addChatLogMessage(multiplayer.selfId, text)
    chatUi.show(multiplayer.selfId, text, characterPosition, performance.now())
  }
})

const resize = () => {
  const ratio = pixelRatio.ratio()
  const width = Math.floor(canvas.clientWidth * ratio)
  const height = Math.floor(canvas.clientHeight * ratio)

  if (canvas.width === width && canvas.height === height) {
    return
  }

  canvas.width = width
  canvas.height = height
  resizeTarget(gl, target, width, height)
  resizeTarget(gl, bloomTarget, Math.max(1, Math.floor(width * bloomScale)),
    Math.max(1, Math.floor(height * bloomScale)))
  gl.viewport(0, 0, width, height)
}

const draw = (stamp: number) => {
  const delta = lastStamp === 0 ? 0 : Math.min((stamp - lastStamp) / 1000, 0.05)
  const frame = Math.floor(stamp / 16.6667)

  strobeController.setFrame(frame)
  lastStamp = stamp
  pixelRatio.update(delta, stamp)
  clubGlobal.clubPixelRatio = pixelRatio.ratio()
  resize()
  localCharacter.update(delta, cameraController.turn, outsideTree, styleController.bottomMode, occupiedSeats,
    seat => takeNpcSeat(npcPlayers, seat, stamp * 0.001, outsideTree, occupiedSeats))
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
  saveTimer.update(delta, () =>
    saveClubState({
      camera: cameraController,
      characterAssetsLoaded: characterRenderSystem.assetsLoaded,
      characterPosition,
      djVideoUi,
      alternativeInput,
      hairController,
      idleClipIndex,
      key: saveKey,
      localCharacter,
      room: roomIndex(roomAt(characterPosition)),
      styleController,
    }))
  const camera = cameraController.get()
  strobeController.updateInstances(stamp * 0.001, djVideoUi.zone)
  const lightCount = lightPoints.length / vertexSize

  const projector = createWallProjector(camera, canvas, wallProjector)

  if (introHidden) {
    djVideoUi.update(camera, projector)
  }
  chatUi.update(projector, stamp)

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
    post: {
      bloom: postBloom,
      bloomResolution: postBloomResolution,
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

function updateIntro() {
  const progress = Math.round((
    Number(characterRenderSystem.assetsLoaded)
    + Number(characterRenderSystem.detailsLoaded)
    + Number(buddhaLoaded)
    + Number(treeLoaded)
  ) / 4 * 100)

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
  console.error(error)
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
    console.error(error)
  })
