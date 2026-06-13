import { createDomWallProjection } from './dom-wall.ts'
import type { DomWall } from './dom-wall.ts'
import type { WallProjector } from './projection.ts'
import type { VideoSyncPacket } from './protocol.ts'
import { djVideoWall, loftVideoWall, outsideVideoScreenWall, tentVideoWall, upstairsVideoWall, videoPlaylists,
  videoStartTimes, videoTracks } from './scene-data.ts'
import { roomAt } from './scene.ts'
import { createStyleSetter } from './style-setter.ts'
import type { Vec3, VideoPreview, VideoZone, YouTubePlayer, YouTubeWindow } from './types.ts'

type Camera = { eye: Vec3; center: Vec3 }
type VideoTrackState = {
  currentId: string
  nextId: string
  startedAt: number
  duration: number
  updatedAt: number
}

const endedState = 0
const playlistDiscoveryDelay = 1000
const playlistDiscoveryAttempts = 5
const syncSeekTolerance = 2
const hiddenDjVideoOpacity = '0.01'
const parkedDjVideoSize = 12

export function videoZones(): VideoZone[] {
  return ['inside', 'outside', 'upstairs', 'tent', 'loft']
}

export function createDjVideoUi(
  element: HTMLElement,
  position: Vec3,
  options: {
    onPlaylistDiscovered?: (zone: VideoZone, ids: string[]) => void
    playlistSource?: (zone: VideoZone) => string | undefined
    recoverFocus?: () => void
    zone?: () => VideoZone
  } = {},
) {
  const layers: Record<VideoZone, HTMLElement> = {
    inside: document.createElement('div'),
    loft: document.createElement('div'),
    outside: document.createElement('div'),
    tent: document.createElement('div'),
    upstairs: document.createElement('div'),
  }
  const mounts: Record<VideoZone, HTMLElement> = {
    inside: document.createElement('div'),
    loft: document.createElement('div'),
    outside: document.createElement('div'),
    tent: document.createElement('div'),
    upstairs: document.createElement('div'),
  }
  const states: Partial<Record<VideoZone, VideoTrackState>> = {}
  const players: Partial<Record<VideoZone, YouTubePlayer>> = {}
  const ready: Partial<Record<VideoZone, boolean>> = {}
  const discoveringPlaylists: Partial<Record<VideoZone, boolean>> = {}
  const reportedPlaylists: Partial<Record<VideoZone, string>> = {}
  let zone: VideoZone = currentZone()
  let playUnlocked = false
  let serverTimeOffset = 0
  let scheduleTimer: ReturnType<typeof setTimeout> | undefined
  const parkedDjVideoSizePx = `${parkedDjVideoSize}px`
  const projection = createDomWallProjection(element, {
    hidden: {
      height: parkedDjVideoSizePx,
      opacity: hiddenDjVideoOpacity,
      transform: `translate3d(calc(100dvw - ${parkedDjVideoSizePx}), calc(100dvh - ${parkedDjVideoSizePx}), 0)`,
      width: parkedDjVideoSizePx,
    },
    opacity: '0.74',
  })
  const setInsideStyle = createStyleSetter(layers.inside.style)
  const setLoftStyle = createStyleSetter(layers.loft.style)
  const setOutsideStyle = createStyleSetter(layers.outside.style)
  const setUpstairsStyle = createStyleSetter(layers.upstairs.style)
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

  function currentZone() {
    return options.zone?.() ?? roomAt(position)
  }

  function playlistSource(area: VideoZone) {
    return options.playlistSource?.(area) ?? videoPlaylists[area]
  }

  return {
    get zone() {
      return zone
    },
    setZoneFromPosition() {
      zone = currentZone()
    },
    applySync(packet: VideoSyncPacket) {
      serverTimeOffset = packet.serverTime - performance.now()

      for (const entry of packet.entries) {
        states[entry.zone] = {
          currentId: entry.currentId,
          nextId: entry.nextId,
          startedAt: entry.startedAt,
          duration: entry.duration,
          updatedAt: performance.now(),
        }

        if (ready[entry.zone]) {
          loadScheduledTrack(entry.zone)
        }
      }

      scheduleTrackBoundary()
      pauseOtherVideos(zone, players, ready)
    },
    requestPlaylists(zones: VideoZone[]) {
      for (const area of zones) {
        requestPlaylist(area)
      }
    },
    preview(area = zone): VideoPreview | undefined {
      const state = currentScheduledState(area)
      const id = state?.currentId || players[area]?.getVideoData()?.video_id || videoTracks[area]

      return id ? { id, zone: area } : undefined
    },
    canPlay() {
      return videoReady(zone)
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
                  loadScheduledTrack(area)
                }
                else {
                  cueFallbackTrack(area)
                  requestPlaylist(area)
                }
              },
              onStateChange(event) {
                if (area !== zone) {
                  players[area]!.pauseVideo()
                  return
                }

                if (event.data === endedState) {
                  if (states[area]) {
                    loadScheduledTrack(area)
                  }
                  pauseOtherVideos(area, players, ready)
                  return
                }

                if (states[area]) {
                  loadScheduledTrack(area)
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
      const nextZone: VideoZone = currentZone()

      if (nextZone !== zone) {
        if (ready[zone]) {
          players[zone]!.pauseVideo()
        }

        zone = nextZone

        if (ready[zone] && states[zone]) {
          loadScheduledTrack(zone)
        }
        scheduleTrackBoundary()
        pauseOtherVideos(zone, players, ready)
      }

      const wall = videoWall(nextZone)

      if (!projection.update(camera, projector, wall)) {
        setInsideStyle('pointerEvents', 'none')
        setLoftStyle('pointerEvents', 'none')
        setOutsideStyle('pointerEvents', 'none')
        setUpstairsStyle('pointerEvents', 'none')
        layers.tent.style.pointerEvents = 'none'
        return
      }

      setInsideStyle('opacity', zone === 'inside' ? '1' : '0')
      setLoftStyle('opacity', zone === 'loft' ? '1' : '0')
      setOutsideStyle('opacity', zone === 'outside' ? '1' : '0')
      setUpstairsStyle('opacity', zone === 'upstairs' ? '1' : '0')
      layers.tent.style.opacity = zone === 'tent' ? '1' : '0'
      const pointerEvents = performance.now() > pointerPassthroughUntil ? 'auto' : 'none'

      setInsideStyle('pointerEvents', zone === 'inside' ? pointerEvents : 'none')
      setLoftStyle('pointerEvents', zone === 'loft' ? pointerEvents : 'none')
      setOutsideStyle('pointerEvents', zone === 'outside' ? pointerEvents : 'none')
      setUpstairsStyle('pointerEvents', zone === 'upstairs' ? pointerEvents : 'none')
      layers.tent.style.pointerEvents = zone === 'tent' ? pointerEvents : 'none'
    },
    play() {
      playUnlocked = true

      if (!ready[zone]) {
        return false
      }

      if (states[zone]) {
        loadScheduledTrack(zone)
      }
      else {
        playCurrentOrFallbackTrack(zone)
      }
      pauseOtherVideos(zone, players, ready)

      return true
    },
  }

  function loadScheduledTrack(area: VideoZone) {
    const state = currentScheduledState(area)!
    const player = players[area]!
    const active = area === zone
    const shouldPlay = playUnlocked && active
    const loadedId = player.getVideoData()?.video_id
    const time = scheduledTrackTime(state)

    if (loadedId === state.currentId) {
      const currentTime = player.getCurrentTime()
      const shouldSeek = !shouldPlay || Math.abs(time - currentTime) > syncSeekTolerance

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
    if (active) {
      scheduleTrackBoundary()
    }
  }

  function playFallbackTrack(area: VideoZone) {
    const player = players[area]!
    const id = videoTracks[area]
    const time = videoStartTimes[area]

    if (player.getVideoData()?.video_id === id) {
      player.seekTo(time, true)
      player.playVideo()
      return
    }

    player.loadVideoById({ videoId: id, startSeconds: time })
    player.playVideo()
  }

  function playCurrentOrFallbackTrack(area: VideoZone) {
    const player = players[area]!

    if (player.getVideoData()?.video_id) {
      player.playVideo()
      return
    }

    playFallbackTrack(area)
  }

  function cueFallbackTrack(area: VideoZone) {
    const player = players[area]!
    const id = videoTracks[area]

    if (player.getVideoData()?.video_id === id) {
      return
    }

    player.cueVideoById({ videoId: id, startSeconds: videoStartTimes[area] })
  }

  function requestPlaylist(area: VideoZone) {
    const source = playlistSource(area)

    if (!source) {
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
      list: source,
      listType: 'playlist',
      startSeconds: 0,
    })
    setTimeout(() => reportDiscoveredPlaylist(area, 0), playlistDiscoveryDelay)
  }

  function reportDiscoveredPlaylist(area: VideoZone, attempt: number) {
    if (states[area]) {
      discoveringPlaylists[area] = false
      loadScheduledTrack(area)
      return
    }

    const ids = players[area]!.getPlaylist()

    if (ids?.length) {
      const key = ids.join('\n')

      discoveringPlaylists[area] = false
      if (reportedPlaylists[area] !== key) {
        reportedPlaylists[area] = key
        options.onPlaylistDiscovered?.(area, ids)
      }
      if (states[area]) {
        loadScheduledTrack(area)
      }
      else if (!playUnlocked) {
        cueFallbackTrack(area)
      }
      return
    }

    if (attempt < playlistDiscoveryAttempts) {
      setTimeout(() => reportDiscoveredPlaylist(area, attempt + 1), playlistDiscoveryDelay)
      return
    }

    discoveringPlaylists[area] = false
    if (!states[area] && !playUnlocked) {
      cueFallbackTrack(area)
    }
    console.error(new Error(`Missing YouTube playlist ids for ${area}`))
  }

  function videoReady(area: VideoZone) {
    if (!ready[area]) {
      return false
    }

    const id = players[area]!.getVideoData()?.video_id
    const state = currentScheduledState(area)

    return state ? id === state.currentId : Boolean(id)
  }

  function currentScheduledState(area: VideoZone) {
    const state = states[area]

    if (!state) {
      return
    }

    advanceLocalSchedule(area, state)

    return state
  }

  function advanceLocalSchedule(area: VideoZone, state: VideoTrackState) {
    const end = state.startedAt + state.duration * 1000

    if (!state.nextId || serverTime() < end) {
      return
    }

    state.currentId = state.nextId
    state.nextId = ''
    state.startedAt = end
    state.duration = Number.POSITIVE_INFINITY
    state.updatedAt = performance.now()
  }

  function scheduledTrackTime(state: VideoTrackState) {
    return Math.max(0, (serverTime() - state.startedAt) / 1000)
  }

  function serverTime() {
    return performance.now() + serverTimeOffset
  }

  function scheduleTrackBoundary() {
    clearTimeout(scheduleTimer)

    const state = states[zone]

    if (!state || !Number.isFinite(state.duration)) {
      return
    }

    const delay = Math.max(0, state.startedAt + state.duration * 1000 - serverTime())

    scheduleTimer = setTimeout(() => {
      currentScheduledState(zone)
      if (ready[zone]) {
        loadScheduledTrack(zone)
      }
      scheduleTrackBoundary()
    }, Math.min(delay + 25, 2_147_483_647))
  }
}

function videoWall(zone: VideoZone): DomWall {
  if (zone === 'inside') {
    return djVideoWall
  }
  if (zone === 'loft') {
    return loftVideoWall
  }
  if (zone === 'outside') {
    return outsideVideoScreenWall
  }
  if (zone === 'upstairs') {
    return upstairsVideoWall
  }

  return tentVideoWall
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
