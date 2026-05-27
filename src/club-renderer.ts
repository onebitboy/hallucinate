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
  cameraCenter: WebGLUniformLocation
  cameraEye: WebGLUniformLocation
  renderZone: WebGLUniformLocation
  resolution: WebGLUniformLocation
  treeShadowSampler: WebGLUniformLocation
}

type LightUniforms = {
  cameraCenter: WebGLUniformLocation
  cameraEye: WebGLUniformLocation
  renderZone: WebGLUniformLocation
  resolution: WebGLUniformLocation
  smokeMap: WebGLUniformLocation
  time: WebGLUniformLocation
}

type SmokeUniforms = {
  cameraCenter: WebGLUniformLocation
  cameraEye: WebGLUniformLocation
  resolution: WebGLUniformLocation
  smokeMap: WebGLUniformLocation
  time: WebGLUniformLocation
}

type CharacterBoxUniforms = {
  cameraCenter: WebGLUniformLocation
  cameraEye: WebGLUniformLocation
  renderZone: WebGLUniformLocation
  resolution: WebGLUniformLocation
}

export function renderClubFrame(options: {
  arrays: {
    character: WebGLVertexArrayObject
    characterBox: WebGLVertexArrayObject
    light: WebGLVertexArrayObject
    post: WebGLVertexArrayObject
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
    hairUniforms: CharacterBoxUniforms
  }
  characterPosition: Vec3
  gl: WebGL2RenderingContext
  height: number
  light: {
    count: number
    program: WebGLProgram
    uniforms: LightUniforms
  }
  outside: boolean
  points: Float32Array
  post: {
    bloom: WebGLUniformLocation
    bloomResolution: WebGLUniformLocation
    program: WebGLProgram
    scene: WebGLUniformLocation
    skyForward: WebGLUniformLocation
    skyRight: WebGLUniformLocation
    skyUp: WebGLUniformLocation
  }
  program: WebGLProgram
  roomUniforms: RoomUniforms
  sky: boolean
  smoke: {
    map: WebGLTexture
    points: Float32Array
    program: WebGLProgram
    uniforms: SmokeUniforms
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

  gl.bindFramebuffer(gl.FRAMEBUFFER, options.target.frame)
  gl.viewport(0, 0, options.width, options.height)
  gl.enable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)
  gl.clearColor(options.sky ? 0.28 : 0.01, options.sky ? 0.55 : 0.01, options.sky ? 0.92 : 0.014, 0.0)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  gl.useProgram(options.program)
  gl.uniform2f(options.roomUniforms.resolution, options.width, options.height)
  gl.uniform3f(options.roomUniforms.cameraEye, options.camera.eye[0], options.camera.eye[1], options.camera.eye[2])
  gl.uniform3f(options.roomUniforms.cameraCenter, options.camera.center[0], options.camera.center[1],
    options.camera.center[2])
  gl.uniform1i(options.roomUniforms.renderZone, options.outside ? 1 : 0)
  gl.activeTexture(gl.TEXTURE4)
  gl.bindTexture(gl.TEXTURE_2D, options.treeShadowMap)
  gl.uniform1i(options.roomUniforms.treeShadowSampler, 4)
  gl.bindVertexArray(options.arrays.room)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.enable(gl.POLYGON_OFFSET_FILL)
  gl.polygonOffset(1, 1)
  gl.drawArrays(gl.TRIANGLES, 0, options.points.length / options.vertexSize)
  gl.disable(gl.POLYGON_OFFSET_FILL)
  gl.disable(gl.BLEND)
  drawCharacters(options, options.width, options.height)

  drawRoomDepth({
    array: options.arrays.room,
    camera: options.camera,
    count: options.points.length / options.vertexSize,
    gl,
    height: options.height,
    outside: options.outside,
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
  gl.uniform2f(options.roomUniforms.resolution, options.bloomTarget.width, options.bloomTarget.height)
  gl.uniform3f(options.roomUniforms.cameraEye, options.camera.eye[0], options.camera.eye[1], options.camera.eye[2])
  gl.uniform3f(options.roomUniforms.cameraCenter, options.camera.center[0], options.camera.center[1],
    options.camera.center[2])
  gl.uniform1i(options.roomUniforms.renderZone, options.outside ? 1 : 0)
  gl.activeTexture(gl.TEXTURE4)
  gl.bindTexture(gl.TEXTURE_2D, options.treeShadowMap)
  gl.uniform1i(options.roomUniforms.treeShadowSampler, 4)
  gl.colorMask(false, false, false, false)
  gl.bindVertexArray(options.arrays.room)
  gl.enable(gl.POLYGON_OFFSET_FILL)
  gl.polygonOffset(1, 1)
  gl.drawArrays(gl.TRIANGLES, 0, options.points.length / options.vertexSize)
  gl.disable(gl.POLYGON_OFFSET_FILL)
  drawCharacters(options, options.bloomTarget.width, options.bloomTarget.height)

  drawRoomDepth({
    array: options.arrays.room,
    camera: options.camera,
    count: options.points.length / options.vertexSize,
    gl,
    height: options.bloomTarget.height,
    outside: options.outside,
    program: options.program,
    treeShadowMap: options.treeShadowMap,
    uniforms: options.roomUniforms,
    width: options.bloomTarget.width,
  })
  gl.colorMask(true, true, true, true)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
  gl.depthMask(false)
  drawLights(options, options.bloomTarget.width, options.bloomTarget.height, frame)
  gl.depthMask(true)
  gl.disable(gl.BLEND)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
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
  gl.uniform2f(options.post.bloomResolution, options.bloomTarget.width, options.bloomTarget.height)
  const forward = normalize([
    options.camera.center[0] - options.camera.eye[0],
    options.camera.center[1] - options.camera.eye[1],
    options.camera.center[2] - options.camera.eye[2],
  ])
  const right = normalize([-forward[2], 0, forward[0]])
  const up: Vec3 = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ]

  gl.uniform3f(options.post.skyForward, forward[0], forward[1], forward[2])
  gl.uniform3f(options.post.skyRight, right[0], right[1], right[2])
  gl.uniform3f(options.post.skyUp, up[0], up[1], up[2])
  gl.bindVertexArray(options.arrays.post)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

function normalize(value: Vec3): Vec3 {
  const amount = Math.hypot(value[0], value[1], value[2])

  return [value[0] / amount, value[1] / amount, value[2] / amount]
}

function drawCharacters(options: Parameters<typeof renderClubFrame>[0], width: number, height: number) {
  if (options.character.count > 0) {
    options.gl.bindVertexArray(options.arrays.character)
    options.gl.drawArrays(options.gl.TRIANGLES, 0, options.character.count)
  }

  drawCharacterBoxes({
    array: options.arrays.characterBox,
    camera: options.camera,
    count: options.character.boxInstanceCount,
    geometry: options.character.boxGeometry,
    gl: options.gl,
    height,
    outside: options.outside,
    program: options.character.boxProgram,
    uniforms: options.character.boxUniforms,
    width,
  })
  drawNpcHair({
    camera: options.camera,
    gl: options.gl,
    hairRenderMeshes: options.character.hairRenderMeshes,
    height,
    outside: options.outside,
    program: options.character.hairProgram,
    uniforms: options.character.hairUniforms,
    width,
  })
}

function drawLights(options: Parameters<typeof renderClubFrame>[0], width: number, height: number, frame: number) {
  useLightProgram({
    camera: options.camera,
    characterPosition: options.characterPosition,
    frame,
    gl: options.gl,
    height,
    program: options.light.program,
    smokeMap: options.smoke.map,
    uniforms: options.light.uniforms,
    width,
  })
  options.gl.bindVertexArray(options.arrays.light)
  options.gl.drawArrays(options.gl.TRIANGLES, 0, options.light.count)
  options.strobeController.draw(options.camera, width, height, frame)
}
