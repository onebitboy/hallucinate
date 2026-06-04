import type { VideoEndedEntry, VideoProgressEntry, VideoSyncEntry } from './protocol.ts'
import { projectedQuadTransform, projectWallPointWithMinDepthInto } from './projection.ts'
import type { ProjectedPoint, WallProjector } from './projection.ts'
import { djVideoWall, outsideVideoWall, tentVideoWall, videoPlaylists } from './scene-data.ts'
import { roomAt } from './scene.ts'
import type { Vec3, VideoZone, YouTubePlayer, YouTubeWindow } from './types.ts'

type Camera = { eye: Vec3; center: Vec3 }
type Wall = typeof djVideoWall
type VideoTrackState = {
  currentId: string
  nextId?: string
  time: number
}

const endedState = 0
const endedTimeTolerance = 5
const videoNearDepth = 0.05
const playlistDiscoveryDelay = 1000
const playlistDiscoveryAttempts = 5
const syncSeekTolerance = 2

export function videoZones(): VideoZone[] {
  return ['inside', 'outside', 'tent']
}

export function createDjVideoUi(
  element: HTMLElement,
  position: Vec3,
  options: {
    onEnded?: (entry: VideoEndedEntry) => void
    onPlaylistDiscovered?: (zone: VideoZone, ids: string[]) => void
    recoverFocus?: () => void
  } = {},
) {
  const layers: Record<VideoZone, HTMLElement> = {
    inside: document.createElement('div'),
    outside: document.createElement('div'),
    tent: document.createElement('div'),
  }
  const mounts: Record<VideoZone, HTMLElement> = {
    inside: document.createElement('div'),
    outside: document.createElement('div'),
    tent: document.createElement('div'),
  }
  const states: Partial<Record<VideoZone, VideoTrackState>> = {}
  const players: Partial<Record<VideoZone, YouTubePlayer>> = {}
  const ready: Partial<Record<VideoZone, boolean>> = {}
  const discoveringPlaylists: Partial<Record<VideoZone, boolean>> = {}
  const reportedPlaylists: Partial<Record<VideoZone, string>> = {}
  let zone: VideoZone = roomAt(position)
  let playUnlocked = false
  const setElementStyle = createStyleSetter(element.style)
  const setInsideStyle = createStyleSetter(layers.inside.style)
  const setOutsideStyle = createStyleSetter(layers.outside.style)
  const cornerA: Vec3 = [0, 0, 0]
  const cornerB: Vec3 = [0, 0, 0]
  const cornerC: Vec3 = [0, 0, 0]
  const cornerD: Vec3 = [0, 0, 0]
  const pointA: ProjectedPoint = { x: 0, y: 0 }
  const pointB: ProjectedPoint = { x: 0, y: 0 }
  const pointC: ProjectedPoint = { x: 0, y: 0 }
  const pointD: ProjectedPoint = { x: 0, y: 0 }
  const points = [pointA, pointB, pointC, pointD]
  let pointerPassthroughUntil = 0

  addEventListener('blur', () => {
    setTimeout(() => {
      const active = document.activeElement

      if (!(active instanceof HTMLIFrameElement) || !element.contains(active)) {
        return
      }

      pointerPassthroughUntil = performance.now() + 1200
      options.recoverFocus?.()
    })
  })

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
    get zone() {
      return zone
    },
    setZoneFromPosition() {
      zone = roomAt(position)
    },
    applySync(entries: VideoSyncEntry[]) {
      for (const entry of entries) {
        states[entry.zone] = {
          currentId: entry.currentId,
          nextId: entry.nextId,
          time: entry.time,
        }

        if (ready[entry.zone]) {
          loadSyncedTrack(entry.zone, entry.time)
        }
      }

      pauseOtherVideos(zone, players, ready)
    },
    progress(): VideoProgressEntry | undefined {
      syncZoneTime(zone, players, ready, states)
      const state = states[zone]

      return state
        ? { zone, id: state.currentId, time: state.time }
        : undefined
    },
    requestPlaylists(zones: VideoZone[]) {
      for (const area of zones) {
        requestPlaylist(area)
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
                players[area]!.setLoop(false)

                if (states[area]) {
                  loadSyncedTrack(area, states[area]!.time)
                }
                else {
                  players[area]!.pauseVideo()
                }
              },
              onStateChange(event) {
                if (area !== zone) {
                  players[area]!.pauseVideo()
                  return
                }

                if (event.data === endedState) {
                  if (!videoFinished(area)) {
                    players[area]!.seekTo(states[area]!.time, true)
                    players[area]!.playVideo()
                    return
                  }

                  playQueuedTrack(area)
                  pauseOtherVideos(area, players, ready)
                  return
                }

                syncZoneTime(area, players, ready, states)
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
      const nextZone: VideoZone = roomAt(position)

      if (nextZone !== zone) {
        syncZoneTime(zone, players, ready, states)
        if (ready[zone]) {
          players[zone]!.pauseVideo()
        }

        zone = nextZone

        if (ready[zone] && states[zone]) {
          loadSyncedTrack(zone, states[zone]!.time)
        }
        pauseOtherVideos(zone, players, ready)
      }

      const wall = videoWall(nextZone)

      if (!djVideoFacesCamera(camera, wall)) {
        setElementStyle('opacity', '0')
        setInsideStyle('pointerEvents', 'none')
        setOutsideStyle('pointerEvents', 'none')
        layers.tent.style.pointerEvents = 'none'
        return
      }

      const bottom = wall.y - wall.height / 2
      const top = wall.y + wall.height / 2
      if (Math.abs(wall.normal[0]) > 0) {
        const back = wall.z - wall.width / 2
        const front = wall.z + wall.width / 2

        if (wall.normal[0] < 0) {
          setPoint(cornerA, wall.x, bottom, back)
          setPoint(cornerB, wall.x, bottom, front)
          setPoint(cornerC, wall.x, top, front)
          setPoint(cornerD, wall.x, top, back)
        }
        else {
          setPoint(cornerA, wall.x, bottom, front)
          setPoint(cornerB, wall.x, bottom, back)
          setPoint(cornerC, wall.x, top, back)
          setPoint(cornerD, wall.x, top, front)
        }
      }
      else if (wall.normal[2] < 0) {
        const left = wall.x - wall.width / 2
        const right = wall.x + wall.width / 2

        setPoint(cornerA, right, bottom, wall.z)
        setPoint(cornerB, left, bottom, wall.z)
        setPoint(cornerC, left, top, wall.z)
        setPoint(cornerD, right, top, wall.z)
      }
      else {
        const left = wall.x - wall.width / 2
        const right = wall.x + wall.width / 2

        setPoint(cornerA, left, bottom, wall.z)
        setPoint(cornerB, right, bottom, wall.z)
        setPoint(cornerC, right, top, wall.z)
        setPoint(cornerD, left, top, wall.z)
      }

      projectWallPointWithMinDepthInto(cornerA, projector, pointA, videoNearDepth)
      projectWallPointWithMinDepthInto(cornerB, projector, pointB, videoNearDepth)
      projectWallPointWithMinDepthInto(cornerC, projector, pointC, videoNearDepth)
      projectWallPointWithMinDepthInto(cornerD, projector, pointD, videoNearDepth)

      setElementStyle('opacity', '0.74')
      setInsideStyle('opacity', zone === 'inside' ? '1' : '0')
      setOutsideStyle('opacity', zone === 'outside' ? '1' : '0')
      layers.tent.style.opacity = zone === 'tent' ? '1' : '0'
      const pointerEvents = performance.now() > pointerPassthroughUntil ? 'auto' : 'none'

      setInsideStyle('pointerEvents', zone === 'inside' ? pointerEvents : 'none')
      setOutsideStyle('pointerEvents', zone === 'outside' ? pointerEvents : 'none')
      layers.tent.style.pointerEvents = zone === 'tent' ? pointerEvents : 'none'
      setElementStyle('width', `${wall.width * 120}px`)
      setElementStyle('height', `${wall.height * 120}px`)
      setElementStyle('transform', projectedQuadTransform(
        wall.width * 120,
        wall.height * 120,
        points,
      ))
    },
    play() {
      playUnlocked = true

      if (!ready[zone]) {
        return false
      }

      if (states[zone]) {
        loadSyncedTrack(zone, states[zone]!.time)
      }
      pauseOtherVideos(zone, players, ready)

      return true
    },
  }

  function loadSyncedTrack(area: VideoZone, time: number) {
    const state = states[area]!
    const player = players[area]!
    const active = area === zone
    const shouldPlay = playUnlocked && active
    const loadedId = player.getVideoData()?.video_id

    state.time = time
    if (loadedId === state.currentId) {
      const currentTime = player.getCurrentTime()
      const shouldSeek = !shouldPlay || time > currentTime + syncSeekTolerance

      state.time = shouldSeek ? time : currentTime
      if (shouldSeek) {
        player.seekTo(time, true)
      }
      if (shouldPlay) {
        player.playVideo()
      }
      else {
        player.pauseVideo()
      }
      return
    }

    if (shouldPlay) {
      player.loadVideoById({ videoId: state.currentId, startSeconds: time })
      player.playVideo()
    }
    else {
      player.cueVideoById({ videoId: state.currentId, startSeconds: time })
      player.pauseVideo()
    }
  }

  function playQueuedTrack(area: VideoZone) {
    const state = states[area]

    if (!state?.nextId) {
      throw new Error(`Missing next video track for ${area}`)
    }

    const endedId = state.currentId

    state.currentId = state.nextId
    state.nextId = undefined
    state.time = 0
    players[area]!.loadVideoById({ videoId: state.currentId, startSeconds: 0 })
    players[area]!.playVideo()
    options.onEnded?.({ zone: area, id: endedId })
  }

  function videoFinished(area: VideoZone) {
    const state = states[area]!
    const player = players[area]!
    const time = Math.max(state.time, player.getCurrentTime())
    const duration = player.getDuration()

    state.time = time

    return duration > 0 && time + endedTimeTolerance >= duration
  }

  function requestPlaylist(area: VideoZone) {
    if (!videoPlaylists[area]) {
      return
    }

    if (discoveringPlaylists[area]) {
      return
    }

    if (!ready[area]) {
      discoveringPlaylists[area] = true
      setTimeout(() => {
        discoveringPlaylists[area] = false
        requestPlaylist(area)
      }, playlistDiscoveryDelay)
      return
    }

    discoveringPlaylists[area] = true
    players[area]!.cuePlaylist({
      index: 0,
      list: videoPlaylists[area]!,
      listType: 'playlist',
      startSeconds: 0,
    })
    setTimeout(() => reportDiscoveredPlaylist(area, 0), playlistDiscoveryDelay)
  }

  function reportDiscoveredPlaylist(area: VideoZone, attempt: number) {
    const ids = players[area]!.getPlaylist()

    if (ids?.length) {
      const key = ids.join('\n')

      discoveringPlaylists[area] = false
      if (reportedPlaylists[area] !== key) {
        reportedPlaylists[area] = key
        options.onPlaylistDiscovered?.(area, ids)
      }
      if (states[area]) {
        loadSyncedTrack(area, states[area]!.time)
      }
      return
    }

    if (attempt < playlistDiscoveryAttempts) {
      setTimeout(() => reportDiscoveredPlaylist(area, attempt + 1), playlistDiscoveryDelay)
      return
    }

    discoveringPlaylists[area] = false
    console.error(new Error(`Missing YouTube playlist ids for ${area}`))
  }
}

function videoWall(zone: VideoZone): Wall {
  if (zone === 'inside') {
    return djVideoWall
  }
  if (zone === 'outside') {
    return outsideVideoWall
  }

  return tentVideoWall
}

function syncZoneTime(
  area: VideoZone,
  players: Partial<Record<VideoZone, YouTubePlayer>>,
  ready: Partial<Record<VideoZone, boolean>>,
  states: Partial<Record<VideoZone, VideoTrackState>>,
) {
  const state = states[area]

  if (ready[area] && state && players[area]!.getVideoData()?.video_id === state.currentId) {
    state.time = players[area]!.getCurrentTime()
  }
}

function pauseOtherVideos(
  area: VideoZone,
  players: Partial<Record<VideoZone, YouTubePlayer>>,
  ready: Partial<Record<VideoZone, boolean>>,
) {
  for (const zone of videoZones()) {
    if (zone !== area && ready[zone]) {
      players[zone]!.pauseVideo()
    }
  }
}

function setPoint(target: Vec3, x: number, y: number, z: number) {
  target[0] = x
  target[1] = y
  target[2] = z
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
  const toCameraX = camera.eye[0] - wall.x
  const toCameraY = camera.eye[1] - wall.y
  const toCameraZ = camera.eye[2] - wall.z
  const toVideoX = wall.x - camera.eye[0]
  const toVideoY = wall.y - camera.eye[1]
  const toVideoZ = wall.z - camera.eye[2]
  const forwardX = camera.center[0] - camera.eye[0]
  const forwardY = camera.center[1] - camera.eye[1]
  const forwardZ = camera.center[2] - camera.eye[2]

  return wall.normal[0] * toCameraX + wall.normal[1] * toCameraY + wall.normal[2] * toCameraZ > 0
    && forwardX * toVideoX + forwardY * toVideoY + forwardZ * toVideoZ > 0
}
