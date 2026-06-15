import type { CharacterBoxGeometry, SceneTarget, Target, Vec3 } from './types.ts'

import { clamp } from './math.ts'

export function createCharacterBoxGeometry(): CharacterBoxGeometry {
  const vertices: number[] = []
  const add = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, shade: number) => {
    vertices.push(
      a[0],
      a[1],
      a[2],
      shade,
      b[0],
      b[1],
      b[2],
      shade,
      c[0],
      c[1],
      c[2],
      shade,
      a[0],
      a[1],
      a[2],
      shade,
      c[0],
      c[1],
      c[2],
      shade,
      d[0],
      d[1],
      d[2],
      shade,
    )
  }
  const a0: Vec3 = [-1, -1, 0]
  const a1: Vec3 = [1, -1, 0]
  const a2: Vec3 = [1, 1, 0]
  const a3: Vec3 = [-1, 1, 0]
  const b0: Vec3 = [-1, -1, 1]
  const b1: Vec3 = [1, -1, 1]
  const b2: Vec3 = [1, 1, 1]
  const b3: Vec3 = [-1, 1, 1]

  add(a0, a1, b1, b0, 0.65)
  add(a1, a2, b2, b1, 1)
  add(a2, a3, b3, b2, 0.82)
  add(a3, a0, b0, b3, 0.65)
  add(a3, a2, a1, a0, 0.82)
  add(b0, b1, b2, b3, 0.82)

  return {
    data: new Float32Array(vertices),
    count: vertices.length / 4,
  }
}

export function createStrobeGeometry(): CharacterBoxGeometry {
  const vertices: number[] = []
  const add = (localX: number, localZ: number, localY: number, kind: number, u: number, v: number, glow: number,
    haze: number) =>
  {
    vertices.push(localX, localZ, localY, kind, u, v, glow, haze)
  }
  const addBeam = (a: number, b: number, uA: number, uB: number) => {
    add(Math.cos(a), Math.sin(a), 0, 0, uA, 0, 0.18, 1)
    add(Math.cos(b), Math.sin(b), 0, 0, uB, 0, 0.18, 1)
    add(Math.cos(b), Math.sin(b), 1, 0, uB, 1, 1, 1)
    add(Math.cos(a), Math.sin(a), 0, 0, uA, 0, 0.18, 1)
    add(Math.cos(b), Math.sin(b), 1, 0, uB, 1, 1, 1)
    add(Math.cos(a), Math.sin(a), 1, 0, uA, 1, 1, 1)
  }
  const addPool = (x: number, z: number, glow: number) => add(x, z, 0, 1, 0, 0, glow, 0)
  const beamSegments = 20
  const poolSegments = 32
  const innerRadius = 0.82
  const outerRadiusX = 1.75
  const outerRadiusZ = 2.2

  for (let i = 0; i < beamSegments; i++) {
    addBeam((i / beamSegments) * Math.PI * 2, ((i + 1) / beamSegments) * Math.PI * 2, i / beamSegments,
      (i + 1) / beamSegments)
  }

  for (let i = 0; i < poolSegments; i++) {
    const a = (i / poolSegments) * Math.PI * 2
    const b = ((i + 1) / poolSegments) * Math.PI * 2
    const innerAX = Math.cos(a) * innerRadius
    const innerAZ = Math.sin(a) * innerRadius
    const innerBX = Math.cos(b) * innerRadius
    const innerBZ = Math.sin(b) * innerRadius
    const edgeAX = Math.cos(a) * outerRadiusX
    const edgeAZ = Math.sin(a) * outerRadiusZ
    const edgeBX = Math.cos(b) * outerRadiusX
    const edgeBZ = Math.sin(b) * outerRadiusZ

    addPool(0, 0, 1.08)
    addPool(innerAX, innerAZ, 0.9)
    addPool(innerBX, innerBZ, 0.9)
    addPool(innerAX, innerAZ, 0.34)
    addPool(edgeAX, edgeAZ, 0.08)
    addPool(edgeBX, edgeBZ, 0.08)
    addPool(innerAX, innerAZ, 0.34)
    addPool(edgeBX, edgeBZ, 0.08)
    addPool(innerBX, innerBZ, 0.34)
  }

  return {
    data: new Float32Array(vertices),
    count: vertices.length / 8,
  }
}

export function createProgram(context: WebGL2RenderingContext, sourceVertex: string, sourceFragment: string) {
  const shaderVertex = createShader(context, context.VERTEX_SHADER, sourceVertex)
  const shaderFragment = createShader(context, context.FRAGMENT_SHADER, sourceFragment)
  const next = context.createProgram()

  if (!next) {
    throw new Error('Failed to create WebGL program')
  }

  context.attachShader(next, shaderVertex)
  context.attachShader(next, shaderFragment)
  context.linkProgram(next)

  if (!context.getProgramParameter(next, context.LINK_STATUS)) {
    throw new Error(context.getProgramInfoLog(next) ?? 'Failed to link WebGL program')
  }

  context.deleteShader(shaderVertex)
  context.deleteShader(shaderFragment)

  return next
}

export function createShader(context: WebGL2RenderingContext, type: number, source: string) {
  const shader = context.createShader(type)

  if (!shader) {
    throw new Error('Failed to create WebGL shader')
  }

  context.shaderSource(shader, source)
  context.compileShader(shader)

  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    throw new Error(context.getShaderInfoLog(shader) ?? 'Failed to compile WebGL shader')
  }

  return shader
}

export function createTarget(context: WebGL2RenderingContext, width: number, height: number) {
  const frame = context.createFramebuffer()
  const color = context.createTexture()
  const depth = context.createRenderbuffer()

  if (!frame || !color || !depth) {
    throw new Error('Failed to create render target')
  }

  context.bindTexture(context.TEXTURE_2D, color)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.NEAREST)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.NEAREST)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)

  context.bindFramebuffer(context.FRAMEBUFFER, frame)
  context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0, context.TEXTURE_2D, color, 0)
  context.bindRenderbuffer(context.RENDERBUFFER, depth)
  context.framebufferRenderbuffer(context.FRAMEBUFFER, context.DEPTH_ATTACHMENT, context.RENDERBUFFER, depth)
  context.drawBuffers([context.COLOR_ATTACHMENT0])
  const target = { frame, color, depth, width: 0, height: 0 }

  resizeTarget(context, target, width, height)
  context.bindFramebuffer(context.FRAMEBUFFER, null)

  return target
}

export function createSceneTarget(context: WebGL2RenderingContext, width: number, height: number) {
  const frame = context.createFramebuffer()
  const color = context.createTexture()
  const bloom = context.createTexture()
  const depth = context.createRenderbuffer()

  if (!frame || !color || !bloom || !depth) {
    throw new Error('Failed to create scene target')
  }

  setupTargetTexture(context, color)
  setupTargetTexture(context, bloom)

  context.bindFramebuffer(context.FRAMEBUFFER, frame)
  context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0, context.TEXTURE_2D, color, 0)
  context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT1, context.TEXTURE_2D, bloom, 0)
  context.bindRenderbuffer(context.RENDERBUFFER, depth)
  context.framebufferRenderbuffer(context.FRAMEBUFFER, context.DEPTH_ATTACHMENT, context.RENDERBUFFER, depth)
  context.drawBuffers([context.COLOR_ATTACHMENT0, context.COLOR_ATTACHMENT1])
  const target = { bloom, color, depth, frame, width: 0, height: 0 }

  resizeSceneTarget(context, target, width, height)
  context.bindFramebuffer(context.FRAMEBUFFER, null)

  return target
}

export function createSmokeMap(context: WebGL2RenderingContext) {
  const width = 128
  const height = 256
  const texture = context.createTexture()
  const data = new Uint8Array(width * height * 4)
  const fade = (value: number) => value * value * (3 - 2 * value)
  const random = (x: number, y: number, seed: number) => {
    const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123

    return value - Math.floor(value)
  }
  const noise = (x: number, y: number, cellsX: number, cellsY: number, seed: number) => {
    const gx = (x / width) * cellsX
    const gy = (y / height) * cellsY
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const x1 = (x0 + 1) % cellsX
    const y1 = (y0 + 1) % cellsY
    const tx = fade(gx - x0)
    const ty = fade(gy - y0)
    const a = random(x0 % cellsX, y0 % cellsY, seed)
    const b = random(x1, y0 % cellsY, seed)
    const c = random(x0 % cellsX, y1, seed)
    const d = random(x1, y1, seed)
    const top = a + (b - a) * tx
    const bottom = c + (d - c) * tx

    return top + (bottom - top) * ty
  }

  if (!texture) {
    throw new Error('Failed to create smoke texture')
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cloud = noise(x, y, 4, 8, 1) * 0.5
        + noise(x, y, 8, 16, 2) * 0.32
        + noise(x, y, 16, 32, 3) * 0.18
      const soft = clamp((cloud - 0.22) / 0.78, 0, 1)
      const value = Math.floor((0.32 + soft * 0.68) * 255)
      const index = (y * width + x) * 4

      data[index] = value
      data[index + 1] = value
      data[index + 2] = value
      data[index + 3] = 255
    }
  }

  context.bindTexture(context.TEXTURE_2D, texture)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.NEAREST)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.NEAREST)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.REPEAT)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.REPEAT)
  context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, data)

  return texture
}

export function createTreeShadowMap(context: WebGL2RenderingContext) {
  const texture = context.createTexture()
  const data = new Uint8Array([0, 0, 0, 0])

  if (!texture) {
    throw new Error('Failed to create tree shadow texture')
  }

  context.bindTexture(context.TEXTURE_2D, texture)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.NEAREST)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.NEAREST)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
  context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, 1, 1, 0, context.RGBA, context.UNSIGNED_BYTE, data)

  return texture
}

export function createImageTexture(context: WebGL2RenderingContext, path: string) {
  const texture = context.createTexture()
  const data = new Uint8Array([255, 255, 255, 255])
  const image = new Image()

  if (!texture) {
    throw new Error(`Failed to create image texture ${path}`)
  }

  context.bindTexture(context.TEXTURE_2D, texture)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.NEAREST)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.NEAREST)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
  context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, 1, 1, 0, context.RGBA, context.UNSIGNED_BYTE, data)

  image.onload = () => {
    context.bindTexture(context.TEXTURE_2D, texture)
    context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, true)
    context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, context.RGBA, context.UNSIGNED_BYTE, image)
    context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, false)
  }
  image.onerror = () => console.error(new Error(`Failed to load image texture ${path}`))
  image.src = path

  return texture
}

function setupTargetTexture(context: WebGL2RenderingContext, texture: WebGLTexture) {
  context.bindTexture(context.TEXTURE_2D, texture)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.NEAREST)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.NEAREST)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
}

export function resizeTarget(context: WebGL2RenderingContext, target: Target, width: number, height: number) {
  if (target.width === width && target.height === height) {
    return
  }

  target.width = width
  target.height = height
  context.bindTexture(context.TEXTURE_2D, target.color)
  context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, null)
  context.bindRenderbuffer(context.RENDERBUFFER, target.depth)
  context.renderbufferStorage(context.RENDERBUFFER, context.DEPTH_COMPONENT24, width, height)
  context.bindFramebuffer(context.FRAMEBUFFER, target.frame)
  context.drawBuffers([context.COLOR_ATTACHMENT0])

  if (context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE) {
    throw new Error('Render target is incomplete')
  }
}

export function resizeSceneTarget(
  context: WebGL2RenderingContext,
  target: SceneTarget,
  width: number,
  height: number,
) {
  if (target.width === width && target.height === height) {
    return
  }

  target.width = width
  target.height = height
  context.bindTexture(context.TEXTURE_2D, target.color)
  context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, null)
  context.bindTexture(context.TEXTURE_2D, target.bloom)
  context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, width, height, 0, context.RGBA, context.UNSIGNED_BYTE, null)
  context.bindRenderbuffer(context.RENDERBUFFER, target.depth)
  context.renderbufferStorage(context.RENDERBUFFER, context.DEPTH_COMPONENT24, width, height)
  context.bindFramebuffer(context.FRAMEBUFFER, target.frame)
  context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0, context.TEXTURE_2D, target.color, 0)
  context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT1, context.TEXTURE_2D, target.bloom, 0)
  context.drawBuffers([context.COLOR_ATTACHMENT0, context.COLOR_ATTACHMENT1])

  if (context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE) {
    throw new Error('Scene target is incomplete')
  }
}
