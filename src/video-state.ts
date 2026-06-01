import { videoStartTimes, videoTracks } from './scene-data.ts'
import type { VideoZone } from './types.ts'

export function videoStateTime(zone: VideoZone, id: string, time: number) {
  return id === videoTracks[zone] && time < 0.5 ? videoStartTimes[zone] : time
}
