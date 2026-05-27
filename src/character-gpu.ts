import type { HairRenderMesh, Vec3 } from './types.ts'
import type { CharacterBoxGeometry } from './types.ts'
import type { CameraMatrix } from './camera-matrix.ts'

type Camera = { eye: Vec3; center: Vec3 }
export type NumberBufferCache = { capacity?: number; data: Float32Array }

export function uploadCharacterBoxInstances(options: {
  buffer: WebGLBuffer
  cache?: NumberBufferCache
  gl: WebGL2RenderingContext
  instances: number[]
  instanceSize: number
}) {
  const count = options.instances.length / options.instanceSize
  const data = options.cache ? fillNumberBuffer(options.cache, options.instances) : new Float32Array(options.instances)

  uploadFloatBuffer(options.gl, options.buffer, data, options.cache)

  return count
}

export function uploadFloatBuffer(
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  data: Float32Array,
  cache?: NumberBufferCache,
) {
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

function fillNumberBuffer(cache: NumberBufferCache, values: number[]) {
  if (cache.data.length < values.length) {
    cache.data = new Float32Array(values.length)
  }

  cache.data.set(values)

  return cache.data.length === values.length ? cache.data : cache.data.subarray(0, values.length)
}

export function drawCharacterBoxes(options: {
  array: WebGLVertexArrayObject
  camera: Camera
  cameraMatrix: CameraMatrix
  count: number
  geometry: CharacterBoxGeometry
  gl: WebGL2RenderingContext
  height: number
  outside: boolean
  program: WebGLProgram
  uniforms: {
    renderZone: WebGLUniformLocation
    viewProjection: WebGLUniformLocation
  }
  width: number
}) {
  if (options.count === 0) {
    return
  }

  options.gl.useProgram(options.program)
  options.gl.uniformMatrix4fv(options.uniforms.viewProjection, false, options.cameraMatrix.viewProjection)
  options.gl.uniform1i(options.uniforms.renderZone, options.outside ? 1 : 0)
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
  outside: boolean
  program: WebGLProgram
  uniforms: {
    renderZone: WebGLUniformLocation
    viewProjection: WebGLUniformLocation
  }
  width: number
}) {
  options.gl.useProgram(options.program)
  options.gl.uniformMatrix4fv(options.uniforms.viewProjection, false, options.cameraMatrix.viewProjection)
  options.gl.uniform1i(options.uniforms.renderZone, options.outside ? 1 : 0)

  for (const mesh of options.hairRenderMeshes) {
    if (mesh.instanceCount > 0) {
      options.gl.bindVertexArray(mesh.array)
      options.gl.drawArraysInstanced(options.gl.TRIANGLES, 0, mesh.vertexCount, mesh.instanceCount)
    }
  }

  options.gl.bindVertexArray(null)
}
