import type { CameraMatrix } from './camera-matrix.ts'
import { domWallCorners } from './dom-wall.ts'
import type { DomWall } from './dom-wall.ts'
import { djVideoWall, loftVideoWall, outsideVideoWall, tentVideoWall } from './scene-data.ts'
import { videoPreviewFragment, videoPreviewVertex } from './shaders.ts'
import type { Vec3, VideoPreview, VideoZone } from './types.ts'
import { createProgram } from './webgl.ts'

type TextureEntry = {
  loading?: Promise<void>
  ready: boolean
  texture: WebGLTexture
}

const vertexSize = 5
const wallInset = 0.08
const wallOffset = 0.035
const outsideScreenOffset = 0.5
const loftScreenFaceOffset = 0.06

export function createVideoPreviewRenderer(gl: WebGL2RenderingContext) {
  const program = createProgram(gl, videoPreviewVertex, videoPreviewFragment)
  const viewProjection = gl.getUniformLocation(program, 'viewProjection')
  const image = gl.getUniformLocation(program, 'image')
  const array = gl.createVertexArray()
  const buffer = gl.createBuffer()
  const textures = new Map<string, TextureEntry>()
  const geometry: Record<VideoZone, Float32Array> = {
    inside: videoPreviewGeometry(videoPreviewWall('inside')),
    loft: videoPreviewGeometry(videoPreviewWall('loft')),
    outside: videoPreviewGeometry(videoPreviewWall('outside')),
    tent: videoPreviewGeometry(videoPreviewWall('tent')),
  }

  if (!viewProjection || !image || !array || !buffer) {
    throw new Error('Failed to initialize video preview renderer')
  }

  gl.bindVertexArray(array)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, geometry.inside.byteLength, gl.DYNAMIC_DRAW)
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

  return {
    async prepare(preview: VideoPreview | undefined) {
      if (preview) {
        await prepareTexture(preview.id)
      }
    },
    async prepareAll(previews: VideoPreview[]) {
      await Promise.all(previews.map(preview => prepareTexture(preview.id)))
    },
    draw(preview: VideoPreview, cameraMatrix: CameraMatrix) {
      const entry = textures.get(preview.id)

      if (!entry?.ready) {
        return false
      }

      gl.useProgram(program)
      gl.uniformMatrix4fv(viewProjection, false, cameraMatrix.viewProjection)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, entry.texture)
      gl.uniform1i(image, 0)
      gl.bindVertexArray(array)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, geometry[preview.zone])
      gl.disable(gl.CULL_FACE)
      gl.enable(gl.DEPTH_TEST)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
      gl.depthMask(false)
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      return true
    },
  }

  async function prepareTexture(id: string) {
    const cached = textures.get(id)

    if (cached?.ready) {
      return
    }

    if (cached?.loading) {
      await cached.loading
      return
    }

    const texture = gl.createTexture()

    if (!texture) {
      throw new Error('Failed to create video preview texture')
    }

    const entry: TextureEntry = { ready: false, texture }

    textures.set(id, entry)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    entry.loading = loadPreviewImage(id)
      .then(source => {
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
        entry.ready = true
      })
      .catch((error: unknown) => {
        textures.delete(id)
        throw error
      })

    await entry.loading
  }
}

function videoPreviewGeometry(wall: DomWall) {
  const insetWall: DomWall = {
    ...wall,
    height: wall.height - wallInset * 2,
    width: wall.width - wallInset * 2,
    x: wall.x + wall.normal[0] * wallOffset,
    z: wall.z + wall.normal[2] * wallOffset,
  }
  const a: Vec3 = [0, 0, 0]
  const b: Vec3 = [0, 0, 0]
  const c: Vec3 = [0, 0, 0]
  const d: Vec3 = [0, 0, 0]

  domWallCorners(insetWall, a, b, c, d)

  return new Float32Array([
    ...a, 0, 0,
    ...b, 1, 0,
    ...c, 1, 1,
    ...a, 0, 0,
    ...c, 1, 1,
    ...d, 0, 1,
  ])
}

function videoPreviewWall(zone: VideoZone): DomWall {
  if (zone === 'outside') {
    return { ...outsideVideoWall, z: outsideVideoWall.z - outsideScreenOffset }
  }
  if (zone === 'loft') {
    return { ...loftVideoWall, z: loftVideoWall.z + loftScreenFaceOffset }
  }
  if (zone === 'tent') {
    return tentVideoWall
  }

  return djVideoWall
}

async function loadPreviewImage(id: string) {
  let last: unknown

  for (const url of youtubeThumbnailUrls(id)) {
    try {
      return await loadImage(url)
    }
    catch (error: unknown) {
      last = error
    }
  }

  throw last
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()

    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Video preview image failed ${url}`))
    image.src = url
  })
}

function youtubeThumbnailUrls(id: string) {
  const base = `https://i.ytimg.com/vi/${encodeURIComponent(id)}`

  return [
    `${base}/maxresdefault.jpg`,
    `${base}/sddefault.jpg`,
    `${base}/hqdefault.jpg`,
  ]
}
