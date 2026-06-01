import { projectedQuadTransform, projectWallPointInto } from './projection.ts'
import type { ProjectedPoint, WallProjector } from './projection.ts'
import { djVideoWall, outsideVideoWall, tentVideoWall, videoPlaylists, videoStartTimes, videoTracks } from './scene-data.ts'
import { roomAt } from './scene.ts'
import type { Vec3, VideoZone, YouTubePlayer, YouTubeWindow } from './types.ts'

type Camera = { eye: Vec3; center: Vec3 }
type Wall = typeof djVideoWall
const endedState = 0

export function videoZones(): VideoZone[] {
  return ['inside', 'outside', 'tent']
}

export function createDjVideoUi(
  element: HTMLElement,
  position: Vec3,
  options: {
    isAuthority?: (zone: VideoZone) => boolean
    onPlaylistDiscovered?: (zone: VideoZone, ids: string[]) => void
    onStateChanged?: () => void
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
  const times: Record<VideoZone, number> = {
    inside: videoStartTimes.inside,
    outside: videoStartTimes.outside,
    tent: videoStartTimes.tent,
  }
  const trackIndexes: Record<VideoZone, number> = {
    inside: 0,
    outside: 0,
    tent: 0,
  }
  const trackIds: Record<VideoZone, string> = {
    inside: videoTracks.inside,
    outside: videoTracks.outside,
    tent: videoTracks.tent,
  }
  const playlistIds: Partial<Record<VideoZone, string[]>> = {}
  const players: Partial<Record<VideoZone, YouTubePlayer>> = {}
  const ready: Partial<Record<VideoZone, boolean>> = {}
  const pendingStarts: Partial<Record<VideoZone, number>> = {}
  const pendingLoops: Partial<Record<VideoZone, boolean>> = {}
  const pendingTracks: Partial<Record<VideoZone, { id: string; time: number }>> = {}
  const pendingEnded: Partial<Record<VideoZone, boolean>> = {}
  const playlistOrders: Partial<Record<VideoZone, string[]>> = {}
  const reportedPlaylists: Partial<Record<VideoZone, string>> = {}
  let zone: VideoZone = roomAt(position)
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
    times,
    trackIndexes,
    get zone() {
      return zone
    },
    setZoneFromPosition() {
      zone = roomAt(position)
    },
    syncCurrentTime() {
      syncVideoTime(zone, players, ready, pendingStarts, times, trackIndexes, trackIds, playlistIds)
      pauseOtherVideos(zone, players, ready)
    },
    state() {
      if (pendingEnded[zone] && pendingTracks[zone]) {
        return {
          zone,
          id: pendingTracks[zone]!.id,
          time: pendingTracks[zone]!.time,
        }
      }

      syncVideoTime(zone, players, ready, pendingStarts, times, trackIndexes, trackIds, playlistIds)
      pauseOtherVideos(zone, players, ready)

      return {
        zone,
        id: trackIds[zone],
        time: times[zone],
      }
    },
    applyStates(states: Array<{ zone: VideoZone; id: string; time: number }>, preserveSameTrack = false, immediate = false) {
      for (const state of states) {
        const sameTrack = trackIds[state.zone] === state.id

        if (sameTrack && preserveSameTrack && !(pendingEnded[state.zone] && pendingTracks[state.zone])) {
          continue
        }

        if (ready[state.zone]) {
          if (sameTrack && state.zone === zone) {
            if (pendingEnded[state.zone] && pendingTracks[state.zone]) {
              playPendingTrack(state.zone, players, pendingStarts, pendingEnded, pendingTracks, times, trackIds)
              pauseOtherVideos(state.zone, players, ready)
              continue
            }
            times[state.zone] = videoStateTime(state.zone, state.id, state.time)
            pendingStarts[state.zone] = times[state.zone]
            if (!preserveSameTrack) {
              playVideoFromTime(state.zone, players, pendingStarts, times)
            }
          }
          else if (sameTrack) {
            times[state.zone] = videoStateTime(state.zone, state.id, state.time)
            pendingStarts[state.zone] = times[state.zone]
            cueVideoFromTime(state.zone, players, pendingStarts, times, trackIndexes, trackIds, playlistIds)
            players[state.zone]!.pauseVideo()
          }
          else if (state.zone !== zone) {
            trackIds[state.zone] = state.id
            times[state.zone] = videoStateTime(state.zone, state.id, state.time)
            pendingStarts[state.zone] = times[state.zone]
            cueVideoFromTime(state.zone, players, pendingStarts, times, trackIndexes, trackIds, playlistIds)
            players[state.zone]!.pauseVideo()
          }
          else if (videoPlaylists[state.zone] && !immediate) {
            pendingTracks[state.zone] = { id: state.id, time: videoStateTime(state.zone, state.id, state.time) }
            if (pendingEnded[state.zone]) {
              playPendingTrack(state.zone, players, pendingStarts, pendingEnded, pendingTracks, times, trackIds)
              pauseOtherVideos(state.zone, players, ready)
            }
          }
          else {
            delete pendingEnded[state.zone]
            delete pendingTracks[state.zone]
            trackIds[state.zone] = state.id
            times[state.zone] = videoStateTime(state.zone, state.id, state.time)
            pendingStarts[state.zone] = times[state.zone]
            loadVideoFromTime(state.zone, players, pendingStarts, times, trackIndexes, trackIds, playlistIds)
            pauseOtherVideos(state.zone, players, ready)
          }
        }
      }
    },
    applyPlaylists(entries: Array<{ zone: VideoZone; ids: string[] }>) {
      for (const entry of entries) {
        playlistOrders[entry.zone] = entry.ids
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
                players[area]!.setLoop(true)

                if (area === zone) {
                  cueVideoFromTime(area, players, pendingStarts, times, trackIndexes, trackIds, playlistIds)
                }
                else {
                  players[area]!.pauseVideo()
                }

                if (videoPlaylists[area]) {
                  setTimeout(() => syncVideoTime(area, players, ready, pendingStarts, times, trackIndexes, trackIds,
                    playlistIds, reportedPlaylists, options.onPlaylistDiscovered), 1000)
                }
              },
              onStateChange(event) {
                if (area !== zone) {
                  players[area]!.pauseVideo()
                  return
                }

                if (event.data === endedState) {
                  if (videoPlaylists[area]) {
                    if (pendingTracks[area]) {
                      playPendingTrack(area, players, pendingStarts, pendingEnded, pendingTracks, times, trackIds)
                      pauseOtherVideos(area, players, ready)
                    }
                    else if (options.isAuthority?.(area) ?? true) {
                      pendingEnded[area] = true
                      requestNextPlaylistVideo(area, pendingTracks, times, trackIds, playlistOrders, options.onStateChanged)
                    }
                    else {
                      pendingEnded[area] = true
                      pendingStarts[area] = times[area]
                      players[area]!.pauseVideo()
                    }
                  }
                  else {
                    loopVideo(area, zone, players, pendingStarts, pendingLoops, times)
                  }
                  pauseOtherVideos(area, players, ready)
                }
                else {
                  syncVideoTime(area, players, ready, pendingStarts, times, trackIndexes, trackIds, playlistIds,
                    reportedPlaylists, options.onPlaylistDiscovered)
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
      const nextZone: VideoZone = roomAt(position)

      if (nextZone !== zone) {
        if (ready[zone]) {
          syncVideoTime(zone, players, ready, pendingStarts, times, trackIndexes, trackIds, playlistIds)
          players[zone]!.pauseVideo()
        }

        zone = nextZone

        if (ready[zone]) {
          loadVideoFromTime(zone, players, pendingStarts, times, trackIndexes, trackIds, playlistIds)
          pauseOtherVideos(zone, players, ready)
        }
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

      projectWallPointInto(cornerA, projector, pointA)
      projectWallPointInto(cornerB, projector, pointB)
      projectWallPointInto(cornerC, projector, pointC)
      projectWallPointInto(cornerD, projector, pointD)

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
      if (ready[zone]) {
        playVideoFromTime(zone, players, pendingStarts, times)
        pauseOtherVideos(zone, players, ready)
        return true
      }

      return false
    },
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

function cueVideoFromTime(
  area: VideoZone,
  players: Partial<Record<VideoZone, YouTubePlayer>>,
  pendingStarts: Partial<Record<VideoZone, number>>,
  times: Record<VideoZone, number>,
  trackIndexes: Record<VideoZone, number>,
  trackIds: Record<VideoZone, string>,
  playlistIds: Partial<Record<VideoZone, string[]>>,
) {
  pendingStarts[area] = times[area]
  const playlist = shouldLoadPlaylist(area, trackIds, playlistIds) ? videoPlaylists[area] : undefined

  if (playlist) {
    players[area]!.cuePlaylist({
      index: trackIndexes[area],
      list: playlist,
      listType: 'playlist',
      startSeconds: times[area],
    })
  }
  else {
    players[area]!.cueVideoById({
      videoId: trackIds[area],
      startSeconds: times[area],
    })
  }
}

function loadVideoFromTime(
  area: VideoZone,
  players: Partial<Record<VideoZone, YouTubePlayer>>,
  pendingStarts: Partial<Record<VideoZone, number>>,
  times: Record<VideoZone, number>,
  trackIndexes: Record<VideoZone, number>,
  trackIds: Record<VideoZone, string>,
  playlistIds: Partial<Record<VideoZone, string[]>>,
) {
  pendingStarts[area] = times[area]
  const playlist = shouldLoadPlaylist(area, trackIds, playlistIds) ? videoPlaylists[area] : undefined

  if (playlist) {
    players[area]!.loadPlaylist({
      index: trackIndexes[area],
      list: playlist,
      listType: 'playlist',
      startSeconds: times[area],
    })
  }
  else {
    players[area]!.loadVideoById({
      videoId: trackIds[area],
      startSeconds: times[area],
    })
  }
}

function playVideoFromTime(
  area: VideoZone,
  players: Partial<Record<VideoZone, YouTubePlayer>>,
  pendingStarts: Partial<Record<VideoZone, number>>,
  times: Record<VideoZone, number>,
) {
  pendingStarts[area] = times[area]
  players[area]!.seekTo(times[area], true)
  players[area]!.playVideo()
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

function loopVideo(
  area: VideoZone,
  zone: VideoZone,
  players: Partial<Record<VideoZone, YouTubePlayer>>,
  pendingStarts: Partial<Record<VideoZone, number>>,
  pendingLoops: Partial<Record<VideoZone, boolean>>,
  times: Record<VideoZone, number>,
) {
  if (pendingLoops[area]) {
    return
  }

  times[area] = videoStartTimes[area]
  pendingStarts[area] = times[area]
  pendingLoops[area] = true
  setTimeout(() => {
    delete pendingLoops[area]

    if (area !== zone) {
      players[area]!.pauseVideo()
      return
    }

    players[area]!.loadVideoById({
      videoId: trackIdForLoop(area, players),
      startSeconds: times[area],
    })
  }, 0)
}

function requestNextPlaylistVideo(
  area: VideoZone,
  pendingTracks: Partial<Record<VideoZone, { id: string; time: number }>>,
  times: Record<VideoZone, number>,
  trackIds: Record<VideoZone, string>,
  playlistOrders: Partial<Record<VideoZone, string[]>>,
  onStateChanged?: () => void,
) {
  const order = playlistOrders[area]!
  const index = order.indexOf(trackIds[area])
  const id = order[(index + 1) % order.length]!

  pendingTracks[area] = { id, time: 0 }
  trackIds[area] = id
  times[area] = 0
  onStateChanged?.()
}

function playPendingTrack(
  area: VideoZone,
  players: Partial<Record<VideoZone, YouTubePlayer>>,
  pendingStarts: Partial<Record<VideoZone, number>>,
  pendingEnded: Partial<Record<VideoZone, boolean>>,
  pendingTracks: Partial<Record<VideoZone, { id: string; time: number }>>,
  times: Record<VideoZone, number>,
  trackIds: Record<VideoZone, string>,
) {
  const track = pendingTracks[area]!

  delete pendingEnded[area]
  delete pendingTracks[area]
  trackIds[area] = track.id
  times[area] = track.time
  pendingStarts[area] = track.time
  players[area]!.loadVideoById({ videoId: track.id, startSeconds: track.time })
  players[area]!.playVideo()
}

function shouldLoadPlaylist(
  area: VideoZone,
  trackIds: Record<VideoZone, string>,
  playlistIds: Partial<Record<VideoZone, string[]>>,
) {
  return Boolean(videoPlaylists[area] && (trackIds[area] === videoTracks[area] || playlistIds[area]?.includes(trackIds[area])))
}

function trackIdForLoop(area: VideoZone, players: Partial<Record<VideoZone, YouTubePlayer>>) {
  return players[area]!.getVideoData()?.video_id || videoTracks[area]
}

function videoStateTime(zone: VideoZone, id: string, time: number) {
  return id === videoTracks[zone] && time < 0.5 ? videoStartTimes[zone] : time
}

function setPoint(target: Vec3, x: number, y: number, z: number) {
  target[0] = x
  target[1] = y
  target[2] = z
}

function syncVideoTime(
  area: VideoZone,
  players: Partial<Record<VideoZone, YouTubePlayer>>,
  ready: Partial<Record<VideoZone, boolean>>,
  pendingStarts: Partial<Record<VideoZone, number>>,
  times: Record<VideoZone, number>,
  trackIndexes: Record<VideoZone, number>,
  trackIds: Record<VideoZone, string>,
  playlistIds: Partial<Record<VideoZone, string[]>>,
  reportedPlaylists?: Partial<Record<VideoZone, string>>,
  onPlaylistDiscovered?: (zone: VideoZone, ids: string[]) => void,
) {
  if (ready[area]) {
    const time = players[area]!.getCurrentTime()
    const pendingStart = pendingStarts[area]

    if (videoPlaylists[area]) {
      trackIndexes[area] = players[area]!.getPlaylistIndex()
      const playlist = players[area]!.getPlaylist()

      if (playlist?.length) {
        playlistIds[area] = playlist
        reportPlaylist(area, playlist, reportedPlaylists, onPlaylistDiscovered)
      }
    }

    trackIds[area] = players[area]!.getVideoData()?.video_id || trackIds[area]

    if (pendingStart !== undefined && time < pendingStart - 0.5) {
      players[area]!.seekTo(pendingStart, true)
    }
    else {
      delete pendingStarts[area]
      times[area] = time
    }
  }
}

function reportPlaylist(
  zone: VideoZone,
  ids: string[],
  reportedPlaylists: Partial<Record<VideoZone, string>> | undefined,
  onPlaylistDiscovered: ((zone: VideoZone, ids: string[]) => void) | undefined,
) {
  const key = ids.join('\n')

  if (reportedPlaylists && reportedPlaylists[zone] !== key) {
    reportedPlaylists[zone] = key
    onPlaylistDiscovered?.(zone, ids)
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
