import { createCameraMatrix, updateCameraMatrix } from './camera-matrix.ts'
import type { CameraMatrix } from './camera-matrix.ts'
import {
  drawCharacterBoxes,
  drawNpcHair,
} from './character-gpu.ts'
import {
  drawRoomDepth,
  useLightProgram,
  useRoomSmokeProgram,
} from './room-draw.ts'
import { createStrobeDrawController } from './strobe-draw.ts'
import type { CharacterBoxGeometry, HairRenderMesh, Target, Vec3 } from './types.ts'

type Camera = {
  eye: Vec3
  center: Vec3
}

type RoomUniforms = {
  bloomPass: WebGLUniformLocation
  cameraEye: WebGLUniformLocation
  doorCoverVisible: WebGLUniformLocation
  graffitiMap: WebGLUniformLocation
  renderZone: WebGLUniformLocation
  treeShadowSampler: WebGLUniformLocation
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
const bloomCameraMatrix = createCameraMatrix()

export function renderClubFrame(options: {
  arrays: {
    character: WebGLVertexArrayObject
    characterBox: WebGLVertexArrayObject
    light: WebGLVertexArrayObject
    post: WebGLVertexArrayObject
    beachBalls: WebGLVertexArrayObject
    graffiti: WebGLVertexArrayObject
    room: WebGLVertexArrayObject
    smoke: WebGLVertexArrayObject
  }
  bloomTarget: Target
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
  graffitiPoints: Float32Array
  graffitiTexture: WebGLTexture
  post: {
    bloom: WebGLUniformLocation
    bloomResolution: WebGLUniformLocation
    feedback: WebGLUniformLocation
    feedbackAmount: WebGLUniformLocation
    program: WebGLProgram
    renderSky: WebGLUniformLocation
    scene: WebGLUniformLocation
    skyForward: WebGLUniformLocation
    skyRight: WebGLUniformLocation
    skyUp: WebGLUniformLocation
    time: WebGLUniformLocation
    tripKind: WebGLUniformLocation
  }
  program: WebGLProgram
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
  target: Target
  time: number
  treeShadowMap: WebGLTexture
  vertexSize: number
  width: number
}) {
  const gl = options.gl
  const frame = Math.floor(options.time * 60)
  updateCameraMatrix(mainCameraMatrix, options.camera.eye, options.camera.center, options.width, options.height)
  updateCameraMatrix(bloomCameraMatrix, options.camera.eye, options.camera.center, options.bloomTarget.width,
    options.bloomTarget.height)

  gl.bindFramebuffer(gl.FRAMEBUFFER, options.target.frame)
  gl.viewport(0, 0, options.width, options.height)
  gl.enable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)
  gl.clearColor(options.sky ? 0.28 : 0.01, options.sky ? 0.55 : 0.01, options.sky ? 0.92 : 0.014, 0.0)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  gl.useProgram(options.program)
  gl.uniformMatrix4fv(options.roomUniforms.viewProjection, false, mainCameraMatrix.viewProjection)
  gl.uniform3f(options.roomUniforms.cameraEye, options.camera.eye[0], options.camera.eye[1], options.camera.eye[2])
  gl.uniform1i(options.roomUniforms.renderZone, options.renderZone)
  gl.uniform1i(options.roomUniforms.bloomPass, 0)
  gl.uniform1i(options.roomUniforms.doorCoverVisible, options.doorCoverVisible ? 1 : 0)
  gl.activeTexture(gl.TEXTURE4)
  gl.bindTexture(gl.TEXTURE_2D, options.treeShadowMap)
  gl.uniform1i(options.roomUniforms.treeShadowSampler, 4)
  gl.activeTexture(gl.TEXTURE5)
  gl.bindTexture(gl.TEXTURE_2D, options.graffitiTexture)
  gl.uniform1i(options.roomUniforms.graffitiMap, 5)
  gl.bindVertexArray(options.arrays.room)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.enable(gl.POLYGON_OFFSET_FILL)
  gl.polygonOffset(1, 1)
  gl.drawArrays(gl.TRIANGLES, 0, options.points.length / options.vertexSize)
  drawBeachBalls(options)
  gl.disable(gl.POLYGON_OFFSET_FILL)
  gl.depthFunc(gl.LEQUAL)
  gl.depthMask(false)
  drawGraffiti(options)
  options.sceneOverlay?.draw(mainCameraMatrix)
  gl.depthMask(true)
  gl.depthFunc(gl.LESS)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  drawCharacters(options, options.width, options.height, true)
  gl.disable(gl.BLEND)

  drawRoomDepth({
    array: options.arrays.room,
    camera: options.camera,
    cameraMatrix: mainCameraMatrix,
    count: options.points.length / options.vertexSize,
    doorCoverVisible: options.doorCoverVisible,
    gl,
    height: options.height,
    renderZone: options.renderZone,
    program: options.program,
    treeShadowMap: options.treeShadowMap,
    uniforms: options.roomUniforms,
    width: options.width,
  })
  gl.enable(gl.BLEND)
  gl.depthMask(false)
  if (!options.outside) {
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

  gl.bindFramebuffer(gl.FRAMEBUFFER, options.bloomTarget.frame)
  gl.viewport(0, 0, options.bloomTarget.width, options.bloomTarget.height)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  gl.useProgram(options.program)
  gl.uniformMatrix4fv(options.roomUniforms.viewProjection, false, bloomCameraMatrix.viewProjection)
  gl.uniform3f(options.roomUniforms.cameraEye, options.camera.eye[0], options.camera.eye[1], options.camera.eye[2])
  gl.uniform1i(options.roomUniforms.renderZone, options.renderZone)
  gl.uniform1i(options.roomUniforms.bloomPass, 0)
  gl.uniform1i(options.roomUniforms.doorCoverVisible, options.doorCoverVisible ? 1 : 0)
  gl.activeTexture(gl.TEXTURE4)
  gl.bindTexture(gl.TEXTURE_2D, options.treeShadowMap)
  gl.uniform1i(options.roomUniforms.treeShadowSampler, 4)
  gl.activeTexture(gl.TEXTURE5)
  gl.bindTexture(gl.TEXTURE_2D, options.graffitiTexture)
  gl.uniform1i(options.roomUniforms.graffitiMap, 5)
  gl.colorMask(false, false, false, false)
  gl.bindVertexArray(options.arrays.room)
  gl.enable(gl.POLYGON_OFFSET_FILL)
  gl.polygonOffset(1, 1)
  gl.drawArrays(gl.TRIANGLES, 0, options.points.length / options.vertexSize)
  drawBeachBalls(options)
  gl.disable(gl.POLYGON_OFFSET_FILL)
  gl.depthFunc(gl.LEQUAL)
  drawGraffiti(options)
  gl.depthFunc(gl.LESS)
  drawCharacters(options, options.bloomTarget.width, options.bloomTarget.height, false)
  gl.colorMask(true, true, true, true)
  gl.depthMask(false)
  gl.useProgram(options.program)
  gl.uniform1i(options.roomUniforms.bloomPass, 1)
  gl.bindVertexArray(options.arrays.room)
  gl.drawArrays(gl.TRIANGLES, 0, options.points.length / options.vertexSize)
  gl.depthFunc(gl.LEQUAL)
  drawCharacterVertexGeometry(options)
  drawCharacterBoxes({
    array: options.arrays.characterBox,
    bloomPass: true,
    camera: options.camera,
    cameraMatrix: bloomCameraMatrix,
    count: options.character.boxInstanceCount,
    geometry: options.character.boxGeometry,
    gl: options.gl,
    height: options.bloomTarget.height,
    renderZone: options.renderZone,
    program: options.character.boxProgram,
    uniforms: options.character.boxUniforms,
    width: options.bloomTarget.width,
  })
  gl.depthFunc(gl.LESS)
  gl.useProgram(options.program)
  gl.uniform1i(options.roomUniforms.bloomPass, 0)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
  drawLights(options, options.bloomTarget.width, options.bloomTarget.height, frame)
  gl.depthMask(true)
  gl.disable(gl.BLEND)

  gl.bindFramebuffer(gl.FRAMEBUFFER, options.feedback.next.frame)
  gl.viewport(0, 0, options.width, options.height)
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)
  gl.clearColor(options.sky ? 0.28 : 0.01, options.sky ? 0.55 : 0.01, options.sky ? 0.92 : 0.014, 1.0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(options.post.program)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, options.target.color)
  gl.uniform1i(options.post.scene, 0)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, options.bloomTarget.color)
  gl.uniform1i(options.post.bloom, 1)
  gl.activeTexture(gl.TEXTURE2)
  gl.bindTexture(gl.TEXTURE_2D, options.feedback.current.color)
  gl.uniform1i(options.post.feedback, 2)
  gl.uniform1f(options.post.feedbackAmount, options.feedback.amount)
  gl.uniform1f(options.post.time, options.time)
  gl.uniform1i(options.post.tripKind, options.feedback.tripKind)
  gl.uniform2f(options.post.bloomResolution, options.bloomTarget.width, options.bloomTarget.height)
  gl.uniform1i(options.post.renderSky, options.sky ? 1 : options.skyline ? 2 : 0)
  if (options.sky || options.skyline) {
    gl.uniform3f(options.post.skyForward, mainCameraMatrix.forward[0], mainCameraMatrix.forward[1],
      mainCameraMatrix.forward[2])
    gl.uniform3f(options.post.skyRight, mainCameraMatrix.right[0], mainCameraMatrix.right[1], mainCameraMatrix.right[2])
    gl.uniform3f(options.post.skyUp, mainCameraMatrix.up[0], mainCameraMatrix.up[1], mainCameraMatrix.up[2])
  }
  gl.bindVertexArray(options.arrays.post)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, options.feedback.next.frame)
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null)
  gl.blitFramebuffer(0, 0, options.width, options.height, 0, 0, options.width, options.height, gl.COLOR_BUFFER_BIT,
    gl.NEAREST)

  const current = options.feedback.current

  options.feedback.current = options.feedback.next
  options.feedback.next = current
}

function drawCharacterVertexGeometry(options: Parameters<typeof renderClubFrame>[0]) {
  if (options.character.count === 0) {
    return
  }

  options.gl.bindVertexArray(options.arrays.character)
  options.gl.drawArrays(options.gl.TRIANGLES, 0, options.character.count)
}

function drawBeachBalls(options: Parameters<typeof renderClubFrame>[0]) {
  if (options.beachBallPoints.length === 0) {
    return
  }

  options.gl.bindVertexArray(options.arrays.beachBalls)
  options.gl.drawArrays(options.gl.TRIANGLES, 0, options.beachBallPoints.length / options.vertexSize)
}

function drawGraffiti(options: Parameters<typeof renderClubFrame>[0]) {
  if (options.graffitiPoints.length === 0) {
    return
  }

  options.gl.bindVertexArray(options.arrays.graffiti)
  options.gl.drawArrays(options.gl.TRIANGLES, 0, options.graffitiPoints.length / options.vertexSize)
}

function drawCharacters(options: Parameters<typeof renderClubFrame>[0], width: number, height: number, hair: boolean) {
  if (options.character.count > 0) {
    options.gl.bindVertexArray(options.arrays.character)
    options.gl.drawArrays(options.gl.TRIANGLES, 0, options.character.count)
  }

  drawCharacterBoxes({
    array: options.arrays.characterBox,
    camera: options.camera,
    cameraMatrix: width === options.width ? mainCameraMatrix : bloomCameraMatrix,
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
      cameraMatrix: width === options.width ? mainCameraMatrix : bloomCameraMatrix,
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
  useLightProgram({
    camera: options.camera,
    cameraMatrix: width === options.width ? mainCameraMatrix : bloomCameraMatrix,
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
  options.strobeController.draw(frame, width === options.width ? mainCameraMatrix : bloomCameraMatrix)
}
