import type { HairRenderMesh, Vec3 } from './types.ts'
import type { CharacterBoxGeometry } from './types.ts'

type Camera = { eye: Vec3; center: Vec3 }
export type NumberBufferCache = { data: Float32Array }

export function uploadCharacterBoxInstances(options: {
  buffer: WebGLBuffer
  cache?: NumberBufferCache
  gl: WebGL2RenderingContext
  instances: number[]
  instanceSize: number
}) {
  const count = options.instances.length / options.instanceSize
  const data = options.cache ? fillNumberBuffer(options.cache, options.instances) : new Float32Array(options.instances)

  options.gl.bindBuffer(options.gl.ARRAY_BUFFER, options.buffer)
  options.gl.bufferData(options.gl.ARRAY_BUFFER, data, options.gl.DYNAMIC_DRAW)

  return count
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
  count: number
  geometry: CharacterBoxGeometry
  gl: WebGL2RenderingContext
  height: number
  outside: boolean
  program: WebGLProgram
  uniforms: {
    cameraCenter: WebGLUniformLocation
    cameraEye: WebGLUniformLocation
    renderZone: WebGLUniformLocation
    resolution: WebGLUniformLocation
  }
  width: number
}) {
  if (options.count === 0) {
    return
  }

  options.gl.useProgram(options.program)
  options.gl.uniform2f(options.uniforms.resolution, options.width, options.height)
  options.gl.uniform3f(options.uniforms.cameraEye, options.camera.eye[0], options.camera.eye[1], options.camera.eye[2])
  options.gl.uniform3f(options.uniforms.cameraCenter, options.camera.center[0], options.camera.center[1],
    options.camera.center[2])
  options.gl.uniform1i(options.uniforms.renderZone, options.outside ? 1 : 0)
  options.gl.bindVertexArray(options.array)
  options.gl.drawArraysInstanced(options.gl.TRIANGLES, 0, options.geometry.count, options.count)
  options.gl.bindVertexArray(null)
}

export function drawNpcHair(options: {
  camera: Camera
  gl: WebGL2RenderingContext
  hairRenderMeshes: HairRenderMesh[]
  height: number
  outside: boolean
  program: WebGLProgram
  uniforms: {
    cameraCenter: WebGLUniformLocation
    cameraEye: WebGLUniformLocation
    renderZone: WebGLUniformLocation
    resolution: WebGLUniformLocation
  }
  width: number
}) {
  options.gl.useProgram(options.program)
  options.gl.uniform2f(options.uniforms.resolution, options.width, options.height)
  options.gl.uniform3f(options.uniforms.cameraEye, options.camera.eye[0], options.camera.eye[1], options.camera.eye[2])
  options.gl.uniform3f(options.uniforms.cameraCenter, options.camera.center[0], options.camera.center[1],
    options.camera.center[2])
  options.gl.uniform1i(options.uniforms.renderZone, options.outside ? 1 : 0)

  for (const mesh of options.hairRenderMeshes) {
    if (mesh.instanceCount > 0) {
      options.gl.bindVertexArray(mesh.array)
      options.gl.drawArraysInstanced(options.gl.TRIANGLES, 0, mesh.vertexCount, mesh.instanceCount)
    }
  }

  options.gl.bindVertexArray(null)
}
