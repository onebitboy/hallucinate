import './style.css'
import assimpjs from 'assimpjs'

const outsideMotif = 'night' as 'afternoon' | 'night'

type Vec3 = [number, number, number]
const electricNavy: Vec3 = [0.0, 0.028, 0.42]
type Quat = [number, number, number, number]
type Mat4 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

type AssimpNode = {
  name: string
  transformation?: number[]
  children?: AssimpNode[]
}

type AssimpChannel = {
  name: string
  positionkeys?: [number, Vec3][]
  rotationkeys?: [number, Quat][]
  scalingkeys?: [number, Vec3][]
}

type AssimpAnimation = {
  duration?: number
  tickspersecond?: number
  channels?: AssimpChannel[]
}

type AssimpScene = {
  rootnode: AssimpNode
  meshes?: AssimpMesh[]
  animations?: AssimpAnimation[]
}

type AssimpMesh = {
  name: string
  vertices: number[]
  faces: number[][]
}

type CharacterClip = {
  duration: number
  ticksPerSecond: number
  channels: Map<string, AssimpChannel>
}

type HairMesh = {
  name: string
  points: Vec3[]
  faces: number[][]
}

type TreeMesh = {
  points: Vec3[]
  faces: number[][]
  color: Vec3
}

type VideoZone = 'inside' | 'outside'

type YouTubePlayer = {
  cueVideoById(options: { videoId: string; startSeconds: number }): void
  getCurrentTime(): number
  loadVideoById(options: { videoId: string; startSeconds: number }): void
  pauseVideo(): void
  playVideo(): void
}

type YouTubeConstructor = new(
  element: HTMLElement,
  options: {
    events: { onReady: () => void }
    playerVars: Record<string, number>
  },
) => YouTubePlayer

type YouTubeWindow = Window & {
  YT?: {
    Player: YouTubeConstructor
  }
  onYouTubeIframeAPIReady?: () => void
}

type CharacterRig = {
  root: AssimpNode
  clips: Record<CharacterMode, CharacterClip>
}

type CharacterMode = 'stand' | 'run'
type BottomMode = 'pants' | 'skirt'
type TopMode = 'shirt' | 'sleeveless' | 'skin' | 'chest'
type CharacterPart = {
  from: string
  to: string
  width: number
  depth: number
  color: Vec3
  glow?: number
  start?: number
  end?: number
  top?: 'torso' | 'sleeve'
  armOffset?: number
  lift?: number
  bottom?: true
}

type PlayerStyle = {
  topStyleIndex: number
  bottomStyleIndex: number
  hairIndex: number
  hairColorIndex: number
}

type PlayerDestination = {
  position: Vec3
  lookAt?: Vec3
}

type Player = {
  position: Vec3
  turn: number
  motionBlend: number
  input: Vec3
  nextDecision: number
  destination: PlayerDestination
  style: PlayerStyle
  seed: number
}

type SampledPose = {
  stand: Map<string, Vec3>
  run: Map<string, Vec3>
}

type StrobeLight = {
  id: number
  x: number
  z: number
  zone: VideoZone
  top: number
  floor: number
  color: Vec3
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

type StrobeReflectionLight = {
  light: StrobeLight
  target: Vec3
}

type Vertex = [
  x: number,
  y: number,
  z: number,
  r: number,
  g: number,
  b: number,
  glow: number,
  strobe: number,
  u: number,
  v: number,
  haze: number,
]

type Target = {
  frame: WebGLFramebuffer
  color: WebGLTexture
  depth: WebGLRenderbuffer
  width: number
  height: number
}

type Bounds = {
  x: number
  z: number
  width: number
  depth: number
}

type CircleBounds = {
  x: number
  z: number
  radius: number
}

type HairRenderMesh = {
  array: WebGLVertexArrayObject
  vertexBuffer: WebGLBuffer
  instanceBuffer: WebGLBuffer
  vertexCount: number
  instanceCount: number
}

type HairInstance = {
  meshIndex: number
  center: Vec3
  side: Vec3
  up: Vec3
  forward: Vec3
  color: Vec3
}

type ClubGlobal = typeof globalThis & {
  clubFrameId?: number
  clubCharacterRigLoad?: Promise<CharacterRig>
}

const clubGlobal = globalThis as ClubGlobal

if (clubGlobal.clubFrameId !== undefined) {
  cancelAnimationFrame(clubGlobal.clubFrameId)
}

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const djVideo = document.querySelector<HTMLElement>('#dj-video')!
const djVideoLayers: Record<VideoZone, HTMLElement> = {
  inside: document.createElement('div'),
  outside: document.createElement('div'),
}
const djVideoMounts: Record<VideoZone, HTMLElement> = {
  inside: document.createElement('div'),
  outside: document.createElement('div'),
}
const chatForm = document.querySelector<HTMLFormElement>('#chat-form')!
const chatInput = document.querySelector<HTMLInputElement>('#chat-input')!
const chatBubble = document.querySelector<HTMLDivElement>('#chat-bubble')!

if (!canvas) {
  throw new Error('Missing scene canvas')
}

if (!djVideo) {
  throw new Error('Missing DJ video element')
}

for (const zone of videoZones()) {
  const layer = djVideoLayers[zone]
  const mount = djVideoMounts[zone]

  layer.style.position = 'absolute'
  layer.style.inset = '0'
  layer.style.width = '100%'
  layer.style.height = '100%'
  layer.style.opacity = '0'
  layer.style.pointerEvents = 'none'
  mount.style.width = '100%'
  mount.style.height = '100%'
  layer.append(mount)
  djVideo.append(layer)
}

if (!chatForm || !chatInput || !chatBubble) {
  throw new Error('Missing chat elements')
}

const gl = canvas.getContext('webgl2', {
  antialias: false,
  alpha: false,
})!

if (!gl) {
  throw new Error('WebGL2 is not available')
}

const vertex = `#version 300 es
precision highp float;

layout(location = 0) in vec3 position;
layout(location = 1) in vec3 color;
layout(location = 2) in float glow;
layout(location = 3) in float strobe;
layout(location = 4) in vec2 pattern;
layout(location = 5) in float haze;

uniform vec2 resolution;
uniform vec3 cameraEye;
uniform vec3 cameraCenter;

out vec3 shade;
out float light;
out vec2 patternUv;
out float hazeAmount;
out vec3 worldPosition;
flat out float strobeId;

mat4 perspective(float fov, float aspect, float near, float far) {
  float f = 1.0 / tan(fov * 0.5);

  return mat4(
    f / aspect, 0.0, 0.0, 0.0,
    0.0, f, 0.0, 0.0,
    0.0, 0.0, (far + near) / (near - far), -1.0,
    0.0, 0.0, (2.0 * far * near) / (near - far), 0.0
  );
}

mat4 lookAt(vec3 eye, vec3 center, vec3 up) {
  vec3 z = normalize(eye - center);
  vec3 x = normalize(cross(up, z));
  vec3 y = cross(z, x);

  return mat4(
    x.x, y.x, z.x, 0.0,
    x.y, y.y, z.y, 0.0,
    x.z, y.z, z.z, 0.0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1.0
  );
}

void main() {
  mat4 camera = lookAt(cameraEye, cameraCenter, vec3(0.0, 1.0, 0.0));
  mat4 projection = perspective(1.08, resolution.x / resolution.y, 0.1, 180.0);
  vec4 view = camera * vec4(position, 1.0);

  gl_Position = projection * view;
  shade = color;
  light = glow;
  patternUv = pattern;
  hazeAmount = haze;
  worldPosition = position;
  strobeId = strobe;
}
`

const fragment = `#version 300 es
precision highp float;

uniform float time;
uniform vec3 cameraEye;
uniform int renderZone;
uniform sampler2D treeShadowMap;

in vec3 shade;
in float light;
in vec2 patternUv;
in float hazeAmount;
in vec3 worldPosition;
flat in float strobeId;

out vec4 pixel;

bool sceneVisible() {
  bool outsidePoint = worldPosition.x < -7.05 || worldPosition.x > 7.05 || worldPosition.z < -24.05 || worldPosition.z > 4.05;
  bool shell = (
    abs(worldPosition.z - 4.0) < 0.18
    || abs(worldPosition.z + 24.0) < 0.18
    || abs(worldPosition.x - 7.0) < 0.18
    || abs(worldPosition.x + 7.0) < 0.18
  ) && worldPosition.y > -2.15 && worldPosition.y < 5.15;
  bool door = abs(worldPosition.z - 4.0) < 0.22
    && worldPosition.x > -5.75 && worldPosition.x < -3.75
    && worldPosition.y > -2.15 && worldPosition.y < 0.75;

  if (renderZone == 0) {
    return !outsidePoint || door;
  }

  return outsidePoint || (shell && light < 0.12) || door;
}

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 curve = local * local * (3.0 - 2.0 * local);
  float a = hash(cell);
  float b = hash(cell + vec2(1.0, 0.0));
  float c = hash(cell + vec2(0.0, 1.0));
  float d = hash(cell + vec2(1.0, 1.0));

  return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y);
}

vec3 grassColor() {
  vec2 field = worldPosition.xz * 0.11;
  vec2 shadowUv = vec2(
    (worldPosition.x + 72.0) / 144.0,
    (worldPosition.z + 84.0) / 172.0
  );
  float cameraDistance = length(worldPosition.xz - cameraEye.xz);
  float detail = noise(worldPosition.xz * 2.6) * 0.10 + noise(worldPosition.xz * 0.55) * 0.16;
  float band = sin(field.x * 2.7 + noise(field * 2.0) * 2.4) * 0.5 + 0.5;
  float hill = smoothstep(0.22, 0.92, noise(field + vec2(4.0, 9.0)) * 0.7 + band * 0.3);
  float far = smoothstep(10.0, 55.0, cameraDistance);
  float horizon = smoothstep(34.0, 60.0, cameraDistance);
  float shadow = texture(treeShadowMap, shadowUv).a;
  vec3 closeGrass = shade * (0.82 + detail);
  vec3 distantGrass = mix(vec3(${outsideMotif === 'night' ? '0.008, 0.055, 0.025' : '0.035, 0.20, 0.055'}), vec3(${
  outsideMotif === 'night' ? '0.025, 0.13, 0.055' : '0.08, 0.34, 0.095'
}), hill);
  vec3 hillGrass = mix(vec3(${outsideMotif === 'night' ? '0.004, 0.035, 0.018' : '0.018, 0.12, 0.035'}), vec3(${
  outsideMotif === 'night' ? '0.018, 0.095, 0.04' : '0.065, 0.25, 0.06'
}), hill);
  vec3 grass = mix(mix(closeGrass, distantGrass, far), hillGrass, horizon * 0.55);

  return grass * ${outsideMotif === 'night' ? '0.45' : '1.0'} * mix(1.0, ${
  outsideMotif === 'night' ? '1.0' : '0.25'
}, shadow);
}

void main() {
  if (!sceneVisible()) {
    discard;
  }

  float white = step(0.3, min(shade.r, min(shade.g, shade.b)));
  float random = fract(sin(strobeId * 17.13 + time * 9.27) * 43758.5453);
  float strobe = mix(1.0, step(0.82, random), white);
  float receiverShadow = texture(treeShadowMap, patternUv).a;

  if (hazeAmount > 4.5) {
    if (receiverShadow < 0.01) {
      discard;
    }

    pixel = vec4(vec3(0.002, 0.018, 0.004), receiverShadow * 0.42);
    return;
  }

  vec3 base = hazeAmount > 1.5 ? grassColor() : shade;
  vec3 emissive = shade * light * 2.2 * strobe;
  float alpha = hazeAmount > 3.5 ? 0.34 : 1.0;

  pixel = vec4(base + emissive, alpha);
}
`

const lightFragment = `#version 300 es
precision highp float;

uniform float time;
uniform sampler2D smokeMap;
uniform int renderZone;

in vec3 shade;
in float light;
in vec2 patternUv;
in float hazeAmount;
in vec3 worldPosition;
flat in float strobeId;

out vec4 pixel;

bool sceneVisible() {
  bool outsidePoint = worldPosition.x < -7.05 || worldPosition.x > 7.05 || worldPosition.z < -24.05 || worldPosition.z > 4.05;
  bool door = abs(worldPosition.z - 4.0) < 0.22
    && worldPosition.x > -5.75 && worldPosition.x < -3.75
    && worldPosition.y > -2.15 && worldPosition.y < 0.75;

  return renderZone == 0 ? (!outsidePoint || door) : (outsidePoint || door);
}

float smokeDensity(vec2 uv) {
  vec2 drift = vec2(strobeId * 0.173, time * 0.0018);
  float cloud = texture(smokeMap, uv * vec2(1.0, 1.75) + drift).r;
  float detail = texture(smokeMap, uv * vec2(2.7, 4.8) + drift * 0.37 + vec2(0.31, 0.17)).r;
  float smoke = smoothstep(0.28, 0.74, cloud * 0.78 + detail * 0.22);
  float body = smoothstep(0.03, 0.18, uv.y) * (1.0 - smoothstep(0.94, 1.0, uv.y));

  return (0.26 + smoke * 0.9) * body;
}

void main() {
  if (!sceneVisible()) {
    discard;
  }

  float white = step(0.3, min(shade.r, min(shade.g, shade.b)));
  float red = step(0.45, shade.r) * (1.0 - step(0.14, shade.g)) * (1.0 - step(0.1, shade.b));
  float random = fract(sin(strobeId * 17.13 + time * 9.27) * 43758.5453);
  float redRandom = fract(sin(strobeId * 31.7 + floor(time / 90.0) * 13.11) * 43758.5453);
  float redControlled = red * step(0.5, strobeId);
  float redGate = step(0.28, redRandom);
  float beam = step(0.5, hazeAmount);
  float beamGate = step(0.56, random);
  float strobe = mix(1.0, step(0.82, random), white) * mix(1.0, redGate, redControlled) * mix(1.0, beamGate, beam);
  float density = 1.0;

  if (hazeAmount > 0.5) {
    density = smokeDensity(patternUv);
  }

  pixel = vec4(shade + shade * light * 2.2 * strobe * density, clamp(light * strobe * density, 0.0, 1.0));
}
`

const hairVertex = `#version 300 es
precision highp float;

layout(location = 0) in vec3 localPosition;
layout(location = 1) in vec3 instanceCenter;
layout(location = 2) in vec3 instanceSide;
layout(location = 3) in vec3 instanceUp;
layout(location = 4) in vec3 instanceForward;
layout(location = 5) in vec3 instanceColor;

uniform vec2 resolution;
uniform vec3 cameraEye;
uniform vec3 cameraCenter;

out vec3 shade;
out vec3 worldPosition;

mat4 perspective(float fov, float aspect, float near, float far) {
  float f = 1.0 / tan(fov * 0.5);

  return mat4(
    f / aspect, 0.0, 0.0, 0.0,
    0.0, f, 0.0, 0.0,
    0.0, 0.0, (far + near) / (near - far), -1.0,
    0.0, 0.0, (2.0 * far * near) / (near - far), 0.0
  );
}

mat4 lookAt(vec3 eye, vec3 center, vec3 up) {
  vec3 z = normalize(eye - center);
  vec3 x = normalize(cross(up, z));
  vec3 y = cross(z, x);

  return mat4(
    x.x, y.x, z.x, 0.0,
    x.y, y.y, z.y, 0.0,
    x.z, y.z, z.z, 0.0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1.0
  );
}

void main() {
  vec3 position = instanceCenter
    + instanceSide * localPosition.x
    + instanceUp * localPosition.y
    + instanceForward * localPosition.z;
  mat4 camera = lookAt(cameraEye, cameraCenter, vec3(0.0, 1.0, 0.0));
  mat4 projection = perspective(1.08, resolution.x / resolution.y, 0.1, 180.0);

  gl_Position = projection * camera * vec4(position, 1.0);
  shade = instanceColor;
  worldPosition = position;
}
`

const hairFragment = `#version 300 es
precision highp float;

uniform int renderZone;

in vec3 shade;
in vec3 worldPosition;

out vec4 pixel;

bool sceneVisible() {
  bool outsidePoint = worldPosition.x < -7.05 || worldPosition.x > 7.05 || worldPosition.z < -24.05 || worldPosition.z > 4.05;
  bool door = abs(worldPosition.z - 4.0) < 0.22
    && worldPosition.x > -5.75 && worldPosition.x < -3.75
    && worldPosition.y > -2.15 && worldPosition.y < 0.75;

  return renderZone == 0 ? (!outsidePoint || door) : (outsidePoint || door);
}

void main() {
  if (!sceneVisible()) {
    discard;
  }

  pixel = vec4(shade, 1.0);
}
`

const smokeVertex = `#version 300 es
precision highp float;

layout(location = 0) in vec3 center;
layout(location = 1) in vec3 offset;
layout(location = 3) in float seed;
layout(location = 4) in vec2 pattern;

uniform float time;
uniform vec2 resolution;
uniform vec3 cameraEye;
uniform vec3 cameraCenter;

out vec2 patternUv;
out vec2 localUv;
out float opacity;
out float patchSeed;

mat4 perspective(float fov, float aspect, float near, float far) {
  float f = 1.0 / tan(fov * 0.5);

  return mat4(
    f / aspect, 0.0, 0.0, 0.0,
    0.0, f, 0.0, 0.0,
    0.0, 0.0, (far + near) / (near - far), -1.0,
    0.0, 0.0, (2.0 * far * near) / (near - far), 0.0
  );
}

mat4 lookAt(vec3 eye, vec3 center, vec3 up) {
  vec3 z = normalize(eye - center);
  vec3 x = normalize(cross(up, z));
  vec3 y = cross(z, x);

  return mat4(
    x.x, y.x, z.x, 0.0,
    x.y, y.y, z.y, 0.0,
    x.z, y.z, z.z, 0.0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1.0
  );
}

void main() {
  vec3 viewForward = normalize(cameraCenter - cameraEye);
  vec3 right = normalize(cross(viewForward, vec3(0.0, 1.0, 0.0)));
  vec3 up = normalize(cross(right, viewForward));
  float cycle = fract(time * 0.018 + seed * 0.137 + center.y * 0.19);
  float fade = smoothstep(0.0, 0.18, cycle) * (1.0 - smoothstep(0.78, 1.0, cycle));
  vec2 drift = vec2(sin(seed * 2.41), cos(seed * 3.17));
  vec3 place = center;

  place.y = -1.45 + pow(cycle, 1.45) * 4.8;
  place.x += drift.x * (cycle - 0.5) * 1.45 + sin(time * 0.11 + seed * 6.1) * 0.22;
  place.z += drift.y * (cycle - 0.5) * 1.9 + cos(time * 0.09 + seed * 4.7) * 0.28;

  mat4 camera = lookAt(cameraEye, cameraCenter, vec3(0.0, 1.0, 0.0));
  mat4 projection = perspective(1.08, resolution.x / resolution.y, 0.1, 180.0);
  vec3 position = place + right * offset.x + up * offset.y;

  gl_Position = projection * camera * vec4(position, 1.0);
  localUv = pattern;
  patternUv = pattern + vec2(seed * 0.071 + time * 0.012, time * 0.026);
  opacity = offset.z * fade;
  patchSeed = seed;
}
`

const smokeFragment = `#version 300 es
precision highp float;

uniform float time;
uniform sampler2D smokeMap;

in vec2 patternUv;
in vec2 localUv;
in float opacity;
in float patchSeed;

out vec4 pixel;

void main() {
  float swirl = time * 0.42 + patchSeed * 1.71;
  vec2 local = localUv - 0.5;
  vec2 warp = vec2(
    sin(local.y * 9.0 + swirl) * 0.11 + sin(local.x * 5.0 - swirl * 0.7) * 0.06,
    cos(local.x * 8.0 - swirl * 0.83) * 0.1 + sin(local.y * 6.0 + swirl * 0.51) * 0.06
  );
  vec2 uv = patternUv + warp;
  float edgeNoise = texture(smokeMap, uv * vec2(1.9, 1.3) + vec2(time * 0.018, patchSeed * 0.013)).r;
  float radius = 0.38 + (edgeNoise - 0.5) * 0.18;
  float edge = 1.0 - smoothstep(radius * 0.55, radius, length(local + warp * 0.32));
  float cloudA = texture(smokeMap, uv * vec2(1.5, 1.1)).r;
  float cloudB = texture(smokeMap, uv * vec2(3.6, 2.4) + vec2(patchSeed * 0.037, -time * 0.031)).r;
  float cloud = cloudA * 0.7 + cloudB * 0.3;
  float body = (0.22 + smoothstep(0.16, 0.72, cloud) * 0.78) * edge;
  float alpha = body * opacity;

  pixel = vec4(vec3(0.58, 0.55, 0.5), alpha);
}
`

const postVertex = `#version 300 es
precision highp float;

layout(location = 0) in vec2 position;

out vec2 uv;

void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const postFragment = `#version 300 es
precision highp float;

uniform sampler2D scene;
uniform sampler2D bloom;
uniform vec2 bloomResolution;

in vec2 uv;

out vec4 pixel;

vec3 bright(vec4 texel) {
  float redGlow = texel.a * smoothstep(0.58, 1.0, texel.r);
  float blueGlow = texel.a * smoothstep(0.045, 0.24, texel.b) * step(texel.r * 1.4, texel.b);

  return redGlow * vec3(1.0, 0.035, 0.012) + blueGlow * vec3(0.0, 0.067, 1.0);
}

vec3 afternoonSky(vec2 point) {
  vec3 horizon = vec3(0.96, 0.36, 0.2);
  vec3 peach = vec3(0.9, 0.54, 0.34);
  vec3 blue = vec3(0.28, 0.52, 0.86);
  float lift = smoothstep(0.28, 0.92, point.y);
  float warmth = 1.0 - smoothstep(0.18, 0.55, point.y);

  return mix(mix(peach, blue, lift), horizon, warmth * 0.72);
}

vec3 nightSky(vec2 point) {
  float starCell = 150.0;
  vec2 cell = floor(point * vec2(starCell, starCell * 0.62));
  vec2 local = fract(point * vec2(starCell, starCell * 0.62)) - 0.5;
  float seed = fract(sin(dot(cell, vec2(41.7, 289.3))) * 37158.5453);
  float star = step(0.985, seed) * smoothstep(0.055, 0.0, length(local));
  vec3 low = vec3(0.015, 0.01, 0.035);
  vec3 high = vec3(0.0, 0.0, 0.012);

  return mix(low, high, smoothstep(0.0, 1.0, point.y)) + vec3(star);
}

void main() {
  vec4 source = texture(scene, uv);
  vec3 base = source.rgb;
  float sky = 1.0 - smoothstep(0.02, 0.12, distance(base, vec3(0.28, 0.55, 0.92)));
  vec2 texel = 1.0 / bloomResolution;
  vec2 near = texel * 3.2;
  vec2 far = texel * 7.0;
  vec3 glow = bright(texture(bloom, uv)) * 0.72;

  base = mix(base, ${outsideMotif === 'night' ? 'nightSky(uv)' : 'afternoonSky(uv)'}, sky);

  glow += bright(texture(bloom, uv + vec2(near.x, 0.0))) * 0.18;
  glow += bright(texture(bloom, uv - vec2(near.x, 0.0))) * 0.18;
  glow += bright(texture(bloom, uv + vec2(0.0, near.y))) * 0.15;
  glow += bright(texture(bloom, uv - vec2(0.0, near.y))) * 0.15;
  glow += bright(texture(bloom, uv + vec2(far.x, 0.0))) * 0.09;
  glow += bright(texture(bloom, uv - vec2(far.x, 0.0))) * 0.09;
  glow += bright(texture(bloom, uv + vec2(0.0, far.y))) * 0.07;
  glow += bright(texture(bloom, uv - vec2(0.0, far.y))) * 0.07;

  vec3 color = base + glow * 4.4;
  color = vec3(1.0) - exp(-color * 1.05);
  color *= vec3(1.02, 0.98, 0.96);

  pixel = vec4(pow(color, vec3(0.9)), 1.0);
}
`

const vertices: Vertex[] = []
const lights: Vertex[] = []
const smoke: Vertex[] = []
const vertexSize = 11
let characterRig: CharacterRig | undefined
let characterHair: HairMesh | undefined
let characterHairIndex = 0
let characterHairColorIndex = 0
let characterHairMeshes: HairMesh[] = []
let hairRenderMeshes: HairRenderMesh[] = []
let hairInstances: HairInstance[] = []
let characterMode: CharacterMode = 'stand'
let characterRigLoad: Promise<CharacterRig> | undefined
let frameId = 0
const saveKey = 'club-state'
const keys = new Set<string>()
const input: Vec3 = [0, 0, 0]
const forward: Vec3 = [0, 0, 0]
const right: Vec3 = [0, 0, 0]
const direction: Vec3 = [0, 0, 0]
const characterPosition: Vec3 = [-2.2, -1.95, -6.8]
const cameraPosition: Vec3 = [-2.2, 0.15, -9.0]
const cameraTarget: Vec3 = [-2.2, -0.75, -6.8]
const djBooth: Bounds = { x: 0, z: -21.55, width: 3.6, depth: 1.24 }
const djSpeakers: Bounds[] = [
  { x: -4.16, z: -21.63, width: 0.71, depth: 0.79 },
  { x: 4.16, z: -21.63, width: 0.71, depth: 0.79 },
]
const bartenderBar: Bounds = { x: 2.25, z: 2.42, width: 5.2, depth: 0.7 }
const bartenderStools: Bounds[] = [-2.05, -1.15, -0.25, 0.65, 1.55, 2.25].map(offset => ({
  x: bartenderBar.x + offset,
  z: bartenderBar.z - 1.15,
  width: 0.34,
  depth: 0.34,
}))
const outsideDjBooth: Bounds = { x: 0, z: 29, width: 3.6, depth: 1.24 }
const outsideDjSpeakers: Bounds[] = [
  { x: -4.16, z: 29.08, width: 0.71, depth: 0.79 },
  { x: 4.16, z: 29.08, width: 0.71, depth: 0.79 },
]
const djVideoWall = { x: 0, y: .25, z: -23.96, width: 5.5, height: 3.0625, normal: [0, 0, 1] as Vec3 }
const outsideVideoWall = { x: 0, y: .25, z: 31.41, width: 5.5, height: 3.0625, normal: [0, 0, -1] as Vec3 }
const videoTracks: Record<VideoZone, string> = {
  inside: '0oB97YhEukw',
  outside: 'HIn1BxT38mE',
}
const videoTimes: Record<VideoZone, number> = {
  inside: 0,
  outside: 0,
}
const backDoor = { x: -4.75, z: 4, width: 1.45, height: 2.55 }
const roomBounds = { left: -7, right: 7, back: -24, front: 4 }
const outsideBounds = { left: -24, right: 24, back: -32, front: 34 }
const landscapeBounds = { left: -72, right: 72, back: -84, front: 88 }
let outsideTree: CircleBounds = { x: 0, z: 20.5, radius: 0.75 }
let cameraTurn = 0
let cameraDragX = 0
let cameraDragY = 0
let cameraPitch = 0
let cameraDragging = false
let cameraReturning = false
let characterTurn = 0
let characterMotionBlend = 0
let floorY = -1.95
let velocityY = 0
let lastStamp = 0
let saveTime = 0
let chatHideAt = 0
const videoPlayers: Partial<Record<VideoZone, YouTubePlayer>> = {}
const videoPlayersReady: Partial<Record<VideoZone, boolean>> = {}
let videoZone: VideoZone = isOutside(characterPosition) ? 'outside' : 'inside'

addRoom(vertices)
addWallStrips(lights)
addRoomSmoke(smoke)

let points = new Float32Array(vertices.flat())
let lightPoints = new Float32Array(lights.flat())
const smokePoints = new Float32Array(smoke.flat())
const program = createProgram(gl, vertex, fragment)
const lightProgram = createProgram(gl, vertex, lightFragment)
const hairProgram = createProgram(gl, hairVertex, hairFragment)
const smokeProgram = createProgram(gl, smokeVertex, smokeFragment)
const postProgram = createProgram(gl, postVertex, postFragment)
const smokeMap = createSmokeMap(gl)
const treeShadowMap = createTreeShadowMap(gl)
const resolution = gl.getUniformLocation(program, 'resolution')
const cameraEye = gl.getUniformLocation(program, 'cameraEye')
const cameraCenter = gl.getUniformLocation(program, 'cameraCenter')
const renderZone = gl.getUniformLocation(program, 'renderZone')
const treeShadowSampler = gl.getUniformLocation(program, 'treeShadowMap')
const lightTime = gl.getUniformLocation(lightProgram, 'time')
const lightSmokeMap = gl.getUniformLocation(lightProgram, 'smokeMap')
const lightRenderZone = gl.getUniformLocation(lightProgram, 'renderZone')
const lightResolution = gl.getUniformLocation(lightProgram, 'resolution')
const lightCameraEye = gl.getUniformLocation(lightProgram, 'cameraEye')
const lightCameraCenter = gl.getUniformLocation(lightProgram, 'cameraCenter')
const hairResolution = gl.getUniformLocation(hairProgram, 'resolution')
const hairCameraEye = gl.getUniformLocation(hairProgram, 'cameraEye')
const hairCameraCenter = gl.getUniformLocation(hairProgram, 'cameraCenter')
const hairRenderZone = gl.getUniformLocation(hairProgram, 'renderZone')
const roomSmokeTime = gl.getUniformLocation(smokeProgram, 'time')
const roomSmokeMap = gl.getUniformLocation(smokeProgram, 'smokeMap')
const roomSmokeResolution = gl.getUniformLocation(smokeProgram, 'resolution')
const roomSmokeCameraEye = gl.getUniformLocation(smokeProgram, 'cameraEye')
const roomSmokeCameraCenter = gl.getUniformLocation(smokeProgram, 'cameraCenter')
const postScene = gl.getUniformLocation(postProgram, 'scene')
const postBloom = gl.getUniformLocation(postProgram, 'bloom')
const postBloomResolution = gl.getUniformLocation(postProgram, 'bloomResolution')
const array = gl.createVertexArray()
const buffer = gl.createBuffer()
const lightArray = gl.createVertexArray()
const lightBuffer = gl.createBuffer()
const smokeArray = gl.createVertexArray()
const smokeBuffer = gl.createBuffer()
const characterArray = gl.createVertexArray()
const characterBuffer = gl.createBuffer()
const postArray = gl.createVertexArray()
const postBuffer = gl.createBuffer()
const target = createTarget(gl, 1, 1)
const bloomTarget = createTarget(gl, 1, 1)
const stride = vertexSize * Float32Array.BYTES_PER_ELEMENT

if (!resolution || !cameraEye || !cameraCenter || !renderZone || !treeShadowSampler || !lightTime || !lightSmokeMap
  || !lightRenderZone || !lightResolution || !lightCameraEye || !lightCameraCenter || !hairResolution || !hairCameraEye
  || !hairCameraCenter || !hairRenderZone || !roomSmokeTime || !roomSmokeMap || !roomSmokeResolution
  || !roomSmokeCameraEye || !roomSmokeCameraCenter || !postScene || !postBloom || !postBloomResolution || !array
  || !buffer || !lightArray || !lightBuffer || !smokeArray || !smokeBuffer || !characterArray || !characterBuffer
  || !postArray || !postBuffer)
{
  throw new Error('Failed to initialize WebGL resources')
}

gl.bindVertexArray(array)
gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
gl.enableVertexAttribArray(1)
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(2)
gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(3)
gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(4)
gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 8 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(5)
gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 10 * Float32Array.BYTES_PER_ELEMENT)
gl.bindVertexArray(null)

function refreshRoomBuffer() {
  points = new Float32Array(vertices.flat())
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW)
}

gl.bindVertexArray(lightArray)
gl.bindBuffer(gl.ARRAY_BUFFER, lightBuffer)
gl.bufferData(gl.ARRAY_BUFFER, lightPoints, gl.DYNAMIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
gl.enableVertexAttribArray(1)
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(2)
gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(3)
gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(4)
gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 8 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(5)
gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 10 * Float32Array.BYTES_PER_ELEMENT)
gl.bindVertexArray(null)

gl.bindVertexArray(smokeArray)
gl.bindBuffer(gl.ARRAY_BUFFER, smokeBuffer)
gl.bufferData(gl.ARRAY_BUFFER, smokePoints, gl.STATIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
gl.enableVertexAttribArray(1)
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(2)
gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(3)
gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(4)
gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 8 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(5)
gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 10 * Float32Array.BYTES_PER_ELEMENT)
gl.bindVertexArray(null)

gl.bindVertexArray(characterArray)
gl.bindBuffer(gl.ARRAY_BUFFER, characterBuffer)
gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0)
gl.enableVertexAttribArray(1)
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(2)
gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(3)
gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(4)
gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 8 * Float32Array.BYTES_PER_ELEMENT)
gl.enableVertexAttribArray(5)
gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 10 * Float32Array.BYTES_PER_ELEMENT)
gl.bindVertexArray(null)

gl.bindVertexArray(postArray)
gl.bindBuffer(gl.ARRAY_BUFFER, postBuffer)
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
gl.enableVertexAttribArray(0)
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
gl.bindVertexArray(null)

gl.enable(gl.DEPTH_TEST)
gl.clearColor(0.01, 0.01, 0.014, 1.0)
canvas.style.touchAction = 'none'

canvas.addEventListener('pointerdown', event => {
  cameraDragging = true
  cameraReturning = false
  cameraDragX = event.clientX
  cameraDragY = event.clientY
  canvas.setPointerCapture(event.pointerId)
})

canvas.addEventListener('pointermove', event => {
  if (cameraDragging) {
    cameraTurn -= (event.clientX - cameraDragX) * 0.005
    cameraPitch = clamp(cameraPitch + (event.clientY - cameraDragY) * 0.018, -2.4, 4.2)
    cameraDragX = event.clientX
    cameraDragY = event.clientY
  }
})

canvas.addEventListener('pointerup', event => {
  cameraDragging = false
  canvas.releasePointerCapture(event.pointerId)
})

canvas.addEventListener('pointercancel', event => {
  cameraDragging = false
  canvas.releasePointerCapture(event.pointerId)
})

addEventListener('keydown', event => {
  if (document.activeElement === chatInput) {
    return
  }

  if (event.code === 'Space') {
    event.preventDefault()
    openChatInput()
    return
  }

  if (event.key.toLowerCase() === 'q') {
    cycleHair(-1)
    return
  }

  if (event.key.toLowerCase() === 'w') {
    cycleHair(1)
    return
  }

  if (event.key === '1') {
    cycleHairColor(-1)
    return
  }

  if (event.key === '2') {
    cycleHairColor(1)
    return
  }

  if (event.key.toLowerCase() === 'a') {
    cycleShirt(-1)
    return
  }

  if (event.key.toLowerCase() === 's') {
    cycleShirt(1)
    return
  }

  if (event.key.toLowerCase() === 'z') {
    cyclePants(-1)
    return
  }

  if (event.key.toLowerCase() === 'x') {
    cyclePants(1)
    return
  }

  keys.add(event.key.toLowerCase())
})

addEventListener('keyup', event => {
  keys.delete(event.key.toLowerCase())
})

chatForm.addEventListener('submit', event => {
  event.preventDefault()
  submitChatInput()
})

const resize = () => {
  const ratio = window.devicePixelRatio
  const width = Math.floor(canvas.clientWidth * ratio)
  const height = Math.floor(canvas.clientHeight * ratio)

  canvas.width = width
  canvas.height = height
  resizeTarget(gl, target, width, height)
  resizeTarget(gl, bloomTarget, Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)))
  gl.viewport(0, 0, width, height)
}

const draw = (stamp: number) => {
  const delta = lastStamp === 0 ? 0 : Math.min((stamp - lastStamp) / 1000, 0.05)
  const frame = Math.floor(stamp / 16.6667)

  lightFrame = frame
  lastStamp = stamp
  resize()
  updateCharacter(delta)
  updatePlayers(delta, stamp * 0.001)
  updateCamera(delta)
  updateSave(delta)
  const camera = getCamera()
  const lightCount = updateLightBuffer(stamp * 0.001)

  updateDjVideo(camera)
  updateChatOverlay(camera, stamp)

  const outside = isOutside(characterPosition)
  const sky = usesSkyBackground(camera)

  gl.bindFramebuffer(gl.FRAMEBUFFER, target.frame)
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.enable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)
  gl.clearColor(sky ? 0.28 : 0.01, sky ? 0.55 : 0.01, sky ? 0.92 : 0.014, 0.0)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  gl.useProgram(program)
  gl.uniform2f(resolution, canvas.width, canvas.height)
  gl.uniform3f(cameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(cameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.uniform1i(renderZone, outside ? 1 : 0)
  gl.activeTexture(gl.TEXTURE4)
  gl.bindTexture(gl.TEXTURE_2D, treeShadowMap)
  gl.uniform1i(treeShadowSampler, 4)
  gl.bindVertexArray(array)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.enable(gl.POLYGON_OFFSET_FILL)
  gl.polygonOffset(1, 1)
  gl.drawArrays(gl.TRIANGLES, 0, points.length / vertexSize)
  gl.disable(gl.POLYGON_OFFSET_FILL)
  gl.disable(gl.BLEND)
  const characterCount = updateCharacterMesh(stamp * 0.001)

  if (characterCount > 0) {
    gl.bindVertexArray(characterArray)
    gl.drawArrays(gl.TRIANGLES, 0, characterCount)
  }
  drawNpcHair(camera, canvas.width, canvas.height, outside)

  drawRoomDepth(camera, canvas.width, canvas.height, outside)
  gl.enable(gl.BLEND)
  gl.depthMask(false)
  if (!outside) {
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    useRoomSmokeProgram(camera, canvas.width, canvas.height, stamp * 0.001)
    gl.bindVertexArray(smokeArray)
    gl.drawArrays(gl.TRIANGLES, 0, smokePoints.length / vertexSize)
  }
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
  useLightProgram(camera, canvas.width, canvas.height, frame)
  gl.bindVertexArray(lightArray)
  gl.drawArrays(gl.TRIANGLES, 0, lightCount)
  gl.depthMask(true)
  gl.disable(gl.BLEND)

  gl.bindFramebuffer(gl.FRAMEBUFFER, bloomTarget.frame)
  gl.viewport(0, 0, bloomTarget.width, bloomTarget.height)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  gl.useProgram(program)
  gl.uniform2f(resolution, bloomTarget.width, bloomTarget.height)
  gl.uniform3f(cameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(cameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.uniform1i(renderZone, outside ? 1 : 0)
  gl.activeTexture(gl.TEXTURE4)
  gl.bindTexture(gl.TEXTURE_2D, treeShadowMap)
  gl.uniform1i(treeShadowSampler, 4)
  gl.colorMask(false, false, false, false)
  gl.bindVertexArray(array)
  gl.enable(gl.POLYGON_OFFSET_FILL)
  gl.polygonOffset(1, 1)
  gl.drawArrays(gl.TRIANGLES, 0, points.length / vertexSize)
  gl.disable(gl.POLYGON_OFFSET_FILL)

  if (characterCount > 0) {
    gl.bindVertexArray(characterArray)
    gl.drawArrays(gl.TRIANGLES, 0, characterCount)
  }
  drawNpcHair(camera, bloomTarget.width, bloomTarget.height, outside)

  drawRoomDepth(camera, bloomTarget.width, bloomTarget.height, outside)
  gl.colorMask(true, true, true, true)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
  gl.depthMask(false)
  useLightProgram(camera, bloomTarget.width, bloomTarget.height, frame)
  gl.bindVertexArray(lightArray)
  gl.drawArrays(gl.TRIANGLES, 0, lightCount)
  gl.depthMask(true)
  gl.disable(gl.BLEND)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)
  gl.clearColor(sky ? 0.28 : 0.01, sky ? 0.55 : 0.01, sky ? 0.92 : 0.014, 1.0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(postProgram)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, target.color)
  gl.uniform1i(postScene, 0)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, bloomTarget.color)
  gl.uniform1i(postBloom, 1)
  gl.uniform2f(postBloomResolution, bloomTarget.width, bloomTarget.height)
  gl.bindVertexArray(postArray)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  frameId = requestAnimationFrame(draw)
  clubGlobal.clubFrameId = frameId
}

frameId = requestAnimationFrame(draw)
clubGlobal.clubFrameId = frameId

loadCharacterRigOnce()
  .then(next => {
    characterRig = next
  })
  .catch((error: unknown) => {
    console.error(error)
  })

function loadCharacterRigOnce() {
  characterRigLoad ??= clubGlobal.clubCharacterRigLoad ??= loadCharacterRig()

  return characterRigLoad
}

import.meta.hot?.dispose(() => {
  cancelAnimationFrame(frameId)
})

function drawRoomDepth(
  camera: { eye: [number, number, number]; center: [number, number, number] },
  width: number,
  height: number,
  outside: boolean,
) {
  gl.useProgram(program)
  gl.uniform2f(resolution, width, height)
  gl.uniform3f(cameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(cameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.uniform1i(renderZone, outside ? 1 : 0)
  gl.activeTexture(gl.TEXTURE4)
  gl.bindTexture(gl.TEXTURE_2D, treeShadowMap)
  gl.uniform1i(treeShadowSampler, 4)
  gl.colorMask(false, false, false, false)
  gl.depthMask(true)
  gl.bindVertexArray(array)
  gl.drawArrays(gl.TRIANGLES, 0, points.length / vertexSize)
  gl.colorMask(true, true, true, true)
}

function useRoomSmokeProgram(
  camera: { eye: [number, number, number]; center: [number, number, number] },
  width: number,
  height: number,
  time: number,
) {
  gl.useProgram(smokeProgram)
  gl.uniform1f(roomSmokeTime, time)
  gl.uniform2f(roomSmokeResolution, width, height)
  gl.uniform3f(roomSmokeCameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(roomSmokeCameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.activeTexture(gl.TEXTURE3)
  gl.bindTexture(gl.TEXTURE_2D, smokeMap)
  gl.uniform1i(roomSmokeMap, 3)
}

function useLightProgram(
  camera: { eye: [number, number, number]; center: [number, number, number] },
  width: number,
  height: number,
  frame: number,
) {
  gl.useProgram(lightProgram)
  gl.uniform1f(lightTime, frame)
  gl.uniform1i(lightRenderZone, isOutside(characterPosition) ? 1 : 0)
  gl.uniform2f(lightResolution, width, height)
  gl.uniform3f(lightCameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(lightCameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.activeTexture(gl.TEXTURE2)
  gl.bindTexture(gl.TEXTURE_2D, smokeMap)
  gl.uniform1i(lightSmokeMap, 2)
}

function updateLightBuffer(time: number) {
  const next = [...lights]

  addCeilingBeams(next, time)
  lightPoints = new Float32Array(next.flat())
  gl.bindBuffer(gl.ARRAY_BUFFER, lightBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, lightPoints, gl.DYNAMIC_DRAW)

  return lightPoints.length / vertexSize
}

const characterBones: [string, string][] = [
  ['mixamorig:Hips', 'mixamorig:Spine'],
  ['mixamorig:Spine', 'mixamorig:Spine1'],
  ['mixamorig:Spine1', 'mixamorig:Spine2'],
  ['mixamorig:Spine2', 'mixamorig:Neck'],
  ['mixamorig:Neck', 'mixamorig:Head'],
  ['mixamorig:Head', 'mixamorig:HeadTop_End'],
  ['mixamorig:Spine2', 'mixamorig:LeftShoulder'],
  ['mixamorig:LeftShoulder', 'mixamorig:LeftArm'],
  ['mixamorig:LeftArm', 'mixamorig:LeftForeArm'],
  ['mixamorig:LeftForeArm', 'mixamorig:LeftHand'],
  ['mixamorig:Spine2', 'mixamorig:RightShoulder'],
  ['mixamorig:RightShoulder', 'mixamorig:RightArm'],
  ['mixamorig:RightArm', 'mixamorig:RightForeArm'],
  ['mixamorig:RightForeArm', 'mixamorig:RightHand'],
  ['mixamorig:Hips', 'mixamorig:LeftUpLeg'],
  ['mixamorig:LeftUpLeg', 'mixamorig:LeftLeg'],
  ['mixamorig:LeftLeg', 'mixamorig:LeftFoot'],
  ['mixamorig:LeftFoot', 'mixamorig:LeftToeBase'],
  ['mixamorig:LeftToeBase', 'mixamorig:LeftToe_End'],
  ['mixamorig:Hips', 'mixamorig:RightUpLeg'],
  ['mixamorig:RightUpLeg', 'mixamorig:RightLeg'],
  ['mixamorig:RightLeg', 'mixamorig:RightFoot'],
  ['mixamorig:RightFoot', 'mixamorig:RightToeBase'],
  ['mixamorig:RightToeBase', 'mixamorig:RightToe_End'],
]

const characterGroundJoints = [
  'mixamorig:LeftFoot',
  'mixamorig:LeftToeBase',
  'mixamorig:LeftToe_End',
  'mixamorig:RightFoot',
  'mixamorig:RightToeBase',
  'mixamorig:RightToe_End',
]
const characterScale = 0.007
const characterFloor = -1.95
const shirt: Vec3 = [0.035, 0.04, 0.052]
const shirtLight: Vec3 = [0.055, 0.07, 0.09]
const pants: Vec3 = [0.035, 0.04, 0.052]
const skin: Vec3 = [0.86, 0.58, 0.38]
const shoe: Vec3 = [0.018, 0.018, 0.02]
const jewelPalette: Vec3[] = [
  [0.018, 0.018, 0.02],
  [0.14, 0.145, 0.16],
  [0.78, 0.76, 0.72],
  [0.8, 0.03, 0.12],
  [0.05, 0.52, 0.9],
  [0.02, 0.72, 0.42],
  [0.72, 0.08, 0.92],
  [0.98, 0.72, 0.05],
  [0.0, 0.82, 0.82],
]
const hairPalette: Vec3[] = [
  [0.025, 0.018, 0.014],
  [0.18, 0.09, 0.035],
  [0.78, 0.62, 0.34],
  [0.62, 0.12, 0.035],
  [0.86, 0.84, 0.78],
  ...jewelPalette.slice(3),
]
let shirtColorIndex = 1
let topStyleIndex = 1
let topMode: TopMode = 'shirt'
let pantsColorIndex = 0
let bottomStyleIndex = 0
let bottomMode: BottomMode = 'pants'
restoreState()
videoZone = isOutside(characterPosition) ? 'outside' : 'inside'
loadYouTubePlayer()
const wallLightZ = [-2, -6, -10, -14, -18, -22]
const backLightX = [-4.5, 0, 4.5]
const strobeLights = createStrobeLights()
const players = createPlayers(100)
let lightFrame = 0
let strobeReflectionFrame = -1
let strobeReflectionLights: StrobeReflectionLight[] = []
const characterParts: CharacterPart[] = [
  { from: 'mixamorig:Hips', to: 'mixamorig:Neck', width: 0.26, depth: 0.16, color: shirtLight, start: -0.06, end: 1.02,
    top: 'torso' },
  { from: 'mixamorig:Neck', to: 'mixamorig:HeadTop_End', width: 0.17, depth: 0.16, color: skin, start: 0.02,
    end: 0.34 },
  { from: 'mixamorig:LeftArm', to: 'mixamorig:LeftForeArm', width: 0.07, depth: 0.065, color: shirt, top: 'sleeve',
    armOffset: 0.075, lift: 0.035 },
  { from: 'mixamorig:LeftForeArm', to: 'mixamorig:LeftHand', width: 0.055, depth: 0.05, color: skin, end: 1.22,
    armOffset: 0.075, lift: 0.035 },
  { from: 'mixamorig:RightArm', to: 'mixamorig:RightForeArm', width: 0.07, depth: 0.065, color: shirt, top: 'sleeve',
    armOffset: 0.075, lift: 0.035 },
  { from: 'mixamorig:RightForeArm', to: 'mixamorig:RightHand', width: 0.055, depth: 0.05, color: skin, end: 1.22,
    armOffset: 0.075, lift: 0.035 },
  { from: 'mixamorig:Hips', to: 'mixamorig:LeftUpLeg', width: 0.12, depth: 0.09, color: pants, bottom: true },
  { from: 'mixamorig:LeftUpLeg', to: 'mixamorig:LeftLeg', width: 0.1, depth: 0.085, color: pants, bottom: true },
  { from: 'mixamorig:LeftLeg', to: 'mixamorig:LeftFoot', width: 0.08, depth: 0.07, color: skin },
  { from: 'mixamorig:LeftFoot', to: 'mixamorig:LeftToe_End', width: 0.095, depth: 0.055, color: shoe, start: -0.06,
    end: 1.05 },
  { from: 'mixamorig:Hips', to: 'mixamorig:RightUpLeg', width: 0.12, depth: 0.09, color: pants, bottom: true },
  { from: 'mixamorig:RightUpLeg', to: 'mixamorig:RightLeg', width: 0.1, depth: 0.085, color: pants, bottom: true },
  { from: 'mixamorig:RightLeg', to: 'mixamorig:RightFoot', width: 0.08, depth: 0.07, color: skin },
  { from: 'mixamorig:RightFoot', to: 'mixamorig:RightToe_End', width: 0.095, depth: 0.055, color: shoe, start: -0.06,
    end: 1.05 },
]

async function loadCharacterRig(): Promise<CharacterRig> {
  const ajs = await assimpjs({
    locateFile(path) {
      return path.endsWith('.wasm') ? '/assimpjs.wasm' : path
    },
  })
  const [stand, run, manHair, womanHair] = await Promise.all([
    loadAssimpScene(ajs, '/stand.fbx', 'stand.fbx'),
    loadAssimpScene(ajs, '/run.fbx', 'run.fbx'),
    loadAssimpScene(ajs, '/man-hair.fbx', 'man-hair.fbx'),
    loadAssimpScene(ajs, '/woman-hair.fbx', 'woman-hair.fbx'),
  ])
  const rig = {
    root: stand.rootnode,
    clips: {
      stand: createCharacterClip(stand, 'stand.fbx'),
      run: createCharacterClip(run, 'run.fbx'),
    },
  }

  validateCharacterRig(rig.root)
  characterHairMeshes = [...createHairMeshes(manHair, 'man'), ...createHairMeshes(womanHair, 'woman')]
  hairRenderMeshes = createHairRenderMeshes(characterHairMeshes)
  characterHairIndex = normalizeIndex(characterHairIndex, characterHairMeshes.length + 1)
  setCharacterHair()
  logCurrentHair()
  loadOutsideTree().catch((error: unknown) => {
    console.error(error)
  })

  return rig
}

async function loadOutsideTree() {
  const ajs = await assimpjs({
    locateFile(path) {
      return path.endsWith('.wasm') ? '/assimpjs.wasm' : path
    },
  })
  const trees = await loadAssimpScene(ajs, '/trees.fbx', 'trees.fbx')

  addTreeToWorld(createTreeMeshes(trees))
}

function createTreeMeshes(scene: AssimpScene): TreeMesh[] {
  const meshes = scene.meshes!.map((mesh, index) => {
    const points: Vec3[] = []

    for (let i = 0; i < mesh.vertices.length; i += 3) {
      points.push([mesh.vertices[i]!, mesh.vertices[i + 1]!, mesh.vertices[i + 2]!])
    }

    return { points, faces: mesh.faces.filter(face => face.length === 3), color: treeMeshColor(index) }
  })

  if (meshes.length === 0) {
    throw new Error('trees.fbx has no meshes')
  }

  return normalizeTreeMeshes(meshes)
}

function normalizeTreeMeshes(meshes: TreeMesh[]): TreeMesh[] {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]

  for (const mesh of meshes) {
    for (const point of mesh.points) {
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], point[i])
        max[i] = Math.max(max[i], point[i])
      }
    }
  }

  const centerX = (min[0] + max[0]) * 0.5
  const centerZ = (min[2] + max[2]) * 0.5
  const height = max[1] - min[1]
  const amount = 12.9 / height
  const turn = Math.PI / 4
  const turnX = Math.cos(turn)
  const turnZ = Math.sin(turn)

  return meshes.map(mesh => ({
    points: mesh.points.map(point => {
      const x = (point[0] - centerX) * amount
      const y = (point[2] - centerZ) * amount
      const z = -(point[1] - min[1]) * amount

      return [
        x * turnX - z * turnZ,
        y,
        x * turnZ + z * turnX,
      ]
    }),
    faces: mesh.faces,
    color: mesh.color,
  }))
}

function treeMeshColor(index: number): Vec3 {
  if (index === 1) {
    return [0, 0, 0]
  }

  if (index === 2) {
    return [0, 1, 0]
  }

  if (index === 3) {
    return [0, 0.8, 0]
  }

  if (index === 4) {
    return [0, 0.9, 0]
  }

  return [0.38, 0.18, 0.07]
}

function addTreeToWorld(meshes: TreeMesh[]) {
  const position: Vec3 = [outsideTree.x, characterFloor + 3.7, outsideTree.z]

  setOutsideTreeCollision(meshes, position)

  if (outsideMotif !== 'night') {
    uploadTreeShadowMap(meshes, position)
    addTreeShadowReceiver(vertices)
  }

  for (const mesh of meshes) {
    for (const face of mesh.faces) {
      const a = add(position, mesh.points[face[0]!]!)
      const b = add(position, mesh.points[face[1]!]!)
      const c = add(position, mesh.points[face[2]!]!)

      if (triangleAreaSquared(a, b, c) > 0.00000001) {
        addSunLitTriangle(vertices, a, b, c, mesh.color)
      }
    }
  }

  refreshRoomBuffer()
}

function setOutsideTreeCollision(meshes: TreeMesh[], position: Vec3) {
  const trunk = meshes[1]!
  let bottom = Infinity
  let top = -Infinity
  let x = 0
  let z = 0
  let count = 0

  for (const point of trunk.points) {
    const y = position[1] + point[1]

    bottom = Math.min(bottom, y)
    top = Math.max(top, y)
  }

  for (const point of trunk.points) {
    const world = add(position, point)

    if (world[1] < bottom + (top - bottom) * 0.28) {
      x += world[0]
      z += world[2]
      count++
    }
  }

  x /= count
  z /= count

  z -= 2
  x += .25

  outsideTree = {
    x,
    z,
    radius: 0.35,
  }
  // addTreeCollisionDebug(vertices)
}

function addTreeCollisionDebug(target: Vertex[]) {
  const y = characterFloor + 0.05
  const color: Vec3 = [0, 0.85, 1]
  const left = outsideTree.x - outsideTree.radius
  const right = outsideTree.x + outsideTree.radius
  const back = outsideTree.z - outsideTree.radius
  const front = outsideTree.z + outsideTree.radius

  addQuad(target, [left, y, back], [right, y, back], [right, y, front], [left, y, front], color, 0.35)
}

function addTreeShadowReceiver(target: Vertex[]) {
  const y = characterFloor + 0.026
  const color: Vec3 = [0, 0, 0]
  const a: Vec3 = [landscapeBounds.left, y, landscapeBounds.front]
  const b: Vec3 = [landscapeBounds.right, y, landscapeBounds.front]
  const c: Vec3 = [landscapeBounds.right, y, landscapeBounds.back]
  const d: Vec3 = [landscapeBounds.left, y, landscapeBounds.back]

  target.push(pack(a, color, 0, 0, 0, 0, 5), pack(b, color, 0, 0, 1, 0, 5), pack(c, color, 0, 0, 1, 1, 5))
  target.push(pack(a, color, 0, 0, 0, 0, 5), pack(c, color, 0, 0, 1, 1, 5), pack(d, color, 0, 0, 0, 1, 5))
}

function clipGroundPolygonFront(points: Vec3[], front: number): Vec3[] {
  const clipped: Vec3[] = []

  for (let i = 0; i < points.length; i++) {
    const current = points[i]!
    const next = points[(i + 1) % points.length]!
    const currentInside = current[2] >= front
    const nextInside = next[2] >= front

    if (currentInside && nextInside) {
      clipped.push(next)
    }
    else if (currentInside && !nextInside) {
      clipped.push(intersectGroundFront(current, next, front))
    }
    else if (!currentInside && nextInside) {
      clipped.push(intersectGroundFront(current, next, front), next)
    }
  }

  return clipped
}

function intersectGroundFront(a: Vec3, b: Vec3, front: number): Vec3 {
  const amount = (front - a[2]) / (b[2] - a[2])

  return [
    mix(a[0], b[0], amount),
    a[1],
    front,
  ]
}

function convexGroundHull(points: Vec3[]): Vec3[] {
  const unique = [...new Map(points.map(point => [`${point[0].toFixed(2)}:${point[2].toFixed(2)}`, point])).values()]
    .sort((a, b) => a[0] === b[0] ? a[2] - b[2] : a[0] - b[0])
  const lower: Vec3[] = []
  const upper: Vec3[] = []

  for (const point of unique) {
    while (lower.length >= 2 && groundTurn(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) {
      lower.pop()
    }

    lower.push(point)
  }

  for (const point of [...unique].reverse()) {
    while (upper.length >= 2 && groundTurn(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) {
      upper.pop()
    }

    upper.push(point)
  }

  lower.pop()
  upper.pop()

  return [...lower, ...upper]
}

function groundTurn(a: Vec3, b: Vec3, c: Vec3) {
  return (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])
}

function projectTreeShadow(point: Vec3, light: Vec3, ground: number): Vec3 {
  const amount = (ground - point[1]) / light[1]

  return [
    point[0] + light[0] * amount,
    ground,
    point[2] + light[2] * amount,
  ]
}

function createHairMeshes(scene: AssimpScene, source: string): HairMesh[] {
  const meshes = scene.meshes!.filter(mesh => mesh.name.toLowerCase().includes('hair'))
    .filter((_, index) => !removedHairStyles.has(`${source}:${index}`))
    .map(mesh => createHairMesh(mesh, source))

  if (meshes.length === 0) {
    throw new Error('Hair FBX has no hair meshes')
  }

  return meshes
}

const removedHairStyles = new Set([
  'man:1',
  'man:2',
  'man:5',
  'woman:2',
])

function createHairMesh(mesh: AssimpMesh, source: string): HairMesh {
  const points: Vec3[] = []
  const turnRightSideForward = source === 'man' && mesh.name === 'Wolf3D_Hair.009'

  for (let i = 0; i < mesh.vertices.length; i += 3) {
    points.push([mesh.vertices[i]!, mesh.vertices[i + 1]!, mesh.vertices[i + 2]!])
  }

  return {
    name: `${source}:${mesh.name}`,
    points: normalizeHairPoints(points, turnRightSideForward),
    faces: mesh.faces.filter(face => face.length === 3),
  }
}

function createHairRenderMeshes(meshes: HairMesh[]) {
  return meshes.map(mesh => createHairRenderMesh(mesh))
}

function createHairRenderMesh(mesh: HairMesh): HairRenderMesh {
  const array = gl.createVertexArray()
  const vertexBuffer = gl.createBuffer()
  const instanceBuffer = gl.createBuffer()

  if (!array || !vertexBuffer || !instanceBuffer) {
    throw new Error('Failed to create hair render mesh')
  }

  const data: number[] = []

  for (const face of mesh.faces) {
    const a = hairLocalPoint(mesh.points[face[0]!]!)
    const b = hairLocalPoint(mesh.points[face[1]!]!)
    const c = hairLocalPoint(mesh.points[face[2]!]!)

    data.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
  }

  gl.bindVertexArray(array)
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW)

  for (let i = 0; i < 5; i++) {
    const location = i + 1

    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 15 * Float32Array.BYTES_PER_ELEMENT,
      i * 3 * Float32Array.BYTES_PER_ELEMENT)
    gl.vertexAttribDivisor(location, 1)
  }

  gl.bindVertexArray(null)

  return {
    array,
    vertexBuffer,
    instanceBuffer,
    vertexCount: data.length / 3,
    instanceCount: 0,
  }
}

function hairLocalPoint(point: Vec3): Vec3 {
  const scaleAmount = 1.4
  const x = point[0] * scaleAmount
  const z = -(point[2] - 0.02) * scaleAmount - 0.055
  const y = (point[1] + 0.08) * scaleAmount - Math.max(0, z) * 0.28

  return [x, y, z]
}

function updateNpcHairInstances() {
  const grouped = Array.from({ length: hairRenderMeshes.length }, () => [] as number[])

  for (const instance of hairInstances) {
    const data = grouped[instance.meshIndex]!

    data.push(
      instance.center[0], instance.center[1], instance.center[2],
      instance.side[0], instance.side[1], instance.side[2],
      instance.up[0], instance.up[1], instance.up[2],
      instance.forward[0], instance.forward[1], instance.forward[2],
      instance.color[0], instance.color[1], instance.color[2],
    )
  }

  for (let i = 0; i < hairRenderMeshes.length; i++) {
    const mesh = hairRenderMeshes[i]!
    const data = grouped[i]!

    mesh.instanceCount = data.length / 15
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instanceBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW)
  }
}

function normalizeHairPoints(points: Vec3[], turnRightSideForward: boolean): Vec3[] {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]

  for (const point of points) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], point[i])
      max[i] = Math.max(max[i], point[i])
    }
  }

  const center: Vec3 = [
    (min[0] + max[0]) * 0.5,
    (min[1] + max[1]) * 0.5,
    (min[2] + max[2]) * 0.5,
  ]
  const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2])
  const amount = Math.min(1, 0.45 / span)

  return points.map(point => {
    const next = scale(subtract(point, center), amount)

    return turnRightSideForward ? [-next[2], -next[1], next[0]] : next
  })
}

async function loadAssimpScene(
  ajs: Awaited<ReturnType<typeof assimpjs>>,
  path: string,
  name: string,
): Promise<AssimpScene> {
  const response = await fetch(path)

  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`)
  }

  const files = new ajs.FileList()

  files.AddFile(name, new Uint8Array(await response.arrayBuffer()))

  const result = ajs.ConvertFileList(files, 'assjson')

  if (!result.IsSuccess() || result.FileCount() === 0) {
    throw new Error(`Assimp failed to convert ${name}: ${result.GetErrorCode()}`)
  }

  return JSON.parse(new TextDecoder().decode(result.GetFile(0).GetContent())) as AssimpScene
}

function createCharacterClip(scene: AssimpScene, name: string): CharacterClip {
  const animation = scene.animations?.[0]

  if (!animation) {
    throw new Error(`${name} has no animation`)
  }

  return {
    duration: animation.duration ?? 1,
    ticksPerSecond: animation.tickspersecond ?? 30,
    channels: new Map((animation.channels ?? []).map(channel => [channel.name, channel])),
  }
}

function validateCharacterRig(root: AssimpNode) {
  const names = collectNodeNames(root, new Set<string>())

  for (const [from, to] of characterBones) {
    if (!names.has(from) || !names.has(to)) {
      throw new Error(`Missing skeleton bone ${from} -> ${to}`)
    }
  }
}

function collectNodeNames(node: AssimpNode, names: Set<string>) {
  names.add(node.name)

  for (const child of node.children ?? []) {
    collectNodeNames(child, names)
  }

  return names
}

function updateCharacterMesh(time: number) {
  if (!characterRig) {
    return 0
  }

  const target: Vertex[] = []
  hairInstances = []
  addRenderedCharacter(target, {
    position: characterPosition,
    turn: characterTurn,
    motionBlend: characterMotionBlend,
    style: {
      topStyleIndex,
      bottomStyleIndex,
      hairIndex: characterHairIndex,
      hairColorIndex: characterHairColorIndex,
    },
  }, time, true)

  const view = playerView()
  const npcPose = sampleBasePose(characterRig, Math.floor(time * 12) / 12)

  for (const player of players) {
    if (playerInView(player, view)) {
      addRenderedCharacter(target, player, time, false, npcPose)
    }
  }

  updateNpcHairInstances()
  const data = new Float32Array(target.flat())

  gl.bindBuffer(gl.ARRAY_BUFFER, characterBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)

  return data.length / vertexSize
}

function drawNpcHair(camera: ReturnType<typeof getCamera>, width: number, height: number, outside: boolean) {
  gl.useProgram(hairProgram)
  gl.uniform2f(hairResolution, width, height)
  gl.uniform3f(hairCameraEye, camera.eye[0], camera.eye[1], camera.eye[2])
  gl.uniform3f(hairCameraCenter, camera.center[0], camera.center[1], camera.center[2])
  gl.uniform1i(hairRenderZone, outside ? 1 : 0)

  for (const mesh of hairRenderMeshes) {
    if (mesh.instanceCount > 0) {
      gl.bindVertexArray(mesh.array)
      gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.vertexCount, mesh.instanceCount)
    }
  }

  gl.bindVertexArray(null)
}

function playerView() {
  const eye = cameraPosition
  const forward = normalize(subtract(cameraTarget, eye))
  const right = normalize(cross(forward, [0, 1, 0]))
  const up = cross(right, forward)

  return { eye, forward, right, up }
}

function playerInView(player: Player, view: ReturnType<typeof playerView>) {
  const center: Vec3 = [player.position[0], player.position[1] + 0.85, player.position[2]]
  const toPlayer = subtract(center, view.eye)
  const depth = dot(toPlayer, view.forward)
  const radius = 1.2

  if (depth < -radius || depth > 45) {
    return false
  }

  const vertical = Math.tan(1.08 / 2) * Math.max(depth, 0.1) + radius
  const horizontal = vertical * (canvas.width / canvas.height) + radius

  return Math.abs(dot(toPlayer, view.right)) < horizontal && Math.abs(dot(toPlayer, view.up)) < vertical
}

function addRenderedCharacter(
  target: Vertex[],
  player: { position: Vec3; turn: number; motionBlend: number; style: PlayerStyle },
  time: number,
  detailedHair: boolean,
  basePose?: SampledPose,
) {
  const pose = sampleCharacterPose(characterRig!, time, player, basePose)
  const style = playerStyle(player.style)

  for (const part of characterParts) {
    if (style.bottomMode === 'pants' || !part.bottom) {
      addCharacterPart(target, pose, part, player, style)
    }
  }

  if (style.bottomMode === 'skirt') {
    addCharacterSkirt(target, pose, player, style)
  }

  if (style.topMode === 'chest') {
    addCharacterChest(target, pose, player)
  }

  const hair = playerHair(player.style.hairIndex)

  if (hair && characterHairMeshes.length > 0) {
    addNpcHairInstance(pose, hair, player, style.hairColor)
  }
}

function addNpcHairInstance(pose: Map<string, Vec3>, hair: HairMesh, player: { turn: number }, color: Vec3) {
  const head = pose.get('mixamorig:Head')!
  const top = pose.get('mixamorig:HeadTop_End')!
  const up = normalize(subtract(top, head))
  const center = add(head, scale(up, -0.035))
  hairInstances.push({
    meshIndex: characterHairMeshes.indexOf(hair),
    center,
    side: [Math.cos(player.turn), 0, -Math.sin(player.turn)],
    up,
    forward: [Math.sin(player.turn), 0, Math.cos(player.turn)],
    color,
  })
}

function sampleCharacterPose(
  rig: CharacterRig,
  time: number,
  player: { position: Vec3; turn: number; motionBlend: number },
  basePose = sampleBasePose(rig, time),
) {
  const { stand, run } = basePose
  const pose = new Map<string, Vec3>()

  for (const [name, point] of stand) {
    const next = run.get(name)!

    pose.set(name, [
      mix(point[0], next[0], player.motionBlend),
      mix(point[1], next[1], player.motionBlend),
      mix(point[2], next[2], player.motionBlend),
    ])
  }

  return placeCharacterPose(pose, player.position, player.turn)
}

function sampleBasePose(rig: CharacterRig, time: number): SampledPose {
  return {
    stand: sampleClipPose(rig, rig.clips.stand, time),
    run: sampleClipPose(rig, rig.clips.run, time),
  }
}

function sampleClipPose(rig: CharacterRig, clip: CharacterClip, time: number) {
  const tick = (time * clip.ticksPerSecond) % clip.duration
  const pose = new Map<string, Vec3>()

  sampleNodePose(rig.root, identity(), clip, tick, pose)

  return pose
}

function sampleNodePose(node: AssimpNode, parent: Mat4, clip: CharacterClip, tick: number, pose: Map<string, Vec3>) {
  const helper = isAssimpHelper(node)
  const channel = clip.channels.get(node.name)
  const local = channel ? sampleChannelTransform(node, channel, tick) : nodeTransform(node)
  const world = helper ? parent : multiply(parent, local)

  if (!helper) {
    pose.set(node.name, transformOrigin(world))
  }

  for (const child of node.children ?? []) {
    sampleNodePose(child, world, clip, tick, pose)
  }
}

function sampleChannelTransform(node: AssimpNode, channel: AssimpChannel, tick: number) {
  return compose(
    sampleVec3(channel.positionkeys, tick, transformOrigin(nodeTransform(node))),
    sampleQuat(channel.rotationkeys, tick, [1, 0, 0, 0]),
    sampleVec3(channel.scalingkeys, tick, [1, 1, 1]),
  )
}

function sampleVec3(keys: [number, Vec3][] | undefined, tick: number, fallback: Vec3): Vec3 {
  if (!keys?.length) {
    return fallback
  }

  if (keys.length === 1 || tick <= keys[0]![0]) {
    return [...keys[0]![1]]
  }

  for (let i = 0; i < keys.length - 1; i++) {
    const from = keys[i]!
    const to = keys[i + 1]!

    if (tick <= to[0]) {
      const t = (tick - from[0]) / (to[0] - from[0])

      return [
        mix(from[1][0], to[1][0], t),
        mix(from[1][1], to[1][1], t),
        mix(from[1][2], to[1][2], t),
      ]
    }
  }

  return [...keys[keys.length - 1]![1]]
}

function sampleQuat(keys: [number, Quat][] | undefined, tick: number, fallback: Quat): Quat {
  if (!keys?.length) {
    return fallback
  }

  if (keys.length === 1 || tick <= keys[0]![0]) {
    return normalizeQuat(keys[0]![1])
  }

  for (let i = 0; i < keys.length - 1; i++) {
    const from = keys[i]!
    const to = keys[i + 1]!

    if (tick <= to[0]) {
      return slerp(from[1], to[1], (tick - from[0]) / (to[0] - from[0]))
    }
  }

  return normalizeQuat(keys[keys.length - 1]![1])
}

function addCharacterPart(
  target: Vertex[],
  pose: Map<string, Vec3>,
  part: CharacterPart,
  player: { turn: number },
  style: ReturnType<typeof playerStyle>,
) {
  const from = pose.get(part.from)!
  const to = pose.get(part.to)!
  const start = part.start ?? 0
  const end = part.end ?? 1
  const axis = subtract(to, from)
  let a = add(from, scale(axis, start))
  let b = add(from, scale(axis, end))

  if (part.armOffset) {
    const center = scale(add(a, b), 0.5)
    const torso = pose.get('mixamorig:Spine2')!
    const side: Vec3 = [Math.cos(player.turn), 0, -Math.sin(player.turn)]
    const amount = Math.sign(dot(subtract(center, torso), side)) * part.armOffset
    const offset = scale(side, amount)

    a = add(a, offset)
    b = add(b, offset)
  }

  if (part.lift) {
    const offset: Vec3 = [0, part.lift, 0]

    a = add(a, offset)
    b = add(b, offset)
  }

  addCharacterBox(target, a, b, part.width, part.depth, characterPartColor(part, style), part.glow ?? 0.02)
}

function characterPartColor(part: CharacterPart, style: ReturnType<typeof playerStyle>) {
  if (part.top === 'torso') {
    return style.topMode === 'shirt' || style.topMode === 'sleeveless' ? style.shirtLight : skin
  }

  if (part.top === 'sleeve') {
    return style.topMode === 'shirt' ? style.shirt : skin
  }

  if (part.bottom) {
    return style.pants
  }

  if (part.color === shoe) {
    return style.shoe
  }

  return part.color
}

function addCharacterChest(target: Vertex[], pose: Map<string, Vec3>, player: { turn: number }) {
  const spine = pose.get('mixamorig:Spine2')!
  const neck = pose.get('mixamorig:Neck')!
  const center = add(spine, scale(subtract(neck, spine), 0.32))
  const side: Vec3 = [Math.cos(player.turn), 0, -Math.sin(player.turn)]
  const forward: Vec3 = [Math.sin(player.turn), 0, Math.cos(player.turn)]

  for (const offset of [-0.055, 0.055]) {
    const a = add(add(center, scale(side, offset)), scale(forward, 0.06))
    const b = add(add(center, scale(side, offset)), scale(forward, 0.13))

    addCharacterBox(target, a, b, 0.065, 0.06, skin, 0.02)
  }
}

function addCharacterSkirt(
  target: Vertex[],
  pose: Map<string, Vec3>,
  player: { turn: number },
  style: ReturnType<typeof playerStyle>,
) {
  const hips = pose.get('mixamorig:Hips')!
  const leftUp = pose.get('mixamorig:LeftUpLeg')!
  const rightUp = pose.get('mixamorig:RightUpLeg')!
  const leftLeg = pose.get('mixamorig:LeftLeg')!
  const rightLeg = pose.get('mixamorig:RightLeg')!
  const topCenter = scale(add(add(hips, leftUp), rightUp), 1 / 3)
  const bottomCenter = scale(add(leftLeg, rightLeg), 0.5)
  const side: Vec3 = [Math.cos(player.turn), 0, -Math.sin(player.turn)]
  const forward: Vec3 = [Math.sin(player.turn), 0, Math.cos(player.turn)]
  const topWidth = 0.09
  const bottomWidth = 0.15
  const topDepth = 0.11
  const bottomDepth = 0.14
  const a = add(add(topCenter, scale(side, -topWidth)), scale(forward, -topDepth))
  const b = add(add(topCenter, scale(side, topWidth)), scale(forward, -topDepth))
  const c = add(add(topCenter, scale(side, topWidth)), scale(forward, topDepth))
  const d = add(add(topCenter, scale(side, -topWidth)), scale(forward, topDepth))
  const e = add(add(bottomCenter, scale(side, -bottomWidth)), scale(forward, -bottomDepth))
  const f = add(add(bottomCenter, scale(side, bottomWidth)), scale(forward, -bottomDepth))
  const g = add(add(bottomCenter, scale(side, bottomWidth)), scale(forward, bottomDepth))
  const h = add(add(bottomCenter, scale(side, -bottomWidth)), scale(forward, bottomDepth))

  addLitQuad(target, a, b, f, e, style.pants, 0.02)
  addLitQuad(target, b, c, g, f, scale(style.pants, 0.88), 0.02)
  addLitQuad(target, c, d, h, g, scale(style.pants, 0.78), 0.02)
  addLitQuad(target, d, a, e, h, scale(style.pants, 0.88), 0.02)
  addLitQuad(target, e, f, g, h, scale(style.pants, 0.68), 0.02)
}

function addCharacterHair(target: Vertex[], pose: Map<string, Vec3>, mesh: HairMesh, player: { turn: number }, color: Vec3) {
  const head = pose.get('mixamorig:Head')!
  const top = pose.get('mixamorig:HeadTop_End')!
  const up = normalize(subtract(top, head))
  const side: Vec3 = [Math.cos(player.turn), 0, -Math.sin(player.turn)]
  const forward: Vec3 = [Math.sin(player.turn), 0, Math.cos(player.turn)]
  const center = add(head, scale(up, -0.035))

  for (const face of mesh.faces) {
    const a = hairPoint(center, side, up, forward, mesh.points[face[0]!]!)
    const b = hairPoint(center, side, up, forward, mesh.points[face[1]!]!)
    const c = hairPoint(center, side, up, forward, mesh.points[face[2]!]!)

    if (triangleAreaSquared(a, b, c) > 0.00000001) {
      addLitTriangle(target, a, b, c, color, 0)
    }
  }
}

function triangleAreaSquared(a: Vec3, b: Vec3, c: Vec3) {
  return dot(cross(subtract(c, a), subtract(b, a)), cross(subtract(c, a), subtract(b, a)))
}

function hairPoint(center: Vec3, side: Vec3, up: Vec3, forward: Vec3, point: Vec3) {
  const scaleAmount = 1.4
  const x = point[0] * scaleAmount
  const z = -(point[2] - 0.02) * scaleAmount - 0.055
  const y = (point[1] + 0.08) * scaleAmount - Math.max(0, z) * 0.28

  return add(add(add(center, scale(side, x)), scale(up, y)), scale(forward, z))
}

function addLitTriangle(target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3, glow: number) {
  const center = scale(add(add(a, b), c), 1 / 3)
  const normal = normalize(cross(subtract(c, a), subtract(b, a)))
  const shade = addLocalReflection(color, center, normal)

  target.push(pack(a, shade, glow), pack(b, shade, glow), pack(c, shade, glow))
}

function addSunLitTriangle(target: Vertex[], a: Vec3, b: Vec3, c: Vec3, color: Vec3) {
  const center = scale(add(add(a, b), c), 1 / 3)
  const normal = normalize(cross(subtract(c, a), subtract(b, a)))
  const sun = normalize(subtract([10.5, 6.8, outsideBounds.front], center))
  const diffuse = Math.abs(dot(normal, sun))
  const lift = clamp((normal[1] + 1) * 0.5, 0, 1)
  const night = outsideMotif === 'night'
  const treeLights: Vec3[] = [
    [outsideTree.x - outsideTree.radius * 2.5, characterFloor - 0.35, outsideTree.z + outsideTree.radius * 0.85],
    [outsideTree.x + outsideTree.radius * 2.5, characterFloor - 0.35, outsideTree.z + outsideTree.radius * 0.85],
    [outsideTree.x, characterFloor - 0.35, outsideTree.z - outsideTree.radius * 2.5],
  ]
  let uplight = 0

  for (const light of treeLights) {
    const toLight = subtract(light, center)
    const distance = Math.hypot(toLight[0], toLight[1], toLight[2])
    const fromLight = normalize(subtract(center, light))
    const vertical = clamp(dot(fromLight, [0, 1, 0]), 0, 1)
    const facing = clamp(dot(normal, scale(fromLight, -1)), 0, 1)
    const cone = smoothstep(0.58, 0.96, vertical)

    uplight += facing * cone * clamp(1 - distance / 8, 0, 1)
  }

  const light = 0.34 + diffuse * 0.86 + lift * 0.18
  const warmth: Vec3 = [1.1, 1.03, 0.86]
  const baseLight = night ? light * 0.22 + lift * 0.04 : light
  const blueLight = night ? uplight * 2.1 : 0
  const shade: Vec3 = [
    clamp(color[0] * baseLight * warmth[0] + blueLight * electricNavy[0], 0, 1),
    clamp(color[1] * baseLight * warmth[1] + blueLight * electricNavy[1], 0, 1),
    clamp(color[2] * baseLight * warmth[2] + blueLight * electricNavy[2], 0, 1),
  ]

  target.push(pack(a, shade, 0), pack(b, shade, 0), pack(c, shade, 0))
}

function addCharacterBox(
  target: Vertex[],
  a: Vec3,
  b: Vec3,
  width: number,
  depth: number,
  color: Vec3,
  glow: number,
  strobe = 0,
) {
  const direction = normalize(subtract(b, a))
  const vertical = Math.abs(direction[1]) > 0.82
  const side = vertical
    ? scale([Math.cos(characterTurn), 0, -Math.sin(characterTurn)], width * 0.5)
    : scale(normalize(cross(direction, [0, 1, 0])), width * 0.5)
  const up = vertical
    ? scale([Math.sin(characterTurn), 0, Math.cos(characterTurn)], depth * 0.5)
    : scale(normalize(cross(side, direction)), depth * 0.5)
  const a0 = subtract(subtract(a, side), up)
  const a1 = add(subtract(a, up), side)
  const a2 = add(add(a, side), up)
  const a3 = add(subtract(a, side), up)
  const b0 = subtract(subtract(b, side), up)
  const b1 = add(subtract(b, up), side)
  const b2 = add(add(b, side), up)
  const b3 = add(subtract(b, side), up)
  const shadeA = scale(color, 0.65)
  const shadeB = scale(color, 0.82)

  addLitQuad(target, a0, a1, b1, b0, shadeA, glow)
  addLitQuad(target, a1, a2, b2, b1, color, glow)
  addLitQuad(target, a2, a3, b3, b2, shadeB, glow)
  addLitQuad(target, a3, a0, b0, b3, shadeA, glow)
  addLitQuad(target, a3, a2, a1, a0, shadeB, glow)
  addLitQuad(target, b0, b1, b2, b3, shadeB, glow)
}

function addLitQuad(
  target: Vertex[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  color: Vec3,
  glow: number,
) {
  const center = scale(add(add(a, b), add(c, d)), 0.25)
  const normal = normalize(cross(subtract(c, a), subtract(b, a)))

  addQuad(target, a, b, c, d, addLocalReflection(color, center, normal), glow)
}

function addLocalReflection(color: Vec3, point: Vec3, normal: Vec3): Vec3 {
  const red = redReflection(point, normal)
  const white = strobeReflection(point, normal)

  return [
    clamp(color[0] + red * 1.45 + white * 2.85, 0, 1),
    clamp(color[1] + red * 0.06 + white * 2.7, 0, 1),
    clamp(color[2] + red * 0.03 + white * 2.25, 0, 1),
  ]
}

function redReflection(point: Vec3, normal: Vec3) {
  let amount = 0

  if (Math.abs(normal[0]) > Math.abs(normal[2])) {
    const x = normal[0] > 0 ? 6.98 : -6.98

    for (const z of wallLightZ) {
      amount = Math.max(amount, redLightAmount(point, normal, x, point[1], z))
    }
  }
  else {
    const z = normal[2] > 0 ? 3.98 : -23.98

    for (const x of backLightX) {
      amount = Math.max(amount, redLightAmount(point, normal, x, point[1], z))
    }
  }

  return amount
}

function redLightAmount(point: Vec3, normal: Vec3, x: number, y: number, z: number) {
  const dx = x - point[0]
  const dy = y - point[1]
  const dz = z - point[2]
  const distance = Math.hypot(dx, dz)
  const length = Math.hypot(dx, dy, dz)
  const facing = Math.max(0, (normal[0] * dx + normal[1] * dy + normal[2] * dz) / length)
  const height = 0.8 + Math.max(0, point[1] + 1.95) * 0.18

  return Math.exp(-distance * 0.95) * Math.pow(facing, 1.35) * height * 1.65
}

function strobeReflection(point: Vec3, normal: Vec3) {
  let amount = 0
  const active = activeStrobeReflectionLights()

  for (const setup of active) {
    amount = Math.max(amount, strobeLightAmount(point, normal, setup.light, setup.target))
  }

  return amount
}

function activeStrobeReflectionLights() {
  if (strobeReflectionFrame !== lightFrame) {
    strobeReflectionLights = []
    strobeReflectionFrame = lightFrame

    for (const light of strobeLights) {
      const strobe = Math.floor(strobeRandom(light.id, lightFrame) + 0.18)

      if (strobe > 0) {
        strobeReflectionLights.push({
          light,
          target: strobeTarget(light, lightFrame / 60),
        })
      }
    }
  }

  return strobeReflectionLights
}

function strobeLightAmount(point: Vec3, normal: Vec3, light: StrobeLight, target: Vec3) {
  const top = 4.75
  const floor = -1.96
  const t = clamp((top - point[1]) / (top - floor), 0, 1)
  const radiusX = mix(0.07, 0.5, t)
  const radiusZ = mix(0.07, 0.68, t)
  const centerX = mix(light.x, target[0], t)
  const centerZ = mix(light.z, target[2], t)
  const dx = (point[0] - centerX) / radiusX
  const dz = (point[2] - centerZ) / radiusZ
  const cone = dx * dx + dz * dz

  if (cone > 1) {
    return 0
  }

  const lx = light.x - point[0]
  const ly = top - point[1]
  const lz = light.z - point[2]
  const length = Math.hypot(lx, ly, lz)
  const facing = Math.max(0, (normal[0] * lx + normal[1] * ly + normal[2] * lz) / length)
  const inside = Math.pow(1 - cone, 0.45)

  return inside * Math.pow(facing, 0.78) * 7.2
}

function strobeRandom(id: number, frame: number) {
  const value = Math.sin(id * 17.13 + frame * 9.27) * 43758.5453

  return value - Math.floor(value)
}

function createStrobeLights() {
  const lights: StrobeLight[] = []
  let id = 1

  for (const x of [-3.8, 0, 3.8]) {
    for (const z of [-5.5, -10.5, -15.5, -20.5]) {
      lights.push({
        id,
        x,
        z,
        zone: 'inside',
        top: 4.75,
        floor: -1.96,
        color: [0.9, 0.88, 0.8],
        minX: -5.8,
        maxX: 5.8,
        minZ: -22.7,
        maxZ: 3.1,
      })
      id++
    }
  }

  const stageTop = characterFloor + 4.1
  const stageZ = outsideDjBooth.z + 2.15
  const stageHalfWidth = 3.7

  for (const x of [outsideDjBooth.x - stageHalfWidth, outsideDjBooth.x + stageHalfWidth]) {
    const side = Math.sign(x - outsideDjBooth.x)

    lights.push({
      id,
      x,
      z: stageZ,
      zone: 'outside',
      top: stageTop,
      floor: characterFloor + 0.02,
      color: electricNavy,
      minX: outsideDjBooth.x - 10.5,
      maxX: outsideDjBooth.x + 10.5,
      minZ: roomBounds.front + 1.2,
      maxZ: outsideDjBooth.z - 1.0,
    })
    id++
  }

  return lights
}

function strobeTarget(light: StrobeLight, time: number): Vec3 {
  if (light.zone === 'outside') {
    return outsideStrobeTarget(light, time)
  }

  const cycle = time % 16
  const sweepTime = cycle < 5.5 ? time : time - 3
  const speed = 1.15
  const phase = sweepTime * speed + (light.id * 1.27)
  const sweepX = light.x + Math.sin(phase) * 2.5 + Math.sin(phase * 1.7) * 0.8
  const sweepZ = light.z + Math.cos(sweepTime * 1.3 + light.id * 1.43) * 3.2 + Math.sin(phase * 2.1) * 0.9
  const vertical = smoothstep(5.5, 7.0, cycle) * (1 - smoothstep(12.5, 14.0, cycle))
  const x = mix(sweepX, light.x, vertical)
  const z = mix(sweepZ, light.z, vertical)

  return [clamp(x, light.minX, light.maxX), light.floor, clamp(z, light.minZ, light.maxZ)]
}

function outsideStrobeTarget(light: StrobeLight, time: number): Vec3 {
  const side = Math.sign(light.x - outsideDjBooth.x)
  const phase = time * 0.56 + light.id * 2.17
  const drift = time * 0.37 + light.id * 1.31
  const x = Math.sin(phase) * 5.8 + Math.sin(drift * 1.73) * 2.6 - side * 0.9
  const z = light.z - 6.8 - Math.cos(drift) * 3.4 - Math.sin(phase * 0.61) * 2.1

  return [clamp(x, light.minX, light.maxX), light.floor, clamp(z, light.minZ, light.maxZ)]
}

function placeCharacterPose(pose: Map<string, Vec3>, position: Vec3, turn: number) {
  const ground = Math.min(...characterGroundJoints.map(name => pose.get(name)![1]))
  const next = new Map<string, Vec3>()
  const sin = Math.sin(turn)
  const cos = Math.cos(turn)

  for (const [name, point] of pose) {
    const x = point[0] * characterScale
    const y = (point[1] - ground) * characterScale
    const z = point[2] * characterScale

    next.set(name, [
      position[0] + x * cos + z * sin,
      position[1] + y,
      position[2] - x * sin + z * cos,
    ])
  }

  return next
}

function isAssimpHelper(node: AssimpNode) {
  return node.name.includes('$AssimpFbx$')
}

function identity(): Mat4 {
  return [
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
  ]
}

function nodeTransform(node: AssimpNode): Mat4 {
  if (!node.transformation) {
    return identity()
  }

  if (node.transformation.length !== 16) {
    throw new Error(`Invalid transform for ${node.name}`)
  }

  return node.transformation as Mat4
}

function compose(position: Vec3, rotation: Quat, nextScale: Vec3): Mat4 {
  return multiply(translate(position), multiply(rotate(rotation), scaleMatrix(nextScale)))
}

function translate([x, y, z]: Vec3): Mat4 {
  return [
    1,
    0,
    0,
    x,
    0,
    1,
    0,
    y,
    0,
    0,
    1,
    z,
    0,
    0,
    0,
    1,
  ]
}

function scaleMatrix([x, y, z]: Vec3): Mat4 {
  return [
    x,
    0,
    0,
    0,
    0,
    y,
    0,
    0,
    0,
    0,
    z,
    0,
    0,
    0,
    0,
    1,
  ]
}

function rotate(quat: Quat): Mat4 {
  const [w, x, y, z] = normalizeQuat(quat)
  const xx = x * x
  const yy = y * y
  const zz = z * z
  const xy = x * y
  const xz = x * z
  const yz = y * z
  const wx = w * x
  const wy = w * y
  const wz = w * z

  return [
    1 - 2 * (yy + zz),
    2 * (xy - wz),
    2 * (xz + wy),
    0,
    2 * (xy + wz),
    1 - 2 * (xx + zz),
    2 * (yz - wx),
    0,
    2 * (xz - wy),
    2 * (yz + wx),
    1 - 2 * (xx + yy),
    0,
    0,
    0,
    0,
    1,
  ]
}

function multiply(a: Mat4, b: Mat4): Mat4 {
  const next = Array.from({ length: 16 }, () => 0) as Mat4

  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      next[row * 4 + column] = a[row * 4] * b[column]
        + a[row * 4 + 1] * b[4 + column]
        + a[row * 4 + 2] * b[8 + column]
        + a[row * 4 + 3] * b[12 + column]
    }
  }

  return next
}

function transformOrigin(matrix: Mat4): Vec3 {
  return [matrix[3], matrix[7], matrix[11]]
}

function normalizeQuat([w, x, y, z]: Quat): Quat {
  const length = Math.hypot(w, x, y, z)

  return [w / length, x / length, y / length, z / length]
}

function slerp(a: Quat, b: Quat, t: number): Quat {
  let [bw, bx, by, bz] = b
  let dot = a[0] * bw + a[1] * bx + a[2] * by + a[3] * bz

  if (dot < 0) {
    dot = -dot
    bw = -bw
    bx = -bx
    by = -by
    bz = -bz
  }

  if (dot > 0.9995) {
    return normalizeQuat([
      mix(a[0], bw, t),
      mix(a[1], bx, t),
      mix(a[2], by, t),
      mix(a[3], bz, t),
    ])
  }

  const theta = Math.acos(dot)
  const sinTheta = Math.sin(theta)
  const from = Math.sin((1 - t) * theta) / sinTheta
  const to = Math.sin(t * theta) / sinTheta

  return [
    a[0] * from + bw * to,
    a[1] * from + bx * to,
    a[2] * from + by * to,
    a[3] * from + bz * to,
  ]
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function scale(vector: Vec3, amount: number): Vec3 {
  return [vector[0] * amount, vector[1] * amount, vector[2] * amount]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector[0], vector[1], vector[2])

  if (length === 0) {
    throw new Error('Cannot normalize zero vector')
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

function normalizeIndex(index: number, length: number) {
  return (index % length + length) % length
}

function restoreState() {
  const state = JSON.parse(localStorage.getItem(saveKey) ?? 'null') as {
    character: Vec3
    camera: Vec3
    cameraTurn: number
    characterTurn: number
    velocityY: number
    characterHairIndex?: number
    characterHairColorIndex?: number
    shirtColorIndex?: number
    topStyleIndex?: number
    pantsColorIndex?: number
    bottomStyleIndex?: number
    videoTimes?: Partial<Record<VideoZone, number>>
  } | null

  if (state) {
    setVec3(characterPosition, state.character)
    setVec3(cameraPosition, state.camera)
    cameraTurn = state.cameraTurn
    characterTurn = state.characterTurn
    velocityY = state.velocityY
    characterHairIndex = state.characterHairIndex ?? characterHairIndex
    characterHairColorIndex = normalizeIndex(state.characterHairColorIndex ?? characterHairColorIndex,
      hairPalette.length)
    topStyleIndex = normalizeIndex(state.topStyleIndex ?? state.shirtColorIndex ?? topStyleIndex,
      jewelPalette.length * 2 + 2)
    bottomStyleIndex = normalizeIndex(state.bottomStyleIndex ?? state.pantsColorIndex ?? bottomStyleIndex,
      jewelPalette.length * 2)
    videoTimes.inside = state.videoTimes?.inside ?? videoTimes.inside
    videoTimes.outside = state.videoTimes?.outside ?? videoTimes.outside
    setTopStyle()
    setBottomStyle()
  }
}

function saveState() {
  syncCurrentVideoTime()

  localStorage.setItem(saveKey, JSON.stringify({
    character: characterPosition,
    camera: cameraPosition,
    cameraTurn,
    characterTurn,
    velocityY,
    characterHairIndex,
    characterHairColorIndex,
    shirtColorIndex,
    topStyleIndex,
    pantsColorIndex,
    bottomStyleIndex,
    videoTimes,
  }))
}

function updateSave(delta: number) {
  saveTime += delta

  if (saveTime >= 0.5) {
    saveState()
    saveTime = 0
  }
}

function syncCurrentVideoTime() {
  for (const zone of videoZones()) {
    if (videoPlayersReady[zone]) {
      videoTimes[zone] = videoPlayers[zone]!.getCurrentTime()
    }
  }
}

function getInput() {
  input[0] = Number(keys.has('l') || keys.has('arrowright')) - Number(keys.has('j') || keys.has('arrowleft'))
  input[1] = 0
  input[2] = Number(keys.has('i') || keys.has('arrowup')) - Number(keys.has('k') || keys.has('arrowdown'))

  return input
}

function updateCharacter(delta: number) {
  getInput()
  const moving = lengthSq(input) > 0

  characterMotionBlend = mix(characterMotionBlend, moving ? 1 : 0, 1 - Math.exp(-8 * delta))
  characterMode = characterMotionBlend > 0.5 ? 'run' : 'stand'

  if (moving) {
    normalizeInto(input)
    setVec3(forward, [Math.sin(cameraTurn), 0, Math.cos(cameraTurn)])
    setVec3(right, [-Math.cos(cameraTurn), 0, Math.sin(cameraTurn)])
    setVec3(direction, add(scale(forward, input[2]), scale(right, input[0])))
    normalizeInto(direction)

    characterPosition[0] += direction[0] * delta * 5
    characterPosition[2] += direction[2] * delta * 5
    collideRoom(characterPosition)
    characterTurn = smoothAngle(characterTurn, Math.atan2(direction[0], direction[2]), 10, delta)
  }
  floorY = walkHeight(characterPosition[0], characterPosition[1], characterPosition[2])

  if (floorY > characterPosition[1]) {
    characterPosition[1] = floorY
    velocityY = 0
  }
  else {
    velocityY -= 12 * delta
    characterPosition[1] += velocityY * delta

    if (characterPosition[1] < floorY) {
      characterPosition[1] = floorY
      velocityY = 0
    }
  }

  collideRoom(characterPosition)
}

function createPlayers(count: number) {
  const next: Player[] = []

  for (let i = 0; i < count; i++) {
    const seed = i + 1
    const destination = playerDestination(seed, 0)
    const position: Vec3 = [
      destination.position[0] + seededRange(seed, 10, -1.2, 1.2),
      characterFloor,
      destination.position[2] + seededRange(seed, 11, -1.2, 1.2),
    ]

    next.push({
      position,
      turn: seededRange(seed, 12, -Math.PI, Math.PI),
      motionBlend: 0,
      input: [0, 0, 0],
      nextDecision: seededRange(seed, 13, 0.3, 2.8),
      destination,
      style: {
        topStyleIndex: Math.floor(seededRange(seed, 14, 0, jewelPalette.length * 2 + 2)),
        bottomStyleIndex: Math.floor(seededRange(seed, 15, 0, jewelPalette.length * 2)),
        hairIndex: Math.floor(seededRange(seed, 16, 0, 19)),
        hairColorIndex: Math.floor(seededRange(seed, 17, 0, hairPalette.length)),
      },
      seed,
    })
  }

  return next
}

function updatePlayers(delta: number, time: number) {
  for (const player of players) {
    const destination = activePlayerDestination(player)
    const distance = Math.hypot(
      destination.position[0] - player.position[0],
      destination.position[2] - player.position[2],
    )

    if (distance < 0.55 && destination === player.destination) {
      player.destination = playerDestination(player.seed, Math.floor(time / 6 + player.seed))
      player.nextDecision = time
    }

    if (time >= player.nextDecision) {
      choosePlayerInput(player, time)
      player.nextDecision = time + seededRange(player.seed, Math.floor(time * 3.1), 0.45, 2.4)
    }

    const moving = lengthSq(player.input) > 0

    player.motionBlend = mix(player.motionBlend, moving ? 1 : 0, 1 - Math.exp(-7 * delta))

    if (moving) {
      const direction = normalize([...player.input])

      player.position[0] += direction[0] * delta * 2.55
      player.position[2] += direction[2] * delta * 2.55
      collideRoom(player.position)
      player.turn = smoothAngle(player.turn, Math.atan2(direction[0], direction[2]), 8, delta)
    }
    else if (destination.lookAt) {
      const dx = destination.lookAt[0] - player.position[0]
      const dz = destination.lookAt[2] - player.position[2]

      player.turn = smoothAngle(player.turn, Math.atan2(dx, dz), 4, delta)
    }

    player.position[1] = characterFloor
  }
}

function choosePlayerInput(player: Player, time: number) {
  const random = seededRandom(player.seed, Math.floor(time * 7.7))

  if (random < 0.22) {
    player.input = [0, 0, 0]
    return
  }

  const destination = activePlayerDestination(player)
  const dx = destination.position[0] - player.position[0]
  const dz = destination.position[2] - player.position[2]
  const angle = Math.atan2(dx, dz) + seededRange(player.seed, Math.floor(time * 5.3), -0.75, 0.75)
  const directions: Vec3[] = [
    [0, 0, 1],
    [1, 0, 1],
    [-1, 0, 1],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, -1],
    [1, 0, -1],
    [-1, 0, -1],
  ]
  const index = normalizeIndex(Math.round(angle / (Math.PI / 4)), directions.length)

  player.input = [...directions[index]!]
}

function activePlayerDestination(player: Player): PlayerDestination {
  const outside = isOutside(player.position)
  const destinationOutside = isOutside(player.destination.position)

  if (outside === destinationOutside) {
    return player.destination
  }

  return {
    position: [backDoor.x, characterFloor, outside ? roomBounds.front - 0.75 : roomBounds.front + 0.75],
  }
}

function playerDestination(seed: number, step: number): PlayerDestination {
  const choice = Math.floor(seededRange(seed, step + 100, 0, 6))
  const jitterX = seededRange(seed, step + 101, -1.8, 1.8)
  const jitterZ = seededRange(seed, step + 102, -1.4, 1.4)

  if (choice === 0) {
    return { position: [jitterX, characterFloor, djBooth.z + 2.2 + jitterZ], lookAt: [djBooth.x, characterFloor, djBooth.z] }
  }

  if (choice === 1) {
    return { position: [bartenderBar.x + jitterX, characterFloor, bartenderBar.z - 1.55 + jitterZ * 0.35] }
  }

  if (choice === 2) {
    return { position: [backDoor.x + jitterX * 0.35, characterFloor, roomBounds.front - 1.3 + jitterZ * 0.3] }
  }

  if (choice === 3) {
    return { position: [outsideTree.x + jitterX, characterFloor, outsideTree.z - 2.4 + jitterZ], lookAt: [outsideTree.x,
      characterFloor, outsideTree.z] }
  }

  if (choice === 4) {
    return { position: [outsideDjBooth.x + jitterX, characterFloor, outsideDjBooth.z - 2.6 + jitterZ],
      lookAt: [outsideDjBooth.x, characterFloor, outsideDjBooth.z] }
  }

  return { position: [seededRange(seed, step + 103, roomBounds.left + 1.2, roomBounds.right - 1.2), characterFloor,
    seededRange(seed, step + 104, roomBounds.back + 2.2, roomBounds.front - 2.0)] }
}

function seededRange(seed: number, salt: number, min: number, max: number) {
  return mix(min, max, seededRandom(seed, salt))
}

function seededRandom(seed: number, salt: number) {
  const value = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453123

  return value - Math.floor(value)
}

function updateCamera(delta: number) {
  getInput()
  const moving = lengthSq(input) > 0

  if (!cameraDragging && moving) {
    cameraReturning = true
  }

  if (!cameraDragging && (moving || cameraReturning)) {
    const turnSpeed = cameraReturning ? 5 : mix(0.8, 2.2, input[2])

    cameraTurn = smoothAngle(cameraTurn, characterTurn, turnSpeed, delta)
    cameraPitch = mix(cameraPitch, 0, 1 - Math.exp(-4 * delta))

    if (cameraReturning) {
      const angle = Math.abs(Math.atan2(Math.sin(characterTurn - cameraTurn), Math.cos(characterTurn - cameraTurn)))

      if (angle < 0.01 && Math.abs(cameraPitch) < 0.01) {
        cameraReturning = false
      }
    }
  }

  cameraTarget[0] = characterPosition[0]
  cameraTarget[1] = characterPosition[1] + 1.2
  cameraTarget[2] = characterPosition[2]
  const outside = isOutside(characterPosition)
  const time = performance.now() * 0.001
  const distance = outside ? 2.2 : cameraDanceDistance(time)
  const bounce = outside ? 0 : cameraDanceBounce(time)
  const ideal: Vec3 = [
    characterPosition[0] - Math.sin(cameraTurn) * distance,
    characterPosition[1] + 1.35 + cameraPitch + bounce,
    characterPosition[2] - Math.cos(cameraTurn) * distance,
  ]

  ideal[0] = outside
    ? clamp(ideal[0], outsideBounds.left + 1, outsideBounds.right - 1)
    : clamp(ideal[0], roomBounds.left + 0.4, roomBounds.right - 0.4)
  ideal[1] = clamp(ideal[1], characterFloor + 0.35, 4.3)
  ideal[2] = outside
    ? clamp(ideal[2], outsideBounds.back + 1, outsideBounds.front - 1)
    : clamp(ideal[2], roomBounds.back + 0.2, roomBounds.front - 0.2)

  if (outside) {
    collideBuildingWalls(ideal, 0.65)
  }

  lerpVec3(cameraPosition, ideal, 1 - Math.pow(0.015, delta))
  if (outside) {
    collideBuildingWalls(cameraPosition, 0.65)
  }

  cameraPosition[1] = Math.max(cameraPosition[1],
    walkHeight(cameraPosition[0], characterPosition[1], cameraPosition[2]) + 0.35)
}

function cameraDanceBounce(time: number) {
  const beat = (time * 2.25) % 1
  const offbeat = (time * 4.3 + 0.5) % 1
  const kick = beat < 0.08 ? beat / 0.08 : 1 - (beat - 0.08) / 0.92
  const tick = offbeat < 0.04 ? offbeat / 0.04 : 1 - (offbeat - 0.04) / 0.96

  return kick * 0.26 + tick * 0.035
}

function cameraDanceDistance(time: number) {
  const beat = (time * 2.15) % 1
  const zoom = beat < 0.1 ? beat / 0.1 : 1 - (beat - 0.1) / 0.9

  return 2.2 + zoom * 0.18
}

function getCamera() {
  return {
    eye: [cameraPosition[0], cameraPosition[1], cameraPosition[2]] as [number, number, number],
    center: [cameraTarget[0], cameraTarget[1], cameraTarget[2]] as [number, number, number],
  }
}

function openChatInput() {
  chatInput.value = ''
  chatForm.dataset.open = 'true'
  chatBubble.dataset.open = 'false'
  chatInput.focus()
}

function submitChatInput() {
  const text = chatInput.value.trim()

  if (text) {
    chatBubble.textContent = text
    chatBubble.dataset.open = 'true'
    chatHideAt = performance.now() + 5000
  }

  chatForm.dataset.open = 'false'
  chatInput.blur()
}

function cycleHair(direction: number) {
  if (characterHairMeshes.length === 0) {
    return
  }

  characterHairIndex = normalizeIndex(characterHairIndex + direction, characterHairMeshes.length + 1)
  setCharacterHair()
  logCurrentHair()
}

function setCharacterHair() {
  characterHair = characterHairIndex === 0 ? undefined : characterHairMeshes[characterHairIndex - 1]!
}

function logCurrentHair() {
  console.log(`Current hair ${characterHairIndex}: ${characterHair?.name ?? 'no hair'}`)
}

function cycleHairColor(direction: number) {
  characterHairColorIndex = normalizeIndex(characterHairColorIndex + direction, hairPalette.length)
}

function cycleShirt(direction: number) {
  topStyleIndex = normalizeIndex(topStyleIndex + direction, jewelPalette.length * 2 + 2)
  setTopStyle()
}

function setTopStyle() {
  if (topStyleIndex < jewelPalette.length) {
    topMode = 'shirt'
    shirtColorIndex = topStyleIndex
  }
  else if (topStyleIndex < jewelPalette.length * 2) {
    topMode = 'sleeveless'
    shirtColorIndex = topStyleIndex - jewelPalette.length
  }
  else {
    topMode = topStyleIndex === jewelPalette.length * 2 ? 'skin' : 'chest'
  }

  setVec3(shirt, jewelPalette[shirtColorIndex]!)
  setVec3(shirtLight, scale(jewelPalette[shirtColorIndex]!, 1.35))
}

function cyclePants(direction: number) {
  bottomStyleIndex = normalizeIndex(bottomStyleIndex + direction, jewelPalette.length * 2)
  setBottomStyle()
}

function setBottomStyle() {
  bottomMode = bottomStyleIndex < jewelPalette.length ? 'pants' : 'skirt'
  pantsColorIndex = bottomStyleIndex % jewelPalette.length
  setVec3(pants, jewelPalette[pantsColorIndex]!)
  setVec3(shoe, scale(jewelPalette[pantsColorIndex]!, 0.72))
}

function playerStyle(style: PlayerStyle) {
  const topIndex = normalizeIndex(style.topStyleIndex, jewelPalette.length * 2 + 2)
  const bottomIndex = normalizeIndex(style.bottomStyleIndex, jewelPalette.length * 2)
  const shirtIndex = topIndex < jewelPalette.length
    ? topIndex
    : topIndex < jewelPalette.length * 2
      ? topIndex - jewelPalette.length
      : 0
  const topMode = topIndex < jewelPalette.length
    ? 'shirt'
    : topIndex < jewelPalette.length * 2
      ? 'sleeveless'
      : topIndex === jewelPalette.length * 2
        ? 'skin'
        : 'chest'
  const bottomMode = bottomIndex < jewelPalette.length ? 'pants' : 'skirt'
  const pantsColor = jewelPalette[bottomIndex % jewelPalette.length]!

  return {
    topMode: topMode as TopMode,
    bottomMode: bottomMode as BottomMode,
    shirt: jewelPalette[shirtIndex]!,
    shirtLight: scale(jewelPalette[shirtIndex]!, 1.35),
    pants: pantsColor,
    shoe: scale(pantsColor, 0.72),
    hairColor: hairPalette[normalizeIndex(style.hairColorIndex, hairPalette.length)]!,
  }
}

function playerHair(index: number) {
  if (index === 0 || characterHairMeshes.length === 0) {
    return undefined
  }

  return characterHairMeshes[normalizeIndex(index - 1, characterHairMeshes.length)]!
}

function updateChatOverlay(camera: ReturnType<typeof getCamera>, stamp: number) {
  const point = projectWallPoint([characterPosition[0], characterPosition[1] + 1.05, characterPosition[2]], camera)
  const y = point.y - 68

  chatForm.style.transform = `translate(-50%, -100%) translate(${point.x}px, ${y}px)`
  chatBubble.style.transform = `translate(-50%, -100%) translate(${point.x}px, ${y - 8}px)`

  if (chatBubble.dataset.open === 'true' && stamp > chatHideAt) {
    chatBubble.dataset.open = 'false'
  }
}

function updateDjVideo(camera: ReturnType<typeof getCamera>) {
  updateVideoTrack()

  const wall = isOutside(characterPosition) ? outsideVideoWall : djVideoWall

  if (!djVideoFacesCamera(camera, wall)) {
    djVideo.style.opacity = '0'
    djVideoLayers.inside.style.pointerEvents = 'none'
    djVideoLayers.outside.style.pointerEvents = 'none'
    return
  }

  const left = wall.x - wall.width / 2
  const right = wall.x + wall.width / 2
  const bottom = wall.y - wall.height / 2
  const top = wall.y + wall.height / 2
  const points = wall.normal[2] < 0
    ? [
      projectWallPoint([right, bottom, wall.z], camera),
      projectWallPoint([left, bottom, wall.z], camera),
      projectWallPoint([left, top, wall.z], camera),
      projectWallPoint([right, top, wall.z], camera),
    ]
    : [
      projectWallPoint([left, bottom, wall.z], camera),
      projectWallPoint([right, bottom, wall.z], camera),
      projectWallPoint([right, top, wall.z], camera),
      projectWallPoint([left, top, wall.z], camera),
    ]

  djVideo.style.opacity = '0.74'
  djVideoLayers.inside.style.opacity = videoZone === 'inside' ? '1' : '0'
  djVideoLayers.outside.style.opacity = videoZone === 'outside' ? '1' : '0'
  djVideoLayers.inside.style.pointerEvents = videoZone === 'inside' ? 'auto' : 'none'
  djVideoLayers.outside.style.pointerEvents = videoZone === 'outside' ? 'auto' : 'none'
  djVideo.style.width = `${wall.width * 120}px`
  djVideo.style.height = `${wall.height * 120}px`
  djVideo.style.transform = projectedQuadTransform(
    wall.width * 120,
    wall.height * 120,
    points,
  )
}

function loadYouTubePlayer() {
  const youtube = window as YouTubeWindow

  youtube.onYouTubeIframeAPIReady = () => {
    for (const zone of videoZones()) {
      videoPlayers[zone] = new youtube.YT!.Player(djVideoMounts[zone], {
        playerVars: {
          autoplay: 0,
          controls: 1,
          playsinline: 1,
          enablejsapi: 1,
        },
        events: {
          onReady() {
            videoPlayersReady[zone] = true
            const load = zone === videoZone ? videoPlayers[zone]!.loadVideoById : videoPlayers[zone]!.cueVideoById

            load.call(videoPlayers[zone]!, {
              videoId: videoTracks[zone],
              startSeconds: videoTimes[zone],
            })

            if (zone === videoZone) {
              videoPlayers[zone]!.playVideo()
            }
            else {
              videoPlayers[zone]!.pauseVideo()
            }
          },
        },
      })
    }
  }

  if (youtube.YT?.Player) {
    youtube.onYouTubeIframeAPIReady()
  }
  else {
    const script = document.createElement('script')

    script.src = 'https://www.youtube.com/iframe_api'
    document.head.append(script)
  }
}

function updateVideoTrack() {
  const nextZone: VideoZone = isOutside(characterPosition) ? 'outside' : 'inside'

  if (nextZone !== videoZone) {
    if (videoPlayersReady[videoZone]) {
      videoTimes[videoZone] = videoPlayers[videoZone]!.getCurrentTime()
      videoPlayers[videoZone]!.pauseVideo()
    }

    videoZone = nextZone

    if (videoPlayersReady[videoZone]) {
      videoPlayers[videoZone]!.playVideo()
    }
  }
}

function videoZones(): VideoZone[] {
  return ['inside', 'outside']
}

function djVideoFacesCamera(
  camera: ReturnType<typeof getCamera>,
  wall: typeof djVideoWall,
) {
  const center: Vec3 = [wall.x, wall.y, wall.z]
  const toCamera = subtract(camera.eye, center)
  const toVideo = subtract(center, camera.eye)
  const forward = subtract(camera.center, camera.eye)

  return dot(wall.normal, toCamera) > 0 && dot(forward, toVideo) > 0
}

function projectedQuadTransform(width: number, height: number, points: ReturnType<typeof projectWallPoint>[]) {
  const from = [
    { x: 0, y: height },
    { x: width, y: height },
    { x: width, y: 0 },
    { x: 0, y: 0 },
  ]
  const to = points.map(point => ({ x: point.x, y: point.y }))
  const matrix = multiplyProjective(quadBasis(to), invertProjective(quadBasis(from)))

  return `matrix3d(${
    [
      matrix[0],
      matrix[3],
      0,
      matrix[6],
      matrix[1],
      matrix[4],
      0,
      matrix[7],
      0,
      0,
      1,
      0,
      matrix[2],
      matrix[5],
      0,
      matrix[8],
    ].join(',')
  })`
}

function quadBasis(points: { x: number; y: number }[]) {
  const [a, b, c, d] = points
  const matrix = [
    a!.x,
    b!.x,
    c!.x,
    a!.y,
    b!.y,
    c!.y,
    1,
    1,
    1,
  ]
  const scale = multiplyProjectiveVector(invertProjective(matrix), [d!.x, d!.y, 1])

  return [
    matrix[0]! * scale[0],
    matrix[1]! * scale[1],
    matrix[2]! * scale[2],
    matrix[3]! * scale[0],
    matrix[4]! * scale[1],
    matrix[5]! * scale[2],
    matrix[6]! * scale[0],
    matrix[7]! * scale[1],
    matrix[8]! * scale[2],
  ]
}

function multiplyProjective(a: number[], b: number[]) {
  return [
    a[0]! * b[0]! + a[1]! * b[3]! + a[2]! * b[6]!,
    a[0]! * b[1]! + a[1]! * b[4]! + a[2]! * b[7]!,
    a[0]! * b[2]! + a[1]! * b[5]! + a[2]! * b[8]!,
    a[3]! * b[0]! + a[4]! * b[3]! + a[5]! * b[6]!,
    a[3]! * b[1]! + a[4]! * b[4]! + a[5]! * b[7]!,
    a[3]! * b[2]! + a[4]! * b[5]! + a[5]! * b[8]!,
    a[6]! * b[0]! + a[7]! * b[3]! + a[8]! * b[6]!,
    a[6]! * b[1]! + a[7]! * b[4]! + a[8]! * b[7]!,
    a[6]! * b[2]! + a[7]! * b[5]! + a[8]! * b[8]!,
  ]
}

function multiplyProjectiveVector(matrix: number[], vector: Vec3): Vec3 {
  return [
    matrix[0]! * vector[0] + matrix[1]! * vector[1] + matrix[2]! * vector[2],
    matrix[3]! * vector[0] + matrix[4]! * vector[1] + matrix[5]! * vector[2],
    matrix[6]! * vector[0] + matrix[7]! * vector[1] + matrix[8]! * vector[2],
  ]
}

function invertProjective(matrix: number[]) {
  const a = matrix[0]!
  const b = matrix[1]!
  const c = matrix[2]!
  const d = matrix[3]!
  const e = matrix[4]!
  const f = matrix[5]!
  const g = matrix[6]!
  const h = matrix[7]!
  const i = matrix[8]!
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)

  return [
    (e * i - f * h) / determinant,
    (c * h - b * i) / determinant,
    (b * f - c * e) / determinant,
    (f * g - d * i) / determinant,
    (a * i - c * g) / determinant,
    (c * d - a * f) / determinant,
    (d * h - e * g) / determinant,
    (b * g - a * h) / determinant,
    (a * e - b * d) / determinant,
  ]
}

function projectWallPoint(point: Vec3, camera: ReturnType<typeof getCamera>) {
  const forward = normalize(subtract(camera.center, camera.eye))
  const cameraZ = scale(forward, -1)
  const cameraX = normalize(cross([0, 1, 0], cameraZ))
  const cameraY = cross(cameraZ, cameraX)
  const relative = subtract(point, camera.eye)
  const viewX = dot(cameraX, relative)
  const viewY = dot(cameraY, relative)
  const viewZ = dot(cameraZ, relative)
  const f = 1 / Math.tan(1.08 * 0.5)
  const aspect = canvas.width / canvas.height
  const depth = -viewZ
  const ndcX = (viewX * f / aspect) / depth
  const ndcY = (viewY * f) / depth

  return {
    x: (ndcX * 0.5 + 0.5) * canvas.clientWidth,
    y: (0.5 - ndcY * 0.5) * canvas.clientHeight,
  }
}

function walkHeight(_x: number, _y: number, _z: number) {
  return characterFloor
}

function isAtBackDoor(position: Vec3) {
  return Math.abs(position[0] - backDoor.x) < backDoor.width * 0.5
}

function isOutside(position: Vec3) {
  return position[0] < roomBounds.left || position[0] > roomBounds.right || position[2] < roomBounds.back
    || position[2] > roomBounds.front
}

function usesSkyBackground(camera: ReturnType<typeof getCamera>) {
  return true
}

function collideRoom(position: Vec3) {
  const insideLeft = roomBounds.left + 0.8
  const insideRight = roomBounds.right - 0.8
  const insideBack = roomBounds.back + 0.8
  const insideFront = roomBounds.front - 0.8
  const outside = isOutside(position)

  if (outside) {
    position[0] = clamp(position[0], outsideBounds.left, outsideBounds.right)
    position[2] = clamp(position[2], outsideBounds.back, outsideBounds.front)
    collideBuildingWalls(position, 0.45)
    collideCircle(position, outsideTree)
    collideBounds(position, outsideDjBooth)

    for (const speaker of outsideDjSpeakers) {
      collideBounds(position, speaker)
    }

    return
  }

  position[0] = clamp(position[0], insideLeft, insideRight)

  if (position[2] > insideFront && !isAtBackDoor(position)) {
    position[2] = insideFront
  }
  else {
    position[2] = clamp(position[2], insideBack, roomBounds.front + 0.45)
  }

  collideBounds(position, djBooth)
  collideBounds(position, bartenderBar)

  for (const stool of bartenderStools) {
    collideBounds(position, stool)
  }

  for (const speaker of djSpeakers) {
    collideBounds(position, speaker)
  }
}

function collideBuildingWalls(position: Vec3, padding: number) {
  const left = roomBounds.left - padding
  const right = roomBounds.right + padding
  const back = roomBounds.back - padding
  const front = roomBounds.front + padding

  if (position[0] > left && position[0] < right && position[2] > back && position[2] < front) {
    if (isAtBackDoor(position) && position[2] > roomBounds.front - 0.8) {
      return
    }

    const pushLeft = Math.abs(position[0] - left)
    const pushRight = Math.abs(right - position[0])
    const pushBack = Math.abs(position[2] - back)
    const pushFront = Math.abs(front - position[2])
    const push = Math.min(pushLeft, pushRight, pushBack, pushFront)

    if (push === pushLeft) {
      position[0] = left
    }
    else if (push === pushRight) {
      position[0] = right
    }
    else if (push === pushBack) {
      position[2] = back
    }
    else {
      position[2] = front
    }
  }
}

function collideBounds(position: Vec3, bounds: Bounds) {
  const padding = 0.28
  const left = bounds.x - bounds.width / 2 - padding
  const right = bounds.x + bounds.width / 2 + padding
  const front = bounds.z + bounds.depth / 2 + padding
  const back = bounds.z - bounds.depth / 2 - padding

  if (position[0] > left && position[0] < right && position[2] > back && position[2] < front) {
    const pushLeft = Math.abs(position[0] - left)
    const pushRight = Math.abs(right - position[0])
    const pushBack = Math.abs(position[2] - back)
    const pushFront = Math.abs(front - position[2])
    const push = Math.min(pushLeft, pushRight, pushBack, pushFront)

    if (push === pushLeft) {
      position[0] = left
    }
    else if (push === pushRight) {
      position[0] = right
    }
    else if (push === pushBack) {
      position[2] = back
    }
    else {
      position[2] = front
    }
  }
}

function collideCircle(position: Vec3, bounds: CircleBounds) {
  const x = position[0] - bounds.x
  const z = position[2] - bounds.z
  const distance = Math.hypot(x, z)
  const radius = bounds.radius + 0.28

  if (distance < radius) {
    position[0] = bounds.x + x / distance * radius
    position[2] = bounds.z + z / distance * radius
  }
}

function smoothAngle(from: number, to: number, lambda: number, delta: number) {
  const angle = Math.atan2(Math.sin(to - from), Math.cos(to - from))

  return from + angle * (1 - Math.exp(-lambda * delta))
}

function setVec3(target: Vec3, value: Vec3) {
  target[0] = value[0]
  target[1] = value[1]
  target[2] = value[2]
}

function lerpVec3(target: Vec3, value: Vec3, t: number) {
  target[0] = mix(target[0], value[0], t)
  target[1] = mix(target[1], value[1], t)
  target[2] = mix(target[2], value[2], t)
}

function lengthSq(vector: Vec3) {
  return vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]
}

function normalizeInto(vector: Vec3) {
  const length = Math.hypot(vector[0], vector[1], vector[2])

  vector[0] /= length
  vector[1] /= length
  vector[2] /= length
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function createTarget(context: WebGL2RenderingContext, width: number, height: number) {
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
  const target = { frame, color, depth, width: 0, height: 0 }

  resizeTarget(context, target, width, height)
  context.bindFramebuffer(context.FRAMEBUFFER, null)

  return target
}

function createSmokeMap(context: WebGL2RenderingContext) {
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

function createTreeShadowMap(context: WebGL2RenderingContext) {
  const texture = context.createTexture()
  const data = new Uint8Array([0, 0, 0, 0])

  if (!texture) {
    throw new Error('Failed to create tree shadow texture')
  }

  context.bindTexture(context.TEXTURE_2D, texture)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
  context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, 1, 1, 0, context.RGBA, context.UNSIGNED_BYTE, data)

  return texture
}

function uploadTreeShadowMap(meshes: TreeMesh[], position: Vec3) {
  const size = 512
  const canvas = document.createElement('canvas')
  const blurCanvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  const blurContext = blurCanvas.getContext('2d')!
  const light = normalize([-0.55, -1, -0.7])
  const ground = characterFloor + 0.02

  canvas.width = size
  canvas.height = size
  blurCanvas.width = size
  blurCanvas.height = size
  context.fillStyle = 'rgba(0,0,0,0.95)'

  for (const mesh of meshes) {
    for (const face of mesh.faces) {
      const polygon = clipGroundPolygonFront([
        projectTreeShadow(add(position, mesh.points[face[0]!]!), light, ground),
        projectTreeShadow(add(position, mesh.points[face[1]!]!), light, ground),
        projectTreeShadow(add(position, mesh.points[face[2]!]!), light, ground),
      ], roomBounds.front + 0.06)

      if (polygon.length >= 3) {
        drawShadowPolygon(context, polygon, size)
      }
    }
  }

  blurContext.clearRect(0, 0, size, size)
  blurContext.filter = 'blur(0.5px)'
  blurContext.globalAlpha = 0.72
  blurContext.drawImage(canvas, 0, 0)
  gl.bindTexture(gl.TEXTURE_2D, treeShadowMap)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, blurCanvas)
}

function drawShadowPolygon(context: CanvasRenderingContext2D, points: Vec3[], size: number) {
  const first = shadowTexturePoint(points[0]!, size)

  context.beginPath()
  context.moveTo(first[0], first[1])

  for (const point of points.slice(1)) {
    const next = shadowTexturePoint(point, size)

    context.lineTo(next[0], next[1])
  }

  context.closePath()
  context.fill()
}

function shadowTexturePoint(point: Vec3, size: number): [number, number] {
  return [
    ((point[0] - landscapeBounds.left) / (landscapeBounds.right - landscapeBounds.left)) * size,
    (1 - (point[2] - landscapeBounds.back) / (landscapeBounds.front - landscapeBounds.back)) * size,
  ]
}

function resizeTarget(context: WebGL2RenderingContext, target: Target, width: number, height: number) {
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

  if (context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE) {
    throw new Error('Render target is incomplete')
  }
}

function addRoom(target: Vertex[]) {
  const dark: [number, number, number] = [0.032, 0.032, 0.038]
  const wall: [number, number, number] = [0.025, 0.023, 0.028]
  const ceiling: [number, number, number] = [0.016, 0.016, 0.02]
  const doorLeft = backDoor.x - backDoor.width / 2
  const doorRight = backDoor.x + backDoor.width / 2

  addQuad(target, [-7, -2, 4], [7, -2, 4], [7, -2, -24], [-7, -2, -24], dark, 0)
  addQuad(target, [-7, 5, -24], [7, 5, -24], [7, 5, 4], [-7, 5, 4], ceiling, 0)
  addQuad(target, [-7, -2, -24], [-7, 5, -24], [-7, 5, 4], [-7, -2, 4], wall, 0)
  addQuad(target, [7, -2, 4], [7, 5, 4], [7, 5, -24], [7, -2, -24], wall, 0)
  addQuad(target, [-7, -2, -24], [7, -2, -24], [7, 5, -24], [-7, 5, -24], [0.028, 0.022, 0.028], 0)
  addOutside(target)
  addQuad(target, [doorLeft, -2, 4], [-7, -2, 4], [-7, 5, 4], [doorLeft, 5, 4], [0.028, 0.022, 0.028], 0)
  addQuad(target, [7, -2, 4], [doorRight, -2, 4], [doorRight, 5, 4], [7, 5, 4], [0.028, 0.022, 0.028], 0)
  addQuad(target, [doorRight, backDoor.height - 2, 4], [doorLeft, backDoor.height - 2, 4], [doorLeft, 5, 4], [doorRight,
    5, 4], [0.028, 0.022, 0.028], 0)
  addBox(target, doorLeft - 0.05, -2 + backDoor.height / 2, 4.035, 0.1, backDoor.height, 0.08, [0.025, 0.035, 0.023],
    0.04)
  addBox(target, doorRight + 0.05, -2 + backDoor.height / 2, 4.035, 0.1, backDoor.height, 0.08, [0.025, 0.035, 0.023],
    0.04)
  addBox(target, backDoor.x, -2 + backDoor.height + 0.05, 4.035, backDoor.width + 0.2, 0.1, 0.08, [0.025, 0.035, 0.023],
    0.04)
  addDoorPerimeterStripes(target)
  addBartenderBar(target)
  addDjBooth(target)
}

function addDoorPerimeterStripes(target: Vertex[]) {
  const left = backDoor.x - backDoor.width / 2 - 0.14
  const right = backDoor.x + backDoor.width / 2 + 0.14
  const bottom = -1.82
  const top = -2 + backDoor.height + 0.18
  const width = right - left
  const height = top - bottom
  const glow = 3.2

  addDoorPerimeterFrame(target, roomBounds.front - 0.08, left, right, bottom, top, width, height, electricNavy, glow)
  addDoorPerimeterFrame(target, roomBounds.front + 0.08, left, right, bottom, top, width, height, [0.95, 0.02, 0.015],
    glow)
}

function addDoorPerimeterFrame(
  target: Vertex[],
  z: number,
  left: number,
  right: number,
  bottom: number,
  top: number,
  width: number,
  height: number,
  color: Vec3,
  glow: number,
) {
  addBox(target, left, bottom + height / 2, z, 0.11, height, 0.06, color, glow)
  addBox(target, right, bottom + height / 2, z, 0.11, height, 0.06, color, glow)
  addBox(target, left + width / 2, top, z, width + 0.11, 0.11, 0.06, color, glow)
}

function addBartenderBar(target: Vertex[]) {
  const body: Vec3 = [0.026, 0.016, 0.018]
  const top: Vec3 = [0.006, 0.006, 0.008]
  const metal: Vec3 = [0.055, 0.052, 0.052]
  const seat: Vec3 = [0.014, 0.012, 0.013]
  const bottle: Vec3 = [0.16, 0.028, 0.018]
  const y = -2

  addBox(target, bartenderBar.x, y + 0.38, bartenderBar.z, bartenderBar.width, 0.76, bartenderBar.depth, body, 0)
  addBox(target, bartenderBar.x, y + 0.8, bartenderBar.z - 0.03, bartenderBar.width + 0.24, 0.12,
    bartenderBar.depth + 0.32, top, 0)
  for (const shelfY of [0.98, 1.58]) {
    addBox(target, bartenderBar.x, y + shelfY, roomBounds.front - 0.18, bartenderBar.width + 0.12, 0.08, 0.16, top, 0)

    for (let i = 0; i < 8; i++) {
      const x = bartenderBar.x - 1.38 + i * 0.39
      const height = 0.27 + (i % 3) * 0.07
      addBox(target, x, y + shelfY + 0.06 + height / 2, roomBounds.front - 0.28, 0.1, height, 0.1, bottle, 0.18)
    }
  }

  for (const stool of bartenderStools) {
    addBox(target, stool.x, y + 0.27, stool.z, 0.06, 0.54, 0.06, metal, 0)
    addDisc(target, [stool.x, y + 0.56, stool.z], 0.2, 0.2, 'y', seat, 0)
    addDisc(target, [stool.x, y + 0.04, stool.z], 0.15, 0.15, 'y', metal, 0)
  }
}

function addOutside(target: Vertex[]) {
  const floor = -1.95
  const horizonFloor = -2.08

  addGrassHorizon(target, horizonFloor)

  addGrassQuad(target, [landscapeBounds.left, floor, landscapeBounds.front], [landscapeBounds.right, floor,
    landscapeBounds.front], [landscapeBounds.right, floor, roomBounds.front], [landscapeBounds.left, floor,
    roomBounds.front])
  addGrassQuad(target, [roomBounds.left, floor, roomBounds.front], [landscapeBounds.left, floor, roomBounds.front], [
    landscapeBounds.left,
    floor,
    roomBounds.back,
  ], [roomBounds.left, floor, roomBounds.back])
  addGrassQuad(target, [landscapeBounds.right, floor, roomBounds.front], [roomBounds.right, floor, roomBounds.front], [
    roomBounds.right,
    floor,
    roomBounds.back,
  ], [landscapeBounds.right, floor, roomBounds.back])
  addGrassQuad(target, [landscapeBounds.left, floor, roomBounds.back], [landscapeBounds.right, floor, roomBounds.back],
    [landscapeBounds.right, floor, landscapeBounds.back], [landscapeBounds.left, floor, landscapeBounds.back])
  addOutsideStage(target, floor)
  addDjBoothAt(target, outsideDjBooth, outsideDjSpeakers, -1, electricNavy, 3.2)
  addOutsideSkyLight(target)
}

function addOutsideStage(target: Vertex[], floor: number) {
  const dark: Vec3 = [0.005, 0.008, 0.02]
  const z = outsideDjBooth.z + 2.15
  const width = 7.4
  const left = outsideDjBooth.x - width / 2
  const right = outsideDjBooth.x + width / 2
  const base = floor + 0.1
  const top = floor + 4.1
  const centerY = (base + top) / 2

  addBox(target, outsideDjBooth.x, floor + 0.04, z + 0.12, width + 1.2, 0.08, 1.55, dark, 0)
  addBox(target, left, centerY, z, 0.13, top - base, 0.13, electricNavy, 3.2)
  addBox(target, right, centerY, z, 0.13, top - base, 0.13, electricNavy, 3.2)
  addBox(target, outsideDjBooth.x, top, z, width, 0.13, 0.13, electricNavy, 3.2)
  addStageBeam(target, [left, base, z], [right, top, z], electricNavy)
  addStageBeam(target, [right, base, z], [left, top, z], electricNavy)
}

function addStageBeam(target: Vertex[], a: Vec3, b: Vec3, color: Vec3) {
  const center = scale(add(a, b), 0.5)
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0])
  const side: Vec3 = [-Math.sin(angle) * 0.06, Math.cos(angle) * 0.06, 0]

  addQuad(target, add(a, side), subtract(a, side), subtract(b, side), add(b, side), color, 2.4)
  addBox(target, center[0], center[1], center[2], length, 0.035, 0.035, color, 1.2)
}

function addOutsideSkyLight(target: Vertex[]) {
  const z = outsideBounds.front - 0.12

  if (outsideMotif === 'night') {
    addDisc(target, [10.5, 6.8, z], 0.56, 0.56, 'z', [0.86, 0.88, 1], 1.15)
    addDisc(target, [10.72, 6.92, z - 0.01], 0.5, 0.5, 'z', [0, 0, 0.015], 0)
    return
  }

  addDisc(target, [10.5, 6.8, z], 1.0, 1.0, 'z', [1, 0.78, 0.22], 1.9)
}

function addGrassHorizon(target: Vertex[], floor: number) {
  const sideSegments = 32
  const points: [number, number][] = []
  const centerX = (landscapeBounds.left + landscapeBounds.right) / 2
  const centerZ = (landscapeBounds.back + landscapeBounds.front) / 2
  const outerScale = 1.85

  addGrassQuad(target, [landscapeBounds.left, floor, landscapeBounds.front], [landscapeBounds.right, floor,
    landscapeBounds.front], [landscapeBounds.right, floor, landscapeBounds.back], [landscapeBounds.left, floor,
    landscapeBounds.back])

  for (let i = 0; i < sideSegments; i++) {
    const t = i / sideSegments

    points.push([mix(landscapeBounds.left, landscapeBounds.right, t), landscapeBounds.back])
  }

  for (let i = 0; i < sideSegments; i++) {
    const t = i / sideSegments

    points.push([landscapeBounds.right, mix(landscapeBounds.back, landscapeBounds.front, t)])
  }

  for (let i = 0; i < sideSegments; i++) {
    const t = i / sideSegments

    points.push([mix(landscapeBounds.right, landscapeBounds.left, t), landscapeBounds.front])
  }

  for (let i = 0; i < sideSegments; i++) {
    const t = i / sideSegments

    points.push([landscapeBounds.left, mix(landscapeBounds.front, landscapeBounds.back, t)])
  }

  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length
    const a = points[i]!
    const b = points[next]!
    const aHill = horizonHill(i, points.length)
    const bHill = horizonHill(next, points.length)
    const outerA: [number, number] = [
      centerX + (a[0] - centerX) * outerScale,
      centerZ + (a[1] - centerZ) * outerScale,
    ]
    const outerB: [number, number] = [
      centerX + (b[0] - centerX) * outerScale,
      centerZ + (b[1] - centerZ) * outerScale,
    ]

    addHorizonQuad(target, [a[0], floor, a[1]], [b[0], floor, b[1]], [outerB[0], floor + bHill, outerB[1]], [outerA[0],
      floor + aHill, outerA[1]])
  }
}

function horizonHill(index: number, total: number) {
  const t = index / total

  return 2.2
    + Math.sin(t * Math.PI * 2 * 7.0) * 1.05
    + Math.sin(t * Math.PI * 2 * 13.0 + 1.7) * 0.62
    + Math.sin(t * Math.PI * 2 * 23.0 + 0.4) * 0.34
}

function addHorizonQuad(
  target: Vertex[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
) {
  const color: Vec3 = [0.018, 0.16, 0.04]

  target.push(packGrass(a, color), packGrass(b, color), packGrass(c, color))
  target.push(packGrass(a, color), packGrass(c, color), packGrass(d, color))
}

function addDjBooth(target: Vertex[]) {
  addDjBoothAt(target, djBooth, djSpeakers, 1, [1, 0.03, 0.015], 0.45)
}

function addDjBoothAt(target: Vertex[], booth: Bounds, speakers: Bounds[], direction: number, accent: Vec3,
  accentGlow: number)
{
  const body: Vec3 = [0.026, 0.018, 0.021]
  const top: Vec3 = [0.006, 0.006, 0.008]
  const dark: Vec3 = [0.012, 0.011, 0.014]
  const cone: Vec3 = [0.05, 0.047, 0.043]
  const y = -2
  const scale = 0.75

  addBox(target, booth.x, y + 0.33, booth.z, booth.width, 0.66, booth.depth, body, 0)
  addBox(target, booth.x, y + 0.7, booth.z + direction * 0.045, booth.width + 0.38 * scale, 0.12,
    booth.depth + 0.28 * scale, top, 0)
  addBox(target, booth.x - 0.82 * scale, y + 0.81, booth.z + direction * 0.21, 0.645 * scale, 0.039, 0.465 * scale,
    dark, 0)
  addBox(target, booth.x + 0.82 * scale, y + 0.81, booth.z + direction * 0.21, 0.645 * scale, 0.039, 0.465 * scale,
    dark, 0)
  addDisc(target, [booth.x - 0.82 * scale, y + 0.84, booth.z + direction * 0.21], 0.27 * scale, 0.21 * scale, 'y',
    accent, accentGlow)
  addDisc(target, [booth.x + 0.82 * scale, y + 0.84, booth.z + direction * 0.21], 0.27 * scale, 0.21 * scale, 'y',
    accent, accentGlow)
  addBox(target, booth.x, y + 0.835, booth.z + direction * 0.24, 0.56 * scale, 0.045, 0.68 * scale, [0.035, 0.034,
    0.036], 0)

  for (const speaker of speakers) {
    addSpeakerStack(target, speaker, body, dark, cone, direction)
  }
}

function addSpeakerStack(target: Vertex[], bounds: Bounds, body: Vec3, dark: Vec3, cone: Vec3, direction: number) {
  const y = -2
  const front = bounds.z + direction * (bounds.depth / 2 + 0.012)

  addBox(target, bounds.x, y + 0.72, bounds.z, bounds.width, 1.44, bounds.depth, body, 0)
  addBox(target, bounds.x, y + 1.6, bounds.z, bounds.width * 0.82, 0.54, bounds.depth * 0.82, dark, 0)
  addDisc(target, [bounds.x, y + 0.9, front], 0.24, 0.24, 'z', cone, 0)
  addDisc(target, [bounds.x, y + 0.39, front], 0.165, 0.165, 'z', cone, 0)
  addDisc(target, [bounds.x, y + 1.6, front], 0.15, 0.15, 'z', cone, 0)
}

function addBox(
  target: Vertex[],
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  color: Vec3,
  glow: number,
  strobe = 0,
) {
  const left = x - width / 2
  const right = x + width / 2
  const bottom = y - height / 2
  const top = y + height / 2
  const front = z + depth / 2
  const back = z - depth / 2

  addQuad(target, [left, bottom, front], [right, bottom, front], [right, top, front], [left, top, front], color, glow,
    strobe)
  addQuad(target, [right, bottom, back], [left, bottom, back], [left, top, back], [right, top, back], color, glow,
    strobe)
  addQuad(target, [left, bottom, back], [left, bottom, front], [left, top, front], [left, top, back], color, glow,
    strobe)
  addQuad(target, [right, bottom, front], [right, bottom, back], [right, top, back], [right, top, front], color, glow,
    strobe)
  addQuad(target, [left, top, front], [right, top, front], [right, top, back], [left, top, back], color, glow, strobe)
  addQuad(target, [left, bottom, back], [right, bottom, back], [right, bottom, front], [left, bottom, front], color,
    glow, strobe)
}

function addDisc(
  target: Vertex[],
  center: Vec3,
  radiusX: number,
  radiusY: number,
  axis: 'y' | 'z',
  color: Vec3,
  glow: number,
) {
  const segments = 18

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const b = ((i + 1) / segments) * Math.PI * 2
    const pointA: Vec3 = axis === 'y'
      ? [center[0] + Math.cos(a) * radiusX, center[1], center[2] + Math.sin(a) * radiusY]
      : [center[0] + Math.cos(a) * radiusX, center[1] + Math.sin(a) * radiusY, center[2]]
    const pointB: Vec3 = axis === 'y'
      ? [center[0] + Math.cos(b) * radiusX, center[1], center[2] + Math.sin(b) * radiusY]
      : [center[0] + Math.cos(b) * radiusX, center[1] + Math.sin(b) * radiusY, center[2]]

    target.push(pack(center, color, glow), pack(pointA, color, glow), pack(pointB, color, glow))
  }
}

function addWallStrips(target: Vertex[]) {
  let id = 101

  for (const z of [-2, -6, -10, -14, -18, -22]) {
    addSideStrip(target, -6.98, z, id++)
    addSideStrip(target, 6.98, z, id++)
  }

  for (const x of [-4.5, 0, 4.5]) {
    if (x !== 0) {
      addEndStrip(target, x, -23.98, id++)
    }

    if (x !== -4.5) {
      addEndStrip(target, x, 3.98, id++)
    }
  }

  addDjBoothStrip(target, djBooth, 1, [1, 0.03, 0.015], 2.15)
  addDjBoothStrip(target, outsideDjBooth, -1, electricNavy, 3.2)
  addBartenderBarStrip(target)
  addBartenderBottleGlow(target)
}

function addSideStrip(target: Vertex[], x: number, z: number, id: number) {
  addQuad(
    target,
    [x, -1.25, z - 0.24],
    [x, 3.75, z - 0.24],
    [x, 3.75, z - 0.09],
    [x, -1.25, z - 0.09],
    [0.22, 0.006, 0.004],
    0.08,
    id,
  )

  addQuad(
    target,
    [x, -1.25, z - 0.09],
    [x, 3.75, z - 0.09],
    [x, 3.75, z + 0.09],
    [x, -1.25, z + 0.09],
    [1, 0.03, 0.015],
    2.15,
    id,
  )

  addQuad(
    target,
    [x, -1.25, z + 0.09],
    [x, 3.75, z + 0.09],
    [x, 3.75, z + 0.24],
    [x, -1.25, z + 0.24],
    [0.22, 0.006, 0.004],
    0.08,
    id,
  )
}

function addEndStrip(target: Vertex[], x: number, z: number, id: number) {
  addQuad(
    target,
    [x - 0.24, -1.25, z],
    [x - 0.09, -1.25, z],
    [x - 0.09, 3.75, z],
    [x - 0.24, 3.75, z],
    [0.22, 0.006, 0.004],
    0.08,
    id,
  )

  addQuad(
    target,
    [x - 0.09, -1.25, z],
    [x + 0.09, -1.25, z],
    [x + 0.09, 3.75, z],
    [x - 0.09, 3.75, z],
    [1, 0.03, 0.015],
    2.15,
    id,
  )

  addQuad(
    target,
    [x + 0.09, -1.25, z],
    [x + 0.24, -1.25, z],
    [x + 0.24, 3.75, z],
    [x + 0.09, 3.75, z],
    [0.22, 0.006, 0.004],
    0.08,
    id,
  )
}

function addDjBoothStrip(target: Vertex[], booth: Bounds, direction: number, color: Vec3, glow: number) {
  const y = -1.54
  const z = booth.z + direction * 0.91
  const width = booth.width - 0.45
  const height = 0.07

  addBox(target, booth.x, y, z, width, height, 0.06, color, glow)
}

function addBartenderBarStrip(target: Vertex[]) {
  addBox(target, bartenderBar.x, -1.54, bartenderBar.z - bartenderBar.depth / 2 - 0.16, bartenderBar.width - 0.45, 0.07,
    0.06, [1, 0.03, 0.015], 2.15)
}

function addBartenderBottleGlow(target: Vertex[]) {
  const y = -2

  for (const shelfY of [0.98, 1.58]) {
    for (let i = 0; i < 8; i++) {
      const x = bartenderBar.x - 1.38 + i * 0.39
      const height = 0.27 + (i % 3) * 0.07

      addBox(target, x, y + shelfY + 0.06 + height / 2, roomBounds.front - 0.3, 0.1, height, 0.08, [1, 0.03, 0.015],
        0.72)
    }
  }
}

function addRoomSmoke(target: Vertex[]) {
  for (let i = 0; i < 82; i++) {
    const seed = i + 1
    const x = mix(-5.4, 5.4, smokeRandom(seed * 11.7))
    const y = mix(-1.35, 1.4, smokeRandom(seed * 19.1) ** 1.8)
    const z = mix(-22.5, 1.8, smokeRandom(seed * 31.3))
    const width = mix(1.8, 5.1, smokeRandom(seed * 47.9))
    const height = mix(0.8, 2.35, smokeRandom(seed * 61.5))
    const opacity = mix(0.045, 0.12, smokeRandom(seed * 73.3))

    addSmokePatch(target, [x, y, z], width, height, opacity, seed)
  }
}

function addSmokePatch(
  target: Vertex[],
  center: [number, number, number],
  width: number,
  height: number,
  opacity: number,
  seed: number,
) {
  const left = -width / 2
  const right = width / 2
  const bottom = -height / 2
  const top = height / 2

  target.push(
    packSmoke(center, left, bottom, opacity, seed, 0, 0),
    packSmoke(center, right, bottom, opacity, seed, 1, 0),
    packSmoke(center, right, top, opacity, seed, 1, 1),
  )
  target.push(
    packSmoke(center, left, bottom, opacity, seed, 0, 0),
    packSmoke(center, right, top, opacity, seed, 1, 1),
    packSmoke(center, left, top, opacity, seed, 0, 1),
  )
}

function smokeRandom(seed: number) {
  const value = Math.sin(seed * 127.1) * 43758.5453123

  return value - Math.floor(value)
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)

  return t * t * (3 - 2 * t)
}

function addCeilingBeams(target: Vertex[], time: number) {
  for (const light of strobeLights) {
    if (light.zone !== videoZone) {
      continue
    }

    const hit = strobeTarget(light, time)

    addBeam(target, light, hit[0], hit[2])
    addFloorPool(target, light, hit[0], hit[2])
  }
}

function addBeam(target: Vertex[], light: StrobeLight, targetX: number, targetZ: number) {
  const shells = [
    { radiusX: light.zone === 'outside' ? 1.35 : 0.5, radiusZ: light.zone === 'outside' ? 1.85 : 0.68,
      glow: light.zone === 'outside' ? 0.7 : 0.42, color: light.color },
  ]
  const segments = 20

  for (let shell = 0; shell < shells.length; shell++) {
    const layer = shells[shell]!
    const offset = shell * Math.PI / segments
    const uvOffset = shell * 0.37

    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2 + offset
      const b = ((i + 1) / segments) * Math.PI * 2 + offset
      const uA = i / segments + uvOffset
      const uB = (i + 1) / segments + uvOffset
      const topA: [number, number, number] = [light.x + Math.cos(a) * 0.07, light.top, light.z + Math.sin(a) * 0.07]
      const topB: [number, number, number] = [light.x + Math.cos(b) * 0.07, light.top, light.z + Math.sin(b) * 0.07]
      const bottomA: [number, number, number] = [targetX + Math.cos(a) * layer.radiusX, light.floor,
        targetZ + Math.sin(a) * layer.radiusZ]
      const bottomB: [number, number, number] = [targetX + Math.cos(b) * layer.radiusX, light.floor,
        targetZ + Math.sin(b) * layer.radiusZ]

      target.push(
        pack(topA, layer.color, layer.glow * 0.18, light.id, uA, 0, 1),
        pack(topB, layer.color, layer.glow * 0.18, light.id, uB, 0, 1),
        pack(bottomB, layer.color, layer.glow, light.id, uB, 1, 1),
      )
      target.push(
        pack(topA, layer.color, layer.glow * 0.18, light.id, uA, 0, 1),
        pack(bottomB, layer.color, layer.glow, light.id, uB, 1, 1),
        pack(bottomA, layer.color, layer.glow, light.id, uA, 1, 1),
      )
    }
  }
}

function addFloorPool(target: Vertex[], light: StrobeLight, x: number, z: number) {
  const center: [number, number, number] = [x, light.floor + 0.02, z]
  const color = light.color
  const innerRadius = 0.82
  const outerRadiusX = 1.75
  const outerRadiusZ = 2.2
  const segments = 32

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const b = ((i + 1) / segments) * Math.PI * 2
    const innerA: [number, number, number] = [x + Math.cos(a) * innerRadius, light.floor + 0.02,
      z + Math.sin(a) * innerRadius]
    const innerB: [number, number, number] = [x + Math.cos(b) * innerRadius, light.floor + 0.02,
      z + Math.sin(b) * innerRadius]
    const edgeA: [number, number, number] = [x + Math.cos(a) * outerRadiusX, light.floor + 0.02,
      z + Math.sin(a) * outerRadiusZ]
    const edgeB: [number, number, number] = [x + Math.cos(b) * outerRadiusX, light.floor + 0.02,
      z + Math.sin(b) * outerRadiusZ]

    target.push(pack(center, color, 1.08, light.id), pack(innerA, color, 0.9, light.id),
      pack(innerB, color, 0.9, light.id))
    target.push(pack(innerA, color, 0.34, light.id), pack(edgeA, color, 0.08, light.id),
      pack(edgeB, color, 0.08, light.id))
    target.push(pack(innerA, color, 0.34, light.id), pack(edgeB, color, 0.08, light.id),
      pack(innerB, color, 0.34, light.id))
  }
}

function addQuad(
  target: Vertex[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
  color: [number, number, number],
  glow: number,
  strobe = 0,
) {
  target.push(pack(a, color, glow, strobe), pack(b, color, glow, strobe), pack(c, color, glow, strobe))
  target.push(pack(a, color, glow, strobe), pack(c, color, glow, strobe), pack(d, color, glow, strobe))
}

function addGrassQuad(
  target: Vertex[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
) {
  const color: Vec3 = [0.05, 0.34, 0.08]

  target.push(packGrass(a, color), packGrass(b, color), packGrass(c, color))
  target.push(packGrass(a, color), packGrass(c, color), packGrass(d, color))
}

function pack(
  point: [number, number, number],
  color: [number, number, number],
  glow: number,
  strobe = 0,
  u = 0,
  v = 0,
  haze = 0,
): Vertex {
  return [point[0], point[1], point[2], color[0], color[1], color[2], glow, strobe, u, v, haze]
}

function packGrass(point: [number, number, number], color: [number, number, number]): Vertex {
  return pack(point, color, 0, 0, point[0] * 0.08, point[2] * 0.08, 2)
}

function packSmoke(
  center: [number, number, number],
  x: number,
  y: number,
  opacity: number,
  seed: number,
  u: number,
  v: number,
): Vertex {
  return [center[0], center[1], center[2], x, y, opacity, 0, seed, u, v, 0]
}

function createProgram(context: WebGL2RenderingContext, sourceVertex: string, sourceFragment: string) {
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

function createShader(context: WebGL2RenderingContext, type: number, source: string) {
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
