import { frameAtTime } from './animation-time.ts'
import { createCameraMatrix, updateCameraMatrix } from './camera-matrix.ts'
import type { CameraMatrix } from './camera-matrix.ts'
import {
  drawCharacterBoxes,
  drawNpcHair,
} from './character-gpu.ts'
import type { DayCycle } from './constants.ts'
import {
  drawRoomDepth,
  useLightProgram,
  useRoomSmokeProgram,
} from './room-draw.ts'
import { createStrobeDrawController } from './strobe-draw.ts'
import type { CharacterBoxGeometry, HairRenderMesh, SceneTarget, Target, Vec3 } from './types.ts'

type Camera = {
  eye: Vec3
  center: Vec3
  up?: Vec3
}

type RoomUniforms = {
  bloomPass: WebGLUniformLocation
  bloomWrite: WebGLUniformLocation
  cameraEye: WebGLUniformLocation
  characterPass: WebGLUniformLocation
  doorCoverVisible: WebGLUniformLocation
  graffitiMap: WebGLUniformLocation
  objectTextureMap: WebGLUniformLocation
  outsideNight: WebGLUniformLocation
  renderZone: WebGLUniformLocation
  treeShadowSampler: WebGLUniformLocation
  viewProjection: WebGLUniformLocation
}

type RoomDepthUniforms = {
  doorCoverVisible: WebGLUniformLocation
  renderZone: WebGLUniformLocation
  viewProjection: WebGLUniformLocation
}

type LightUniforms = {
  renderZone: WebGLUniformLocation
  smokeMap: WebGLUniformLocation
  time: WebGLUniformLocation
  viewProjection: WebGLUniformLocation
}

type SmokeUniforms = {
  cameraRight: WebGLUniformLocation
  cameraUp: WebGLUniformLocation
  smokeMap: WebGLUniformLocation
  time: WebGLUniformLocation
  viewProjection: WebGLUniformLocation
}

type CharacterBoxUniforms = {
  bloomPass: WebGLUniformLocation
  renderZone: WebGLUniformLocation
  viewProjection: WebGLUniformLocation
}

type CharacterHairUniforms = {
  renderZone: WebGLUniformLocation
  viewProjection: WebGLUniformLocation
}

const mainCameraMatrix = createCameraMatrix()
const feedbackActiveThreshold = 0.001

export function renderClubFrame(options: {
  arrays: {
    character: WebGLVertexArrayObject
    characterBox: WebGLVertexArrayObject
    light: WebGLVertexArrayObject
    post: WebGLVertexArrayObject
    beachBalls: WebGLVertexArrayObject
    bubbles: WebGLVertexArrayObject
    foam: WebGLVertexArrayObject
    smokePuff: WebGLVertexArrayObject
    graffiti: WebGLVertexArrayObject
    room: WebGLVertexArrayObject
    smoke: WebGLVertexArrayObject
    treeSwing: WebGLVertexArrayObject
  }
  camera: Camera
  character: {
    boxGeometry: CharacterBoxGeometry
    boxInstanceCount: number
    boxProgram: WebGLProgram
    boxUniforms: CharacterBoxUniforms
    count: number
    hairProgram: WebGLProgram
    hairRenderMeshes: HairRenderMesh[]
    hairUniforms: CharacterHairUniforms
  }
  characterPosition: Vec3
  gl: WebGL2RenderingContext
  height: number
  objectTexture: WebGLTexture
  feedback: {
    amount: number
    current: Target
    next: Target
    tripKind: number
  }
  light: {
    count: number
    program: WebGLProgram
    uniforms: LightUniforms
  }
  outside: boolean
  renderZone: number
  doorCoverVisible: boolean
  points: Float32Array
  beachBallPoints: Float32Array
  bubblePoints: Float32Array
  foamPoints: Float32Array
  smokePuffPoints: Float32Array
  treeSwingPoints: Float32Array
  graffitiPoints: Float32Array
  graffitiTexture: WebGLTexture
  post: {
    bloom: WebGLUniformLocation
    bloomResolution: WebGLUniformLocation
    daylight: WebGLUniformLocation
    feedback: WebGLUniformLocation
    feedbackAmount: WebGLUniformLocation
    moonDirection: WebGLUniformLocation
    plain: {
      bloom: WebGLUniformLocation
      bloomResolution: WebGLUniformLocation
      program: WebGLProgram
      scene: WebGLUniformLocation
    }
    program: WebGLProgram
    renderSky: WebGLUniformLocation
    scene: WebGLUniformLocation
    skyForward: WebGLUniformLocation
    skyRight: WebGLUniformLocation
    skyUp: WebGLUniformLocation
    sunDirection: WebGLUniformLocation
    moonProgress: WebGLUniformLocation
    sunProgress: WebGLUniformLocation
    time: WebGLUniformLocation
    tripKind: WebGLUniformLocation
  }
  dayCycle: DayCycle
  program: WebGLProgram
  roomDepth: {
    program: WebGLProgram
    uniforms: RoomDepthUniforms
  }
  roomUniforms: RoomUniforms
  skyline: boolean
  sky: boolean
  smoke: {
    map: WebGLTexture
    points: Float32Array
    program: WebGLProgram
    uniforms: SmokeUniforms
  }
  sceneOverlay?: {
    draw: (cameraMatrix: CameraMatrix) => void
  }
  strobeController: ReturnType<typeof createStrobeDrawController>
  target: SceneTarget
  time: number
  treeShadowMap: WebGLTexture
  vertexSize: number
  width: number
}) {
  const gl = options.gl
  const frame = frameAtTime(options.time)
  const outsideNight = 1 - options.dayCycle.daylight
  updateCameraMatrix(mainCameraMatrix, options.camera.eye, options.camera.center, options.target.width,
    options.target.height, options.camera.up)

  gl.bindFramebuffer(gl.FRAMEBUFFER, options.target.frame)
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
  gl.viewport(0, 0, options.target.width, options.target.height)
  gl.enable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)
  gl.clearBufferfv(gl.COLOR, 0, [options.sky ? 0.28 : 0.01, options.sky ? 0.55 : 0.01, options.sky ? 0.92 : 0.014, 0.0])
  gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0])
  gl.clear(gl.DEPTH_BUFFER_BIT)
  gl.useProgram(options.program)
  gl.uniformMatrix4fv(options.roomUniforms.viewProjection, false, mainCameraMatrix.viewProjection)
  gl.uniform3f(options.roomUniforms.cameraEye, options.camera.eye[0], options.camera.eye[1], options.camera.eye[2])
  gl.uniform1i(options.roomUniforms.renderZone, options.renderZone)
  gl.uniform1i(options.roomUniforms.bloomPass, 0)
  gl.uniform1i(options.roomUniforms.bloomWrite, 1)
  gl.uniform1i(options.roomUniforms.characterPass, 0)
  gl.uniform1i(options.roomUniforms.doorCoverVisible, options.doorCoverVisible ? 1 : 0)
  gl.uniform1f(options.roomUniforms.outsideNight, outsideNight)
  bindRoomTextures(options)
  gl.bindVertexArray(options.arrays.room)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.enable(gl.POLYGON_OFFSET_FILL)
  gl.polygonOffset(1, 1)
  gl.drawArrays(gl.TRIANGLES, 0, options.points.length / options.vertexSize)
  drawTreeSwing(options)
  gl.uniform1i(options.roomUniforms.bloomWrite, 0)
  drawBeachBalls(options)
  drawBubbles(options)
  drawFoam(options)
  drawSmokePuff(options)
  gl.disable(gl.POLYGON_OFFSET_FILL)
  gl.depthFunc(gl.LEQUAL)
  gl.depthMask(false)
  drawGraffiti(options)
  options.sceneOverlay?.draw(mainCameraMatrix)
  // Scene overlays use their own program; the detailed local character is drawn with the room shader.
  gl.useProgram(options.program)
  gl.depthMask(true)
  gl.depthFunc(gl.LESS)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.uniform1i(options.roomUniforms.bloomWrite, 1)
  drawCharacters(options, options.width, options.height, true)
  gl.disable(gl.BLEND)

  drawRoomDepth({
    array: options.arrays.room,
    cameraMatrix: mainCameraMatrix,
    count: options.points.length / options.vertexSize,
    doorCoverVisible: options.doorCoverVisible,
    gl,
    renderZone: options.renderZone,
    program: options.roomDepth.program,
    uniforms: options.roomDepth.uniforms,
  })
  gl.enable(gl.BLEND)
  gl.depthMask(false)
  if (!options.outside && options.smoke.points.length > 0) {
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    useRoomSmokeProgram({
      camera: options.camera,
      cameraMatrix: mainCameraMatrix,
      gl,
      height: options.height,
      program: options.smoke.program,
      smokeMap: options.smoke.map,
      time: options.time,
      uniforms: options.smoke.uniforms,
      width: options.width,
    })
    gl.bindVertexArray(options.arrays.smoke)
    gl.drawArrays(gl.TRIANGLES, 0, options.smoke.points.length / options.vertexSize)
  }
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
  drawLights(options, options.width, options.height, frame)
  gl.depthMask(true)
  gl.disable(gl.BLEND)

  const feedbackActive = options.feedback.amount > feedbackActiveThreshold
  const plainPost = !feedbackActive && !options.sky && !options.skyline

  gl.bindFramebuffer(gl.FRAMEBUFFER, feedbackActive ? options.feedback.next.frame : null)
  gl.drawBuffers([feedbackActive ? gl.COLOR_ATTACHMENT0 : gl.BACK])
  gl.viewport(0, 0, options.width, options.height)
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)
  if (plainPost) {
    gl.useProgram(options.post.plain.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, options.target.color)
    gl.uniform1i(options.post.plain.scene, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, options.target.bloom)
    gl.uniform1i(options.post.plain.bloom, 1)
    gl.uniform2f(options.post.plain.bloomResolution, options.target.width, options.target.height)
  }
  else {
    gl.useProgram(options.post.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, options.target.color)
    gl.uniform1i(options.post.scene, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, options.target.bloom)
    gl.uniform1i(options.post.bloom, 1)
    if (feedbackActive) {
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, options.feedback.current.color)
      gl.uniform1i(options.post.feedback, 2)
    }
    gl.uniform1f(options.post.feedbackAmount, options.feedback.amount)
    gl.uniform1f(options.post.time, options.time)
    gl.uniform1i(options.post.tripKind, options.feedback.tripKind)
    gl.uniform1f(options.post.daylight, options.dayCycle.daylight)
    gl.uniform1f(options.post.moonProgress, options.dayCycle.moonProgress)
    gl.uniform1f(options.post.sunProgress, options.dayCycle.progress)
    gl.uniform3f(options.post.moonDirection, options.dayCycle.moonDirection[0], options.dayCycle.moonDirection[1],
      options.dayCycle.moonDirection[2])
    gl.uniform3f(options.post.sunDirection, options.dayCycle.sunDirection[0], options.dayCycle.sunDirection[1],
      options.dayCycle.sunDirection[2])
    gl.uniform2f(options.post.bloomResolution, options.target.width, options.target.height)
    gl.uniform1i(options.post.renderSky, options.sky ? 1 : options.skyline ? 2 : 0)
    if (options.sky || options.skyline) {
      gl.uniform3f(options.post.skyForward, mainCameraMatrix.forward[0], mainCameraMatrix.forward[1],
        mainCameraMatrix.forward[2])
      gl.uniform3f(options.post.skyRight, mainCameraMatrix.right[0], mainCameraMatrix.right[1],
        mainCameraMatrix.right[2])
      gl.uniform3f(options.post.skyUp, mainCameraMatrix.up[0], mainCameraMatrix.up[1], mainCameraMatrix.up[2])
    }
  }
  gl.bindVertexArray(options.arrays.post)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  if (!feedbackActive) {
    return
  }

  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, options.feedback.next.frame)
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null)
  gl.blitFramebuffer(0, 0, options.width, options.height, 0, 0, options.width, options.height, gl.COLOR_BUFFER_BIT,
    gl.NEAREST)

  const current = options.feedback.current

  options.feedback.current = options.feedback.next
  options.feedback.next = current
}

function bindRoomTextures(options: Parameters<typeof renderClubFrame>[0]) {
  const gl = options.gl

  gl.activeTexture(gl.TEXTURE4)
  gl.bindTexture(gl.TEXTURE_2D, options.treeShadowMap)
  gl.uniform1i(options.roomUniforms.treeShadowSampler, 4)
  gl.activeTexture(gl.TEXTURE5)
  gl.bindTexture(gl.TEXTURE_2D, options.graffitiTexture)
  gl.uniform1i(options.roomUniforms.graffitiMap, 5)
  gl.activeTexture(gl.TEXTURE6)
  gl.bindTexture(gl.TEXTURE_2D, options.objectTexture)
  gl.uniform1i(options.roomUniforms.objectTextureMap, 6)
}

function drawCharacterVertexGeometry(options: Parameters<typeof renderClubFrame>[0]) {
  if (options.character.count === 0) {
    return
  }

  options.gl.uniform1i(options.roomUniforms.characterPass, 1)
  options.gl.bindVertexArray(options.arrays.character)
  options.gl.drawArrays(options.gl.TRIANGLES, 0, options.character.count)
  options.gl.uniform1i(options.roomUniforms.characterPass, 0)
}

function drawBeachBalls(options: Parameters<typeof renderClubFrame>[0]) {
  if (options.beachBallPoints.length === 0) {
    return
  }

  options.gl.bindVertexArray(options.arrays.beachBalls)
  options.gl.drawArrays(options.gl.TRIANGLES, 0, options.beachBallPoints.length / options.vertexSize)
}

function drawTreeSwing(options: Parameters<typeof renderClubFrame>[0]) {
  if (options.treeSwingPoints.length === 0) {
    return
  }

  options.gl.bindVertexArray(options.arrays.treeSwing)
  options.gl.drawArrays(options.gl.TRIANGLES, 0, options.treeSwingPoints.length / options.vertexSize)
}

function drawBubbles(options: Parameters<typeof renderClubFrame>[0]) {
  if (options.bubblePoints.length === 0) {
    return
  }

  options.gl.bindVertexArray(options.arrays.bubbles)
  options.gl.drawArrays(options.gl.TRIANGLES, 0, options.bubblePoints.length / options.vertexSize)
}

function drawFoam(options: Parameters<typeof renderClubFrame>[0]) {
  if (options.foamPoints.length === 0) {
    return
  }

  options.gl.bindVertexArray(options.arrays.foam)
  options.gl.drawArrays(options.gl.TRIANGLES, 0, options.foamPoints.length / options.vertexSize)
}

function drawSmokePuff(options: Parameters<typeof renderClubFrame>[0]) {
  if (options.smokePuffPoints.length === 0) {
    return
  }

  options.gl.bindVertexArray(options.arrays.smokePuff)
  options.gl.drawArrays(options.gl.TRIANGLES, 0, options.smokePuffPoints.length / options.vertexSize)
}

function drawGraffiti(options: Parameters<typeof renderClubFrame>[0]) {
  if (options.graffitiPoints.length === 0) {
    return
  }

  options.gl.bindVertexArray(options.arrays.graffiti)
  options.gl.drawArrays(options.gl.TRIANGLES, 0, options.graffitiPoints.length / options.vertexSize)
}

function drawCharacters(options: Parameters<typeof renderClubFrame>[0], width: number, height: number, hair: boolean) {
  drawCharacterVertexGeometry(options)

  drawCharacterBoxes({
    array: options.arrays.characterBox,
    camera: options.camera,
    cameraMatrix: mainCameraMatrix,
    count: options.character.boxInstanceCount,
    geometry: options.character.boxGeometry,
    gl: options.gl,
    height,
    renderZone: options.renderZone,
    program: options.character.boxProgram,
    uniforms: options.character.boxUniforms,
    width,
  })
  if (hair) {
    drawNpcHair({
      camera: options.camera,
      cameraMatrix: mainCameraMatrix,
      gl: options.gl,
      hairRenderMeshes: options.character.hairRenderMeshes,
      height,
      renderZone: options.renderZone,
      program: options.character.hairProgram,
      uniforms: options.character.hairUniforms,
      width,
    })
  }
}

function drawLights(options: Parameters<typeof renderClubFrame>[0], width: number, height: number, frame: number) {
  if (options.light.count > 0) {
    useLightProgram({
      camera: options.camera,
      cameraMatrix: mainCameraMatrix,
      characterPosition: options.characterPosition,
      frame,
      gl: options.gl,
      height,
      program: options.light.program,
      renderZone: options.renderZone,
      smokeMap: options.smoke.map,
      uniforms: options.light.uniforms,
      width,
    })
    options.gl.bindVertexArray(options.arrays.light)
    options.gl.drawArrays(options.gl.TRIANGLES, 0, options.light.count)
  }
  options.strobeController.draw(frame, mainCameraMatrix)
}
