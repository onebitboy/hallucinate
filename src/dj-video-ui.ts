import { dot, subtract } from './math.ts'
import { projectedQuadTransform, projectWallPoint } from './projection.ts'
import type { WallProjector } from './projection.ts'
import { djVideoWall, outsideVideoWall, videoTracks } from './scene-data.ts'
import { isOutside } from './scene.ts'
import type { Vec3, VideoZone, YouTubePlayer, YouTubeWindow } from './types.ts'

type Camera = { eye: Vec3; center: Vec3 }
type Wall = typeof djVideoWall

export function videoZones(): VideoZone[] {
  return ['inside', 'outside']
}

export function createDjVideoUi(
  element: HTMLElement,
  position: Vec3,
) {
  const layers: Record<VideoZone, HTMLElement> = {
    inside: document.createElement('div'),
    outside: document.createElement('div'),
  }
  const mounts: Record<VideoZone, HTMLElement> = {
    inside: document.createElement('div'),
    outside: document.createElement('div'),
  }
  const times: Record<VideoZone, number> = {
    inside: 0,
    outside: 0,
  }
  const players: Partial<Record<VideoZone, YouTubePlayer>> = {}
  const ready: Partial<Record<VideoZone, boolean>> = {}
  let zone: VideoZone = isOutside(position) ? 'outside' : 'inside'
  const setElementStyle = createStyleSetter(element.style)
  const setInsideStyle = createStyleSetter(layers.inside.style)
  const setOutsideStyle = createStyleSetter(layers.outside.style)

  for (const area of videoZones()) {
    const layer = layers[area]
    const mount = mounts[area]

    layer.style.position = 'absolute'
    layer.style.inset = '0'
    layer.style.width = '100%'
    layer.style.height = '100%'
    layer.style.opacity = '0'
    layer.style.pointerEvents = 'none'
    mount.style.width = '100%'
    mount.style.height = '100%'
    layer.append(mount)
    element.append(layer)
  }

  return {
    times,
    get zone() {
      return zone
    },
    setZoneFromPosition() {
      zone = isOutside(position) ? 'outside' : 'inside'
    },
    syncCurrentTime() {
      for (const area of videoZones()) {
        if (ready[area]) {
          times[area] = players[area]!.getCurrentTime()
        }
      }
    },
    load() {
      const youtube = window as YouTubeWindow

      youtube.onYouTubeIframeAPIReady = () => {
        for (const area of videoZones()) {
          players[area] = new youtube.YT!.Player(mounts[area], {
            playerVars: {
              autoplay: 0,
              controls: 1,
              playsinline: 1,
              enablejsapi: 1,
            },
            events: {
              onReady() {
                ready[area] = true
                const load = area === zone ? players[area]!.loadVideoById : players[area]!.cueVideoById

                load.call(players[area]!, {
                  videoId: videoTracks[area],
                  startSeconds: times[area],
                })

                if (area === zone) {
                  players[area]!.playVideo()
                }
                else {
                  players[area]!.pauseVideo()
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
    },
    update(camera: Camera, projector: WallProjector) {
      const nextZone: VideoZone = isOutside(position) ? 'outside' : 'inside'

      if (nextZone !== zone) {
        if (ready[zone]) {
          times[zone] = players[zone]!.getCurrentTime()
          players[zone]!.pauseVideo()
        }

        zone = nextZone

        if (ready[zone]) {
          players[zone]!.playVideo()
        }
      }

      const wall = isOutside(position) ? outsideVideoWall : djVideoWall

      if (!djVideoFacesCamera(camera, wall)) {
        setElementStyle('opacity', '0')
        setInsideStyle('pointerEvents', 'none')
        setOutsideStyle('pointerEvents', 'none')
        return
      }

      const left = wall.x - wall.width / 2
      const right = wall.x + wall.width / 2
      const bottom = wall.y - wall.height / 2
      const top = wall.y + wall.height / 2
      const points = wall.normal[2] < 0
        ? [
          projectWallPoint([right, bottom, wall.z], projector),
          projectWallPoint([left, bottom, wall.z], projector),
          projectWallPoint([left, top, wall.z], projector),
          projectWallPoint([right, top, wall.z], projector),
        ]
        : [
          projectWallPoint([left, bottom, wall.z], projector),
          projectWallPoint([right, bottom, wall.z], projector),
          projectWallPoint([right, top, wall.z], projector),
          projectWallPoint([left, top, wall.z], projector),
        ]

      setElementStyle('opacity', '0.74')
      setInsideStyle('opacity', zone === 'inside' ? '1' : '0')
      setOutsideStyle('opacity', zone === 'outside' ? '1' : '0')
      setInsideStyle('pointerEvents', zone === 'inside' ? 'auto' : 'none')
      setOutsideStyle('pointerEvents', zone === 'outside' ? 'auto' : 'none')
      setElementStyle('width', `${wall.width * 120}px`)
      setElementStyle('height', `${wall.height * 120}px`)
      setElementStyle('transform', projectedQuadTransform(
        wall.width * 120,
        wall.height * 120,
        points,
      ))
    },
  }
}

type StyleName = 'height' | 'opacity' | 'pointerEvents' | 'transform' | 'width'

function createStyleSetter(style: CSSStyleDeclaration) {
  const values = new Map<StyleName, string>()

  return (name: StyleName, value: string) => {
    if (values.get(name) !== value) {
      values.set(name, value)
      style[name] = value
    }
  }
}

function djVideoFacesCamera(camera: Camera, wall: Wall) {
  const center: Vec3 = [wall.x, wall.y, wall.z]
  const toCamera = subtract(camera.eye, center)
  const toVideo = subtract(center, camera.eye)
  const forward = subtract(camera.center, camera.eye)

  return dot(wall.normal, toCamera) > 0 && dot(forward, toVideo) > 0
}
