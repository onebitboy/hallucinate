export type Vec3 = [number, number, number]
export type Quat = [number, number, number, number]
export type Mat4 = [
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

export type AssimpNode = {
  name: string
  transformation?: number[]
  children?: AssimpNode[]
}

export type AssimpChannel = {
  name: string
  positionkeys?: [number, Vec3][]
  rotationkeys?: [number, Quat][]
  scalingkeys?: [number, Vec3][]
}

export type AssimpAnimation = {
  duration?: number
  tickspersecond?: number
  channels?: AssimpChannel[]
}

export type AssimpScene = {
  rootnode: AssimpNode
  meshes?: AssimpMesh[]
  animations?: AssimpAnimation[]
}

export type AssimpMesh = {
  name: string
  vertices: number[]
  faces: number[][]
}

export type CharacterClip = {
  duration: number
  ticksPerSecond: number
  channels: Map<string, AssimpChannel>
}

export type HairMesh = {
  name: string
  localTriangles: number[]
}

export type TreeMesh = {
  points: Vec3[]
  faces: number[][]
  color: Vec3
}

export type VideoZone = 'inside' | 'outside'

export type YouTubePlayer = {
  cueVideoById(options: { videoId: string; startSeconds: number }): void
  getCurrentTime(): number
  loadVideoById(options: { videoId: string; startSeconds: number }): void
  pauseVideo(): void
  playVideo(): void
}

export type YouTubeConstructor = new(
  element: HTMLElement,
  options: {
    events: { onReady: () => void }
    playerVars: Record<string, number>
  },
) => YouTubePlayer

export type YouTubeWindow = Window & {
  YT?: {
    Player: YouTubeConstructor
  }
  onYouTubeIframeAPIReady?: () => void
}

export type CharacterRig = {
  root: AssimpNode
  nodes: RigNode[]
  clips: Record<CharacterMode, CharacterClip>
}

export type RigNode = {
  name: string
  parent: number
  helper: boolean
  transform: Mat4
  origin: Vec3
}

export type CharacterMode = 'stand' | 'run'
export type BottomMode = 'pants' | 'skirt'
export type TopMode = 'shirt' | 'sleeveless' | 'skin' | 'chest'
export type CharacterPart = {
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

export type PlayerStyle = {
  topStyleIndex: number
  bottomStyleIndex: number
  hairIndex: number
  hairColorIndex: number
}

export type ResolvedPlayerStyle = {
  topMode: TopMode
  bottomMode: BottomMode
  shirt: Vec3
  shirtLight: Vec3
  pants: Vec3
  shoe: Vec3
  hairColor: Vec3
}

export type PlayerDestination = {
  position: Vec3
  lookAt?: Vec3
}

export type Player = {
  position: Vec3
  turn: number
  motionBlend: number
  input: Vec3
  nextDecision: number
  destination: PlayerDestination
  style: PlayerStyle
  resolvedStyle: ResolvedPlayerStyle
  seed: number
}

export type SampledPose = {
  stand: Map<string, Vec3>
  run: Map<string, Vec3>
}

export type PoseBlendCache = Map<number, Map<string, Vec3>>

export type CharacterBoxGeometry = {
  data: Float32Array
  count: number
}

export type StrobeLight = {
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

export type StrobeReflectionLight = {
  light: StrobeLight
  target: Vec3
}

export type Vertex = [
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

export type Target = {
  frame: WebGLFramebuffer
  color: WebGLTexture
  depth: WebGLRenderbuffer
  width: number
  height: number
}

export type Bounds = {
  x: number
  z: number
  width: number
  depth: number
}

export type CircleBounds = {
  x: number
  z: number
  radius: number
}

export type HairRenderMesh = {
  array: WebGLVertexArrayObject
  vertexBuffer: WebGLBuffer
  instanceBuffer: WebGLBuffer
  vertexCount: number
  instanceCount: number
}

export type HairInstance = {
  meshIndex: number
  center: Vec3
  side: Vec3
  up: Vec3
  forward: Vec3
  color: Vec3
}

export type ClubGlobal = typeof globalThis & {
  clubFrameId?: number
  clubCharacterRigLoad?: Promise<CharacterRig>
}
