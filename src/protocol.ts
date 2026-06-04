import type { BeachBall, GraffitiSplat, Vec3 } from './types.ts'
import type { CharacterMode, PlayerStyle, VideoZone } from './types.ts'

export const C_MOTION = 1
export const S_ROOM_STATE = 2
export const S_MOTION = 3
export const S_LEAVE = 4
export const C_ROOM_CHANGE = 6
export const S_SPAWN = 7
export const MESSAGE = 8
export const C_HEARTBEAT = 9
export const S_ONLINE = 10
export const VIDEO_SYNC = 11
export const BEACH_BALLS = 12
export const GRAFFITI = 13
export const ADMIN = 14
export const MODERATION = 15
export const VIDEO_PROGRESS = 16
export const VIDEO_PLAYLIST = 17
export const VIDEO_ENDED = 18
export const VIDEO_PLAYLIST_REQUEST = 19

export const roomCount = 3
export const messageMaxLength = 120
export const positionScale = 100
export const protocolVersion = 31

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const angleScale = 256 / (Math.PI * 2)
const motionSize = 16
const spawnSize = motionSize + 2

export type MotionPacket = {
  id?: number
  x: number
  y: number
  height: number
  keys: number
  angle: number
  idleClipIndex: number
  mode: number
  style: PlayerStyle
}

export type SpawnPacket = Required<MotionPacket>

export type RoomStatePacket = {
  selfId: number
  room: number
  players: SpawnPacket[]
}

export type MessagePacket = {
  id: number
  text: string
}

export type VideoSyncEntry = {
  zone: VideoZone
  currentId: string
  nextId: string
  time: number
}

export type VideoSyncPacket = {
  entries: VideoSyncEntry[]
}

export type VideoProgressEntry = {
  zone: VideoZone
  id: string
  time: number
}

export type VideoProgressPacket = {
  entry: VideoProgressEntry
}

export type VideoEndedEntry = {
  zone: VideoZone
  id: string
}

export type VideoEndedPacket = {
  entry: VideoEndedEntry
}

export type VideoPlaylistRequestPacket = {
  zones: VideoZone[]
}

export type VideoPlaylistEntry = {
  zone: VideoZone
  ids: string[]
}

export type VideoPlaylistPacket = {
  entries: VideoPlaylistEntry[]
}

export type BeachBallPacket = {
  balls: BeachBall[]
}

export type GraffitiPacket = {
  splats: GraffitiSplat[]
}

export type AdminPacket = {
  pass: string
  command: 'ban' | 'banSubnet' | 'randomTrack'
  id: number
}

export type ModerationPacket = {
  command: 'deleteMessages'
  id: number
}

const protocolModes: CharacterMode[] = ['stand', 'run', 'manSitting', 'womanSitting', 'jump', 'wave', 'waveOut']
const protocolVideoZones: VideoZone[] = ['inside', 'outside', 'tent']
export const modeCount = protocolModes.length

export function modeToProtocol(mode: CharacterMode) {
  return protocolModes.indexOf(mode)
}

export function protocolToMode(mode: number) {
  return protocolModes[mode]!
}

export function sceneToProtocol(value: number) {
  return Math.round(value * positionScale)
}

export function protocolToScene(value: number) {
  return value / positionScale
}

export function angleToProtocol(angle: number) {
  return ((Math.round(angle * angleScale) % 256) + 256) % 256
}

export function protocolToAngle(angle: number) {
  return angle / angleScale
}

export function encodeKeys(input: Vec3) {
  return Number(input[2] > 0) | (Number(input[0] > 0) << 1) | (Number(input[2] < 0) << 2)
    | (Number(input[0] < 0) << 3)
}

export function decodeKeys(keys: number, angle: number): Vec3 {
  if (keys === 0) {
    return [0, 0, 0]
  }

  return [Math.sin(protocolToAngle(angle)), 0, Math.cos(protocolToAngle(angle))]
}

export function encodeClientMotion(packet: MotionPacket) {
  const data = new ArrayBuffer(1 + motionSize)
  const view = new DataView(data)

  view.setUint8(0, C_MOTION)
  writeMotion(view, 1, packet)

  return data
}

export function decodeClientMotion(view: DataView): MotionPacket {
  expectSize(view, 1 + spawnSize - 2)

  return {
    ...readMotion(view, 1),
  }
}

export function encodeRoomChange(room: number) {
  const data = new ArrayBuffer(2)
  const view = new DataView(data)

  view.setUint8(0, C_ROOM_CHANGE)
  view.setUint8(1, room)

  return data
}

export function decodeRoomChange(view: DataView) {
  expectSize(view, 2)

  return view.getUint8(1)
}

export function encodeHeartbeat() {
  const data = new ArrayBuffer(1)
  const view = new DataView(data)

  view.setUint8(0, C_HEARTBEAT)

  return data
}

export function encodeOnline(count: number) {
  const data = new ArrayBuffer(3)
  const view = new DataView(data)

  view.setUint8(0, S_ONLINE)
  view.setUint16(1, count)

  return data
}

export function decodeOnline(view: DataView) {
  expectSize(view, 3)

  return view.getUint16(1)
}

export function encodeVideoSync(packet: VideoSyncPacket) {
  const encoded = packet.entries.map(entry => ({
    ...entry,
    currentBytes: textEncoder.encode(entry.currentId),
    nextBytes: textEncoder.encode(entry.nextId),
  }))
  const size = 2 + encoded.reduce((total, entry) =>
    total + 9 + entry.currentBytes.length + entry.nextBytes.length, 0)
  const data = new ArrayBuffer(size)
  const view = new DataView(data)
  let offset = 2

  view.setUint8(0, VIDEO_SYNC)
  view.setUint8(1, encoded.length)

  for (const entry of encoded) {
    view.setUint8(offset, videoZoneToProtocol(entry.zone))
    view.setUint32(offset + 1, Math.round(entry.time * 1000))
    view.setUint16(offset + 5, entry.currentBytes.length)
    new Uint8Array(data, offset + 7).set(entry.currentBytes)
    offset += 7 + entry.currentBytes.length
    view.setUint16(offset, entry.nextBytes.length)
    new Uint8Array(data, offset + 2).set(entry.nextBytes)
    offset += 2 + entry.nextBytes.length
  }

  return data
}

export function decodeVideoSync(view: DataView): VideoSyncPacket {
  expectAtLeastSize(view, 2)

  const count = view.getUint8(1)
  const entries: VideoSyncEntry[] = []
  let offset = 2

  for (let i = 0; i < count; i++) {
    expectAtLeastSize(view, offset + 7)
    const zone = protocolToVideoZone(view.getUint8(offset))
    const time = view.getUint32(offset + 1) / 1000
    const currentLength = view.getUint16(offset + 5)
    expectAtLeastSize(view, offset + 7 + currentLength + 2)
    const currentId = textDecoder.decode(new Uint8Array(view.buffer, view.byteOffset + offset + 7, currentLength))

    offset += 7 + currentLength
    const nextLength = view.getUint16(offset)
    expectAtLeastSize(view, offset + 2 + nextLength)
    const nextId = textDecoder.decode(new Uint8Array(view.buffer, view.byteOffset + offset + 2, nextLength))

    entries.push({ zone, currentId, nextId, time })
    offset += 2 + nextLength
  }

  expectSize(view, offset)

  return { entries }
}

export function encodeVideoProgress(packet: VideoProgressPacket) {
  const bytes = textEncoder.encode(packet.entry.id)
  const data = new ArrayBuffer(8 + bytes.length)
  const view = new DataView(data)

  view.setUint8(0, VIDEO_PROGRESS)
  view.setUint8(1, videoZoneToProtocol(packet.entry.zone))
  view.setUint32(2, Math.round(packet.entry.time * 1000))
  view.setUint16(6, bytes.length)
  new Uint8Array(data, 8).set(bytes)

  return data
}

export function decodeVideoProgress(view: DataView): VideoProgressPacket {
  expectAtLeastSize(view, 8)
  const length = view.getUint16(6)
  expectSize(view, 8 + length)

  return {
    entry: {
      zone: protocolToVideoZone(view.getUint8(1)),
      time: view.getUint32(2) / 1000,
      id: textDecoder.decode(new Uint8Array(view.buffer, view.byteOffset + 8, length)),
    },
  }
}

export function encodeVideoEnded(packet: VideoEndedPacket) {
  const bytes = textEncoder.encode(packet.entry.id)
  const data = new ArrayBuffer(4 + bytes.length)
  const view = new DataView(data)

  view.setUint8(0, VIDEO_ENDED)
  view.setUint8(1, videoZoneToProtocol(packet.entry.zone))
  view.setUint16(2, bytes.length)
  new Uint8Array(data, 4).set(bytes)

  return data
}

export function decodeVideoEnded(view: DataView): VideoEndedPacket {
  expectAtLeastSize(view, 4)
  const length = view.getUint16(2)
  expectSize(view, 4 + length)

  return {
    entry: {
      zone: protocolToVideoZone(view.getUint8(1)),
      id: textDecoder.decode(new Uint8Array(view.buffer, view.byteOffset + 4, length)),
    },
  }
}

export function encodeVideoPlaylistRequest(packet: VideoPlaylistRequestPacket) {
  const data = new ArrayBuffer(2 + packet.zones.length)
  const view = new DataView(data)

  view.setUint8(0, VIDEO_PLAYLIST_REQUEST)
  view.setUint8(1, packet.zones.length)
  packet.zones.forEach((zone, index) => view.setUint8(2 + index, videoZoneToProtocol(zone)))

  return data
}

export function decodeVideoPlaylistRequest(view: DataView): VideoPlaylistRequestPacket {
  expectAtLeastSize(view, 2)
  const count = view.getUint8(1)
  expectSize(view, 2 + count)
  const zones: VideoZone[] = []

  for (let i = 0; i < count; i++) {
    zones.push(protocolToVideoZone(view.getUint8(2 + i)))
  }

  return { zones }
}

export function encodeVideoPlaylist(packet: VideoPlaylistPacket) {
  const encoded = packet.entries.map(entry => ({
    zone: entry.zone,
    ids: entry.ids.map(id => textEncoder.encode(id)),
  }))
  const size = 2 + encoded.reduce((total, entry) =>
    total + 2 + entry.ids.reduce((idsTotal, id) => idsTotal + 2 + id.length, 0), 0)
  const data = new ArrayBuffer(size)
  const view = new DataView(data)
  let offset = 2

  view.setUint8(0, VIDEO_PLAYLIST)
  view.setUint8(1, encoded.length)

  for (const entry of encoded) {
    view.setUint8(offset, videoZoneToProtocol(entry.zone))
    view.setUint8(offset + 1, entry.ids.length)
    offset += 2

    for (const id of entry.ids) {
      view.setUint16(offset, id.length)
      new Uint8Array(data, offset + 2).set(id)
      offset += 2 + id.length
    }
  }

  return data
}

export function decodeVideoPlaylist(view: DataView): VideoPlaylistPacket {
  expectAtLeastSize(view, 2)
  const count = view.getUint8(1)
  const entries: VideoPlaylistEntry[] = []
  let offset = 2

  for (let i = 0; i < count; i++) {
    expectAtLeastSize(view, offset + 2)
    const zone = protocolToVideoZone(view.getUint8(offset))
    const idsCount = view.getUint8(offset + 1)
    const ids: string[] = []

    offset += 2
    for (let j = 0; j < idsCount; j++) {
      expectAtLeastSize(view, offset + 2)
      const length = view.getUint16(offset)
      expectAtLeastSize(view, offset + 2 + length)
      ids.push(textDecoder.decode(new Uint8Array(view.buffer, view.byteOffset + offset + 2, length)))
      offset += 2 + length
    }

    entries.push({ zone, ids })
  }

  expectSize(view, offset)

  return { entries }
}

export function encodeBeachBalls(packet: BeachBallPacket) {
  const data = new ArrayBuffer(2 + packet.balls.length * 13)
  const view = new DataView(data)
  let offset = 2

  view.setUint8(0, BEACH_BALLS)
  view.setUint8(1, packet.balls.length)

  for (const ball of packet.balls) {
    view.setUint8(offset, ball.id)
    view.setInt16(offset + 1, sceneToProtocol(ball.position[0]))
    view.setInt16(offset + 3, sceneToProtocol(ball.position[1]))
    view.setInt16(offset + 5, sceneToProtocol(ball.position[2]))
    view.setInt16(offset + 7, sceneToProtocol(ball.velocity[0]))
    view.setInt16(offset + 9, sceneToProtocol(ball.velocity[1]))
    view.setInt16(offset + 11, sceneToProtocol(ball.velocity[2]))
    offset += 13
  }

  return data
}

export function decodeBeachBalls(view: DataView): BeachBallPacket {
  expectAtLeastSize(view, 2)
  const count = view.getUint8(1)
  expectSize(view, 2 + count * 13)
  const balls: BeachBall[] = []
  let offset = 2

  for (let i = 0; i < count; i++) {
    balls.push({
      id: view.getUint8(offset),
      position: [
        protocolToScene(view.getInt16(offset + 1)),
        protocolToScene(view.getInt16(offset + 3)),
        protocolToScene(view.getInt16(offset + 5)),
      ],
      velocity: [
        protocolToScene(view.getInt16(offset + 7)),
        protocolToScene(view.getInt16(offset + 9)),
        protocolToScene(view.getInt16(offset + 11)),
      ],
    })
    offset += 13
  }

  return { balls }
}

export function encodeGraffiti(packet: GraffitiPacket) {
  const data = new ArrayBuffer(3 + packet.splats.length * 13)
  const view = new DataView(data)
  let offset = 3

  view.setUint8(0, GRAFFITI)
  view.setUint16(1, packet.splats.length)

  for (const splat of packet.splats) {
    view.setUint32(offset, splat.id)
    view.setUint8(offset + 4, splat.wall)
    view.setInt16(offset + 5, sceneToProtocol(splat.x))
    view.setInt16(offset + 7, sceneToProtocol(splat.y))
    view.setUint16(offset + 9, splat.seed)
    view.setUint8(offset + 11, splat.colorIndex)
    view.setUint8(offset + 12, splat.radius)
    offset += 13
  }

  return data
}

export function decodeGraffiti(view: DataView): GraffitiPacket {
  expectAtLeastSize(view, 3)
  const count = view.getUint16(1)
  expectSize(view, 3 + count * 13)
  const splats: GraffitiSplat[] = []
  let offset = 3

  for (let i = 0; i < count; i++) {
    splats.push({
      id: view.getUint32(offset),
      wall: view.getUint8(offset + 4),
      x: protocolToScene(view.getInt16(offset + 5)),
      y: protocolToScene(view.getInt16(offset + 7)),
      seed: view.getUint16(offset + 9),
      colorIndex: view.getUint8(offset + 11),
      radius: view.getUint8(offset + 12),
    })
    offset += 13
  }

  return { splats }
}

export function encodeSpawn(packet: SpawnPacket) {
  const data = new ArrayBuffer(1 + spawnSize)
  const view = new DataView(data)

  view.setUint8(0, S_SPAWN)
  writeSpawn(view, 1, packet)

  return data
}

export function decodeSpawn(view: DataView, offset = 1): SpawnPacket {
  expectSize(view, offset + spawnSize)

  return readSpawn(view, offset)
}

export function encodeServerMotion(packet: SpawnPacket) {
  const data = new ArrayBuffer(1 + spawnSize)
  const view = new DataView(data)

  view.setUint8(0, S_MOTION)
  writeSpawn(view, 1, packet)

  return data
}

export function decodeServerMotion(view: DataView): SpawnPacket {
  expectSize(view, 1 + spawnSize)

  return readSpawn(view, 1)
}

export function encodeLeave(id: number) {
  const data = new ArrayBuffer(3)
  const view = new DataView(data)

  view.setUint8(0, S_LEAVE)
  view.setUint16(1, id)

  return data
}

export function decodeLeave(view: DataView) {
  expectSize(view, 3)

  return view.getUint16(1)
}

export function encodeRoomState(packet: RoomStatePacket) {
  const data = new ArrayBuffer(6 + packet.players.length * spawnSize)
  const view = new DataView(data)

  view.setUint8(0, S_ROOM_STATE)
  view.setUint16(1, packet.selfId)
  view.setUint8(3, packet.room)
  view.setUint16(4, packet.players.length)
  packet.players.forEach((player, index) => writeSpawn(view, 6 + index * spawnSize, player))

  return data
}

export function decodeRoomState(view: DataView): RoomStatePacket {
  expectAtLeastSize(view, 6)

  const count = view.getUint16(4)
  expectSize(view, 6 + count * spawnSize)
  const players: SpawnPacket[] = []

  for (let i = 0; i < count; i++) {
    players.push(readSpawn(view, 6 + i * spawnSize))
  }

  return {
    selfId: view.getUint16(1),
    room: view.getUint8(3),
    players,
  }
}

export function encodeClientMessage(text: string) {
  const bytes = textEncoder.encode(text)
  const data = new ArrayBuffer(3 + bytes.length)
  const view = new DataView(data)

  view.setUint8(0, MESSAGE)
  view.setUint16(1, bytes.length)
  new Uint8Array(data, 3).set(bytes)

  return data
}

export function decodeClientMessage(view: DataView) {
  expectAtLeastSize(view, 3)

  const length = view.getUint16(1)
  expectTextSize(view, 3, length)

  return textDecoder.decode(new Uint8Array(view.buffer, view.byteOffset + 3, length))
}

export function encodeServerMessage(packet: MessagePacket) {
  const bytes = textEncoder.encode(packet.text)
  const data = new ArrayBuffer(5 + bytes.length)
  const view = new DataView(data)

  view.setUint8(0, MESSAGE)
  view.setUint16(1, packet.id)
  view.setUint16(3, bytes.length)
  new Uint8Array(data, 5).set(bytes)

  return data
}

export function decodeServerMessage(view: DataView): MessagePacket {
  expectAtLeastSize(view, 5)

  const length = view.getUint16(3)
  expectTextSize(view, 5, length)

  return {
    id: view.getUint16(1),
    text: textDecoder.decode(new Uint8Array(view.buffer, view.byteOffset + 5, length)),
  }
}

export function encodeAdminMessage(packet: AdminPacket) {
  const pass = textEncoder.encode(packet.pass)
  const command = textEncoder.encode(packet.command)
  const data = new ArrayBuffer(7 + pass.length + command.length)
  const view = new DataView(data)

  view.setUint8(0, ADMIN)
  view.setUint16(1, packet.id)
  view.setUint16(3, pass.length)
  new Uint8Array(data, 5).set(pass)
  view.setUint16(5 + pass.length, command.length)
  new Uint8Array(data, 7 + pass.length).set(command)

  return data
}

export function decodeAdminMessage(view: DataView): AdminPacket {
  expectAtLeastSize(view, 7)
  const passLength = view.getUint16(3)

  const commandOffset = 5 + passLength
  expectAtLeastSize(view, commandOffset + 2)
  const commandLength = view.getUint16(commandOffset)

  expectTextSize(view, commandOffset + 2, commandLength)
  const command = textDecoder.decode(new Uint8Array(view.buffer, view.byteOffset + commandOffset + 2, commandLength))

  if (command !== 'ban' && command !== 'banSubnet' && command !== 'randomTrack') {
    throw new Error(`Invalid admin command ${command}`)
  }

  return {
    id: view.getUint16(1),
    pass: textDecoder.decode(new Uint8Array(view.buffer, view.byteOffset + 5, passLength)),
    command,
  }
}

export function encodeModerationMessage(packet: ModerationPacket) {
  const data = new ArrayBuffer(4)
  const view = new DataView(data)

  view.setUint8(0, MODERATION)
  view.setUint8(1, 1)
  view.setUint16(2, packet.id)

  return data
}

export function decodeModerationMessage(view: DataView): ModerationPacket {
  expectSize(view, 4)

  if (view.getUint8(1) !== 1) {
    throw new Error(`Invalid moderation command ${view.getUint8(1)}`)
  }

  return {
    command: 'deleteMessages',
    id: view.getUint16(2),
  }
}

export function truncateMessage(text: string) {
  return [...text.trim()].slice(0, messageMaxLength).join('')
}

function expectSize(view: DataView, size: number) {
  if (view.byteLength !== size) {
    throw new Error(`Invalid packet size ${view.byteLength}, expected ${size}`)
  }
}

function expectAtLeastSize(view: DataView, size: number) {
  if (view.byteLength < size) {
    throw new Error(`Invalid packet size ${view.byteLength}, expected at least ${size}`)
  }
}

function expectTextSize(view: DataView, offset: number, length: number) {
  const size = offset + length

  if (view.byteLength !== size) {
    throw new Error(`Invalid text packet size ${view.byteLength}, expected ${size}`)
  }
}

function videoZoneToProtocol(zone: VideoZone) {
  return protocolVideoZones.indexOf(zone)
}

function protocolToVideoZone(zone: number) {
  const next = protocolVideoZones[zone]

  if (next === undefined) {
    throw new Error(`Invalid video zone ${zone}`)
  }

  return next
}

function writeSpawn(view: DataView, offset: number, packet: SpawnPacket) {
  view.setUint16(offset, packet.id)
  writeMotion(view, offset + 2, packet)
}

function readSpawn(view: DataView, offset: number): SpawnPacket {
  return {
    id: view.getUint16(offset),
    ...readMotion(view, offset + 2),
  }
}

function writeMotion(view: DataView, offset: number, packet: MotionPacket) {
  view.setInt16(offset, packet.x)
  view.setInt16(offset + 2, packet.y)
  view.setInt16(offset + 4, packet.height)
  view.setUint8(offset + 6, packet.keys)
  view.setUint8(offset + 7, packet.angle)
  view.setUint8(offset + 8, packet.idleClipIndex)
  view.setUint8(offset + 9, packet.mode)
  view.setUint8(offset + 10, packet.style.topStyleIndex)
  view.setUint8(offset + 11, packet.style.bottomStyleIndex)
  view.setUint8(offset + 12, packet.style.hairIndex)
  view.setUint8(offset + 13, packet.style.hairColorIndex)
  view.setUint8(offset + 14, packet.style.skinColorIndex)
  view.setUint8(offset + 15, packet.style.accessoryIndex)
}

function readMotion(view: DataView, offset: number): MotionPacket {
  return {
    x: view.getInt16(offset),
    y: view.getInt16(offset + 2),
    height: view.getInt16(offset + 4),
    keys: view.getUint8(offset + 6),
    angle: view.getUint8(offset + 7),
    idleClipIndex: view.getUint8(offset + 8),
    mode: view.getUint8(offset + 9),
    style: {
      topStyleIndex: view.getUint8(offset + 10),
      bottomStyleIndex: view.getUint8(offset + 11),
      hairIndex: view.getUint8(offset + 12),
      hairColorIndex: view.getUint8(offset + 13),
      skinColorIndex: view.getUint8(offset + 14),
      accessoryIndex: view.getUint8(offset + 15),
    },
  }
}
