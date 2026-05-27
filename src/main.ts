import './style.css'
import assimpjs from 'assimpjs'
import {
  characterBones,
  characterFloor,
  characterGroundJoints,
  characterScale,
  hairPalette,
  jewelPalette,
  pants,
  shirt,
  shirtLight,
  shoe,
  skin,
} from './character-data.ts'
import { createHairMeshes, createHairRenderMeshes, updateHairInstances } from './character-hair.ts'
import {
  createCharacterClip,
  createRigNodes,
  sampleBasePose,
  sampleCharacterPose,
  validateCharacterRig,
} from './character-rig.ts'
import { electricNavy, outsideMotif } from './constants.ts'
import {
  add,
  clamp,
  cross,
  dot,
  lengthSq,
  lerpVec3,
  mix,
  normalize,
  normalizeIndex,
  normalizeInto,
  scale,
  setVec3,
  smoothAngle,
  smoothstep,
  subtract,
} from './math.ts'
import { projectedQuadTransform, projectWallPoint } from './projection.ts'
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
import type {
  AssimpScene,
  BottomMode,
  Bounds,
  CharacterMode,
  CharacterPart,
  CharacterRig,
  CircleBounds,
  ClubGlobal,
  HairInstance,
  HairMesh,
  HairRenderMesh,
  Player,
  PlayerDestination,
  PlayerStyle,
  PoseBlendCache,
  ResolvedPlayerStyle,
  SampledPose,
  StrobeLight,
  StrobeReflectionLight,
  TopMode,
  TreeMesh,
  Vec3,
  Vertex,
  VideoZone,
  YouTubePlayer,
  YouTubeWindow,
} from './types.ts'
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

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const djVideo = document.querySelector<HTMLElement>('#dj-video')!
const djVideoLayers: Record<VideoZone, HTMLElement> = {
  inside: document.createElement('div'),
  outside: document.createElement('div'),
}
const djVideoMounts: Record<VideoZone, HTMLElement> = {
  inside: document.createElement('div'),
  outside: document.createElement('div'),
}
const chatForm = document.querySelector<HTMLFormElement>('#chat-form')!
const chatInput = document.querySelector<HTMLInputElement>('#chat-input')!
const chatBubble = document.querySelector<HTMLDivElement>('#chat-bubble')!

if (!canvas) {
  throw new Error('Missing scene canvas')
}

if (!djVideo) {
  throw new Error('Missing DJ video element')
}

for (const zone of videoZones()) {
  const layer = djVideoLayers[zone]
  const mount = djVideoMounts[zone]

  layer.style.position = 'absolute'
  layer.style.inset = '0'
  layer.style.width = '100%'
  layer.style.height = '100%'
  layer.style.opacity = '0'
  layer.style.pointerEvents = 'none'
  mount.style.width = '100%'
  mount.style.height = '100%'
  layer.append(mount)
  djVideo.append(layer)
}

if (!chatForm || !chatInput || !chatBubble) {
  throw new Error('Missing chat elements')
}

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
let characterRig: CharacterRig | undefined
let characterHair: HairMesh | undefined
let characterHairIndex = 0
let characterHairColorIndex = 0
let characterHairMeshes: HairMesh[] = []
let hairRenderMeshes: HairRenderMesh[] = []
let hairInstances: HairInstance[] = []
let characterMode: CharacterMode = 'stand'
let characterRigLoad: Promise<CharacterRig> | undefined
let frameId = 0
const saveKey = 'club-state'
const keys = new Set<string>()
const input: Vec3 = [0, 0, 0]
const forward: Vec3 = [0, 0, 0]
const right: Vec3 = [0, 0, 0]
const direction: Vec3 = [0, 0, 0]
const characterPosition: Vec3 = [-2.2, -1.95, -6.8]
const cameraPosition: Vec3 = [-2.2, 0.15, -9.0]
const cameraTarget: Vec3 = [-2.2, -0.75, -6.8]
const djBooth: Bounds = { x: 0, z: -21.55, width: 3.6, depth: 1.24 }
const djSpeakers: Bounds[] = [
  { x: -4.16, z: -21.63, width: 0.71, depth: 0.79 },
  { x: 4.16, z: -21.63, width: 0.71, depth: 0.79 },
]
const bartenderBar: Bounds = { x: 2.25, z: 2.42, width: 5.2, depth: 0.7 }
const bartenderStools: Bounds[] = [-2.05, -1.15, -0.25, 0.65, 1.55, 2.25].map(offset => ({
  x: bartenderBar.x + offset,
  z: bartenderBar.z - 1.15,
  width: 0.34,
  depth: 0.34,
}))
const outsideDjBooth: Bounds = { x: 0, z: 29, width: 3.6, depth: 1.24 }
const outsideDjSpeakers: Bounds[] = [
  { x: -4.16, z: 29.08, width: 0.71, depth: 0.79 },
  { x: 4.16, z: 29.08, width: 0.71, depth: 0.79 },
]
const djVideoWall = { x: 0, y: .25, z: -23.96, width: 5.5, height: 3.0625, normal: [0, 0, 1] as Vec3 }
const outsideVideoWall = { x: 0, y: .25, z: 31.41, width: 5.5, height: 3.0625, normal: [0, 0, -1] as Vec3 }
const videoTracks: Record<VideoZone, string> = {
  inside: '0oB97YhEukw',
  outside: 'HIn1BxT38mE',
}
const videoTimes: Record<VideoZone, number> = {
  inside: 0,
  outside: 0,
}
const backDoor = { x: -4.75, z: 4, width: 1.45, height: 2.55 }
const roomBounds = { left: -7, right: 7, back: -24, front: 4 }
const outsideBounds = { left: -24, right: 24, back: -32, front: 34 }
const landscapeBounds = { left: -72, right: 72, back: -84, front: 88 }
let outsideTree: CircleBounds = { x: 0, z: 20.5, radius: 0.75 }
let cameraTurn = 0
let cameraDragX = 0
let cameraDragY = 0
let cameraPitch = 0
let cameraDragging = false
let cameraReturning = false
let characterTurn = 0
let characterMotionBlend = 0
let floorY = -1.95
let velocityY = 0
let lastStamp = 0
let saveTime = 0
let chatHideAt = 0
let chatOverlayX = Number.NaN
let chatOverlayY = Number.NaN
const videoPlayers: Partial<Record<VideoZone, YouTubePlayer>> = {}
const videoPlayersReady: Partial<Record<VideoZone, boolean>> = {}
let videoZone: VideoZone = isOutside(characterPosition) ? 'outside' : 'inside'

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
let characterBoxInstances: number[] = []
let characterBoxInstanceCount = 0
let strobeInstances: number[] = []
let strobeInstanceCount = 0

if (!resolution || !cameraEye || !cameraCenter || !renderZone || !treeShadowSampler || !characterBoxResolution
  || !characterBoxCameraEye || !characterBoxCameraCenter || !characterBoxRenderZone || !lightTime || !lightSmokeMap
  || !lightRenderZone || !lightResolution || !lightCameraEye || !lightCameraCenter || !strobeTime || !strobeSmokeMap
  || !strobeRenderZone || !strobeResolution || !strobeCameraEye || !strobeCameraCenter || !hairResolution
  || !hairCameraEye
  || !hairCameraCenter || !hairRenderZone || !roomSmokeTime || !roomSmokeMap || !roomSmokeResolution
  || !roomSmokeCameraEye || !roomSmokeCameraCenter || !postScene || !postBloom || !postBloomResolution || !array
  || !buffer || !lightArray || !lightBuffer || !strobeArray || !strobeGeometryBuffer || !strobeInstanceBuffer
  || !smokeArray || !smokeBuffer || !characterArray || !characterBuffer
  || !characterBoxArray || !characterBoxGeometryBuffer || !characterBoxInstanceBuffer || !postArray || !postBuffer)
{
  throw new Error('Failed to initialize WebGL resources')
}

gl.bindVertexArray(array)
gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
gl.enableVertexAttribArray(1)
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(2)
gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(3)
gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(4)
gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 8 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(5)
gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 10 * Float32Array.BYTES_PER_ELEMENT)
gl.bindVertexArray(null)

function refreshRoomBuffer() {
  points = new Float32Array(vertices.flat())
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW)
}

gl.bindVertexArray(lightArray)
gl.bindBuffer(gl.ARRAY_BUFFER, lightBuffer)
gl.bufferData(gl.ARRAY_BUFFER, lightPoints, gl.DYNAMIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
gl.enableVertexAttribArray(1)
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(2)
gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(3)
gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(4)
gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 8 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(5)
gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 10 * Float32Array.BYTES_PER_ELEMENT)
gl.bindVertexArray(null)

gl.bindVertexArray(strobeArray)
gl.bindBuffer(gl.ARRAY_BUFFER, strobeGeometryBuffer)
gl.bufferData(gl.ARRAY_BUFFER, strobeGeometry.data, gl.STATIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 8 * Float32Array.BYTES_PER_ELEMENT, 0)
gl.enableVertexAttribArray(1)
gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 8 * Float32Array.BYTES_PER_ELEMENT, 4 * Float32Array.BYTES_PER_ELEMENT)
gl.bindBuffer(gl.ARRAY_BUFFER, strobeInstanceBuffer)
gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW)
gl.enableVertexAttribArray(2)
gl.vertexAttribPointer(2, 3, gl.FLOAT, false, strobeInstanceStride, 0)
gl.vertexAttribDivisor(2, 1)
gl.enableVertexAttribArray(3)
gl.vertexAttribPointer(3, 3, gl.FLOAT, false, strobeInstanceStride, 3 * Float32Array.BYTES_PER_ELEMENT)
gl.vertexAttribDivisor(3, 1)
gl.enableVertexAttribArray(4)
gl.vertexAttribPointer(4, 3, gl.FLOAT, false, strobeInstanceStride, 6 * Float32Array.BYTES_PER_ELEMENT)
gl.vertexAttribDivisor(4, 1)
gl.enableVertexAttribArray(5)
gl.vertexAttribPointer(5, 3, gl.FLOAT, false, strobeInstanceStride, 9 * Float32Array.BYTES_PER_ELEMENT)
gl.vertexAttribDivisor(5, 1)
gl.enableVertexAttribArray(6)
gl.vertexAttribPointer(6, 2, gl.FLOAT, false, strobeInstanceStride, 12 * Float32Array.BYTES_PER_ELEMENT)
gl.vertexAttribDivisor(6, 1)
gl.bindVertexArray(null)

gl.bindVertexArray(smokeArray)
gl.bindBuffer(gl.ARRAY_BUFFER, smokeBuffer)
gl.bufferData(gl.ARRAY_BUFFER, smokePoints, gl.STATIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
gl.enableVertexAttribArray(1)
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(2)
gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(3)
gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(4)
gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 8 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(5)
gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 10 * Float32Array.BYTES_PER_ELEMENT)
gl.bindVertexArray(null)

gl.bindVertexArray(characterArray)
gl.bindBuffer(gl.ARRAY_BUFFER, characterBuffer)
gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
gl.enableVertexAttribArray(1)
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(2)
gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(3)
gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(4)
gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 8 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(5)
gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 10 * Float32Array.BYTES_PER_ELEMENT)
gl.bindVertexArray(null)

gl.bindVertexArray(characterBoxArray)
gl.bindBuffer(gl.ARRAY_BUFFER, characterBoxGeometryBuffer)
gl.bufferData(gl.ARRAY_BUFFER, characterBoxGeometry.data, gl.STATIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0)
gl.enableVertexAttribArray(1)
gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 3 * Float32Array.BYTES_PER_ELEMENT)
gl.bindBuffer(gl.ARRAY_BUFFER, characterBoxInstanceBuffer)
gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW)
for (let i = 0; i < 5; i++) {
  const location = 2 + i

  gl.enableVertexAttribArray(location)
  gl.vertexAttribPointer(location, 3, gl.FLOAT, false, characterBoxInstanceStride,
    i * 3 * Float32Array.BYTES_PER_ELEMENT)
  gl.vertexAttribDivisor(location, 1)
}
gl.enableVertexAttribArray(7)
gl.vertexAttribPointer(7, 1, gl.FLOAT, false, characterBoxInstanceStride, 15 * Float32Array.BYTES_PER_ELEMENT)
gl.vertexAttribDivisor(7, 1)
gl.enableVertexAttribArray(8)
gl.vertexAttribPointer(8, 1, gl.FLOAT, false, characterBoxInstanceStride, 16 * Float32Array.BYTES_PER_ELEMENT)
gl.vertexAttribDivisor(8, 1)
gl.bindVertexArray(null)

gl.bindVertexArray(postArray)
gl.bindBuffer(gl.ARRAY_BUFFER, postBuffer)
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
gl.bindVertexArray(null)

gl.enable(gl.DEPTH_TEST)
gl.clearColor(0.01, 0.01, 0.014, 1.0)
canvas.style.touchAction = 'none'

canvas.addEventListener('pointerdown', event => {
  cameraDragging = true
  cameraReturning = false
  cameraDragX = event.clientX
  cameraDragY = event.clientY
  canvas.setPointerCapture(event.pointerId)
})

canvas.addEventListener('pointermove', event => {
  if (cameraDragging) {
    cameraTurn -= (event.clientX - cameraDragX) * 0.005
    cameraPitch = clamp(cameraPitch + (event.clientY - cameraDragY) * 0.018, -2.4, 4.2)
    cameraDragX = event.clientX
    cameraDragY = event.clientY
  }
})

canvas.addEventListener('pointerup', event => {
  cameraDragging = false
  canvas.releasePointerCapture(event.pointerId)
})

canvas.addEventListener('pointercancel', event => {
  cameraDragging = false
  canvas.releasePointerCapture(event.pointerId)
})

addEventListener('keydown', event => {
  if (document.activeElement === chatInput) {
    return
  }

  if (event.code === 'Space') {
    event.preventDefault()
    openChatInput()
    return
  }

  if (event.key.toLowerCase() === 'q') {
    cycleHair(-1)
    return
  }

  if (event.key.toLowerCase() === 'w') {
    cycleHair(1)
    return
  }

  if (event.key === '1') {
    cycleHairColor(-1)
    return
  }

  if (event.key === '2') {
    cycleHairColor(1)
    return
  }

  if (event.key.toLowerCase() === 'a') {
    cycleShirt(-1)
    return
  }

  if (event.key.toLowerCase() === 's') {
    cycleShirt(1)
    return
  }

  if (event.key.toLowerCase() === 'z') {
    cyclePants(-1)
    return
  }

  if (event.key.toLowerCase() === 'x') {
    cyclePants(1)
    return
  }

  keys.add(event.key.toLowerCase())
})

addEventListener('keyup', event => {
  keys.delete(event.key.toLowerCase())
})

chatForm.addEventListener('submit', event => {
  event.preventDefault()
  submitChatInput()
})

const resize = () => {
  const ratio = window.devicePixelRatio
  const width = Math.floor(canvas.clientWidth * ratio)
  const height = Math.floor(canvas.clientHeight * ratio)

  canvas.width = width
  canvas.height = height
  resizeTarget(gl, target, width, height)
  resizeTarget(gl, bloomTarget, Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)))
  gl.viewport(0, 0, width, height)
}

const draw = (stamp: number) => {
  const delta = lastStamp === 0 ? 0 : Math.min((stamp - lastStamp) / 1000, 0.05)
  const frame = Math.floor(stamp / 16.6667)

  lightFrame = frame
  lastStamp = stamp
  resize()
  updateCharacter(delta)
  updatePlayers(delta, stamp * 0.001)
  updateCamera(delta)
  updateSave(delta)
  const camera = getCamera()
  const lightCount = updateLightBuffer(stamp * 0.001)

  updateDjVideo(camera)
  updateChatOverlay(camera, stamp)

  const outside = isOutside(characterPosition)
  const sky = usesSkyBackground(camera)

  gl.bindFramebuffer(gl.FRAMEBUFFER, target.frame)
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.enable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)
  gl.clearColor(sky ? 0.28 : 0.01, sky ? 0.55 : 0.01, sky ? 0.92 : 0.014, 0.0)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  gl.useProgram(program)
  gl.uniform2f(resolution, canvas.width, canvas.height)
  gl.uniform3f(cameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(cameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.uniform1i(renderZone, outside ? 1 : 0)
  gl.activeTexture(gl.TEXTURE4)
  gl.bindTexture(gl.TEXTURE_2D, treeShadowMap)
  gl.uniform1i(treeShadowSampler, 4)
  gl.bindVertexArray(array)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.enable(gl.POLYGON_OFFSET_FILL)
  gl.polygonOffset(1, 1)
  gl.drawArrays(gl.TRIANGLES, 0, points.length / vertexSize)
  gl.disable(gl.POLYGON_OFFSET_FILL)
  gl.disable(gl.BLEND)
  const characterCount = updateCharacterMesh(stamp * 0.001)

  if (characterCount > 0) {
    gl.bindVertexArray(characterArray)
    gl.drawArrays(gl.TRIANGLES, 0, characterCount)
  }
  drawCharacterBoxes(camera, canvas.width, canvas.height, outside)
  drawNpcHair(camera, canvas.width, canvas.height, outside)

  drawRoomDepth(camera, canvas.width, canvas.height, outside)
  gl.enable(gl.BLEND)
  gl.depthMask(false)
  if (!outside) {
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    useRoomSmokeProgram(camera, canvas.width, canvas.height, stamp * 0.001)
    gl.bindVertexArray(smokeArray)
    gl.drawArrays(gl.TRIANGLES, 0, smokePoints.length / vertexSize)
  }
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
  useLightProgram(camera, canvas.width, canvas.height, frame)
  gl.bindVertexArray(lightArray)
  gl.drawArrays(gl.TRIANGLES, 0, lightCount)
  drawStrobes(camera, canvas.width, canvas.height, frame)
  gl.depthMask(true)
  gl.disable(gl.BLEND)

  gl.bindFramebuffer(gl.FRAMEBUFFER, bloomTarget.frame)
  gl.viewport(0, 0, bloomTarget.width, bloomTarget.height)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  gl.useProgram(program)
  gl.uniform2f(resolution, bloomTarget.width, bloomTarget.height)
  gl.uniform3f(cameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(cameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.uniform1i(renderZone, outside ? 1 : 0)
  gl.activeTexture(gl.TEXTURE4)
  gl.bindTexture(gl.TEXTURE_2D, treeShadowMap)
  gl.uniform1i(treeShadowSampler, 4)
  gl.colorMask(false, false, false, false)
  gl.bindVertexArray(array)
  gl.enable(gl.POLYGON_OFFSET_FILL)
  gl.polygonOffset(1, 1)
  gl.drawArrays(gl.TRIANGLES, 0, points.length / vertexSize)
  gl.disable(gl.POLYGON_OFFSET_FILL)

  if (characterCount > 0) {
    gl.bindVertexArray(characterArray)
    gl.drawArrays(gl.TRIANGLES, 0, characterCount)
  }
  drawCharacterBoxes(camera, bloomTarget.width, bloomTarget.height, outside)
  drawNpcHair(camera, bloomTarget.width, bloomTarget.height, outside)

  drawRoomDepth(camera, bloomTarget.width, bloomTarget.height, outside)
  gl.colorMask(true, true, true, true)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
  gl.depthMask(false)
  useLightProgram(camera, bloomTarget.width, bloomTarget.height, frame)
  gl.bindVertexArray(lightArray)
  gl.drawArrays(gl.TRIANGLES, 0, lightCount)
  drawStrobes(camera, bloomTarget.width, bloomTarget.height, frame)
  gl.depthMask(true)
  gl.disable(gl.BLEND)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)
  gl.clearColor(sky ? 0.28 : 0.01, sky ? 0.55 : 0.01, sky ? 0.92 : 0.014, 1.0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(postProgram)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, target.color)
  gl.uniform1i(postScene, 0)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, bloomTarget.color)
  gl.uniform1i(postBloom, 1)
  gl.uniform2f(postBloomResolution, bloomTarget.width, bloomTarget.height)
  gl.bindVertexArray(postArray)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  frameId = requestAnimationFrame(draw)
  clubGlobal.clubFrameId = frameId
}

frameId = requestAnimationFrame(draw)
clubGlobal.clubFrameId = frameId

loadCharacterRigOnce()
  .then(next => {
    characterRig = next
  })
  .catch((error: unknown) => {
    console.error(error)
  })

function loadCharacterRigOnce() {
  characterRigLoad ??= clubGlobal.clubCharacterRigLoad ??= loadCharacterRig()

  return characterRigLoad
}

import.meta.hot?.dispose(() => {
  cancelAnimationFrame(frameId)
})

function drawRoomDepth(
  camera: { eye: [number, number, number]; center: [number, number, number] },
  width: number,
  height: number,
  outside: boolean,
) {
  gl.useProgram(program)
  gl.uniform2f(resolution, width, height)
  gl.uniform3f(cameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(cameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.uniform1i(renderZone, outside ? 1 : 0)
  gl.activeTexture(gl.TEXTURE4)
  gl.bindTexture(gl.TEXTURE_2D, treeShadowMap)
  gl.uniform1i(treeShadowSampler, 4)
  gl.colorMask(false, false, false, false)
  gl.depthMask(true)
  gl.bindVertexArray(array)
  gl.drawArrays(gl.TRIANGLES, 0, points.length / vertexSize)
  gl.colorMask(true, true, true, true)
}

function useRoomSmokeProgram(
  camera: { eye: [number, number, number]; center: [number, number, number] },
  width: number,
  height: number,
  time: number,
) {
  gl.useProgram(smokeProgram)
  gl.uniform1f(roomSmokeTime, time)
  gl.uniform2f(roomSmokeResolution, width, height)
  gl.uniform3f(roomSmokeCameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(roomSmokeCameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.activeTexture(gl.TEXTURE3)
  gl.bindTexture(gl.TEXTURE_2D, smokeMap)
  gl.uniform1i(roomSmokeMap, 3)
}

function useLightProgram(
  camera: { eye: [number, number, number]; center: [number, number, number] },
  width: number,
  height: number,
  frame: number,
) {
  gl.useProgram(lightProgram)
  gl.uniform1f(lightTime, frame)
  gl.uniform1i(lightRenderZone, isOutside(characterPosition) ? 1 : 0)
  gl.uniform2f(lightResolution, width, height)
  gl.uniform3f(lightCameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(lightCameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.activeTexture(gl.TEXTURE2)
  gl.bindTexture(gl.TEXTURE_2D, smokeMap)
  gl.uniform1i(lightSmokeMap, 2)
}

function useStrobeProgram(
  camera: { eye: [number, number, number]; center: [number, number, number] },
  width: number,
  height: number,
  frame: number,
) {
  gl.useProgram(strobeProgram)
  gl.uniform1f(strobeTime, frame)
  gl.uniform1i(strobeRenderZone, isOutside(characterPosition) ? 1 : 0)
  gl.uniform2f(strobeResolution, width, height)
  gl.uniform3f(strobeCameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(strobeCameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.activeTexture(gl.TEXTURE2)
  gl.bindTexture(gl.TEXTURE_2D, smokeMap)
  gl.uniform1i(strobeSmokeMap, 2)
}

function updateLightBuffer(time: number) {
  updateStrobeInstances(time)

  return lightPoints.length / vertexSize
}

function updateStrobeInstances(time: number) {
  strobeInstances.length = 0

  for (const light of strobeLights) {
    if (light.zone !== videoZone) {
      continue
    }

    const hit = strobeTarget(light, time)
    const outside = light.zone === 'outside'

    strobeInstances.push(
      light.x,
      light.top,
      light.z,
      hit[0],
      light.floor,
      hit[2],
      0.07,
      outside ? 1.35 : 0.5,
      outside ? 1.85 : 0.68,
      light.color[0],
      light.color[1],
      light.color[2],
      light.id,
      outside ? 0.7 : 0.42,
    )
  }

  strobeInstanceCount = strobeInstances.length / strobeInstanceSize
  gl.bindBuffer(gl.ARRAY_BUFFER, strobeInstanceBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(strobeInstances), gl.DYNAMIC_DRAW)
}

function drawStrobes(camera: ReturnType<typeof getCamera>, width: number, height: number, frame: number) {
  if (strobeInstanceCount === 0) {
    return
  }

  useStrobeProgram(camera, width, height, frame)
  gl.bindVertexArray(strobeArray)
  gl.drawArraysInstanced(gl.TRIANGLES, 0, strobeGeometry.count, strobeInstanceCount)
}

let shirtColorIndex = 1
let topStyleIndex = 1
let topMode: TopMode = 'shirt'
let pantsColorIndex = 0
let bottomStyleIndex = 0
let bottomMode: BottomMode = 'pants'
restoreState()
videoZone = isOutside(characterPosition) ? 'outside' : 'inside'
loadYouTubePlayer()
const wallLightZ = [-2, -6, -10, -14, -18, -22]
const backLightX = [-4.5, 0, 4.5]
const strobeLights = createStrobeLights()
const players = createPlayers(100)
let lightFrame = 0
let strobeReflectionFrame = -1
let strobeReflectionLights: StrobeReflectionLight[] = []
const characterParts: CharacterPart[] = [
  { from: 'mixamorig:Hips', to: 'mixamorig:Neck', width: 0.26, depth: 0.16, color: shirtLight, start: -0.06, end: 1.02,
    top: 'torso' },
  { from: 'mixamorig:Neck', to: 'mixamorig:HeadTop_End', width: 0.17, depth: 0.16, color: skin, start: 0.02,
    end: 0.34 },
  { from: 'mixamorig:LeftArm', to: 'mixamorig:LeftForeArm', width: 0.07, depth: 0.065, color: shirt, top: 'sleeve',
    armOffset: 0.075, lift: 0.035 },
  { from: 'mixamorig:LeftForeArm', to: 'mixamorig:LeftHand', width: 0.055, depth: 0.05, color: skin, end: 1.22,
    armOffset: 0.075, lift: 0.035 },
  { from: 'mixamorig:RightArm', to: 'mixamorig:RightForeArm', width: 0.07, depth: 0.065, color: shirt, top: 'sleeve',
    armOffset: 0.075, lift: 0.035 },
  { from: 'mixamorig:RightForeArm', to: 'mixamorig:RightHand', width: 0.055, depth: 0.05, color: skin, end: 1.22,
    armOffset: 0.075, lift: 0.035 },
  { from: 'mixamorig:Hips', to: 'mixamorig:LeftUpLeg', width: 0.12, depth: 0.09, color: pants, bottom: true },
  { from: 'mixamorig:LeftUpLeg', to: 'mixamorig:LeftLeg', width: 0.1, depth: 0.085, color: pants, bottom: true },
  { from: 'mixamorig:LeftLeg', to: 'mixamorig:LeftFoot', width: 0.08, depth: 0.07, color: skin },
  { from: 'mixamorig:LeftFoot', to: 'mixamorig:LeftToe_End', width: 0.095, depth: 0.055, color: shoe, start: -0.06,
    end: 1.05 },
  { from: 'mixamorig:Hips', to: 'mixamorig:RightUpLeg', width: 0.12, depth: 0.09, color: pants, bottom: true },
  { from: 'mixamorig:RightUpLeg', to: 'mixamorig:RightLeg', width: 0.1, depth: 0.085, color: pants, bottom: true },
  { from: 'mixamorig:RightLeg', to: 'mixamorig:RightFoot', width: 0.08, depth: 0.07, color: skin },
  { from: 'mixamorig:RightFoot', to: 'mixamorig:RightToe_End', width: 0.095, depth: 0.055, color: shoe, start: -0.06,
    end: 1.05 },
]
const characterPoseJoints = [
  ...new Set([
    ...characterGroundJoints,
    ...characterParts.flatMap(part => [part.from, part.to]),
    'mixamorig:Spine2',
    'mixamorig:Neck',
    'mixamorig:Hips',
    'mixamorig:LeftUpLeg',
    'mixamorig:RightUpLeg',
    'mixamorig:LeftLeg',
    'mixamorig:RightLeg',
    'mixamorig:Head',
    'mixamorig:HeadTop_End',
  ]),
]
const characterPoseJointSet = new Set(characterPoseJoints)

async function loadCharacterRig(): Promise<CharacterRig> {
  const ajs = await assimpjs({
    locateFile(path) {
      return path.endsWith('.wasm') ? '/assimpjs.wasm' : path
    },
  })
  const [stand, run, manHair, womanHair] = await Promise.all([
    loadAssimpScene(ajs, '/stand.fbx', 'stand.fbx'),
    loadAssimpScene(ajs, '/run.fbx', 'run.fbx'),
    loadAssimpScene(ajs, '/man-hair.fbx', 'man-hair.fbx'),
    loadAssimpScene(ajs, '/woman-hair.fbx', 'woman-hair.fbx'),
  ])
  const rig = {
    root: stand.rootnode,
    nodes: createRigNodes(stand.rootnode),
    clips: {
      stand: createCharacterClip(stand, 'stand.fbx'),
      run: createCharacterClip(run, 'run.fbx'),
    },
  }

  validateCharacterRig(rig.root, characterBones)
  characterHairMeshes = [...createHairMeshes(manHair, 'man'), ...createHairMeshes(womanHair, 'woman')]
  hairRenderMeshes = createHairRenderMeshes(gl, characterHairMeshes)
  characterHairIndex = normalizeIndex(characterHairIndex, characterHairMeshes.length + 1)
  setCharacterHair()
  logCurrentHair()
  loadOutsideTree().catch((error: unknown) => {
    console.error(error)
  })

  return rig
}

async function loadOutsideTree() {
  const ajs = await assimpjs({
    locateFile(path) {
      return path.endsWith('.wasm') ? '/assimpjs.wasm' : path
    },
  })
  const trees = await loadAssimpScene(ajs, '/trees.fbx', 'trees.fbx')

  addTreeToWorld(createTreeMeshes(trees))
}

function createTreeMeshes(scene: AssimpScene): TreeMesh[] {
  const meshes = scene.meshes!.map((mesh, index) => {
    const points: Vec3[] = []

    for (let i = 0; i < mesh.vertices.length; i += 3) {
      points.push([mesh.vertices[i]!, mesh.vertices[i + 1]!, mesh.vertices[i + 2]!])
    }

    return { points, faces: mesh.faces.filter(face => face.length === 3), color: treeMeshColor(index) }
  })

  if (meshes.length === 0) {
    throw new Error('trees.fbx has no meshes')
  }

  return normalizeTreeMeshes(meshes)
}

function normalizeTreeMeshes(meshes: TreeMesh[]): TreeMesh[] {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]

  for (const mesh of meshes) {
    for (const point of mesh.points) {
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], point[i])
        max[i] = Math.max(max[i], point[i])
      }
    }
  }

  const centerX = (min[0] + max[0]) * 0.5
  const centerZ = (min[2] + max[2]) * 0.5
  const height = max[1] - min[1]
  const amount = 12.9 / height
  const turn = Math.PI / 4
  const turnX = Math.cos(turn)
  const turnZ = Math.sin(turn)

  return meshes.map(mesh => ({
    points: mesh.points.map(point => {
      const x = (point[0] - centerX) * amount
      const y = (point[2] - centerZ) * amount
      const z = -(point[1] - min[1]) * amount

      return [
        x * turnX - z * turnZ,
        y,
        x * turnZ + z * turnX,
      ]
    }),
    faces: mesh.faces,
    color: mesh.color,
  }))
}

function treeMeshColor(index: number): Vec3 {
  if (index === 1) {
    return [0, 0, 0]
  }

  if (index === 2) {
    return [0, 1, 0]
  }

  if (index === 3) {
    return [0, 0.8, 0]
  }

  if (index === 4) {
    return [0, 0.9, 0]
  }

  return [0.38, 0.18, 0.07]
}

function addTreeToWorld(meshes: TreeMesh[]) {
  const position: Vec3 = [outsideTree.x, characterFloor + 3.7, outsideTree.z]

  setOutsideTreeCollision(meshes, position)

  if (outsideMotif !== 'night') {
    uploadTreeShadowMap(meshes, position)
    addTreeShadowReceiver(vertices)
  }

  for (const mesh of meshes) {
    for (const face of mesh.faces) {
      const a = add(position, mesh.points[face[0]!]!)
      const b = add(position, mesh.points[face[1]!]!)
      const c = add(position, mesh.points[face[2]!]!)

      if (triangleAreaSquared(a, b, c) > 0.00000001) {
        addSunLitTriangle(vertices, a, b, c, mesh.color)
      }
    }
  }

  refreshRoomBuffer()
}

function setOutsideTreeCollision(meshes: TreeMesh[], position: Vec3) {
  const trunk = meshes[1]!
  let bottom = Infinity
  let top = -Infinity
  let x = 0
  let z = 0
  let count = 0

  for (const point of trunk.points) {
    const y = position[1] + point[1]

    bottom = Math.min(bottom, y)
    top = Math.max(top, y)
  }

  for (const point of trunk.points) {
    const world = add(position, point)

    if (world[1] < bottom + (top - bottom) * 0.28) {
      x += world[0]
      z += world[2]
      count++
    }
  }

  x /= count
  z /= count

  z -= 2
  x += .25

  outsideTree = {
    x,
    z,
    radius: 0.35,
  }
  // addTreeCollisionDebug(vertices)
}

function addTreeCollisionDebug(target: Vertex[]) {
  const y = characterFloor + 0.05
  const color: Vec3 = [0, 0.85, 1]
  const left = outsideTree.x - outsideTree.radius
  const right = outsideTree.x + outsideTree.radius
  const back = outsideTree.z - outsideTree.radius
  const front = outsideTree.z + outsideTree.radius

  addQuad(target, [left, y, back], [right, y, back], [right, y, front], [left, y, front], color, 0.35)
}

function addTreeShadowReceiver(target: Vertex[]) {
  const y = characterFloor + 0.026
  const color: Vec3 = [0, 0, 0]
  const a: Vec3 = [landscapeBounds.left, y, landscapeBounds.front]
  const b: Vec3 = [landscapeBounds.right, y, landscapeBounds.front]
  const c: Vec3 = [landscapeBounds.right, y, landscapeBounds.back]
  const d: Vec3 = [landscapeBounds.left, y, landscapeBounds.back]

  target.push(pack(a, color, 0, 0, 0, 0, 5), pack(b, color, 0, 0, 1, 0, 5), pack(c, color, 0, 0, 1, 1, 5))
  target.push(pack(a, color, 0, 0, 0, 0, 5), pack(c, color, 0, 0, 1, 1, 5), pack(d, color, 0, 0, 0, 1, 5))
}

function clipGroundPolygonFront(points: Vec3[], front: number): Vec3[] {
  const clipped: Vec3[] = []

  for (let i = 0; i < points.length; i++) {
    const current = points[i]!
    const next = points[(i + 1) % points.length]!
    const currentInside = current[2] >= front
    const nextInside = next[2] >= front

    if (currentInside && nextInside) {
      clipped.push(next)
    }
    else if (currentInside && !nextInside) {
      clipped.push(intersectGroundFront(current, next, front))
    }
    else if (!currentInside && nextInside) {
      clipped.push(intersectGroundFront(current, next, front), next)
    }
  }

  return clipped
}

function intersectGroundFront(a: Vec3, b: Vec3, front: number): Vec3 {
  const amount = (front - a[2]) / (b[2] - a[2])

  return [
    mix(a[0], b[0], amount),
    a[1],
    front,
  ]
}

function convexGroundHull(points: Vec3[]): Vec3[] {
  const unique = [...new Map(points.map(point => [`${point[0].toFixed(2)}:${point[2].toFixed(2)}`, point])).values()]
    .sort((a, b) => a[0] === b[0] ? a[2] - b[2] : a[0] - b[0])
  const lower: Vec3[] = []
  const upper: Vec3[] = []

  for (const point of unique) {
    while (lower.length >= 2 && groundTurn(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) {
      lower.pop()
    }

    lower.push(point)
  }

  for (const point of [...unique].reverse()) {
    while (upper.length >= 2 && groundTurn(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) {
      upper.pop()
    }

    upper.push(point)
  }

  lower.pop()
  upper.pop()

  return [...lower, ...upper]
}

function groundTurn(a: Vec3, b: Vec3, c: Vec3) {
  return (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])
}

function projectTreeShadow(point: Vec3, light: Vec3, ground: number): Vec3 {
  const amount = (ground - point[1]) / light[1]

  return [
    point[0] + light[0] * amount,
    ground,
    point[2] + light[2] * amount,
  ]
}

async function loadAssimpScene(
  ajs: Awaited<ReturnType<typeof assimpjs>>,
  path: string,
  name: string,
): Promise<AssimpScene> {
  const response = await fetch(path)

  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`)
  }

  const files = new ajs.FileList()

  files.AddFile(name, new Uint8Array(await response.arrayBuffer()))

  const result = ajs.ConvertFileList(files, 'assjson')

  if (!result.IsSuccess() || result.FileCount() === 0) {
    throw new Error(`Assimp failed to convert ${name}: ${result.GetErrorCode()}`)
  }

  return JSON.parse(new TextDecoder().decode(result.GetFile(0).GetContent())) as AssimpScene
}





function updateCharacterMesh(time: number) {
  if (!characterRig) {
    return 0
  }

  const target: Vertex[] = []
  characterBoxInstances = []
  hairInstances = []
  addRenderedCharacter(target, {
    position: characterPosition,
    turn: characterTurn,
    motionBlend: characterMotionBlend,
    style: {
      topStyleIndex,
      bottomStyleIndex,
      hairIndex: characterHairIndex,
      hairColorIndex: characterHairColorIndex,
    },
  }, time, true)

  const view = playerView()
  const npcPose = sampleBasePose(characterRig, time, characterPoseJointSet)
  const npcBlendCache: PoseBlendCache = new Map()

  for (const player of players) {
    if (playerInView(player, view)) {
      addRenderedCharacter(target, player, time, false, npcPose, npcBlendCache)
    }
  }

  updateHairInstances(gl, hairRenderMeshes, hairInstances)
  updateCharacterBoxInstances()
  const data = flattenVertices(target)

  gl.bindBuffer(gl.ARRAY_BUFFER, characterBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)

  return data.length / vertexSize
}

function updateCharacterBoxInstances() {
  characterBoxInstanceCount = characterBoxInstances.length / characterBoxInstanceSize
  gl.bindBuffer(gl.ARRAY_BUFFER, characterBoxInstanceBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(characterBoxInstances), gl.DYNAMIC_DRAW)
}

function drawCharacterBoxes(camera: ReturnType<typeof getCamera>, width: number, height: number, outside: boolean) {
  if (characterBoxInstanceCount === 0) {
    return
  }

  gl.useProgram(characterBoxProgram)
  gl.uniform2f(characterBoxResolution, width, height)
  gl.uniform3f(characterBoxCameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(characterBoxCameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.uniform1i(characterBoxRenderZone, outside ? 1 : 0)
  gl.bindVertexArray(characterBoxArray)
  gl.drawArraysInstanced(gl.TRIANGLES, 0, characterBoxGeometry.count, characterBoxInstanceCount)
  gl.bindVertexArray(null)
}

function flattenVertices(target: Vertex[]) {
  const data = new Float32Array(target.length * vertexSize)
  let offset = 0

  for (const vertex of target) {
    data[offset++] = vertex[0]
    data[offset++] = vertex[1]
    data[offset++] = vertex[2]
    data[offset++] = vertex[3]
    data[offset++] = vertex[4]
    data[offset++] = vertex[5]
    data[offset++] = vertex[6]
    data[offset++] = vertex[7]
    data[offset++] = vertex[8]
    data[offset++] = vertex[9]
    data[offset++] = vertex[10]
  }

  return data
}

function drawNpcHair(camera: ReturnType<typeof getCamera>, width: number, height: number, outside: boolean) {
  gl.useProgram(hairProgram)
  gl.uniform2f(hairResolution, width, height)
  gl.uniform3f(hairCameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(hairCameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.uniform1i(hairRenderZone, outside ? 1 : 0)

  for (const mesh of hairRenderMeshes) {
    if (mesh.instanceCount > 0) {
      gl.bindVertexArray(mesh.array)
      gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.vertexCount, mesh.instanceCount)
    }
  }

  gl.bindVertexArray(null)
}

function playerView() {
  const eye = cameraPosition
  const forward = normalize(subtract(cameraTarget, eye))
  const right = normalize(cross(forward, [0, 1, 0]))
  const up = cross(right, forward)

  return { eye, forward, right, up }
}

function playerInView(player: Player, view: ReturnType<typeof playerView>) {
  const center: Vec3 = [player.position[0], player.position[1] + 0.85, player.position[2]]
  const toPlayer = subtract(center, view.eye)
  const depth = dot(toPlayer, view.forward)
  const radius = 1.2

  if (depth < -radius || depth > 45) {
    return false
  }

  const vertical = Math.tan(1.08 / 2) * Math.max(depth, 0.1) + radius
  const horizontal = vertical * (canvas.width / canvas.height) + radius

  return Math.abs(dot(toPlayer, view.right)) < horizontal && Math.abs(dot(toPlayer, view.up)) < vertical
}

function addRenderedCharacter(
  target: Vertex[],
  player: {
    position: Vec3
    turn: number
    motionBlend: number
    style: PlayerStyle
    resolvedStyle?: ResolvedPlayerStyle
  },
  time: number,
  detailedHair: boolean,
  basePose?: SampledPose,
  blendCache?: PoseBlendCache,
) {
  const pose = sampleCharacterPose(characterRig!, time, player, characterPoseJoints, characterPoseJointSet, characterGroundJoints, characterScale, basePose, blendCache)
  const style = player.resolvedStyle ?? playerStyle(player.style)
  const localReflection = detailedHair

  for (const part of characterParts) {
    if (style.bottomMode === 'pants' || !part.bottom) {
      addCharacterPart(target, pose, part, player, style, localReflection)
    }
  }

  if (style.bottomMode === 'skirt') {
    addCharacterSkirt(target, pose, player, style, localReflection)
  }

  if (style.topMode === 'chest') {
    addCharacterChest(target, pose, player, localReflection)
  }

  const hair = playerHair(player.style.hairIndex)

  if (hair && detailedHair) {
    addCharacterHair(target, pose, hair, player, style.hairColor)
  }
  else if (hair && characterHairMeshes.length > 0) {
    addNpcHairInstance(pose, hair, player, style.hairColor)
  }
}

function addNpcHairInstance(pose: Map<string, Vec3>, hair: HairMesh, player: { turn: number }, color: Vec3) {
  const head = pose.get('mixamorig:Head')!
  const top = pose.get('mixamorig:HeadTop_End')!
  const up = normalize(subtract(top, head))
  const center = add(head, scale(up, -0.035))
  hairInstances.push({
    meshIndex: characterHairMeshes.indexOf(hair),
    center,
    side: [Math.cos(player.turn), 0, -Math.sin(player.turn)],
    up,
    forward: [Math.sin(player.turn), 0, Math.cos(player.turn)],
    color,
  })
}

function addCharacterPart(
  target: Vertex[],
  pose: Map<string, Vec3>,
  part: CharacterPart,
  player: { turn: number },
  style: ReturnType<typeof playerStyle>,
  localReflection: boolean,
) {
  const from = pose.get(part.from)!
  const to = pose.get(part.to)!
  const start = part.start ?? 0
  const end = part.end ?? 1
  const axis = subtract(to, from)
  let a = add(from, scale(axis, start))
  let b = add(from, scale(axis, end))

  if (part.armOffset) {
    const center = scale(add(a, b), 0.5)
    const torso = pose.get('mixamorig:Spine2')!
    const side: Vec3 = [Math.cos(player.turn), 0, -Math.sin(player.turn)]
    const amount = Math.sign(dot(subtract(center, torso), side)) * part.armOffset
    const offset = scale(side, amount)

    a = add(a, offset)
    b = add(b, offset)
  }

  if (part.lift) {
    const offset: Vec3 = [0, part.lift, 0]

    a = add(a, offset)
    b = add(b, offset)
  }

  addCharacterBox(target, a, b, part.width, part.depth, characterPartColor(part, style), part.glow ?? 0.02, player.turn,
    localReflection)
}

function characterPartColor(part: CharacterPart, style: ReturnType<typeof playerStyle>) {
  if (part.top === 'torso') {
    return style.topMode === 'shirt' || style.topMode === 'sleeveless' ? style.shirtLight : skin
  }

  if (part.top === 'sleeve') {
    return style.topMode === 'shirt' ? style.shirt : skin
  }

  if (part.bottom) {
    return style.pants
  }

  if (part.color === shoe) {
    return style.shoe
  }

  return part.color
}

function addCharacterChest(
  target: Vertex[],
  pose: Map<string, Vec3>,
  player: { turn: number },
  localReflection: boolean,
) {
  const spine = pose.get('mixamorig:Spine2')!
  const neck = pose.get('mixamorig:Neck')!
  const center = add(spine, scale(subtract(neck, spine), 0.32))
  const side: Vec3 = [Math.cos(player.turn), 0, -Math.sin(player.turn)]
  const forward: Vec3 = [Math.sin(player.turn), 0, Math.cos(player.turn)]

  for (const offset of [-0.055, 0.055]) {
    const a = add(add(center, scale(side, offset)), scale(forward, 0.06))
    const b = add(add(center, scale(side, offset)), scale(forward, 0.13))

    addCharacterBox(target, a, b, 0.065, 0.06, skin, 0.02, player.turn, localReflection)
  }
}

function addCharacterSkirt(
  target: Vertex[],
  pose: Map<string, Vec3>,
  player: { turn: number },
  style: ReturnType<typeof playerStyle>,
  localReflection: boolean,
) {
  const hips = pose.get('mixamorig:Hips')!
  const leftUp = pose.get('mixamorig:LeftUpLeg')!
  const rightUp = pose.get('mixamorig:RightUpLeg')!
  const leftLeg = pose.get('mixamorig:LeftLeg')!
  const rightLeg = pose.get('mixamorig:RightLeg')!
  const topCenter = scale(add(add(hips, leftUp), rightUp), 1 / 3)
  const bottomCenter = scale(add(leftLeg, rightLeg), 0.5)
  const side: Vec3 = [Math.cos(player.turn), 0, -Math.sin(player.turn)]
  const forward: Vec3 = [Math.sin(player.turn), 0, Math.cos(player.turn)]
  const topWidth = 0.09
  const bottomWidth = 0.15
  const topDepth = 0.11
  const bottomDepth = 0.14
  const a = add(add(topCenter, scale(side, -topWidth)), scale(forward, -topDepth))
  const b = add(add(topCenter, scale(side, topWidth)), scale(forward, -topDepth))
  const c = add(add(topCenter, scale(side, topWidth)), scale(forward, topDepth))
  const d = add(add(topCenter, scale(side, -topWidth)), scale(forward, topDepth))
  const e = add(add(bottomCenter, scale(side, -bottomWidth)), scale(forward, -bottomDepth))
  const f = add(add(bottomCenter, scale(side, bottomWidth)), scale(forward, -bottomDepth))
  const g = add(add(bottomCenter, scale(side, bottomWidth)), scale(forward, bottomDepth))
  const h = add(add(bottomCenter, scale(side, -bottomWidth)), scale(forward, bottomDepth))

  addCharacterQuad(target, a, b, f, e, style.pants, 0.02, localReflection)
  addCharacterQuad(target, b, c, g, f, scale(style.pants, 0.88), 0.02, localReflection)
  addCharacterQuad(target, c, d, h, g, scale(style.pants, 0.78), 0.02, localReflection)
  addCharacterQuad(target, d, a, e, h, scale(style.pants, 0.88), 0.02, localReflection)
  addCharacterQuad(target, e, f, g, h, scale(style.pants, 0.68), 0.02, localReflection)
}

function addCharacterHair(target: Vertex[], pose: Map<string, Vec3>, mesh: HairMesh, player: { turn: number },
  color: Vec3)
{
  const head = pose.get('mixamorig:Head')!
  const top = pose.get('mixamorig:HeadTop_End')!
  const up = normalize(subtract(top, head))
  const side: Vec3 = [Math.cos(player.turn), 0, -Math.sin(player.turn)]
  const forward: Vec3 = [Math.sin(player.turn), 0, Math.cos(player.turn)]
  const center = add(head, scale(up, -0.035))

  for (const face of mesh.faces) {
    const a = hairPoint(center, side, up, forward, mesh.points[face[0]!]!)
    const b = hairPoint(center, side, up, forward, mesh.points[face[1]!]!)
    const c = hairPoint(center, side, up, forward, mesh.points[face[2]!]!)

    if (triangleAreaSquared(a, b, c) > 0.00000001) {
      addLitTriangle(target, a, b, c, color, 0)
    }
  }
}

function triangleAreaSquared(a: Vec3, b: Vec3, c: Vec3) {
  return dot(cross(subtract(c, a), subtract(b, a)), cross(subtract(c, a), subtract(b, a)))
}

function hairPoint(center: Vec3, side: Vec3, up: Vec3, forward: Vec3, point: Vec3) {
  const scaleAmount = 1.4
  const x = point[0] * scaleAmount
  const z = -(point[2] - 0.02) * scaleAmount - 0.055
  const y = (point[1] + 0.08) * scaleAmount - Math.max(0, z) * 0.28

  return add(add(add(center, scale(side, x)), scale(up, y)), scale(forward, z))
}

function addLitTriangle(target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3, glow: number) {
  const center = scale(add(add(a, b), c), 1 / 3)
  const normal = normalize(cross(subtract(c, a), subtract(b, a)))
  const shade = addLocalReflection(color, center, normal)

  target.push(
    [a[0], a[1], a[2], shade[0], shade[1], shade[2], glow, 0, 0, 0, 0],
    [b[0], b[1], b[2], shade[0], shade[1], shade[2], glow, 0, 0, 0, 0],
    [c[0], c[1], c[2], shade[0], shade[1], shade[2], glow, 0, 0, 0, 0],
  )
}

function addSunLitTriangle(target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3) {
  const center = scale(add(add(a, b), c), 1 / 3)
  const normal = normalize(cross(subtract(c, a), subtract(b, a)))
  const sun = normalize(subtract([10.5, 6.8, outsideBounds.front], center))
  const diffuse = Math.abs(dot(normal, sun))
  const lift = clamp((normal[1] + 1) * 0.5, 0, 1)
  const night = outsideMotif === 'night'
  const treeLights: Vec3[] = [
    [outsideTree.x - outsideTree.radius * 2.5, characterFloor - 0.35, outsideTree.z + outsideTree.radius * 0.85],
    [outsideTree.x + outsideTree.radius * 2.5, characterFloor - 0.35, outsideTree.z + outsideTree.radius * 0.85],
    [outsideTree.x, characterFloor - 0.35, outsideTree.z - outsideTree.radius * 2.5],
  ]
  let uplight = 0

  for (const light of treeLights) {
    const toLight = subtract(light, center)
    const distance = Math.hypot(toLight[0], toLight[1], toLight[2])
    const fromLight = normalize(subtract(center, light))
    const vertical = clamp(dot(fromLight, [0, 1, 0]), 0, 1)
    const facing = clamp(dot(normal, scale(fromLight, -1)), 0, 1)
    const cone = smoothstep(0.58, 0.96, vertical)

    uplight += facing * cone * clamp(1 - distance / 8, 0, 1)
  }

  const light = 0.34 + diffuse * 0.86 + lift * 0.18
  const warmth: Vec3 = [1.1, 1.03, 0.86]
  const baseLight = night ? light * 0.22 + lift * 0.04 : light
  const blueLight = night ? uplight * 2.1 : 0
  const shade: Vec3 = [
    clamp(color[0] * baseLight * warmth[0] + blueLight * electricNavy[0], 0, 1),
    clamp(color[1] * baseLight * warmth[1] + blueLight * electricNavy[1], 0, 1),
    clamp(color[2] * baseLight * warmth[2] + blueLight * electricNavy[2], 0, 1),
  ]

  target.push(
    [a[0], a[1], a[2], shade[0], shade[1], shade[2], 0, 0, 0, 0, 0],
    [b[0], b[1], b[2], shade[0], shade[1], shade[2], 0, 0, 0, 0, 0],
    [c[0], c[1], c[2], shade[0], shade[1], shade[2], 0, 0, 0, 0, 0],
  )
}

function addCharacterBox(
  target: Vertex[],
  a: Vec3,
  b: Vec3,
  width: number,
  depth: number,
  color: Vec3,
  glow: number,
  turn: number,
  localReflection: boolean,
  strobe = 0,
) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  const length = Math.hypot(dx, dy, dz)
  const nx = dx / length
  const ny = dy / length
  const nz = dz / length
  const vertical = Math.abs(ny) > 0.82
  let sideX = 0
  let sideY = 0
  let sideZ = 0
  let upX = 0
  let upY = 0
  let upZ = 0

  if (vertical) {
    sideX = Math.cos(turn)
    sideZ = -Math.sin(turn)
    upX = Math.sin(turn)
    upZ = Math.cos(turn)
  }
  else {
    const sideLength = Math.hypot(-nz, nx)

    sideX = -nz / sideLength
    sideZ = nx / sideLength
    upX = -sideZ * ny
    upY = sideZ * nx - sideX * nz
    upZ = sideX * ny

    const upLength = Math.hypot(upX, upY, upZ)

    upX /= upLength
    upY /= upLength
    upZ /= upLength
  }

  sideX *= width * 0.5
  sideY *= width * 0.5
  sideZ *= width * 0.5
  upX *= depth * 0.5
  upY *= depth * 0.5
  upZ *= depth * 0.5

  if (!localReflection) {
    addCharacterBoxInstance(a, b, [sideX, sideY, sideZ], [upX, upY, upZ], color, glow, strobe)
    return
  }

  const a0: Vec3 = [a[0] - sideX - upX, a[1] - sideY - upY, a[2] - sideZ - upZ]
  const a1: Vec3 = [a[0] + sideX - upX, a[1] + sideY - upY, a[2] + sideZ - upZ]
  const a2: Vec3 = [a[0] + sideX + upX, a[1] + sideY + upY, a[2] + sideZ + upZ]
  const a3: Vec3 = [a[0] - sideX + upX, a[1] - sideY + upY, a[2] - sideZ + upZ]
  const b0: Vec3 = [b[0] - sideX - upX, b[1] - sideY - upY, b[2] - sideZ - upZ]
  const b1: Vec3 = [b[0] + sideX - upX, b[1] + sideY - upY, b[2] + sideZ - upZ]
  const b2: Vec3 = [b[0] + sideX + upX, b[1] + sideY + upY, b[2] + sideZ + upZ]
  const b3: Vec3 = [b[0] - sideX + upX, b[1] - sideY + upY, b[2] - sideZ + upZ]
  const shadeA = scale(color, 0.65)
  const shadeB = scale(color, 0.82)

  addCharacterQuad(target, a0, a1, b1, b0, shadeA, glow, localReflection)
  addCharacterQuad(target, a1, a2, b2, b1, color, glow, localReflection)
  addCharacterQuad(target, a2, a3, b3, b2, shadeB, glow, localReflection)
  addCharacterQuad(target, a3, a0, b0, b3, shadeA, glow, localReflection)
  addCharacterQuad(target, a3, a2, a1, a0, shadeB, glow, localReflection)
  addCharacterQuad(target, b0, b1, b2, b3, shadeB, glow, localReflection)
}

function addCharacterBoxInstance(
  a: Vec3,
  b: Vec3,
  side: Vec3,
  up: Vec3,
  color: Vec3,
  glow: number,
  strobe: number,
) {
  characterBoxInstances.push(
    a[0],
    a[1],
    a[2],
    b[0],
    b[1],
    b[2],
    side[0],
    side[1],
    side[2],
    up[0],
    up[1],
    up[2],
    color[0],
    color[1],
    color[2],
    glow,
    strobe,
  )
}

function addCharacterQuad(
  target: Vertex[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  color: Vec3,
  glow: number,
  localReflection: boolean,
) {
  if (localReflection) {
    addLitQuad(target, a, b, c, d, color, glow)
  }
  else {
    addQuad(target, a, b, c, d, color, glow)
  }
}

function addLitQuad(
  target: Vertex[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  color: Vec3,
  glow: number,
) {
  const center = scale(add(add(a, b), add(c, d)), 0.25)
  const normal = normalize(cross(subtract(c, a), subtract(b, a)))

  addQuad(target, a, b, c, d, addLocalReflection(color, center, normal), glow)
}

function addLocalReflection(color: Vec3, point: Vec3, normal: Vec3): Vec3 {
  const red = redReflection(point, normal)
  const white = strobeReflection(point, normal)

  return [
    clamp(color[0] + red * 1.45 + white * 2.85, 0, 1),
    clamp(color[1] + red * 0.06 + white * 2.7, 0, 1),
    clamp(color[2] + red * 0.03 + white * 2.25, 0, 1),
  ]
}

function redReflection(point: Vec3, normal: Vec3) {
  if (Math.abs(normal[0]) > Math.abs(normal[2])) {
    const x = normal[0] > 0 ? 6.98 : -6.98
    const z = nearestValue(wallLightZ, point[2])

    return redLightAmount(point, normal, x, point[1], z)
  }

  const z = normal[2] > 0 ? 3.98 : -23.98
  const x = nearestValue(backLightX, point[0])

  return redLightAmount(point, normal, x, point[1], z)
}

function nearestValue(values: number[], target: number) {
  let next = values[0]!
  let distance = Math.abs(target - next)

  for (let i = 1; i < values.length; i++) {
    const value = values[i]!
    const nextDistance = Math.abs(target - value)

    if (nextDistance < distance) {
      next = value
      distance = nextDistance
    }
  }

  return next
}

function redLightAmount(point: Vec3, normal: Vec3, x: number, y: number, z: number) {
  const dx = x - point[0]
  const dy = y - point[1]
  const dz = z - point[2]
  const distance = Math.hypot(dx, dz)
  const length = Math.hypot(dx, dy, dz)
  const facing = Math.max(0, (normal[0] * dx + normal[1] * dy + normal[2] * dz) / length)
  const height = 0.8 + Math.max(0, point[1] + 1.95) * 0.18

  return Math.exp(-distance * 0.95) * facing * Math.sqrt(facing) * height * 1.65
}

function strobeReflection(point: Vec3, normal: Vec3) {
  let amount = 0
  const active = activeStrobeReflectionLights()

  for (const setup of active) {
    amount = Math.max(amount, strobeLightAmount(point, normal, setup.light, setup.target))
  }

  return amount
}

function activeStrobeReflectionLights() {
  if (strobeReflectionFrame !== lightFrame) {
    strobeReflectionLights = []
    strobeReflectionFrame = lightFrame

    for (const light of strobeLights) {
      const strobe = Math.floor(strobeRandom(light.id, lightFrame) + 0.18)

      if (strobe > 0) {
        strobeReflectionLights.push({
          light,
          target: strobeTarget(light, lightFrame / 60),
        })
      }
    }
  }

  return strobeReflectionLights
}

function strobeLightAmount(point: Vec3, normal: Vec3, light: StrobeLight, target: Vec3) {
  const top = 4.75
  const floor = -1.96
  const t = clamp((top - point[1]) / (top - floor), 0, 1)
  const radiusX = mix(0.07, 0.5, t)
  const radiusZ = mix(0.07, 0.68, t)
  const centerX = mix(light.x, target[0], t)
  const centerZ = mix(light.z, target[2], t)
  const dx = (point[0] - centerX) / radiusX
  const dz = (point[2] - centerZ) / radiusZ
  const cone = dx * dx + dz * dz

  if (cone > 1) {
    return 0
  }

  const lx = light.x - point[0]
  const ly = top - point[1]
  const lz = light.z - point[2]
  const length = Math.hypot(lx, ly, lz)
  const facing = Math.max(0, (normal[0] * lx + normal[1] * ly + normal[2] * lz) / length)
  const inside = Math.pow(1 - cone, 0.45)

  return inside * Math.sqrt(facing) * 7.2
}

function strobeRandom(id: number, frame: number) {
  const value = Math.sin(id * 17.13 + frame * 9.27) * 43758.5453

  return value - Math.floor(value)
}

function createStrobeLights() {
  const lights: StrobeLight[] = []
  let id = 1

  for (const x of [-3.8, 0, 3.8]) {
    for (const z of [-5.5, -10.5, -15.5, -20.5]) {
      lights.push({
        id,
        x,
        z,
        zone: 'inside',
        top: 4.75,
        floor: -1.96,
        color: [0.9, 0.88, 0.8],
        minX: -5.8,
        maxX: 5.8,
        minZ: -22.7,
        maxZ: 3.1,
      })
      id++
    }
  }

  const stageTop = characterFloor + 4.1
  const stageZ = outsideDjBooth.z + 2.15
  const stageHalfWidth = 3.7

  for (const x of [outsideDjBooth.x - stageHalfWidth, outsideDjBooth.x + stageHalfWidth]) {
    const side = Math.sign(x - outsideDjBooth.x)

    lights.push({
      id,
      x,
      z: stageZ,
      zone: 'outside',
      top: stageTop,
      floor: characterFloor + 0.02,
      color: electricNavy,
      minX: outsideDjBooth.x - 10.5,
      maxX: outsideDjBooth.x + 10.5,
      minZ: roomBounds.front + 1.2,
      maxZ: outsideDjBooth.z - 1.0,
    })
    id++
  }

  return lights
}

function strobeTarget(light: StrobeLight, time: number): Vec3 {
  if (light.zone === 'outside') {
    return outsideStrobeTarget(light, time)
  }

  const cycle = time % 16
  const sweepTime = cycle < 5.5 ? time : time - 3
  const speed = 1.15
  const phase = sweepTime * speed + (light.id * 1.27)
  const sweepX = light.x + Math.sin(phase) * 2.5 + Math.sin(phase * 1.7) * 0.8
  const sweepZ = light.z + Math.cos(sweepTime * 1.3 + light.id * 1.43) * 3.2 + Math.sin(phase * 2.1) * 0.9
  const vertical = smoothstep(5.5, 7.0, cycle) * (1 - smoothstep(12.5, 14.0, cycle))
  const x = mix(sweepX, light.x, vertical)
  const z = mix(sweepZ, light.z, vertical)

  return [clamp(x, light.minX, light.maxX), light.floor, clamp(z, light.minZ, light.maxZ)]
}

function outsideStrobeTarget(light: StrobeLight, time: number): Vec3 {
  const side = Math.sign(light.x - outsideDjBooth.x)
  const phase = time * 0.56 + light.id * 2.17
  const drift = time * 0.37 + light.id * 1.31
  const x = Math.sin(phase) * 5.8 + Math.sin(drift * 1.73) * 2.6 - side * 0.9
  const z = light.z - 6.8 - Math.cos(drift) * 3.4 - Math.sin(phase * 0.61) * 2.1

  return [clamp(x, light.minX, light.maxX), light.floor, clamp(z, light.minZ, light.maxZ)]
}



function restoreState() {
  const state = JSON.parse(localStorage.getItem(saveKey) ?? 'null') as {
    character: Vec3
    camera: Vec3
    cameraTurn: number
    characterTurn: number
    velocityY: number
    characterHairIndex?: number
    characterHairColorIndex?: number
    shirtColorIndex?: number
    topStyleIndex?: number
    pantsColorIndex?: number
    bottomStyleIndex?: number
    videoTimes?: Partial<Record<VideoZone, number>>
  } | null

  if (state) {
    setVec3(characterPosition, state.character)
    setVec3(cameraPosition, state.camera)
    cameraTurn = state.cameraTurn
    characterTurn = state.characterTurn
    velocityY = state.velocityY
    characterHairIndex = state.characterHairIndex ?? characterHairIndex
    characterHairColorIndex = normalizeIndex(state.characterHairColorIndex ?? characterHairColorIndex,
      hairPalette.length)
    topStyleIndex = normalizeIndex(state.topStyleIndex ?? state.shirtColorIndex ?? topStyleIndex,
      jewelPalette.length * 2 + 2)
    bottomStyleIndex = normalizeIndex(state.bottomStyleIndex ?? state.pantsColorIndex ?? bottomStyleIndex,
      jewelPalette.length * 2)
    videoTimes.inside = state.videoTimes?.inside ?? videoTimes.inside
    videoTimes.outside = state.videoTimes?.outside ?? videoTimes.outside
    setTopStyle()
    setBottomStyle()
  }
}

function saveState() {
  syncCurrentVideoTime()

  localStorage.setItem(saveKey, JSON.stringify({
    character: characterPosition,
    camera: cameraPosition,
    cameraTurn,
    characterTurn,
    velocityY,
    characterHairIndex,
    characterHairColorIndex,
    shirtColorIndex,
    topStyleIndex,
    pantsColorIndex,
    bottomStyleIndex,
    videoTimes,
  }))
}

function updateSave(delta: number) {
  saveTime += delta

  if (saveTime >= 0.5) {
    saveState()
    saveTime = 0
  }
}

function syncCurrentVideoTime() {
  for (const zone of videoZones()) {
    if (videoPlayersReady[zone]) {
      videoTimes[zone] = videoPlayers[zone]!.getCurrentTime()
    }
  }
}

function getInput() {
  input[0] = Number(keys.has('l') || keys.has('arrowright')) - Number(keys.has('j') || keys.has('arrowleft'))
  input[1] = 0
  input[2] = Number(keys.has('i') || keys.has('arrowup')) - Number(keys.has('k') || keys.has('arrowdown'))

  return input
}

function updateCharacter(delta: number) {
  getInput()
  const moving = lengthSq(input) > 0

  characterMotionBlend = mix(characterMotionBlend, moving ? 1 : 0, 1 - Math.exp(-8 * delta))
  characterMode = characterMotionBlend > 0.5 ? 'run' : 'stand'

  if (moving) {
    normalizeInto(input)
    setVec3(forward, [Math.sin(cameraTurn), 0, Math.cos(cameraTurn)])
    setVec3(right, [-Math.cos(cameraTurn), 0, Math.sin(cameraTurn)])
    setVec3(direction, add(scale(forward, input[2]), scale(right, input[0])))
    normalizeInto(direction)

    characterPosition[0] += direction[0] * delta * 5
    characterPosition[2] += direction[2] * delta * 5
    collideRoom(characterPosition)
    characterTurn = smoothAngle(characterTurn, Math.atan2(direction[0], direction[2]), 10, delta)
  }
  floorY = walkHeight(characterPosition[0], characterPosition[1], characterPosition[2])

  if (floorY > characterPosition[1]) {
    characterPosition[1] = floorY
    velocityY = 0
  }
  else {
    velocityY -= 12 * delta
    characterPosition[1] += velocityY * delta

    if (characterPosition[1] < floorY) {
      characterPosition[1] = floorY
      velocityY = 0
    }
  }

  collideRoom(characterPosition)
}

function createPlayers(count: number) {
  const next: Player[] = []

  for (let i = 0; i < count; i++) {
    const seed = i + 1
    const destination = playerDestination(seed, 0)
    const position: Vec3 = [
      destination.position[0] + seededRange(seed, 10, -1.2, 1.2),
      characterFloor,
      destination.position[2] + seededRange(seed, 11, -1.2, 1.2),
    ]
    const style: PlayerStyle = {
      topStyleIndex: Math.floor(seededRange(seed, 14, 0, jewelPalette.length * 2 + 2)),
      bottomStyleIndex: Math.floor(seededRange(seed, 15, 0, jewelPalette.length * 2)),
      hairIndex: Math.floor(seededRange(seed, 16, 0, 19)),
      hairColorIndex: Math.floor(seededRange(seed, 17, 0, hairPalette.length)),
    }

    next.push({
      position,
      turn: seededRange(seed, 12, -Math.PI, Math.PI),
      motionBlend: 0,
      input: [0, 0, 0],
      nextDecision: seededRange(seed, 13, 0.3, 2.8),
      destination,
      style,
      resolvedStyle: playerStyle(style),
      seed,
    })
  }

  return next
}

function updatePlayers(delta: number, time: number) {
  for (const player of players) {
    const destination = activePlayerDestination(player)
    const distance = Math.hypot(
      destination.position[0] - player.position[0],
      destination.position[2] - player.position[2],
    )

    if (distance < 0.55 && destination === player.destination) {
      player.destination = playerDestination(player.seed, Math.floor(time / 6 + player.seed))
      player.nextDecision = time
    }

    if (time >= player.nextDecision) {
      choosePlayerInput(player, time)
      player.nextDecision = time + seededRange(player.seed, Math.floor(time * 3.1), 0.45, 2.4)
    }

    const moving = lengthSq(player.input) > 0

    player.motionBlend = mix(player.motionBlend, moving ? 1 : 0, 1 - Math.exp(-7 * delta))

    if (moving) {
      const direction = normalize([...player.input])

      player.position[0] += direction[0] * delta * 2.55
      player.position[2] += direction[2] * delta * 2.55
      collideRoom(player.position)
      player.turn = smoothAngle(player.turn, Math.atan2(direction[0], direction[2]), 8, delta)
    }
    else if (destination.lookAt) {
      const dx = destination.lookAt[0] - player.position[0]
      const dz = destination.lookAt[2] - player.position[2]

      player.turn = smoothAngle(player.turn, Math.atan2(dx, dz), 4, delta)
    }

    player.position[1] = characterFloor
  }
}

function choosePlayerInput(player: Player, time: number) {
  const random = seededRandom(player.seed, Math.floor(time * 7.7))

  if (random < 0.22) {
    player.input = [0, 0, 0]
    return
  }

  const destination = activePlayerDestination(player)
  const dx = destination.position[0] - player.position[0]
  const dz = destination.position[2] - player.position[2]
  const angle = Math.atan2(dx, dz) + seededRange(player.seed, Math.floor(time * 5.3), -0.75, 0.75)
  const directions: Vec3[] = [
    [0, 0, 1],
    [1, 0, 1],
    [-1, 0, 1],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, -1],
    [1, 0, -1],
    [-1, 0, -1],
  ]
  const index = normalizeIndex(Math.round(angle / (Math.PI / 4)), directions.length)

  player.input = [...directions[index]!]
}

function activePlayerDestination(player: Player): PlayerDestination {
  const outside = isOutside(player.position)
  const destinationOutside = isOutside(player.destination.position)

  if (outside === destinationOutside) {
    return player.destination
  }

  return {
    position: [backDoor.x, characterFloor, outside ? roomBounds.front - 0.75 : roomBounds.front + 0.75],
  }
}

function playerDestination(seed: number, step: number): PlayerDestination {
  const choice = Math.floor(seededRange(seed, step + 100, 0, 6))
  const jitterX = seededRange(seed, step + 101, -1.8, 1.8)
  const jitterZ = seededRange(seed, step + 102, -1.4, 1.4)

  if (choice === 0) {
    return { position: [jitterX, characterFloor, djBooth.z + 2.2 + jitterZ],
      lookAt: [djBooth.x, characterFloor, djBooth.z] }
  }

  if (choice === 1) {
    return { position: [bartenderBar.x + jitterX, characterFloor, bartenderBar.z - 1.55 + jitterZ * 0.35] }
  }

  if (choice === 2) {
    return { position: [backDoor.x + jitterX * 0.35, characterFloor, roomBounds.front - 1.3 + jitterZ * 0.3] }
  }

  if (choice === 3) {
    return { position: [outsideTree.x + jitterX, characterFloor, outsideTree.z - 2.4 + jitterZ],
      lookAt: [outsideTree.x, characterFloor, outsideTree.z] }
  }

  if (choice === 4) {
    return { position: [outsideDjBooth.x + jitterX, characterFloor, outsideDjBooth.z - 2.6 + jitterZ],
      lookAt: [outsideDjBooth.x, characterFloor, outsideDjBooth.z] }
  }

  return {
    position: [seededRange(seed, step + 103, roomBounds.left + 1.2, roomBounds.right - 1.2), characterFloor,
      seededRange(seed, step + 104, roomBounds.back + 2.2, roomBounds.front - 2.0)],
  }
}

function seededRange(seed: number, salt: number, min: number, max: number) {
  return mix(min, max, seededRandom(seed, salt))
}

function seededRandom(seed: number, salt: number) {
  const value = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453123

  return value - Math.floor(value)
}

function updateCamera(delta: number) {
  getInput()
  const moving = lengthSq(input) > 0

  if (!cameraDragging && moving) {
    cameraReturning = true
  }

  if (!cameraDragging && (moving || cameraReturning)) {
    const turnSpeed = cameraReturning ? 5 : mix(0.8, 2.2, input[2])

    cameraTurn = smoothAngle(cameraTurn, characterTurn, turnSpeed, delta)
    cameraPitch = mix(cameraPitch, 0, 1 - Math.exp(-4 * delta))

    if (cameraReturning) {
      const angle = Math.abs(Math.atan2(Math.sin(characterTurn - cameraTurn), Math.cos(characterTurn - cameraTurn)))

      if (angle < 0.01 && Math.abs(cameraPitch) < 0.01) {
        cameraReturning = false
      }
    }
  }

  cameraTarget[0] = characterPosition[0]
  cameraTarget[1] = characterPosition[1] + 1.2
  cameraTarget[2] = characterPosition[2]
  const outside = isOutside(characterPosition)
  const time = performance.now() * 0.001
  const distance = outside ? 2.2 : cameraDanceDistance(time)
  const bounce = outside ? 0 : cameraDanceBounce(time)
  const ideal: Vec3 = [
    characterPosition[0] - Math.sin(cameraTurn) * distance,
    characterPosition[1] + 1.35 + cameraPitch + bounce,
    characterPosition[2] - Math.cos(cameraTurn) * distance,
  ]

  ideal[0] = outside
    ? clamp(ideal[0], outsideBounds.left + 1, outsideBounds.right - 1)
    : clamp(ideal[0], roomBounds.left + 0.4, roomBounds.right - 0.4)
  ideal[1] = clamp(ideal[1], characterFloor + 0.35, 4.3)
  ideal[2] = outside
    ? clamp(ideal[2], outsideBounds.back + 1, outsideBounds.front - 1)
    : clamp(ideal[2], roomBounds.back + 0.2, roomBounds.front - 0.2)

  if (outside) {
    collideBuildingWalls(ideal, 0.65)
  }

  lerpVec3(cameraPosition, ideal, 1 - Math.pow(0.015, delta))
  if (outside) {
    collideBuildingWalls(cameraPosition, 0.65)
  }

  cameraPosition[1] = Math.max(cameraPosition[1],
    walkHeight(cameraPosition[0], characterPosition[1], cameraPosition[2]) + 0.35)
}

function cameraDanceBounce(time: number) {
  const beat = (time * 2.25) % 1
  const offbeat = (time * 4.3 + 0.5) % 1
  const kick = beat < 0.08 ? beat / 0.08 : 1 - (beat - 0.08) / 0.92
  const tick = offbeat < 0.04 ? offbeat / 0.04 : 1 - (offbeat - 0.04) / 0.96

  return kick * 0.26 + tick * 0.035
}

function cameraDanceDistance(time: number) {
  const beat = (time * 2.15) % 1
  const zoom = beat < 0.1 ? beat / 0.1 : 1 - (beat - 0.1) / 0.9

  return 2.2 + zoom * 0.18
}

function getCamera() {
  return {
    eye: [cameraPosition[0], cameraPosition[1], cameraPosition[2]] as [number, number, number],
    center: [cameraTarget[0], cameraTarget[1], cameraTarget[2]] as [number, number, number],
  }
}

function openChatInput() {
  chatInput.value = ''
  chatForm.dataset.open = 'true'
  chatBubble.dataset.open = 'false'
  chatInput.focus()
}

function submitChatInput() {
  const text = chatInput.value.trim()

  if (text) {
    chatBubble.textContent = text
    chatBubble.dataset.open = 'true'
    chatHideAt = performance.now() + 5000
  }

  chatForm.dataset.open = 'false'
  chatInput.blur()
}

function cycleHair(direction: number) {
  if (characterHairMeshes.length === 0) {
    return
  }

  characterHairIndex = normalizeIndex(characterHairIndex + direction, characterHairMeshes.length + 1)
  setCharacterHair()
  logCurrentHair()
}

function setCharacterHair() {
  characterHair = characterHairIndex === 0 ? undefined : characterHairMeshes[characterHairIndex - 1]!
}

function logCurrentHair() {
  console.log(`Current hair ${characterHairIndex}: ${characterHair?.name ?? 'no hair'}`)
}

function cycleHairColor(direction: number) {
  characterHairColorIndex = normalizeIndex(characterHairColorIndex + direction, hairPalette.length)
}

function cycleShirt(direction: number) {
  topStyleIndex = normalizeIndex(topStyleIndex + direction, jewelPalette.length * 2 + 2)
  setTopStyle()
}

function setTopStyle() {
  if (topStyleIndex < jewelPalette.length) {
    topMode = 'shirt'
    shirtColorIndex = topStyleIndex
  }
  else if (topStyleIndex < jewelPalette.length * 2) {
    topMode = 'sleeveless'
    shirtColorIndex = topStyleIndex - jewelPalette.length
  }
  else {
    topMode = topStyleIndex === jewelPalette.length * 2 ? 'skin' : 'chest'
  }

  setVec3(shirt, jewelPalette[shirtColorIndex]!)
  setVec3(shirtLight, scale(jewelPalette[shirtColorIndex]!, 1.35))
}

function cyclePants(direction: number) {
  bottomStyleIndex = normalizeIndex(bottomStyleIndex + direction, jewelPalette.length * 2)
  setBottomStyle()
}

function setBottomStyle() {
  bottomMode = bottomStyleIndex < jewelPalette.length ? 'pants' : 'skirt'
  pantsColorIndex = bottomStyleIndex % jewelPalette.length
  setVec3(pants, jewelPalette[pantsColorIndex]!)
  setVec3(shoe, scale(jewelPalette[pantsColorIndex]!, 0.72))
}

function playerStyle(style: PlayerStyle) {
  const topIndex = normalizeIndex(style.topStyleIndex, jewelPalette.length * 2 + 2)
  const bottomIndex = normalizeIndex(style.bottomStyleIndex, jewelPalette.length * 2)
  const shirtIndex = topIndex < jewelPalette.length
    ? topIndex
    : topIndex < jewelPalette.length * 2
    ? topIndex - jewelPalette.length
    : 0
  const topMode = topIndex < jewelPalette.length
    ? 'shirt'
    : topIndex < jewelPalette.length * 2
    ? 'sleeveless'
    : topIndex === jewelPalette.length * 2
    ? 'skin'
    : 'chest'
  const bottomMode = bottomIndex < jewelPalette.length ? 'pants' : 'skirt'
  const pantsColor = jewelPalette[bottomIndex % jewelPalette.length]!

  return {
    topMode: topMode as TopMode,
    bottomMode: bottomMode as BottomMode,
    shirt: jewelPalette[shirtIndex]!,
    shirtLight: scale(jewelPalette[shirtIndex]!, 1.35),
    pants: pantsColor,
    shoe: scale(pantsColor, 0.72),
    hairColor: hairPalette[normalizeIndex(style.hairColorIndex, hairPalette.length)]!,
  }
}

function playerHair(index: number) {
  if (index === 0 || characterHairMeshes.length === 0) {
    return undefined
  }

  return characterHairMeshes[normalizeIndex(index - 1, characterHairMeshes.length)]!
}

function updateChatOverlay(camera: ReturnType<typeof getCamera>, stamp: number) {
  const point = projectWallPoint([characterPosition[0], characterPosition[1] + 1.05, characterPosition[2]], camera,
    canvas)
  const x = Math.round(point.x)
  const y = Math.round(point.y - 68)

  if (x !== chatOverlayX || y !== chatOverlayY) {
    chatOverlayX = x
    chatOverlayY = y
    chatForm.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`
    chatBubble.style.transform = `translate(-50%, -100%) translate(${x}px, ${y - 8}px)`
  }

  if (chatBubble.dataset.open === 'true' && stamp > chatHideAt) {
    chatBubble.dataset.open = 'false'
  }
}

function updateDjVideo(camera: ReturnType<typeof getCamera>) {
  updateVideoTrack()

  const wall = isOutside(characterPosition) ? outsideVideoWall : djVideoWall

  if (!djVideoFacesCamera(camera, wall)) {
    djVideo.style.opacity = '0'
    djVideoLayers.inside.style.pointerEvents = 'none'
    djVideoLayers.outside.style.pointerEvents = 'none'
    return
  }

  const left = wall.x - wall.width / 2
  const right = wall.x + wall.width / 2
  const bottom = wall.y - wall.height / 2
  const top = wall.y + wall.height / 2
  const points = wall.normal[2] < 0
    ? [
      projectWallPoint([right, bottom, wall.z], camera, canvas),
      projectWallPoint([left, bottom, wall.z], camera, canvas),
      projectWallPoint([left, top, wall.z], camera, canvas),
      projectWallPoint([right, top, wall.z], camera, canvas),
    ]
    : [
      projectWallPoint([left, bottom, wall.z], camera, canvas),
      projectWallPoint([right, bottom, wall.z], camera, canvas),
      projectWallPoint([right, top, wall.z], camera, canvas),
      projectWallPoint([left, top, wall.z], camera, canvas),
    ]

  djVideo.style.opacity = '0.74'
  djVideoLayers.inside.style.opacity = videoZone === 'inside' ? '1' : '0'
  djVideoLayers.outside.style.opacity = videoZone === 'outside' ? '1' : '0'
  djVideoLayers.inside.style.pointerEvents = videoZone === 'inside' ? 'auto' : 'none'
  djVideoLayers.outside.style.pointerEvents = videoZone === 'outside' ? 'auto' : 'none'
  djVideo.style.width = `${wall.width * 120}px`
  djVideo.style.height = `${wall.height * 120}px`
  djVideo.style.transform = projectedQuadTransform(
    wall.width * 120,
    wall.height * 120,
    points,
  )
}

function loadYouTubePlayer() {
  const youtube = window as YouTubeWindow

  youtube.onYouTubeIframeAPIReady = () => {
    for (const zone of videoZones()) {
      videoPlayers[zone] = new youtube.YT!.Player(djVideoMounts[zone], {
        playerVars: {
          autoplay: 0,
          controls: 1,
          playsinline: 1,
          enablejsapi: 1,
        },
        events: {
          onReady() {
            videoPlayersReady[zone] = true
            const load = zone === videoZone ? videoPlayers[zone]!.loadVideoById : videoPlayers[zone]!.cueVideoById

            load.call(videoPlayers[zone]!, {
              videoId: videoTracks[zone],
              startSeconds: videoTimes[zone],
            })

            if (zone === videoZone) {
              videoPlayers[zone]!.playVideo()
            }
            else {
              videoPlayers[zone]!.pauseVideo()
            }
          },
        },
      })
    }
  }

  if (youtube.YT?.Player) {
    youtube.onYouTubeIframeAPIReady()
  }
  else {
    const script = document.createElement('script')

    script.src = 'https://www.youtube.com/iframe_api'
    document.head.append(script)
  }
}

function updateVideoTrack() {
  const nextZone: VideoZone = isOutside(characterPosition) ? 'outside' : 'inside'

  if (nextZone !== videoZone) {
    if (videoPlayersReady[videoZone]) {
      videoTimes[videoZone] = videoPlayers[videoZone]!.getCurrentTime()
      videoPlayers[videoZone]!.pauseVideo()
    }

    videoZone = nextZone

    if (videoPlayersReady[videoZone]) {
      videoPlayers[videoZone]!.playVideo()
    }
  }
}

function videoZones(): VideoZone[] {
  return ['inside', 'outside']
}

function djVideoFacesCamera(
  camera: ReturnType<typeof getCamera>,
  wall: typeof djVideoWall,
) {
  const center: Vec3 = [wall.x, wall.y, wall.z]
  const toCamera = subtract(camera.eye, center)
  const toVideo = subtract(center, camera.eye)
  const forward = subtract(camera.center, camera.eye)

  return dot(wall.normal, toCamera) > 0 && dot(forward, toVideo) > 0
}

function walkHeight(_x: number, _y: number, _z: number) {
  return characterFloor
}

function isAtBackDoor(position: Vec3) {
  return Math.abs(position[0] - backDoor.x) < backDoor.width * 0.5
}

function isOutside(position: Vec3) {
  return position[0] < roomBounds.left || position[0] > roomBounds.right || position[2] < roomBounds.back
    || position[2] > roomBounds.front
}

function usesSkyBackground(camera: ReturnType<typeof getCamera>) {
  return true
}

function collideRoom(position: Vec3) {
  const insideLeft = roomBounds.left + 0.8
  const insideRight = roomBounds.right - 0.8
  const insideBack = roomBounds.back + 0.8
  const insideFront = roomBounds.front - 0.8
  const outside = isOutside(position)

  if (outside) {
    position[0] = clamp(position[0], outsideBounds.left, outsideBounds.right)
    position[2] = clamp(position[2], outsideBounds.back, outsideBounds.front)
    collideBuildingWalls(position, 0.45)
    collideCircle(position, outsideTree)
    collideBounds(position, outsideDjBooth)

    for (const speaker of outsideDjSpeakers) {
      collideBounds(position, speaker)
    }

    return
  }

  position[0] = clamp(position[0], insideLeft, insideRight)

  if (position[2] > insideFront && !isAtBackDoor(position)) {
    position[2] = insideFront
  }
  else {
    position[2] = clamp(position[2], insideBack, roomBounds.front + 0.45)
  }

  collideBounds(position, djBooth)
  collideBounds(position, bartenderBar)

  for (const stool of bartenderStools) {
    collideBounds(position, stool)
  }

  for (const speaker of djSpeakers) {
    collideBounds(position, speaker)
  }
}

function collideBuildingWalls(position: Vec3, padding: number) {
  const left = roomBounds.left - padding
  const right = roomBounds.right + padding
  const back = roomBounds.back - padding
  const front = roomBounds.front + padding

  if (position[0] > left && position[0] < right && position[2] > back && position[2] < front) {
    if (isAtBackDoor(position) && position[2] > roomBounds.front - 0.8) {
      return
    }

    const pushLeft = Math.abs(position[0] - left)
    const pushRight = Math.abs(right - position[0])
    const pushBack = Math.abs(position[2] - back)
    const pushFront = Math.abs(front - position[2])
    const push = Math.min(pushLeft, pushRight, pushBack, pushFront)

    if (push === pushLeft) {
      position[0] = left
    }
    else if (push === pushRight) {
      position[0] = right
    }
    else if (push === pushBack) {
      position[2] = back
    }
    else {
      position[2] = front
    }
  }
}

function collideBounds(position: Vec3, bounds: Bounds) {
  const padding = 0.28
  const left = bounds.x - bounds.width / 2 - padding
  const right = bounds.x + bounds.width / 2 + padding
  const front = bounds.z + bounds.depth / 2 + padding
  const back = bounds.z - bounds.depth / 2 - padding

  if (position[0] > left && position[0] < right && position[2] > back && position[2] < front) {
    const pushLeft = Math.abs(position[0] - left)
    const pushRight = Math.abs(right - position[0])
    const pushBack = Math.abs(position[2] - back)
    const pushFront = Math.abs(front - position[2])
    const push = Math.min(pushLeft, pushRight, pushBack, pushFront)

    if (push === pushLeft) {
      position[0] = left
    }
    else if (push === pushRight) {
      position[0] = right
    }
    else if (push === pushBack) {
      position[2] = back
    }
    else {
      position[2] = front
    }
  }
}

function collideCircle(position: Vec3, bounds: CircleBounds) {
  const x = position[0] - bounds.x
  const z = position[2] - bounds.z
  const distance = Math.hypot(x, z)
  const radius = bounds.radius + 0.28

  if (distance < radius) {
    position[0] = bounds.x + x / distance * radius
    position[2] = bounds.z + z / distance * radius
  }
}

function uploadTreeShadowMap(meshes: TreeMesh[], position: Vec3) {
  const size = 512
  const canvas = document.createElement('canvas')
  const blurCanvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  const blurContext = blurCanvas.getContext('2d')!
  const light = normalize([-0.55, -1, -0.7])
  const ground = characterFloor + 0.02

  canvas.width = size
  canvas.height = size
  blurCanvas.width = size
  blurCanvas.height = size
  context.fillStyle = 'rgba(0,0,0,0.95)'

  for (const mesh of meshes) {
    for (const face of mesh.faces) {
      const polygon = clipGroundPolygonFront([
        projectTreeShadow(add(position, mesh.points[face[0]!]!), light, ground),
        projectTreeShadow(add(position, mesh.points[face[1]!]!), light, ground),
        projectTreeShadow(add(position, mesh.points[face[2]!]!), light, ground),
      ], roomBounds.front + 0.06)

      if (polygon.length >= 3) {
        drawShadowPolygon(context, polygon, size)
      }
    }
  }

  blurContext.clearRect(0, 0, size, size)
  blurContext.filter = 'blur(0.5px)'
  blurContext.globalAlpha = 0.72
  blurContext.drawImage(canvas, 0, 0)
  gl.bindTexture(gl.TEXTURE_2D, treeShadowMap)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, blurCanvas)
}

function drawShadowPolygon(context: CanvasRenderingContext2D, points: Vec3[], size: number) {
  const first = shadowTexturePoint(points[0]!, size)

  context.beginPath()
  context.moveTo(first[0], first[1])

  for (const point of points.slice(1)) {
    const next = shadowTexturePoint(point, size)

    context.lineTo(next[0], next[1])
  }

  context.closePath()
  context.fill()
}

function shadowTexturePoint(point: Vec3, size: number): [number, number] {
  return [
    ((point[0] - landscapeBounds.left) / (landscapeBounds.right - landscapeBounds.left)) * size,
    (1 - (point[2] - landscapeBounds.back) / (landscapeBounds.front - landscapeBounds.back)) * size,
  ]
}

function addRoom(target: Vertex[]) {
  const dark: [number, number, number] = [0.032, 0.032, 0.038]
  const wall: [number, number, number] = [0.025, 0.023, 0.028]
  const ceiling: [number, number, number] = [0.016, 0.016, 0.02]
  const doorLeft = backDoor.x - backDoor.width / 2
  const doorRight = backDoor.x + backDoor.width / 2

  addQuad(target, [-7, -2, 4], [7, -2, 4], [7, -2, -24], [-7, -2, -24], dark, 0)
  addQuad(target, [-7, 5, -24], [7, 5, -24], [7, 5, 4], [-7, 5, 4], ceiling, 0)
  addQuad(target, [-7, -2, -24], [-7, 5, -24], [-7, 5, 4], [-7, -2, 4], wall, 0)
  addQuad(target, [7, -2, 4], [7, 5, 4], [7, 5, -24], [7, -2, -24], wall, 0)
  addQuad(target, [-7, -2, -24], [7, -2, -24], [7, 5, -24], [-7, 5, -24], [0.028, 0.022, 0.028], 0)
  addOutside(target)
  addQuad(target, [doorLeft, -2, 4], [-7, -2, 4], [-7, 5, 4], [doorLeft, 5, 4], [0.028, 0.022, 0.028], 0)
  addQuad(target, [7, -2, 4], [doorRight, -2, 4], [doorRight, 5, 4], [7, 5, 4], [0.028, 0.022, 0.028], 0)
  addQuad(target, [doorRight, backDoor.height - 2, 4], [doorLeft, backDoor.height - 2, 4], [doorLeft, 5, 4], [doorRight,
    5, 4], [0.028, 0.022, 0.028], 0)
  addBox(target, doorLeft - 0.05, -2 + backDoor.height / 2, 4.035, 0.1, backDoor.height, 0.08, [0.025, 0.035, 0.023],
    0.04)
  addBox(target, doorRight + 0.05, -2 + backDoor.height / 2, 4.035, 0.1, backDoor.height, 0.08, [0.025, 0.035, 0.023],
    0.04)
  addBox(target, backDoor.x, -2 + backDoor.height + 0.05, 4.035, backDoor.width + 0.2, 0.1, 0.08, [0.025, 0.035, 0.023],
    0.04)
  addDoorPerimeterStripes(target)
  addBartenderBar(target)
  addDjBooth(target)
}

function addDoorPerimeterStripes(target: Vertex[]) {
  const left = backDoor.x - backDoor.width / 2 - 0.14
  const right = backDoor.x + backDoor.width / 2 + 0.14
  const bottom = -1.82
  const top = -2 + backDoor.height + 0.18
  const width = right - left
  const height = top - bottom
  const glow = 3.2

  addDoorPerimeterFrame(target, roomBounds.front - 0.08, left, right, bottom, top, width, height, electricNavy, glow)
  addDoorPerimeterFrame(target, roomBounds.front + 0.08, left, right, bottom, top, width, height, [0.95, 0.02, 0.015],
    glow)
}

function addDoorPerimeterFrame(
  target: Vertex[],
  z: number,
  left: number,
  right: number,
  bottom: number,
  top: number,
  width: number,
  height: number,
  color: Vec3,
  glow: number,
) {
  addBox(target, left, bottom + height / 2, z, 0.11, height, 0.06, color, glow)
  addBox(target, right, bottom + height / 2, z, 0.11, height, 0.06, color, glow)
  addBox(target, left + width / 2, top, z, width + 0.11, 0.11, 0.06, color, glow)
}

function addBartenderBar(target: Vertex[]) {
  const body: Vec3 = [0.026, 0.016, 0.018]
  const top: Vec3 = [0.006, 0.006, 0.008]
  const metal: Vec3 = [0.055, 0.052, 0.052]
  const seat: Vec3 = [0.014, 0.012, 0.013]
  const bottle: Vec3 = [0.16, 0.028, 0.018]
  const y = -2

  addBox(target, bartenderBar.x, y + 0.38, bartenderBar.z, bartenderBar.width, 0.76, bartenderBar.depth, body, 0)
  addBox(target, bartenderBar.x, y + 0.8, bartenderBar.z - 0.03, bartenderBar.width + 0.24, 0.12,
    bartenderBar.depth + 0.32, top, 0)
  for (const shelfY of [0.98, 1.58]) {
    addBox(target, bartenderBar.x, y + shelfY, roomBounds.front - 0.18, bartenderBar.width + 0.12, 0.08, 0.16, top, 0)

    for (let i = 0; i < 8; i++) {
      const x = bartenderBar.x - 1.38 + i * 0.39
      const height = 0.27 + (i % 3) * 0.07
      addBox(target, x, y + shelfY + 0.06 + height / 2, roomBounds.front - 0.28, 0.1, height, 0.1, bottle, 0.18)
    }
  }

  for (const stool of bartenderStools) {
    addBox(target, stool.x, y + 0.27, stool.z, 0.06, 0.54, 0.06, metal, 0)
    addDisc(target, [stool.x, y + 0.56, stool.z], 0.2, 0.2, 'y', seat, 0)
    addDisc(target, [stool.x, y + 0.04, stool.z], 0.15, 0.15, 'y', metal, 0)
  }
}

function addOutside(target: Vertex[]) {
  const floor = -1.95
  const horizonFloor = -2.08

  addGrassHorizon(target, horizonFloor)

  addGrassQuad(target, [landscapeBounds.left, floor, landscapeBounds.front], [landscapeBounds.right, floor,
    landscapeBounds.front], [landscapeBounds.right, floor, roomBounds.front], [landscapeBounds.left, floor,
    roomBounds.front])
  addGrassQuad(target, [roomBounds.left, floor, roomBounds.front], [landscapeBounds.left, floor, roomBounds.front], [
    landscapeBounds.left,
    floor,
    roomBounds.back,
  ], [roomBounds.left, floor, roomBounds.back])
  addGrassQuad(target, [landscapeBounds.right, floor, roomBounds.front], [roomBounds.right, floor, roomBounds.front], [
    roomBounds.right,
    floor,
    roomBounds.back,
  ], [landscapeBounds.right, floor, roomBounds.back])
  addGrassQuad(target, [landscapeBounds.left, floor, roomBounds.back], [landscapeBounds.right, floor, roomBounds.back],
    [landscapeBounds.right, floor, landscapeBounds.back], [landscapeBounds.left, floor, landscapeBounds.back])
  addOutsideStage(target, floor)
  addDjBoothAt(target, outsideDjBooth, outsideDjSpeakers, -1, electricNavy, 3.2)
  addOutsideSkyLight(target)
}

function addOutsideStage(target: Vertex[], floor: number) {
  const dark: Vec3 = [0.005, 0.008, 0.02]
  const z = outsideDjBooth.z + 2.15
  const width = 7.4
  const left = outsideDjBooth.x - width / 2
  const right = outsideDjBooth.x + width / 2
  const base = floor + 0.1
  const top = floor + 4.1
  const centerY = (base + top) / 2

  addBox(target, outsideDjBooth.x, floor + 0.04, z + 0.12, width + 1.2, 0.08, 1.55, dark, 0)
  addBox(target, left, centerY, z, 0.13, top - base, 0.13, electricNavy, 3.2)
  addBox(target, right, centerY, z, 0.13, top - base, 0.13, electricNavy, 3.2)
  addBox(target, outsideDjBooth.x, top, z, width, 0.13, 0.13, electricNavy, 3.2)
  addStageBeam(target, [left, base, z], [right, top, z], electricNavy)
  addStageBeam(target, [right, base, z], [left, top, z], electricNavy)
}

function addStageBeam(target: Vertex[], a: Vec3, b: Vec3, color: Vec3) {
  const center = scale(add(a, b), 0.5)
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0])
  const side: Vec3 = [-Math.sin(angle) * 0.06, Math.cos(angle) * 0.06, 0]

  addQuad(target, add(a, side), subtract(a, side), subtract(b, side), add(b, side), color, 2.4)
  addBox(target, center[0], center[1], center[2], length, 0.035, 0.035, color, 1.2)
}

function addOutsideSkyLight(target: Vertex[]) {
  const z = outsideBounds.front - 0.12

  if (outsideMotif === 'night') {
    addDisc(target, [10.5, 6.8, z], 0.56, 0.56, 'z', [0.86, 0.88, 1], 1.15)
    addDisc(target, [10.72, 6.92, z - 0.01], 0.5, 0.5, 'z', [0, 0, 0.015], 0)
    return
  }

  addDisc(target, [10.5, 6.8, z], 1.0, 1.0, 'z', [1, 0.78, 0.22], 1.9)
}

function addGrassHorizon(target: Vertex[], floor: number) {
  const sideSegments = 32
  const points: [number, number][] = []
  const centerX = (landscapeBounds.left + landscapeBounds.right) / 2
  const centerZ = (landscapeBounds.back + landscapeBounds.front) / 2
  const outerScale = 1.85

  addGrassQuad(target, [landscapeBounds.left, floor, landscapeBounds.front], [landscapeBounds.right, floor,
    landscapeBounds.front], [landscapeBounds.right, floor, landscapeBounds.back], [landscapeBounds.left, floor,
    landscapeBounds.back])

  for (let i = 0; i < sideSegments; i++) {
    const t = i / sideSegments

    points.push([mix(landscapeBounds.left, landscapeBounds.right, t), landscapeBounds.back])
  }

  for (let i = 0; i < sideSegments; i++) {
    const t = i / sideSegments

    points.push([landscapeBounds.right, mix(landscapeBounds.back, landscapeBounds.front, t)])
  }

  for (let i = 0; i < sideSegments; i++) {
    const t = i / sideSegments

    points.push([mix(landscapeBounds.right, landscapeBounds.left, t), landscapeBounds.front])
  }

  for (let i = 0; i < sideSegments; i++) {
    const t = i / sideSegments

    points.push([landscapeBounds.left, mix(landscapeBounds.front, landscapeBounds.back, t)])
  }

  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length
    const a = points[i]!
    const b = points[next]!
    const aHill = horizonHill(i, points.length)
    const bHill = horizonHill(next, points.length)
    const outerA: [number, number] = [
      centerX + (a[0] - centerX) * outerScale,
      centerZ + (a[1] - centerZ) * outerScale,
    ]
    const outerB: [number, number] = [
      centerX + (b[0] - centerX) * outerScale,
      centerZ + (b[1] - centerZ) * outerScale,
    ]

    addHorizonQuad(target, [a[0], floor, a[1]], [b[0], floor, b[1]], [outerB[0], floor + bHill, outerB[1]], [outerA[0],
      floor + aHill, outerA[1]])
  }
}

function horizonHill(index: number, total: number) {
  const t = index / total

  return 2.2
    + Math.sin(t * Math.PI * 2 * 7.0) * 1.05
    + Math.sin(t * Math.PI * 2 * 13.0 + 1.7) * 0.62
    + Math.sin(t * Math.PI * 2 * 23.0 + 0.4) * 0.34
}

function addHorizonQuad(
  target: Vertex[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
) {
  const color: Vec3 = [0.018, 0.16, 0.04]

  target.push(packGrass(a, color), packGrass(b, color), packGrass(c, color))
  target.push(packGrass(a, color), packGrass(c, color), packGrass(d, color))
}

function addDjBooth(target: Vertex[]) {
  addDjBoothAt(target, djBooth, djSpeakers, 1, [1, 0.03, 0.015], 0.45)
}

function addDjBoothAt(target: Vertex[], booth: Bounds, speakers: Bounds[], direction: number, accent: Vec3,
  accentGlow: number)
{
  const body: Vec3 = [0.026, 0.018, 0.021]
  const top: Vec3 = [0.006, 0.006, 0.008]
  const dark: Vec3 = [0.012, 0.011, 0.014]
  const cone: Vec3 = [0.05, 0.047, 0.043]
  const y = -2
  const scale = 0.75

  addBox(target, booth.x, y + 0.33, booth.z, booth.width, 0.66, booth.depth, body, 0)
  addBox(target, booth.x, y + 0.7, booth.z + direction * 0.045, booth.width + 0.38 * scale, 0.12,
    booth.depth + 0.28 * scale, top, 0)
  addBox(target, booth.x - 0.82 * scale, y + 0.81, booth.z + direction * 0.21, 0.645 * scale, 0.039, 0.465 * scale,
    dark, 0)
  addBox(target, booth.x + 0.82 * scale, y + 0.81, booth.z + direction * 0.21, 0.645 * scale, 0.039, 0.465 * scale,
    dark, 0)
  addDisc(target, [booth.x - 0.82 * scale, y + 0.84, booth.z + direction * 0.21], 0.27 * scale, 0.21 * scale, 'y',
    accent, accentGlow)
  addDisc(target, [booth.x + 0.82 * scale, y + 0.84, booth.z + direction * 0.21], 0.27 * scale, 0.21 * scale, 'y',
    accent, accentGlow)
  addBox(target, booth.x, y + 0.835, booth.z + direction * 0.24, 0.56 * scale, 0.045, 0.68 * scale, [0.035, 0.034,
    0.036], 0)

  for (const speaker of speakers) {
    addSpeakerStack(target, speaker, body, dark, cone, direction)
  }
}

function addSpeakerStack(target: Vertex[], bounds: Bounds, body: Vec3, dark: Vec3, cone: Vec3, direction: number) {
  const y = -2
  const front = bounds.z + direction * (bounds.depth / 2 + 0.012)

  addBox(target, bounds.x, y + 0.72, bounds.z, bounds.width, 1.44, bounds.depth, body, 0)
  addBox(target, bounds.x, y + 1.6, bounds.z, bounds.width * 0.82, 0.54, bounds.depth * 0.82, dark, 0)
  addDisc(target, [bounds.x, y + 0.9, front], 0.24, 0.24, 'z', cone, 0)
  addDisc(target, [bounds.x, y + 0.39, front], 0.165, 0.165, 'z', cone, 0)
  addDisc(target, [bounds.x, y + 1.6, front], 0.15, 0.15, 'z', cone, 0)
}

function addBox(
  target: Vertex[],
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  color: Vec3,
  glow: number,
  strobe = 0,
) {
  const left = x - width / 2
  const right = x + width / 2
  const bottom = y - height / 2
  const top = y + height / 2
  const front = z + depth / 2
  const back = z - depth / 2

  addQuad(target, [left, bottom, front], [right, bottom, front], [right, top, front], [left, top, front], color, glow,
    strobe)
  addQuad(target, [right, bottom, back], [left, bottom, back], [left, top, back], [right, top, back], color, glow,
    strobe)
  addQuad(target, [left, bottom, back], [left, bottom, front], [left, top, front], [left, top, back], color, glow,
    strobe)
  addQuad(target, [right, bottom, front], [right, bottom, back], [right, top, back], [right, top, front], color, glow,
    strobe)
  addQuad(target, [left, top, front], [right, top, front], [right, top, back], [left, top, back], color, glow, strobe)
  addQuad(target, [left, bottom, back], [right, bottom, back], [right, bottom, front], [left, bottom, front], color,
    glow, strobe)
}

function addDisc(
  target: Vertex[],
  center: Vec3,
  radiusX: number,
  radiusY: number,
  axis: 'y' | 'z',
  color: Vec3,
  glow: number,
) {
  const segments = 18

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const b = ((i + 1) / segments) * Math.PI * 2
    const pointA: Vec3 = axis === 'y'
      ? [center[0] + Math.cos(a) * radiusX, center[1], center[2] + Math.sin(a) * radiusY]
      : [center[0] + Math.cos(a) * radiusX, center[1] + Math.sin(a) * radiusY, center[2]]
    const pointB: Vec3 = axis === 'y'
      ? [center[0] + Math.cos(b) * radiusX, center[1], center[2] + Math.sin(b) * radiusY]
      : [center[0] + Math.cos(b) * radiusX, center[1] + Math.sin(b) * radiusY, center[2]]

    target.push(pack(center, color, glow), pack(pointA, color, glow), pack(pointB, color, glow))
  }
}

function addWallStrips(target: Vertex[]) {
  let id = 101

  for (const z of [-2, -6, -10, -14, -18, -22]) {
    addSideStrip(target, -6.98, z, id++)
    addSideStrip(target, 6.98, z, id++)
  }

  for (const x of [-4.5, 0, 4.5]) {
    if (x !== 0) {
      addEndStrip(target, x, -23.98, id++)
    }

    if (x !== -4.5) {
      addEndStrip(target, x, 3.98, id++)
    }
  }

  addDjBoothStrip(target, djBooth, 1, [1, 0.03, 0.015], 2.15)
  addDjBoothStrip(target, outsideDjBooth, -1, electricNavy, 3.2)
  addBartenderBarStrip(target)
  addBartenderBottleGlow(target)
}

function addSideStrip(target: Vertex[], x: number, z: number, id: number) {
  addQuad(
    target,
    [x, -1.25, z - 0.24],
    [x, 3.75, z - 0.24],
    [x, 3.75, z - 0.09],
    [x, -1.25, z - 0.09],
    [0.22, 0.006, 0.004],
    0.08,
    id,
  )

  addQuad(
    target,
    [x, -1.25, z - 0.09],
    [x, 3.75, z - 0.09],
    [x, 3.75, z + 0.09],
    [x, -1.25, z + 0.09],
    [1, 0.03, 0.015],
    2.15,
    id,
  )

  addQuad(
    target,
    [x, -1.25, z + 0.09],
    [x, 3.75, z + 0.09],
    [x, 3.75, z + 0.24],
    [x, -1.25, z + 0.24],
    [0.22, 0.006, 0.004],
    0.08,
    id,
  )
}

function addEndStrip(target: Vertex[], x: number, z: number, id: number) {
  addQuad(
    target,
    [x - 0.24, -1.25, z],
    [x - 0.09, -1.25, z],
    [x - 0.09, 3.75, z],
    [x - 0.24, 3.75, z],
    [0.22, 0.006, 0.004],
    0.08,
    id,
  )

  addQuad(
    target,
    [x - 0.09, -1.25, z],
    [x + 0.09, -1.25, z],
    [x + 0.09, 3.75, z],
    [x - 0.09, 3.75, z],
    [1, 0.03, 0.015],
    2.15,
    id,
  )

  addQuad(
    target,
    [x + 0.09, -1.25, z],
    [x + 0.24, -1.25, z],
    [x + 0.24, 3.75, z],
    [x + 0.09, 3.75, z],
    [0.22, 0.006, 0.004],
    0.08,
    id,
  )
}

function addDjBoothStrip(target: Vertex[], booth: Bounds, direction: number, color: Vec3, glow: number) {
  const y = -1.54
  const z = booth.z + direction * 0.91
  const width = booth.width - 0.45
  const height = 0.07

  addBox(target, booth.x, y, z, width, height, 0.06, color, glow)
}

function addBartenderBarStrip(target: Vertex[]) {
  addBox(target, bartenderBar.x, -1.54, bartenderBar.z - bartenderBar.depth / 2 - 0.16, bartenderBar.width - 0.45, 0.07,
    0.06, [1, 0.03, 0.015], 2.15)
}

function addBartenderBottleGlow(target: Vertex[]) {
  const y = -2

  for (const shelfY of [0.98, 1.58]) {
    for (let i = 0; i < 8; i++) {
      const x = bartenderBar.x - 1.38 + i * 0.39
      const height = 0.27 + (i % 3) * 0.07

      addBox(target, x, y + shelfY + 0.06 + height / 2, roomBounds.front - 0.3, 0.1, height, 0.08, [1, 0.03, 0.015],
        0.72)
    }
  }
}

function addRoomSmoke(target: Vertex[]) {
  for (let i = 0; i < 82; i++) {
    const seed = i + 1
    const x = mix(-5.4, 5.4, smokeRandom(seed * 11.7))
    const y = mix(-1.35, 1.4, smokeRandom(seed * 19.1) ** 1.8)
    const z = mix(-22.5, 1.8, smokeRandom(seed * 31.3))
    const width = mix(1.8, 5.1, smokeRandom(seed * 47.9))
    const height = mix(0.8, 2.35, smokeRandom(seed * 61.5))
    const opacity = mix(0.045, 0.12, smokeRandom(seed * 73.3))

    addSmokePatch(target, [x, y, z], width, height, opacity, seed)
  }
}

function addSmokePatch(
  target: Vertex[],
  center: [number, number, number],
  width: number,
  height: number,
  opacity: number,
  seed: number,
) {
  const left = -width / 2
  const right = width / 2
  const bottom = -height / 2
  const top = height / 2

  target.push(
    packSmoke(center, left, bottom, opacity, seed, 0, 0),
    packSmoke(center, right, bottom, opacity, seed, 1, 0),
    packSmoke(center, right, top, opacity, seed, 1, 1),
  )
  target.push(
    packSmoke(center, left, bottom, opacity, seed, 0, 0),
    packSmoke(center, right, top, opacity, seed, 1, 1),
    packSmoke(center, left, top, opacity, seed, 0, 1),
  )
}

function smokeRandom(seed: number) {
  const value = Math.sin(seed * 127.1) * 43758.5453123

  return value - Math.floor(value)
}

function addCeilingBeams(target: Vertex[], time: number) {
  for (const light of strobeLights) {
    if (light.zone !== videoZone) {
      continue
    }

    const hit = strobeTarget(light, time)

    addBeam(target, light, hit[0], hit[2])
    addFloorPool(target, light, hit[0], hit[2])
  }
}

function addBeam(target: Vertex[], light: StrobeLight, targetX: number, targetZ: number) {
  const shells = [
    { radiusX: light.zone === 'outside' ? 1.35 : 0.5, radiusZ: light.zone === 'outside' ? 1.85 : 0.68,
      glow: light.zone === 'outside' ? 0.7 : 0.42, color: light.color },
  ]
  const segments = 20

  for (let shell = 0; shell < shells.length; shell++) {
    const layer = shells[shell]!
    const offset = shell * Math.PI / segments
    const uvOffset = shell * 0.37

    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2 + offset
      const b = ((i + 1) / segments) * Math.PI * 2 + offset
      const uA = i / segments + uvOffset
      const uB = (i + 1) / segments + uvOffset
      const topA: [number, number, number] = [light.x + Math.cos(a) * 0.07, light.top, light.z + Math.sin(a) * 0.07]
      const topB: [number, number, number] = [light.x + Math.cos(b) * 0.07, light.top, light.z + Math.sin(b) * 0.07]
      const bottomA: [number, number, number] = [targetX + Math.cos(a) * layer.radiusX, light.floor,
        targetZ + Math.sin(a) * layer.radiusZ]
      const bottomB: [number, number, number] = [targetX + Math.cos(b) * layer.radiusX, light.floor,
        targetZ + Math.sin(b) * layer.radiusZ]

      target.push(
        pack(topA, layer.color, layer.glow * 0.18, light.id, uA, 0, 1),
        pack(topB, layer.color, layer.glow * 0.18, light.id, uB, 0, 1),
        pack(bottomB, layer.color, layer.glow, light.id, uB, 1, 1),
      )
      target.push(
        pack(topA, layer.color, layer.glow * 0.18, light.id, uA, 0, 1),
        pack(bottomB, layer.color, layer.glow, light.id, uB, 1, 1),
        pack(bottomA, layer.color, layer.glow, light.id, uA, 1, 1),
      )
    }
  }
}

function addFloorPool(target: Vertex[], light: StrobeLight, x: number, z: number) {
  const center: [number, number, number] = [x, light.floor + 0.02, z]
  const color = light.color
  const innerRadius = 0.82
  const outerRadiusX = 1.75
  const outerRadiusZ = 2.2
  const segments = 32

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const b = ((i + 1) / segments) * Math.PI * 2
    const innerA: [number, number, number] = [x + Math.cos(a) * innerRadius, light.floor + 0.02,
      z + Math.sin(a) * innerRadius]
    const innerB: [number, number, number] = [x + Math.cos(b) * innerRadius, light.floor + 0.02,
      z + Math.sin(b) * innerRadius]
    const edgeA: [number, number, number] = [x + Math.cos(a) * outerRadiusX, light.floor + 0.02,
      z + Math.sin(a) * outerRadiusZ]
    const edgeB: [number, number, number] = [x + Math.cos(b) * outerRadiusX, light.floor + 0.02,
      z + Math.sin(b) * outerRadiusZ]

    target.push(pack(center, color, 1.08, light.id), pack(innerA, color, 0.9, light.id),
      pack(innerB, color, 0.9, light.id))
    target.push(pack(innerA, color, 0.34, light.id), pack(edgeA, color, 0.08, light.id),
      pack(edgeB, color, 0.08, light.id))
    target.push(pack(innerA, color, 0.34, light.id), pack(edgeB, color, 0.08, light.id),
      pack(innerB, color, 0.34, light.id))
  }
}

function addQuad(
  target: Vertex[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
  color: [number, number, number],
  glow: number,
  strobe = 0,
) {
  target.push(
    [a[0], a[1], a[2], color[0], color[1], color[2], glow, strobe, 0, 0, 0],
    [b[0], b[1], b[2], color[0], color[1], color[2], glow, strobe, 0, 0, 0],
    [c[0], c[1], c[2], color[0], color[1], color[2], glow, strobe, 0, 0, 0],
    [a[0], a[1], a[2], color[0], color[1], color[2], glow, strobe, 0, 0, 0],
    [c[0], c[1], c[2], color[0], color[1], color[2], glow, strobe, 0, 0, 0],
    [d[0], d[1], d[2], color[0], color[1], color[2], glow, strobe, 0, 0, 0],
  )
}

function addGrassQuad(
  target: Vertex[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
) {
  const color: Vec3 = [0.05, 0.34, 0.08]

  target.push(packGrass(a, color), packGrass(b, color), packGrass(c, color))
  target.push(packGrass(a, color), packGrass(c, color), packGrass(d, color))
}

function pack(
  point: [number, number, number],
  color: [number, number, number],
  glow: number,
  strobe = 0,
  u = 0,
  v = 0,
  haze = 0,
): Vertex {
  return [point[0], point[1], point[2], color[0], color[1], color[2], glow, strobe, u, v, haze]
}

function packGrass(point: [number, number, number], color: [number, number, number]): Vertex {
  return pack(point, color, 0, 0, point[0] * 0.08, point[2] * 0.08, 2)
}

function packSmoke(
  center: [number, number, number],
  x: number,
  y: number,
  opacity: number,
  seed: number,
  u: number,
  v: number,
): Vertex {
  return [center[0], center[1], center[2], x, y, opacity, 0, seed, u, v, 0]
}
