import type { CameraMatrix } from './camera-matrix.ts'
import type { HairRenderMesh, Vec3 } from './types.ts'
import type { CharacterBoxGeometry } from './types.ts'

type Camera = { eye: Vec3; center: Vec3 }
export type NumberBufferCache = { capacity?: number; data: Float32Array }

export function uploadFloatBuffer(
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  data: Float32Array,
  cache?: NumberBufferCache,
) {
  if (data.byteLength === 0) {
    return
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)

  if (!cache) {
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
    return
  }

  if ((cache.capacity ?? 0) < data.byteLength) {
    cache.capacity = data.byteLength
    gl.bufferData(gl.ARRAY_BUFFER, cache.capacity, gl.DYNAMIC_DRAW)
  }

  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data)
}

export function drawCharacterBoxes(options: {
  array: WebGLVertexArrayObject
  camera: Camera
  cameraMatrix: CameraMatrix
  count: number
  geometry: CharacterBoxGeometry
  gl: WebGL2RenderingContext
  height: number
  renderZone: number
  program: WebGLProgram
  uniforms: {
    bloomPass: WebGLUniformLocation
    renderZone: WebGLUniformLocation
    viewProjection: WebGLUniformLocation
  }
  bloomPass?: boolean
  width: number
}) {
  if (options.count === 0) {
    return
  }

  options.gl.useProgram(options.program)
  options.gl.uniformMatrix4fv(options.uniforms.viewProjection, false, options.cameraMatrix.viewProjection)
  options.gl.uniform1i(options.uniforms.renderZone, options.renderZone)
  options.gl.uniform1i(options.uniforms.bloomPass, options.bloomPass ? 1 : 0)
  options.gl.bindVertexArray(options.array)
  options.gl.drawArraysInstanced(options.gl.TRIANGLES, 0, options.geometry.count, options.count)
  options.gl.bindVertexArray(null)
}

export function drawNpcHair(options: {
  camera: Camera
  cameraMatrix: CameraMatrix
  gl: WebGL2RenderingContext
  hairRenderMeshes: HairRenderMesh[]
  height: number
  renderZone: number
  program: WebGLProgram
  uniforms: {
    renderZone: WebGLUniformLocation
    viewProjection: WebGLUniformLocation
  }
  width: number
}) {
  options.gl.useProgram(options.program)
  options.gl.uniformMatrix4fv(options.uniforms.viewProjection, false, options.cameraMatrix.viewProjection)
  options.gl.uniform1i(options.uniforms.renderZone, options.renderZone)

  for (const mesh of options.hairRenderMeshes) {
    if (mesh.instanceCount > 0) {
      options.gl.bindVertexArray(mesh.array)
      options.gl.drawArraysInstanced(options.gl.TRIANGLES, 0, mesh.vertexCount, mesh.instanceCount)
    }
  }

  options.gl.bindVertexArray(null)
}
