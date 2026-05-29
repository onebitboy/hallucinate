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
  const players: Partial<Record<VideoZone, YouTubePlayer>> = {}
  const ready: Partial<Record<VideoZone, boolean>> = {}
  const pendingStarts: Partial<Record<VideoZone, number>> = {}
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
      syncVideoTime(zone, players, ready, pendingStarts, times, trackIndexes, trackIds)
      pauseOtherVideos(zone, players, ready)
    },
    states() {
      syncVideoTime(zone, players, ready, pendingStarts, times, trackIndexes, trackIds)
      pauseOtherVideos(zone, players, ready)

      return videoZones().map(area => ({
        zone: area,
        id: trackIds[area],
        time: times[area],
      }))
    },
    applyStates(states: Array<{ zone: VideoZone; id: string; time: number }>, preserveSameTrack = false) {
      for (const state of states) {
        const sameTrack = trackIds[state.zone] === state.id

        if (sameTrack && preserveSameTrack) {
          continue
        }

        trackIds[state.zone] = state.id
        times[state.zone] = videoStateTime(state.zone, state.id, state.time)
        pendingStarts[state.zone] = times[state.zone]

        if (ready[state.zone]) {
          if (sameTrack && state.zone === zone) {
            players[state.zone]!.seekTo(times[state.zone], true)
          }
          else if (sameTrack) {
            cueVideoFromTime(state.zone, players, pendingStarts, times, trackIndexes, trackIds)
            players[state.zone]!.pauseVideo()
          }
          else if (state.zone !== zone) {
            cueVideoFromTime(state.zone, players, pendingStarts, times, trackIndexes, trackIds)
            players[state.zone]!.pauseVideo()
          }
          else {
            loadVideoFromTime(state.zone, players, pendingStarts, times, trackIndexes, trackIds)
            pauseOtherVideos(state.zone, players, ready)
          }
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
                players[area]!.setLoop(true)

                if (area === zone) {
                  cueVideoFromTime(area, players, pendingStarts, times, trackIndexes, trackIds)
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
                  loopVideo(area, players, pendingStarts, times)
                  pauseOtherVideos(area, players, ready)
                }
                else {
                  syncVideoTime(area, players, ready, pendingStarts, times, trackIndexes, trackIds)
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
          syncVideoTime(zone, players, ready, pendingStarts, times, trackIndexes, trackIds)
          players[zone]!.pauseVideo()
        }

        zone = nextZone

        if (ready[zone]) {
          loadVideoFromTime(zone, players, pendingStarts, times, trackIndexes, trackIds)
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
      setInsideStyle('pointerEvents', zone === 'inside' ? 'auto' : 'none')
      setOutsideStyle('pointerEvents', zone === 'outside' ? 'auto' : 'none')
      layers.tent.style.pointerEvents = zone === 'tent' ? 'auto' : 'none'
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
) {
  pendingStarts[area] = times[area]
  const playlist = trackIds[area] === videoTracks[area] ? videoPlaylists[area] : undefined

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
) {
  pendingStarts[area] = times[area]
  const playlist = trackIds[area] === videoTracks[area] ? videoPlaylists[area] : undefined

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
  players: Partial<Record<VideoZone, YouTubePlayer>>,
  pendingStarts: Partial<Record<VideoZone, number>>,
  times: Record<VideoZone, number>,
) {
  times[area] = videoStartTimes[area]
  pendingStarts[area] = times[area]
  players[area]!.seekTo(times[area], true)
  players[area]!.playVideo()
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
) {
  if (ready[area]) {
    const time = players[area]!.getCurrentTime()
    const pendingStart = pendingStarts[area]

    if (videoPlaylists[area]) {
      trackIndexes[area] = players[area]!.getPlaylistIndex()
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
