const vertex = `#version 300 es
precision highp float;

layout(location = 0) in vec2 position;

out vec2 uv;

void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragment = `#version 300 es
precision highp float;

uniform sampler2D textMap;
uniform sampler2D feedbackMap;
uniform vec2 resolution;
uniform vec2 pointer;
uniform float progress;
uniform float time;

in vec2 uv;

out vec4 pixel;

float hash(vec2 point) {
  vec3 p = fract(vec3(point.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);

  return fract((p.x + p.y) * p.z);
}

void main() {
  vec2 center = uv - 0.5;
  float radius = length(center);
  float angle = atan(center.y, center.x);
  float end = smoothstep(0.78, 1.0, progress);
  vec2 pointerDelta = pointer - 0.5;
  float pointerRadius = length(pointerDelta);
  float pointerAngle = atan(pointerDelta.y, pointerDelta.x);
  float pointerSpin = sin(pointerAngle - angle) * pointerRadius;
  float falloff = pow(max(1.0 - radius * 1.35, 0.0), 2.0);
  float swirl = pointerSpin * 1.35 * falloff;
  float ripple = sin(radius * 48.0 - time * 5.2) * 0.0035 * (0.25 + progress * 0.5);
  vec2 direction = radius > 0.0 ? center / radius : vec2(0.0);
  vec2 warped = vec2(cos(angle + swirl), sin(angle + swirl)) * radius + 0.5;

  warped += direction * ripple;
  warped += vec2(
    sin(uv.y * 15.0 + time * 1.8),
    cos(uv.x * 13.0 - time * 1.5)
  ) * 0.0022 * (0.16 + progress * 0.65);

  vec4 text = texture(textMap, warped);
  vec2 feedbackUv = (uv - 0.5) * (0.988 - end * 0.012) + 0.5;
  vec3 feedback = texture(feedbackMap, feedbackUv).rgb * (0.84 + end * 0.035);
  float grain = hash(floor(uv * resolution * 0.42) + floor(time * 18.0)) * 0.018;
  vec3 color = max(feedback, text.rgb * text.a * (1.05 + progress * 0.35));

  color += text.rgb * text.a * 0.1 + grain;
  color *= 0.985;

  pixel = vec4(color, 1.0);
}
`

const copyFragment = `#version 300 es
precision highp float;

uniform sampler2D map;

in vec2 uv;

out vec4 pixel;

void main() {
  pixel = vec4(texture(map, uv).rgb, 1.0);
}
`

type TextureTarget = {
  frame: WebGLFramebuffer
  texture: WebGLTexture
}

export function createIntroEffect(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false })!

  if (!gl) {
    throw new Error('Intro WebGL2 is not available')
  }

  const effectProgram = createProgram(gl, vertex, fragment)
  const copyProgram = createProgram(gl, vertex, copyFragment)
  const quad = gl.createVertexArray()!
  const buffer = gl.createBuffer()!
  const textCanvas = document.createElement('canvas')
  const textContext = textCanvas.getContext('2d')!
  const textTexture = gl.createTexture()!
  const feedback = [createTarget(gl, 1, 1), createTarget(gl, 1, 1)]
  const effectTextMap = gl.getUniformLocation(effectProgram, 'textMap')!
  const effectFeedbackMap = gl.getUniformLocation(effectProgram, 'feedbackMap')!
  const effectResolution = gl.getUniformLocation(effectProgram, 'resolution')!
  const effectPointer = gl.getUniformLocation(effectProgram, 'pointer')!
  const effectProgress = gl.getUniformLocation(effectProgram, 'progress')!
  const effectTime = gl.getUniformLocation(effectProgram, 'time')!
  const copyMap = gl.getUniformLocation(copyProgram, 'map')!
  let current = 0
  let frame = 0
  let progress = 0
  let pointerX = 0.5
  let pointerY = 0.5
  let running = false
  let textureDirty = true
  let fontsLoaded = !document.fonts

  gl.bindVertexArray(quad)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindTexture(gl.TEXTURE_2D, textTexture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  addEventListener('resize', () => textureDirty = true)
  document.fonts?.load('68px "Black and White Picture"')
    .then(() => document.fonts!.ready)
    .then(() => {
      fontsLoaded = true
      textureDirty = true
    })
    .catch((error: unknown) => console.error(error))

  function start() {
    if (running) {
      return
    }

    running = true
    frame = requestAnimationFrame(draw)
  }

  function stop() {
    running = false
    cancelAnimationFrame(frame)
  }

  function setProgress(value: number) {
    progress = value
  }

  function setPointer(x: number, y: number) {
    pointerX = x
    pointerY = y
  }

  function draw(stamp: number) {
    if (!running) {
      return
    }

    resize()
    if (textureDirty) {
      paintTextTexture()
      textureDirty = false
    }

    const next = 1 - current

    gl.bindFramebuffer(gl.FRAMEBUFFER, feedback[next]!.frame)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
    gl.useProgram(effectProgram)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, textTexture)
    gl.uniform1i(effectTextMap, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, feedback[current]!.texture)
    gl.uniform1i(effectFeedbackMap, 1)
    gl.uniform2f(effectResolution, canvas.width, canvas.height)
    gl.uniform2f(effectPointer, pointerX, pointerY)
    gl.uniform1f(effectProgress, progress)
    gl.uniform1f(effectTime, stamp * 0.001)
    gl.bindVertexArray(quad)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(copyProgram)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, feedback[next]!.texture)
    gl.uniform1i(copyMap, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    current = next
    frame = requestAnimationFrame(draw)
  }

  function resize() {
    const ratio = Math.min(devicePixelRatio, 1.5)
    const width = Math.max(1, Math.floor(canvas.clientWidth * ratio))
    const height = Math.max(1, Math.floor(canvas.clientHeight * ratio))

    if (canvas.width === width && canvas.height === height) {
      return
    }

    canvas.width = width
    canvas.height = height
    resizeTarget(gl, feedback[0]!, width, height)
    resizeTarget(gl, feedback[1]!, width, height)
    clearTarget(feedback[0]!)
    clearTarget(feedback[1]!)
    textureDirty = true
  }

  function paintTextTexture() {
    textCanvas.width = Math.max(1, canvas.width)
    textCanvas.height = Math.max(1, canvas.height)
    textContext.clearRect(0, 0, textCanvas.width, textCanvas.height)

    if (!fontsLoaded) {
      gl.bindTexture(gl.TEXTURE_2D, textTexture)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      return
    }

    textContext.textAlign = 'center'
    textContext.textBaseline = 'middle'

    const scale = Math.min(textCanvas.width / 820, textCanvas.height / 420)
    const titleMaxWidth = Math.min(textCanvas.width * 0.98, 800 * scale, 800)
    const subMaxWidth = Math.min(textCanvas.width * 0.92, 600 * scale, 600)
    let titleSize = Math.max(54, 132 * scale)
    let subSize = Math.max(18, 34 * scale)
    const centerX = textCanvas.width * 0.5
    const centerY = textCanvas.height * 0.4
    const gradient = textContext.createLinearGradient(0, centerY - titleSize * 0.62, 0, centerY + titleSize * 0.38)

    textContext.font = `${titleSize}px "Black and White Picture", sans-serif`
    titleSize *= Math.min(1, titleMaxWidth / textContext.measureText('hallucinate').width)
    textContext.font = `${subSize}px "Black and White Picture", sans-serif`
    subSize *= Math.min(1, subMaxWidth / textContext.measureText('Massively Multiplayer Online Rave').width)

    gradient.addColorStop(0, 'rgb(6,16,145)')
    gradient.addColorStop(0.4, 'rgb(0,142,235)')
    gradient.addColorStop(0.65, 'rgb(255,0,50)')
    gradient.addColorStop(1, 'rgb(255,20,0)')
    textContext.shadowBlur = 34 * scale
    textContext.shadowColor = 'rgba(255,0,40,0.58)'
    textContext.fillStyle = gradient
    textContext.font = `${titleSize}px "Black and White Picture", sans-serif`
    textContext.fillText('hallucinate', centerX, centerY - titleSize * 0.26)
    textContext.shadowBlur = 16 * scale
    textContext.shadowColor = 'rgba(0,230,255,0.42)'
    textContext.fillStyle = 'rgba(255,255,255,0.82)'
    textContext.font = `${subSize}px "Black and White Picture", sans-serif`
    textContext.fillText('Massively Multiplayer Online Rave', centerX, centerY + titleSize * 0.36)

    gl.bindTexture(gl.TEXTURE_2D, textTexture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  }

  function clearTarget(target: TextureTarget) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.frame)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  start()

  return { setPointer, setProgress, stop }
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
  const program = gl.createProgram()!
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource)

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'Cannot link intro effect program')
  }

  return program
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!

  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Cannot compile intro effect shader')
  }

  return shader
}

function createTarget(gl: WebGL2RenderingContext, width: number, height: number): TextureTarget {
  const texture = gl.createTexture()!
  const frame = gl.createFramebuffer()!

  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  resizeTarget(gl, { frame, texture }, width, height)

  return { frame, texture }
}

function resizeTarget(gl: WebGL2RenderingContext, target: TextureTarget, width: number, height: number) {
  gl.bindTexture(gl.TEXTURE_2D, target.texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.frame)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0)
}
