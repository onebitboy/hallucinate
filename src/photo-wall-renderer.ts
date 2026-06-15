import { photoWallColumns, photoWallRows, photoWallSurface } from './photo-wall-data.ts'
import { videoPreviewFragment, videoPreviewVertex } from './shaders.ts'

import type { CameraMatrix } from './camera-matrix.ts'
import { domWallCorners } from './dom-wall.ts'
import type { Vec3 } from './types.ts'
import { createProgram } from './webgl.ts'

const atlasCellSize = 256
const vertexSize = 5

export function createPhotoWallRenderer(gl: WebGL2RenderingContext) {
  const program = createProgram(gl, videoPreviewVertex, videoPreviewFragment)
  const viewProjection = gl.getUniformLocation(program, 'viewProjection')
  const image = gl.getUniformLocation(program, 'image')
  const array = gl.createVertexArray()
  const buffer = gl.createBuffer()
  const texture = gl.createTexture()
  const geometry = photoWallGeometry()
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  let signature = ''
  let ready = false

  if (!viewProjection || !image || !array || !buffer || !texture || !context) {
    throw new Error('Failed to initialize photo wall renderer')
  }

  canvas.width = photoWallColumns * atlasCellSize
  canvas.height = photoWallRows * atlasCellSize
  gl.bindVertexArray(array)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, geometry, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, vertexSize * Float32Array.BYTES_PER_ELEMENT, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(
    1,
    2,
    gl.FLOAT,
    false,
    vertexSize * Float32Array.BYTES_PER_ELEMENT,
    3 * Float32Array.BYTES_PER_ELEMENT,
  )
  gl.bindVertexArray(null)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  return {
    async prepare(urls: string[]) {
      const nextSignature = urls.join('\n')

      if (ready && signature === nextSignature) {
        return
      }

      signature = nextSignature
      ready = false
      context.fillStyle = 'black'
      context.fillRect(0, 0, canvas.width, canvas.height)
      const images = await Promise.all(urls.slice(0, photoWallColumns * photoWallRows).map(loadImage))

      for (let i = 0; i < images.length; i++) {
        drawImageCover(context, images[i]!, i % photoWallColumns * atlasCellSize,
          Math.floor(i / photoWallColumns) * atlasCellSize, atlasCellSize, atlasCellSize)
      }

      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      ready = true
    },
    draw(cameraMatrix: CameraMatrix) {
      if (!ready) {
        return false
      }

      gl.useProgram(program)
      gl.uniformMatrix4fv(viewProjection, false, cameraMatrix.viewProjection)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(image, 0)
      gl.bindVertexArray(array)
      gl.disable(gl.CULL_FACE)
      gl.enable(gl.DEPTH_TEST)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
      gl.depthMask(false)
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      return true
    },
  }
}

function photoWallGeometry() {
  const a: Vec3 = [0, 0, 0]
  const b: Vec3 = [0, 0, 0]
  const c: Vec3 = [0, 0, 0]
  const d: Vec3 = [0, 0, 0]

  domWallCorners(photoWallSurface, a, b, c, d)

  return new Float32Array([
    ...a,
    0,
    0,
    ...b,
    1,
    0,
    ...c,
    1,
    1,
    ...a,
    0,
    0,
    ...c,
    1,
    1,
    ...d,
    0,
    1,
  ])
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const sourceWidth = width / scale
  const sourceHeight = height / scale
  const sourceX = (image.naturalWidth - sourceWidth) * 0.5
  const sourceY = (image.naturalHeight - sourceHeight) * 0.5

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height)
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()

    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Photo wall image failed ${url}`))
    image.src = url
  })
}
