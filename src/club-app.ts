import { createCameraController } from './camera-controller.ts'
import { createCharacterHairController } from './character-hair-control.ts'
import { createCharacterRenderSystem } from './character-render-system.ts'
import { createCharacterStyleController } from './character-style.ts'
import { createChatUi } from './chat-ui.ts'
import { restoreClubState, saveClubState } from './club-persistence.ts'
import { renderClubFrame } from './club-renderer.ts'
import { createSaveTimer } from './club-state.ts'
import { createDjVideoUi } from './dj-video-ui.ts'
import { getDomElements } from './dom-elements.ts'
import { addRoom, addRoomSmoke, addWallStrips } from './environment-object.ts'
import { bindKeyboardInput } from './input.ts'
import { createLocalCharacter } from './local-character.ts'
import { createPlayers, updatePlayers } from './player-system.ts'
import { createWallProjector } from './projection.ts'
import { createSceneLighting } from './scene-lighting.ts'
import {
  isOutside,
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
import { createStrobeDrawController } from './strobe-draw.ts'
import { createStrobeLights } from './strobe-object.ts'
import { loadOutsideTree } from './tree-world.ts'
import type {
  CircleBounds,
  ClubGlobal,
  Vertex,
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

const { canvas, djVideo, chatForm, chatInput, chatBubble } = getDomElements()

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
const keys = new Set<string>()
const localCharacter = createLocalCharacter(keys)
const characterPosition = localCharacter.position
const hairController = createCharacterHairController()
const styleController = createCharacterStyleController()
const chatUi = createChatUi(chatForm, chatInput, chatBubble, characterPosition)
const djVideoUi = createDjVideoUi(djVideo, characterPosition)
const cameraController = createCameraController(canvas, characterPosition)
let outsideTree: CircleBounds = { x: 0, z: 20.5, radius: 0.75 }
let lastStamp = 0
const saveTimer = createSaveTimer(0.5)

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
const resolution = gl.getUniformLocation(program, 'resolution')
const cameraEye = gl.getUniformLocation(program, 'cameraEye')
const cameraCenter = gl.getUniformLocation(program, 'cameraCenter')
const renderZone = gl.getUniformLocation(program, 'renderZone')
const treeShadowSampler = gl.getUniformLocation(program, 'treeShadowMap')
const characterBoxResolution = gl.getUniformLocation(characterBoxProgram, 'resolution')
const characterBoxCameraEye = gl.getUniformLocation(characterBoxProgram, 'cameraEye')
const characterBoxCameraCenter = gl.getUniformLocation(characterBoxProgram, 'cameraCenter')
const characterBoxRenderZone = gl.getUniformLocation(characterBoxProgram, 'renderZone')
const lightTime = gl.getUniformLocation(lightProgram, 'time')
const lightSmokeMap = gl.getUniformLocation(lightProgram, 'smokeMap')
const lightRenderZone = gl.getUniformLocation(lightProgram, 'renderZone')
const lightResolution = gl.getUniformLocation(lightProgram, 'resolution')
const lightCameraEye = gl.getUniformLocation(lightProgram, 'cameraEye')
const lightCameraCenter = gl.getUniformLocation(lightProgram, 'cameraCenter')
const strobeTime = gl.getUniformLocation(strobeProgram, 'time')
const strobeSmokeMap = gl.getUniformLocation(strobeProgram, 'smokeMap')
const strobeRenderZone = gl.getUniformLocation(strobeProgram, 'renderZone')
const strobeResolution = gl.getUniformLocation(strobeProgram, 'resolution')
const strobeCameraEye = gl.getUniformLocation(strobeProgram, 'cameraEye')
const strobeCameraCenter = gl.getUniformLocation(strobeProgram, 'cameraCenter')
const hairResolution = gl.getUniformLocation(hairProgram, 'resolution')
const hairCameraEye = gl.getUniformLocation(hairProgram, 'cameraEye')
const hairCameraCenter = gl.getUniformLocation(hairProgram, 'cameraCenter')
const hairRenderZone = gl.getUniformLocation(hairProgram, 'renderZone')
const roomSmokeTime = gl.getUniformLocation(smokeProgram, 'time')
const roomSmokeMap = gl.getUniformLocation(smokeProgram, 'smokeMap')
const roomSmokeResolution = gl.getUniformLocation(smokeProgram, 'resolution')
const roomSmokeCameraEye = gl.getUniformLocation(smokeProgram, 'cameraEye')
const roomSmokeCameraCenter = gl.getUniformLocation(smokeProgram, 'cameraCenter')
const postScene = gl.getUniformLocation(postProgram, 'scene')
const postBloom = gl.getUniformLocation(postProgram, 'bloom')
const postBloomResolution = gl.getUniformLocation(postProgram, 'bloomResolution')
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
const target = createTarget(gl, 1, 1)
const bloomTarget = createTarget(gl, 1, 1)
const stride = vertexSize * Float32Array.BYTES_PER_ELEMENT
const strobeGeometry = createStrobeGeometry()
const strobeInstanceSize = 14
const strobeInstanceStride = strobeInstanceSize * Float32Array.BYTES_PER_ELEMENT
const characterBoxGeometry = createCharacterBoxGeometry()
const characterBoxInstanceSize = 17
const characterBoxInstanceStride = characterBoxInstanceSize * Float32Array.BYTES_PER_ELEMENT

if (!resolution || !cameraEye || !cameraCenter || !renderZone || !treeShadowSampler || !characterBoxResolution
  || !characterBoxCameraEye || !characterBoxCameraCenter || !characterBoxRenderZone || !lightTime || !lightSmokeMap
  || !lightRenderZone || !lightResolution || !lightCameraEye || !lightCameraCenter || !strobeTime || !strobeSmokeMap
  || !strobeRenderZone || !strobeResolution || !strobeCameraEye || !strobeCameraCenter || !hairResolution
  || !hairCameraEye
  || !hairCameraCenter || !hairRenderZone || !roomSmokeTime || !roomSmokeMap || !roomSmokeResolution
  || !roomSmokeCameraEye || !roomSmokeCameraCenter || !postScene || !postBloom || !postBloomResolution
  || !postSkyForward || !postSkyRight || !postSkyUp || !array
  || !buffer || !lightArray || !lightBuffer || !strobeArray || !strobeGeometryBuffer || !strobeInstanceBuffer
  || !smokeArray || !smokeBuffer || !characterArray || !characterBuffer
  || !characterBoxArray || !characterBoxGeometryBuffer || !characterBoxInstanceBuffer || !postArray || !postBuffer)
{
  throw new Error('Failed to initialize WebGL resources')
}

const characterBoxUniforms = {
  cameraCenter: characterBoxCameraCenter,
  cameraEye: characterBoxCameraEye,
  renderZone: characterBoxRenderZone,
  resolution: characterBoxResolution,
}
const hairUniforms = {
  cameraCenter: hairCameraCenter,
  cameraEye: hairCameraEye,
  renderZone: hairRenderZone,
  resolution: hairResolution,
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

gl.enable(gl.DEPTH_TEST)
gl.clearColor(0.01, 0.01, 0.014, 1.0)

restoreClubState({
  camera: cameraController,
  characterPosition,
  djVideoUi,
  hairController,
  key: saveKey,
  localCharacter,
  styleController,
})
djVideoUi.setZoneFromPosition()
djVideoUi.load()

bindKeyboardInput({
  activeInput: chatInput,
  keys,
  openChatInput: () => chatUi.open(),
  cycleHair: direction => hairController.cycleHair(direction),
  cycleHairColor: direction => hairController.cycleColor(direction),
  cycleShirt: direction => styleController.cycleShirt(direction),
  cyclePants: direction => styleController.cyclePants(direction),
})

chatForm.addEventListener('submit', event => {
  event.preventDefault()
  chatUi.submit()
})

const resize = () => {
  const ratio = window.devicePixelRatio
  const width = Math.floor(canvas.clientWidth * ratio)
  const height = Math.floor(canvas.clientHeight * ratio)

  if (canvas.width === width && canvas.height === height) {
    return
  }

  canvas.width = width
  canvas.height = height
  resizeTarget(gl, target, width, height)
  resizeTarget(gl, bloomTarget, Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)))
  gl.viewport(0, 0, width, height)
}

const draw = (stamp: number) => {
  const delta = lastStamp === 0 ? 0 : Math.min((stamp - lastStamp) / 1000, 0.05)
  const frame = Math.floor(stamp / 16.6667)

  strobeController.setFrame(frame)
  lastStamp = stamp
  resize()
  localCharacter.update(delta, cameraController.turn, outsideTree)
  updatePlayers(players, delta, stamp * 0.001, outsideTree)
  localCharacter.readInput()
  cameraController.update(delta, localCharacter.input, localCharacter.turn)
  saveTimer.update(delta, () =>
    saveClubState({
      camera: cameraController,
      characterAssetsLoaded: characterRenderSystem.assetsLoaded,
      characterPosition,
      djVideoUi,
      hairController,
      key: saveKey,
      localCharacter,
      styleController,
    }))
  const camera = cameraController.get()
  strobeController.updateInstances(stamp * 0.001, djVideoUi.zone)
  const lightCount = lightPoints.length / vertexSize

  const projector = createWallProjector(camera, canvas)

  djVideoUi.update(camera, projector)
  chatUi.update(projector, stamp)

  const outside = isOutside(characterPosition)
  const sky = usesSkyBackground(camera)

  const characterCount = characterRenderSystem.update(stamp * 0.001)

  renderClubFrame({
    arrays: {
      character: characterArray,
      characterBox: characterBoxArray,
      light: lightArray,
      post: postArray,
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
        cameraCenter: lightCameraCenter,
        cameraEye: lightCameraEye,
        renderZone: lightRenderZone,
        resolution: lightResolution,
        smokeMap: lightSmokeMap,
        time: lightTime,
      },
    },
    outside,
    points,
    post: {
      bloom: postBloom,
      bloomResolution: postBloomResolution,
      program: postProgram,
      scene: postScene,
      skyForward: postSkyForward,
      skyRight: postSkyRight,
      skyUp: postSkyUp,
    },
    program,
    roomUniforms: {
      cameraCenter,
      cameraEye,
      renderZone,
      resolution,
      treeShadowSampler,
    },
    sky,
    smoke: {
      map: smokeMap,
      points: smokePoints,
      program: smokeProgram,
      uniforms: {
        cameraCenter: roomSmokeCameraCenter,
        cameraEye: roomSmokeCameraEye,
        resolution: roomSmokeResolution,
        smokeMap: roomSmokeMap,
        time: roomSmokeTime,
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

import.meta.hot?.dispose(() => {
  cancelAnimationFrame(frameId)
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
    cameraCenter: strobeCameraCenter,
    cameraEye: strobeCameraEye,
    renderZone: strobeRenderZone,
    resolution: strobeResolution,
    smokeMap: strobeSmokeMap,
    time: strobeTime,
  },
})
const { addLocalReflection, addSunLitTriangle } = createSceneLighting({
  getTree: () => outsideTree,
  strobeReflection: (point, normal) => strobeController.reflection(point, normal),
})
const players = createPlayers(100, outsideTree)
const characterRenderSystem = createCharacterRenderSystem({
  boxInstanceBuffer: characterBoxInstanceBuffer,
  boxInstanceSize: characterBoxInstanceSize,
  buffer: characterBuffer,
  camera: cameraController,
  canvas,
  characterPosition,
  gl,
  hairController,
  light: addLocalReflection,
  localCharacter,
  players,
  styleController,
  vertexSize,
})

frameId = requestAnimationFrame(draw)
clubGlobal.clubFrameId = frameId

characterRenderSystem.loadOnce(() => {
  loadOutsideTree(gl, treeShadowMap, vertices, outsideTree, addSunLitTriangle)
    .then(nextTree => {
      outsideTree = nextTree
      refreshRoomBuffer()
    })
    .catch((error: unknown) => {
      console.error(error)
    })
}).catch((error: unknown) => {
  console.error(error)
})
