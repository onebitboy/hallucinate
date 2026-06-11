import { shaderFrame } from './animation-time.ts'
import type { CameraMatrix } from './camera-matrix.ts'
import type { Vec3 } from './types.ts'

type Camera = { eye: Vec3; center: Vec3 }

export function drawRoomDepth(options: {
  array: WebGLVertexArrayObject
  cameraMatrix: CameraMatrix
  count: number
  doorCoverVisible: boolean
  gl: WebGL2RenderingContext
  renderZone: number
  program: WebGLProgram
  uniforms: {
    doorCoverVisible: WebGLUniformLocation
    renderZone: WebGLUniformLocation
    viewProjection: WebGLUniformLocation
  }
}) {
  options.gl.useProgram(options.program)
  options.gl.uniformMatrix4fv(options.uniforms.viewProjection, false, options.cameraMatrix.viewProjection)
  options.gl.uniform1i(options.uniforms.renderZone, options.renderZone)
  options.gl.uniform1i(options.uniforms.doorCoverVisible, options.doorCoverVisible ? 1 : 0)
  options.gl.drawBuffers([options.gl.NONE, options.gl.NONE])
  options.gl.colorMask(false, false, false, false)
  options.gl.depthMask(true)
  options.gl.bindVertexArray(options.array)
  options.gl.drawArrays(options.gl.TRIANGLES, 0, options.count)
  options.gl.colorMask(true, true, true, true)
  options.gl.drawBuffers([options.gl.COLOR_ATTACHMENT0, options.gl.COLOR_ATTACHMENT1])
}

export function useRoomSmokeProgram(options: {
  camera: Camera
  cameraMatrix: CameraMatrix
  gl: WebGL2RenderingContext
  height: number
  program: WebGLProgram
  smokeMap: WebGLTexture
  time: number
  uniforms: {
    cameraRight: WebGLUniformLocation
    cameraUp: WebGLUniformLocation
    smokeMap: WebGLUniformLocation
    time: WebGLUniformLocation
    viewProjection: WebGLUniformLocation
  }
  width: number
}) {
  options.gl.useProgram(options.program)
  options.gl.uniform1f(options.uniforms.time, options.time)
  options.gl.uniformMatrix4fv(options.uniforms.viewProjection, false, options.cameraMatrix.viewProjection)
  options.gl.uniform3f(options.uniforms.cameraRight, options.cameraMatrix.right[0], options.cameraMatrix.right[1],
    options.cameraMatrix.right[2])
  options.gl.uniform3f(options.uniforms.cameraUp, options.cameraMatrix.up[0], options.cameraMatrix.up[1],
    options.cameraMatrix.up[2])
  options.gl.activeTexture(options.gl.TEXTURE3)
  options.gl.bindTexture(options.gl.TEXTURE_2D, options.smokeMap)
  options.gl.uniform1i(options.uniforms.smokeMap, 3)
}

export function useLightProgram(options: {
  camera: Camera
  cameraMatrix: CameraMatrix
  characterPosition: Vec3
  frame: number
  gl: WebGL2RenderingContext
  height: number
  program: WebGLProgram
  renderZone: number
  smokeMap: WebGLTexture
  uniforms: {
    renderZone: WebGLUniformLocation
    smokeMap: WebGLUniformLocation
    time: WebGLUniformLocation
    viewProjection: WebGLUniformLocation
  }
  width: number
}) {
  options.gl.useProgram(options.program)
  options.gl.uniform1f(options.uniforms.time, shaderFrame(options.frame))
  options.gl.uniform1i(options.uniforms.renderZone, options.renderZone)
  options.gl.uniformMatrix4fv(options.uniforms.viewProjection, false, options.cameraMatrix.viewProjection)
  options.gl.activeTexture(options.gl.TEXTURE2)
  options.gl.bindTexture(options.gl.TEXTURE_2D, options.smokeMap)
  options.gl.uniform1i(options.uniforms.smokeMap, 2)
}
