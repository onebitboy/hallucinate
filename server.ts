import { Database } from 'bun:sqlite'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { createBeachBalls } from './src/beach-balls.ts'
import { hairPalette, jewelPalette, skinPalette } from './src/character-data.ts'
import { accessoryPalette } from './src/character-style.ts'
import { graffitiColors, graffitiWallBounds, graffitiWallCount, maxGraffitiSplats } from './src/graffiti.ts'
import {
  ADMIN,
  BEACH_BALLS,
  C_HEARTBEAT,
  C_MOTION,
  C_ROOM_CHANGE,
  decodeAdminMessage,
  decodeBeachBalls,
  decodeClientMessage,
  decodeClientMotion,
  decodeClientNickname,
  decodeGraffiti,
  decodeRoomChange,
  decodeVideoEnded,
  decodeVideoPlaylist,
  decodeVideoProgress,
  encodeBeachBalls,
  encodeGraffiti,
  encodeLeave,
  encodeModerationMessage,
  encodeOnline,
  encodeRoomState,
  encodeServerMessage,
  encodeServerMotion,
  encodeServerNickname,
  encodeSpawn,
  encodeVideoPlaylistRequest,
  encodeVideoSync,
  GRAFFITI,
  MESSAGE,
  modeCount,
  NICKNAME,
  nicknameMaxLength,
  type MotionPacket,
  positionScale,
  protocolToScene,
  protocolVersion,
  roomCount,
  type SpawnPacket,
  truncateMessage,
  VIDEO_ENDED,
  VIDEO_PLAYLIST,
  VIDEO_PROGRESS,
  type VideoEndedEntry,
  type VideoPlaylistEntry,
  type VideoProgressEntry,
  type VideoSyncEntry,
} from './src/protocol.ts'
import { outsideBounds, roomBounds, videoPlaylists } from './src/scene-data.ts'
import { roomAt, seatAt } from './src/scene.ts'
import type { GraffitiSplat, VideoZone } from './src/types.ts'

type Client = {
  id: number
  ip: string
  lastInteractionAt: number
  lastSeen: number
  lastMotionAt: number
  poseSynced: boolean
  nickname: string
  room: number
  spaceKey: string
  socket: Bun.ServerWebSocket<SocketData>
  pose: SpawnPacket
  video?: StoredVideoProgressEntry
}

type StoredVideoQueues = {
  entries: StoredVideoQueueEntry[]
}

type StoredVideoPlaylists = {
  entries: StoredVideoPlaylistEntry[]
}

type StoredVideoQueueEntry = VideoSyncEntry & {
  updatedAt: number
}

type StoredVideoProgressEntry = VideoProgressEntry & {
  updatedAt: number
}

type StoredVideoPlaylistEntry = VideoPlaylistEntry & {
  sourceIds: string[]
}

type ChatHistoryEntry = {
  id: number
  text: string
}

type LoftRoom = {
  slug: string
  displaySlug: string
  passwordHash: string
  createdAt: number
  expiresAt: number
  musicKind: 'playlist' | 'video'
  musicSource: string
}

type SpaceState = {
  key: string
  kind: 'loft' | 'main'
  roomCount: number
  rooms: Set<Client>[]
  chatHistory: ChatHistoryEntry[]
  videoQueues: StoredVideoQueueEntry[]
  videoPlaylistOrders: StoredVideoPlaylistEntry[]
  videoPlaylistRequests: Partial<Record<VideoZone, number>>
  beachBalls: ReturnType<typeof createBeachBalls>
  beachBallAuthorities: { client: number; until: number }[]
  slug?: string
  musicKind?: 'playlist' | 'video'
  musicSource?: string
}

type SocketData = {
  initialState: boolean
  ip: string
  protocolOk: boolean
  spaceKey: string
}

const port = Number(process.env.PORT ?? 3001)
const dist = join(import.meta.dir, 'dist')
const clients = new Map<Bun.ServerWebSocket<SocketData>, Client>()
const heartbeatInterval = 10_000
const clientTimeout = 30_000
const onlineActivityTimeout = 5 * 60_000
const chatHistoryMax = 100
const graffitiPacketSplats = 4000
const defaultLoftVideoId = '0oB97YhEukw'
const loftRentMs = 30 * 24 * 60 * 60 * 1000
const loftSlugPattern = /^[A-Za-z0-9_-]+$/
const maxConnectionsPerIp = 4
const maxClientSpeed = 8
const maxClientStep = 1.2
const maxHairIndex = 32
const memoryAssetMaxSize = 2 * 1024 * 1024
const memoryAssets = new Map<string, MemoryAsset>()
const dbPath = process.env.CLUB_DB ?? join(import.meta.dir, 'data', 'club.sqlite')
const db = new Database(dbPath, { create: true, strict: true })
setupDb()
const videoPlaylistRequestInterval = 3000
const beachBallAuthorityDuration = 2000
const adminPass = process.env.ADMIN_PASS ?? ''
const bannedIps = await loadBannedIps()
let graffitiSplats = await loadGraffitiSplats()
let nextGraffitiId = (graffitiSplats.at(-1)?.id ?? 0) + 1
const spaces = new Map<string, SpaceState>()
const mainSpace = createSpace('main', 'main', roomCount)

mainSpace.videoQueues = await loadVideoQueues(mainSpace)
mainSpace.videoPlaylistOrders = await loadVideoPlaylists(mainSpace)
spaces.set(mainSpace.key, mainSpace)
if (initializeVideoQueuesFromPlaylists(mainSpace, Date.now())) {
  await saveVideoQueues(mainSpace)
}

let nextId = 1

type MemoryAsset = {
  modified: Date
  source: ArrayBuffer
  size: number
  tag: string
  type: string
  gzip?: ArrayBuffer
  br?: ArrayBuffer
}

const server = Bun.serve<SocketData>({
  port,
  async fetch(request, server) {
    const ip = clientIp(request)
    const url = new URL(request.url)

    if (url.pathname === '/api/rooms' || url.pathname.startsWith('/api/rooms/')) {
      return handleRoomApi(request, url)
    }

    if (bannedIp(ip)) {
      return new Response('Forbidden', { status: 403 })
    }

    if (ipConnections(ip) >= maxConnectionsPerIp) {
      return new Response('Too Many Connections', { status: 429 })
    }

    if (server.upgrade(request, {
      data: {
        initialState: url.searchParams.get('session') !== 'reconnect',
        ip,
        protocolOk: clientProtocolOk(url.searchParams.get('protocol')),
        spaceKey: websocketSpaceKey(url, ip),
      },
    })) {
      return
    }

    return serveStatic(request)
  },
  websocket: {
    open(socket) {
      if (!socket.data.protocolOk) {
        socket.close(1012, 'version')
        return
      }

      const id = nextId++
      const now = Date.now()
      const space = socket.data.spaceKey ? spaceForKey(socket.data.spaceKey) : undefined

      if (!space) {
        socket.close(1008, 'room')
        return
      }

      const client: Client = {
        id,
        ip: socket.data.ip,
        lastInteractionAt: now,
        lastSeen: now,
        lastMotionAt: now,
        nickname: '',
        poseSynced: false,
        room: 0,
        spaceKey: space.key,
        socket,
        pose: {
          id,
          x: 0,
          y: 0,
          height: 0,
          keys: 0,
          angle: 0,
          idleClipIndex: 0,
          mode: 0,
          style: {
            topStyleIndex: 0,
            bottomStyleIndex: 0,
            hairIndex: 0,
            hairColorIndex: 0,
            skinColorIndex: 2,
            accessoryIndex: 0,
          },
        },
      }

      clients.set(socket, client)
      addToRoom(client, 0)
      sendRoomState(client)
      sendNicknames(client)
      sendChatHistory(client)
      sendVideoSync(client)
      sendBeachBalls(client)
      if (socket.data.initialState) {
        sendGraffiti(client)
      }
      broadcastOnline(clientSpace(client))
      broadcast(client, encodeSpawn(client.pose))
    },
    async message(socket, message) {
      const client = clients.get(socket)!

      try {
        const view = messageView(message)
        const type = view.getUint8(0)

        client.lastSeen = Date.now()

        if (type === C_HEARTBEAT) {
          return
        }

        if (type === C_MOTION) {
          const motion = decodeClientMotion(view)

          touchInteraction(client)
          validateMotion(client, motion)
          client.pose = { id: client.id, ...motion }
          client.lastMotionAt = Date.now()
          client.poseSynced = true
          requestMissingVideoPlaylist(clientSpace(client), clientVideoZone(client))
          broadcast(client, encodeServerMotion(client.pose))
          return
        }

        if (type === C_ROOM_CHANGE) {
          touchInteraction(client)
          changeRoom(client, decodeRoomChange(view))
          return
        }

        if (type === MESSAGE) {
          const text = truncateMessage(decodeClientMessage(view))
          const normalizedText = normalizeChatText(text)
          const emoji = emojiText(text)
          const slur = slurMatch(text)

          touchInteraction(client)
          if ((normalizedText || emoji) && !binaryText(text) && !slur) {
            console.log(`[chat] ${client.id} ${client.ip}: ${text}`)
            addChatHistory(client, text)
            broadcastSpace(clientSpace(client), encodeServerMessage({ id: client.id, text }))
          }

          return
        }

        if (type === NICKNAME) {
          touchInteraction(client)
          setNickname(client, decodeClientNickname(view))
          return
        }

        if (type === ADMIN) {
          touchInteraction(client)
          await applyAdminMessage(client, decodeAdminMessage(view))
          return
        }

        if (type === VIDEO_PROGRESS) {
          const progress = validateVideoProgress(decodeVideoProgress(view).entry)

          if (!client.poseSynced) {
            return
          }

          applyVideoProgress(client, progress)
          return
        }

        if (type === VIDEO_ENDED) {
          const ended = validateVideoEnded(decodeVideoEnded(view).entry)

          if (!client.poseSynced) {
            return
          }

          await applyVideoEnded(client, ended)
          return
        }

        if (type === VIDEO_PLAYLIST) {
          await applyVideoPlaylist(client, validateVideoPlaylist(client, decodeVideoPlaylist(view).entries))
          return
        }

        if (type === BEACH_BALLS) {
          touchInteraction(client)
          const appliedBalls = applyBeachBalls(client, validateBeachBalls(client, decodeBeachBalls(view).balls))

          if (appliedBalls.length > 0) {
            broadcastBeachBalls(clientSpace(client), appliedBalls)
          }

          return
        }

        if (type === GRAFFITI) {
          if (client.spaceKey !== mainSpace.key) {
            return
          }

          try {
            touchInteraction(client)
            const splats = await saveGraffiti(validateGraffiti(decodeGraffiti(view).splats))

            if (splats.length > 0) {
              broadcastGraffiti(splats)
            }
          }
          catch (e) {
            void e
          }

          return
        }

        throw new Error(`Invalid client packet type ${type}`)
      }
      catch (e) {
        if (e instanceof Error && e.message.startsWith('Invalid ')) {
          return
        }

        console.error(e)
      }
    },
    close(socket) {
      const client = clients.get(socket)

      if (!client) {
        return
      }

      removeClient(client)
    },
  },
})

function clientProtocolOk(protocol: string | null) {
  const version = protocol === '-1' ? String(protocolVersion) : protocol

  return version === String(protocolVersion)
}

console.log(`[server]: ws://localhost:${server.port}`)
console.log(`[server]: http://localhost:${server.port}`)

setInterval(syncRooms, heartbeatInterval)
setInterval(logStats, 60_000)

function clientIp(request: Request) {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-real-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'direct'
}

function ipConnections(ip: string) {
  let count = 0

  for (const client of clients.values()) {
    count += Number(client.ip === ip)
  }

  return count
}

function bannedIp(ip: string) {
  for (const ban of bannedIps) {
    if (ipMatchesBan(ip, ban)) {
      return true
    }
  }

  return false
}

function ipMatchesBan(ip: string, ban: string) {
  return ip === ban
    || (ban.endsWith('.') && ip.startsWith(ban))
    || (ban.endsWith(':') && ip.includes(':') && ipv6Subnet(ip) === ban)
}

async function serveStatic(request: Request) {
  const method = request.method

  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: {
        allow: 'GET, HEAD',
      },
    })
  }

  const url = new URL(request.url)
  const path = decodeURIComponent(url.pathname)
  const assetPath = path === '/' ? join(dist, 'index.html') : resolve(dist, `.${path}`)
  const assetRelativePath = relative(dist, assetPath)

  if (assetRelativePath.startsWith('..') || isAbsolute(assetRelativePath)) {
    throw new Error(`Invalid static path ${url.pathname}`)
  }

  const response = await fileResponse(assetPath, request)

  if (response) {
    return response
  }

  if (extname(path)) {
    return new Response('Not Found', { status: 404 })
  }

  return await fileResponse(join(dist, 'index.html'), request) ?? new Response('Not Found', { status: 404 })
}

async function fileResponse(path: string, request: Request) {
  const file = Bun.file(path)

  if (!await file.exists()) {
    return
  }

  if (compressiblePath(path) && file.size <= memoryAssetMaxSize) {
    return await memoryFileResponse(path, file, request)
  }

  const headers = cacheHeaders(path)
  const modified = new Date(file.lastModified)
  const tag = `"${file.size.toString(16)}-${file.lastModified.toString(16)}"`

  headers.set('content-type', assetContentType(path, file))
  headers.set('etag', tag)
  headers.set('last-modified', modified.toUTCString())

  headers.set('content-length', String(file.size))

  if (request.headers.get('if-none-match') === tag) {
    headers.delete('content-length')
    return new Response(null, { status: 304, headers })
  }

  if (request.method === 'HEAD') {
    return new Response(null, { headers })
  }

  return new Response(file, { headers })
}

function cacheHeaders(path: string) {
  const headers = new Headers()

  headers.set('x-content-type-options', 'nosniff')

  if (path.endsWith('index.html')) {
    headers.set('cache-control', 'no-cache')
    return headers
  }

  if (/[/\\]assets[/\\].+-[A-Za-z0-9_-]{8,}\./.test(path)) {
    headers.set('cache-control', 'public, max-age=31536000, immutable')
    return headers
  }

  headers.set('cache-control', 'public, max-age=3600')

  return headers
}

function contentType(path: string) {
  const type = contentTypes.get(extname(path))

  if (!type) {
    throw new Error(`Missing content type for ${path}`)
  }

  return type
}

function assetContentType(path: string, file: Bun.BunFile) {
  return path.endsWith('manifest.json')
    ? 'application/manifest+json; charset=utf-8'
    : file.type || contentType(path)
}

async function handleRoomApi(request: Request, url: URL) {
  if (request.method === 'GET' && url.pathname === '/api/rooms') {
    return jsonResponse({ rooms: listLoftRooms() })
  }

  const slug = roomApiSlug(url.pathname)

  if (!slug) {
    return new Response('Not Found', { status: 404 })
  }

  if (request.method === 'GET' && url.pathname === `/api/rooms/${slug.display}`) {
    return jsonResponse(roomPayload(slug.normalized))
  }

  if (request.method === 'POST' && url.pathname === `/api/rooms/${slug.display}/claim`) {
    const body = await request.json() as { password?: string; musicSource?: string }
    const existing = loadLoftRoom(slug.normalized)

    if (existing && !loftExpired(existing)) {
      return jsonResponse(roomPayload(slug.normalized), 409)
    }

    const password = body.password?.trim()

    if (!password) {
      throw new Error('Missing loft room password')
    }

    const music = parseMusicSource(body.musicSource ?? defaultLoftVideoId)
    const now = Date.now()
    const room: LoftRoom = {
      slug: slug.normalized,
      displaySlug: slug.display,
      passwordHash: hashPassword(password),
      createdAt: now,
      expiresAt: now + loftRentMs,
      musicKind: music.kind,
      musicSource: music.source,
    }

    saveLoftRoom(room)
    refreshLoftSpace(room)

    return jsonResponse(roomPayload(slug.normalized))
  }

  if (request.method === 'POST' && url.pathname === `/api/rooms/${slug.display}/music`) {
    const body = await request.json() as { pass?: string; source?: string }
    const room = activeLoftRoom(slug.normalized)

    if (!room) {
      return new Response('Not Found', { status: 404 })
    }

    if (!validLoftPassword(room, body.pass ?? '') && (adminPass === '' || body.pass !== adminPass)) {
      return new Response('Forbidden', { status: 403 })
    }

    const music = parseMusicSource(body.source ?? '')
    const next = { ...room, musicKind: music.kind, musicSource: music.source }

    saveLoftRoom(next)
    const space = refreshLoftSpace(next)

    saveVideoQueues(space)
    saveVideoPlaylists(space)
    broadcastVideoSync(space, new Set(['loft']))

    return jsonResponse(roomPayload(slug.normalized))
  }

  if (request.method === 'DELETE' && url.pathname === `/api/rooms/${slug.display}`) {
    const body = await request.json() as { pass?: string }

    if (adminPass === '' || body.pass !== adminPass) {
      return new Response('Forbidden', { status: 403 })
    }

    deleteLoftRoom(slug.normalized)

    return jsonResponse({ ok: true })
  }

  return new Response('Method Not Allowed', {
    status: 405,
    headers: { allow: 'GET, POST, DELETE' },
  })
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

function roomApiSlug(path: string) {
  const match = /^\/api\/rooms\/([^/]+)(?:\/(?:claim|music))?$/.exec(path)

  if (!match) {
    return
  }

  const display = decodeURIComponent(match[1]!)

  if (!loftSlugPattern.test(display)) {
    throw new Error(`Invalid room slug ${display}`)
  }

  return {
    display,
    normalized: display.toLowerCase(),
  }
}

function roomPayload(slug: string) {
  const room = loadLoftRoom(slug)
  const claimed = !!room && !loftExpired(room)

  return {
    claimed,
    displaySlug: room?.displaySlug ?? slug,
    expired: !!room && loftExpired(room),
    expiresAt: claimed ? room.expiresAt : 0,
    musicKind: room?.musicKind ?? 'video',
    musicSource: room?.musicSource ?? defaultLoftVideoId,
    slug,
  }
}

function listLoftRooms() {
  const rows = db.query<{
    slug: string
    displaySlug: string
    expiresAt: number
    musicKind: 'playlist' | 'video'
    musicSource: string
  }, { now: number }>(`
    SELECT slug, display_slug AS displaySlug, expires_at AS expiresAt, music_kind AS musicKind,
      music_source AS musicSource
    FROM loft_rooms
    WHERE expires_at > $now
    ORDER BY display_slug COLLATE NOCASE
  `).all({ now: Date.now() })

  return rows.map(room => ({
    ...room,
    players: [...clients.values()].filter(client => client.spaceKey === loftSpaceKey(room.slug)).length,
  }))
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 32).toString('hex')

  return `scrypt:${salt}:${hash}`
}

function validLoftPassword(room: LoftRoom, password: string) {
  const [, salt, hash] = room.passwordHash.split(':')
  const next = scryptSync(password, salt!, 32)
  const saved = Buffer.from(hash!, 'hex')

  return saved.length === next.length && timingSafeEqual(saved, next)
}

function parseMusicSource(source: string): { kind: 'playlist' | 'video'; source: string } {
  const value = source.trim()

  if (!value) {
    throw new Error('Missing music source')
  }

  try {
    const url = new URL(value)
    const list = url.searchParams.get('list')
    const video = url.hostname === 'youtu.be'
      ? url.pathname.slice(1)
      : url.searchParams.get('v')

    if (list) {
      return { kind: 'playlist', source: list }
    }

    if (video) {
      return { kind: 'video', source: video }
    }
  }
  catch (e) {
    void e
  }

  if (!/^[\w-]{6,128}$/.test(value)) {
    throw new Error(`Invalid music source ${value}`)
  }

  if (/^(?:PL|OLAK5uy_|RD|UU|LL|FL)/.test(value)) {
    return { kind: 'playlist', source: value }
  }

  if (!/^[\w-]{6,32}$/.test(value)) {
    throw new Error(`Invalid video source ${value}`)
  }

  return { kind: 'video', source: value }
}

const contentTypes = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.fbx', 'application/octet-stream'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
])

async function memoryFileResponse(path: string, file: Bun.BunFile, request: Request) {
  const asset = await memoryAsset(path, file)
  const encoding = responseEncoding(request, path)
  const headers = cacheHeaders(path)

  headers.set('content-type', asset.type)
  headers.set('etag', asset.tag)
  headers.set('last-modified', asset.modified.toUTCString())
  headers.set('vary', 'accept-encoding')

  if (request.headers.get('if-none-match') === asset.tag) {
    return new Response(null, { status: 304, headers })
  }

  const body = encoding === 'br'
    ? await compressedAsset(asset, 'br')
    : encoding === 'gzip'
    ? await compressedAsset(asset, 'gzip')
    : asset.source

  if (encoding) {
    headers.set('content-encoding', encoding)
  }

  headers.set('content-length', String(body.byteLength))

  if (request.method === 'HEAD') {
    return new Response(null, { headers })
  }

  return new Response(body, { headers })
}

async function memoryAsset(path: string, file: Bun.BunFile) {
  const tag = `"${file.size.toString(16)}-${file.lastModified.toString(16)}"`
  const cached = memoryAssets.get(path)

  if (cached?.tag === tag) {
    return cached
  }

  const source = await file.arrayBuffer()
  const asset: MemoryAsset = {
    modified: new Date(file.lastModified),
    source,
    size: file.size,
    tag,
    type: assetContentType(path, file),
  }

  memoryAssets.set(path, asset)

  return asset
}

async function compressedAsset(asset: MemoryAsset, encoding: 'br' | 'gzip') {
  const cached = asset[encoding]

  if (cached) {
    return cached
  }

  const compressed = await new Response(
    new Response(asset.source).body!.pipeThrough(
      new CompressionStream(encoding === 'br' ? 'brotli' as CompressionFormat : 'gzip'),
    ),
  ).arrayBuffer()

  asset[encoding] = compressed

  return compressed
}

function responseEncoding(request: Request, _path: string) {
  const accept = request.headers.get('accept-encoding') ?? ''

  if (acceptEncodingIncludes(accept, 'br')) {
    return 'br'
  }

  if (acceptEncodingIncludes(accept, 'gzip')) {
    return 'gzip'
  }
}

function acceptEncodingIncludes(header: string, encoding: string) {
  return header
    .split(',')
    .map(part => part.trim().toLowerCase())
    .some(part => {
      const [name, ...parameters] = part.split(';').map(value => value.trim())
      const q = parameters.find(parameter => parameter.startsWith('q='))?.slice(2)

      return name === encoding && q !== '0' && q !== '0.0' && q !== '0.00' && q !== '0.000'
    })
}

function compressiblePath(path: string) {
  const extension = extname(path)

  return extension === '.html'
    || extension === '.css'
    || extension === '.js'
    || extension === '.json'
    || extension === '.map'
    || extension === '.svg'
}

function changeRoom(client: Client, room: number) {
  const space = clientSpace(client)

  if (room < 0 || room >= space.roomCount) {
    throw new Error(`Invalid room ${room}`)
  }

  if (client.poseSynced && room !== clientPoseRoom(client)) {
    sendRoomState(client)
    return
  }

  if (client.room === room) {
    sendRoomState(client)
    return
  }

  const previousZone = clientVideoZone(client)

  removeFromRoom(client)
  addToRoom(client, room)
  requestMissingVideoPlaylist(space, previousZone)
  requestMissingVideoPlaylist(space, clientVideoZone(client))
  sendRoomState(client)
  broadcast(client, encodeSpawn(client.pose))
}

function addToRoom(client: Client, room: number) {
  client.room = room
  clientSpace(client).rooms[room]!.add(client)
}

function removeFromRoom(client: Client) {
  const space = clientSpace(client)

  space.rooms[client.room]!.delete(client)
  broadcast(client, encodeLeave(client.id))
}

function validateMotion(client: Client, motion: MotionPacket) {
  validateMotionValues(client, motion)
  validateMotionStep(client, motion)
}

function binaryText(text: string) {
  return /^[01]+$/.test(text)
}

function emojiText(text: string) {
  return /^(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:\p{Emoji_Modifier}|\uFE0E|\uFE0F)*(?:\u200D[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:\p{Emoji_Modifier}|\uFE0E|\uFE0F)*)*|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3)$/u
    .test(text.trim())
}

function slurMatch(text: string) {
  const normalized = normalizeChatText(text)
  const squashed = normalized.replace(/(.)\1+/g, '$1')
  const matched = slurs.find(slur => normalized.includes(slur) || squashed.includes(slur))
  const pattern = slurPatterns.find(pattern => pattern.test(normalized))

  return matched || pattern ? { matched: matched ?? String(pattern), normalized } : undefined
}

function normalizeChatText(text: string) {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[àáâãäåāăąɑαа]/g, 'a')
    .replace(/[ƄЬᏏᖯ]/g, 'b')
    .replace(/[çćĉċčсϲ]/g, 'c')
    .replace(/[ďđԁ]/g, 'd')
    .replace(/[èéêëēĕėęěеєε]/g, 'e')
    .replace(/[ĝğġģɡց]/g, 'g')
    .replace(/[ĥħһн]/g, 'h')
    .replace(/[ìíîïĩīĭįıιіїӏ]/g, 'i')
    .replace(/[јʝ]/g, 'j')
    .replace(/[ķκк]/g, 'k')
    .replace(/[ĺļľŀłⅼӏ]/g, 'l')
    .replace(/[ｍм]/g, 'm')
    .replace(/[ñńņňŋռոηп]/g, 'n')
    .replace(/[òóôõöōŏőοоօ]/g, 'o')
    .replace(/[ρр]/g, 'p')
    .replace(/[ŕŗřг]/g, 'r')
    .replace(/[śŝşšѕ]/g, 's')
    .replace(/[ţťŧт]/g, 't')
    .replace(/[ùúûüũūŭůűųυս]/g, 'u')
    .replace(/[νѵ]/g, 'v')
    .replace(/[ŵԝ]/g, 'w')
    .replace(/[хχ]/g, 'x')
    .replace(/[ýÿŷуү]/g, 'y')
    .replace(/[źżžʐ]/g, 'z')
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5|\$/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z]/g, '')
}

const slurs = [
  'nigger',
  'niggers',
  'nigga',
  'niggas',
  'niggah',
  'niggahs',
  'nigguh',
  'nigguhs',
  'niglet',
  'coon',
  'jigaboo',
  'porchmonkey',
  'mooncricket',
  'faggot',
  'fag',
  'dyke',
  'homo',
  'kike',
  'hebe',
  'spic',
  'beaner',
  'greaser',
  'chink',
  'gook',
  'zipperhead',
  'wetback',
  'raghead',
  'towelhead',
  'sandnigger',
  'cameljockey',
  'paki',
  'gypsy',
  'dago',
  'kraut',
  'polack',
  'mick',
  'redskin',
  'squaw',
  'injun',
  'tranny',
  'shemale',
  'retard',
  'mongoloid',
]

const slurPatterns = [
  /n+[il]+g+e+r+s?/,
  /n+[il]+g+a+s?/,
  /n+[il]+g+u+h+s?/,
  /n+[il]+g+l+e+t+s?/,
  /f+a+g+o+t+s?/,
  /f+a+g+s?/,
  /k+i+k+e+s?/,
  /s+p+i+c+s?/,
  /c+h+i+n+k+s?/,
  /g+o+o+k+s?/,
]

function validateMotionValues(client: Client, motion: MotionPacket) {
  const x = protocolToScene(motion.x)
  const z = protocolToScene(motion.y)

  if (motion.keys > 15 || (motion.keys & 0b0101) === 0b0101 || (motion.keys & 0b1010) === 0b1010) {
    throw new Error(`Invalid keys ${motion.keys}`)
  }

  if (motion.mode < 0 || motion.mode >= modeCount) {
    throw new Error(`Invalid mode ${motion.mode}`)
  }

  if (motion.idleClipIndex > 19) {
    throw new Error(`Invalid idle clip ${motion.idleClipIndex}`)
  }

  if (motion.style.topStyleIndex >= jewelPalette.length * 2 + 2
    || motion.style.bottomStyleIndex >= jewelPalette.length * 2
    || motion.style.hairIndex > maxHairIndex
    || motion.style.hairColorIndex >= hairPalette.length
    || motion.style.skinColorIndex >= skinPalette.length
    || motion.style.accessoryIndex > accessoryPalette.length)
  {
    throw new Error('Invalid style')
  }

  const bounds = client.spaceKey === mainSpace.key
    ? outsideBounds
    : { left: -12, right: 12, back: -12, front: 12 }

  if (x < bounds.left || x > bounds.right || z < bounds.back || z > bounds.front) {
    throw new Error(`Invalid position ${x}, ${z}`)
  }

  const height = protocolToScene(motion.height)

  if (height < -3 || height > 2.5) {
    throw new Error(`Invalid height ${height}`)
  }

  if (client.spaceKey === mainSpace.key && (motion.mode === 2 || motion.mode === 3)
    && !seatAt([x, 0, z], new Set(), 0.46, true))
  {
    throw new Error(`Invalid seated position ${x}, ${z}`)
  }
}

function validateMotionStep(client: Client, motion: MotionPacket) {
  if (!client.poseSynced) {
    return
  }

  if (motion.mode === 2 || motion.mode === 3) {
    return
  }

  const now = Date.now()
  const delta = Math.max(0, (now - client.lastMotionAt) / 1000)
  const dx = motion.x - client.pose.x
  const dy = motion.y - client.pose.y
  const distance = Math.hypot(dx, dy) / positionScale

  if (distance > maxClientStep + delta * maxClientSpeed) {
    throw new Error(`Invalid movement ${distance.toFixed(2)} in ${delta.toFixed(2)}s`)
  }
}

function clientPoseRoom(client: Client) {
  const x = protocolToScene(client.pose.x)
  const z = protocolToScene(client.pose.y)
  const zone = roomAt([x, 0, z])

  return zone === 'inside' ? 1 : zone === 'tent' ? 2 : 0
}

function sendRoomState(client: Client) {
  const space = clientSpace(client)

  client.socket.send(encodeRoomState({
    selfId: client.id,
    room: client.room,
    players: [...space.rooms[client.room]!.values()].map(player => player.pose),
  }))
}

function sendNicknames(client: Client) {
  for (const next of spaceClients(clientSpace(client))) {
    if (next.nickname) {
      client.socket.send(encodeServerNickname({ id: next.id, text: next.nickname }))
    }
  }
}

function sendChatHistory(client: Client) {
  for (const entry of clientSpace(client).chatHistory) {
    client.socket.send(encodeServerMessage(entry))
  }
}

function addChatHistory(client: Client, text: string) {
  const history = clientSpace(client).chatHistory

  history.push({ id: client.id, text })
  while (history.length > chatHistoryMax) {
    history.shift()
  }
}

function removeChatHistory(space: SpaceState, id: number) {
  for (let i = space.chatHistory.length - 1; i >= 0; i--) {
    if (space.chatHistory[i]!.id === id) {
      space.chatHistory.splice(i, 1)
    }
  }
}

function setNickname(client: Client, text: string) {
  const nickname = text.trim()

  if (nickname.length > nicknameMaxLength || nickname.includes('\n') || nickname.includes('<') || nickname.includes('>')) {
    throw new Error(`Invalid nickname ${nickname}`)
  }

  client.nickname = nickname
  broadcastSpace(clientSpace(client), encodeServerNickname({ id: client.id, text: nickname }))
}

function sendBeachBalls(client: Client) {
  client.socket.send(encodeBeachBalls({ balls: clientSpace(client).beachBalls }))
}

function sendGraffiti(client: Client) {
  if (client.spaceKey !== mainSpace.key) {
    return
  }

  sendGraffitiSplats(client.socket, graffitiSplats)
}

function sendVideoSync(client: Client) {
  const entries = currentVideoSyncForJoin(clientSpace(client))

  if (entries.length > 0) {
    client.socket.send(encodeVideoSync({ entries }))
  }
}

function broadcastVideoSync(space: SpaceState, zones?: Set<VideoZone>) {
  const entries = currentVideoSync(space, Date.now(), zones)

  if (entries.length === 0) {
    return
  }

  const data = encodeVideoSync({ entries })

  for (const client of spaceClients(space)) {
    client.socket.send(data)
  }
}

function currentVideoSync(space: SpaceState, now = Date.now(), zones?: Set<VideoZone>): VideoSyncEntry[] {
  return space.videoQueues
    .filter(entry => !zones || zones.has(entry.zone))
    .map(entry => ({
      zone: entry.zone,
      currentId: entry.currentId,
      nextId: entry.nextId,
      time: entry.time + (now - entry.updatedAt) / 1000,
    }))
}

function currentVideoSyncForJoin(space: SpaceState, now = Date.now()): VideoSyncEntry[] {
  return space.videoQueues.map(entry => {
    const live = videoProgressFromRandomClient(space, entry.zone, entry.currentId, now)

    return {
      zone: entry.zone,
      currentId: entry.currentId,
      nextId: entry.nextId,
      time: live?.time ?? entry.time + (now - entry.updatedAt) / 1000,
    }
  })
}

function videoProgressFromRandomClient(space: SpaceState, zone: VideoZone, id: string, now: number) {
  const entries = [...spaceClients(space)]
    .filter(client => client.video?.zone === zone && client.video.id === id)
    .map(client => client.video!)
  const entry = entries[Math.floor(Math.random() * entries.length)]

  return entry
    ? { zone, id: entry.id, time: entry.time + (now - entry.updatedAt) / 1000 }
    : undefined
}

function setupDb() {
  db.run('PRAGMA journal_mode = WAL;')
  db.run(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS graffiti (
      id INTEGER PRIMARY KEY,
      wall INTEGER NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      seed INTEGER NOT NULL,
      color_index INTEGER NOT NULL,
      radius INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bans (
      value TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS loft_rooms (
      slug TEXT PRIMARY KEY,
      display_slug TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      music_kind TEXT NOT NULL,
      music_source TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS loft_room_bans (
      slug TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (slug, value)
    );
  `)
}

function loadJson<T>(key: string): T | undefined {
  const row = db.query<{ value: string }, { key: string }>('SELECT value FROM kv WHERE key = $key').get({ key })

  return row ? JSON.parse(row.value) as T : undefined
}

function saveJson(key: string, value: unknown) {
  db.query('INSERT INTO kv (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run({ key, value: JSON.stringify(value) })
}

function createSpace(key: string, kind: SpaceState['kind'], count: number, slug?: string): SpaceState {
  const balls = createBeachBalls()

  return {
    key,
    kind,
    roomCount: count,
    rooms: Array.from({ length: count }, () => new Set<Client>()),
    chatHistory: [],
    videoQueues: [],
    videoPlaylistOrders: [],
    videoPlaylistRequests: {},
    beachBalls: balls,
    beachBallAuthorities: balls.map(() => ({ client: 0, until: 0 })),
    slug,
  }
}

function spaceStorageKey(space: SpaceState, key: string) {
  return space.key === mainSpace.key ? key : `${space.key}:${key}`
}

function clientSpace(client: Client) {
  const space = spaces.get(client.spaceKey)

  if (!space) {
    throw new Error(`Missing space ${client.spaceKey}`)
  }

  return space
}

function spaceClients(space: SpaceState) {
  return [...clients.values()].filter(client => client.spaceKey === space.key)
}

function spaceForKey(key: string) {
  if (key === mainSpace.key) {
    return mainSpace
  }

  const slug = key.startsWith('loft:') ? key.slice(5) : ''
  const room = activeLoftRoom(slug)

  if (!room) {
    return
  }

  return refreshLoftSpace(room)
}

function refreshLoftSpace(room: LoftRoom) {
  const key = loftSpaceKey(room.slug)
  let space = spaces.get(key)

  if (!space) {
    space = createSpace(key, 'loft', 1, room.slug)
    space.videoQueues = loadVideoQueues(space)
    space.videoPlaylistOrders = loadVideoPlaylists(space)
    spaces.set(key, space)
  }

  syncLoftMusic(space, room)

  return space
}

function syncLoftMusic(space: SpaceState, room: LoftRoom) {
  space.musicKind = room.musicKind
  space.musicSource = room.musicSource
  if (room.musicKind === 'video') {
    setVideoPlaylistOrder(space, 'loft', [room.musicSource])
    setVideoQueue(space, { zone: 'loft', currentId: room.musicSource, nextId: room.musicSource, time: 0, updatedAt: Date.now() })
    return
  }

  const order = space.videoPlaylistOrders.find(entry => entry.zone === 'loft')

  if (order?.sourceIds[0] !== room.musicSource) {
    space.videoPlaylistOrders = space.videoPlaylistOrders.filter(entry => entry.zone !== 'loft')
    space.videoQueues = space.videoQueues.filter(entry => entry.zone !== 'loft')
  }
}

function loftSpaceKey(slug: string) {
  return `loft:${slug}`
}

function websocketSpaceKey(url: URL, ip: string) {
  const raw = url.searchParams.get('space')

  if (!raw) {
    return mainSpace.key
  }

  if (!loftSlugPattern.test(raw)) {
    return ''
  }

  const slug = raw.toLowerCase()
  const room = activeLoftRoom(slug)

  if (!room || loftBannedIp(slug, ip)) {
    return ''
  }

  refreshLoftSpace(room)

  return loftSpaceKey(slug)
}

function loadLoftRoom(slug: string): LoftRoom | undefined {
  const row = db.query<{
    slug: string
    displaySlug: string
    passwordHash: string
    createdAt: number
    expiresAt: number
    musicKind: 'playlist' | 'video'
    musicSource: string
  }, { slug: string }>(`
    SELECT slug, display_slug AS displaySlug, password_hash AS passwordHash, created_at AS createdAt,
      expires_at AS expiresAt, music_kind AS musicKind, music_source AS musicSource
    FROM loft_rooms
    WHERE slug = $slug
  `).get({ slug })

  return row
}

function activeLoftRoom(slug: string) {
  const room = loadLoftRoom(slug)

  return room && !loftExpired(room) ? room : undefined
}

function loftExpired(room: LoftRoom) {
  return Date.now() >= room.expiresAt
}

function saveLoftRoom(room: LoftRoom) {
  db.query(`
    INSERT INTO loft_rooms (slug, display_slug, password_hash, created_at, expires_at, music_kind, music_source)
    VALUES ($slug, $displaySlug, $passwordHash, $createdAt, $expiresAt, $musicKind, $musicSource)
    ON CONFLICT(slug) DO UPDATE SET display_slug = excluded.display_slug, password_hash = excluded.password_hash,
      created_at = excluded.created_at, expires_at = excluded.expires_at, music_kind = excluded.music_kind,
      music_source = excluded.music_source
  `).run(room)
}

function deleteLoftRoom(slug: string) {
  const key = loftSpaceKey(slug)
  const space = spaces.get(key)

  db.transaction(() => {
    db.query('DELETE FROM loft_rooms WHERE slug = $slug').run({ slug })
    db.query('DELETE FROM loft_room_bans WHERE slug = $slug').run({ slug })
    db.query('DELETE FROM kv WHERE key = $queues OR key = $playlists')
      .run({ queues: `${key}:queues`, playlists: `${key}:playlists` })
  })()

  if (space) {
    for (const client of spaceClients(space)) {
      client.socket.close(1008, 'room deleted')
    }
    spaces.delete(key)
  }
}

function loftBannedIp(slug: string, ip: string) {
  const rows = db.query<{ value: string }, { slug: string }>(
    'SELECT value FROM loft_room_bans WHERE slug = $slug',
  ).all({ slug })

  return rows.some(row => ipMatchesBan(ip, row.value))
}

function saveLoftBan(space: SpaceState, value: string) {
  if (!space.slug) {
    throw new Error(`Missing loft slug for ${space.key}`)
  }

  db.query('INSERT OR IGNORE INTO loft_room_bans (slug, value) VALUES ($slug, $value)')
    .run({ slug: space.slug, value })
}

async function validRoomAdmin(space: SpaceState, pass: string) {
  if (space.kind !== 'loft' || !space.slug) {
    return false
  }

  const room = activeLoftRoom(space.slug)

  return !!room && validLoftPassword(room, pass)
}

function spacePlaylistSource(space: SpaceState, zone: VideoZone) {
  if (space.kind === 'loft') {
    return zone === 'loft' && space.musicKind === 'playlist' ? space.musicSource : undefined
  }

  return videoPlaylists[zone]
}

function loadVideoQueues(space: SpaceState) {
  const saved = loadJson<StoredVideoQueues>(spaceStorageKey(space, 'queues'))

  return saved?.entries ?? []
}

function saveVideoQueues(space: SpaceState) {
  saveJson(spaceStorageKey(space, 'queues'), { entries: space.videoQueues })
}

function loadVideoPlaylists(space: SpaceState) {
  const saved = loadJson<StoredVideoPlaylists>(spaceStorageKey(space, 'playlists'))

  return saved?.entries ?? []
}

function saveVideoPlaylists(space: SpaceState) {
  saveJson(spaceStorageKey(space, 'playlists'), { entries: space.videoPlaylistOrders })
}

function requestMissingVideoPlaylist(space: SpaceState, zone: VideoZone) {
  if (!spacePlaylistSource(space, zone)) {
    return
  }

  if (space.videoPlaylistOrders.some(entry => entry.zone === zone)) {
    return
  }

  const now = Date.now()

  if (now - (space.videoPlaylistRequests[zone] ?? 0) < videoPlaylistRequestInterval) {
    return
  }

  const candidate = [...spaceClients(space)]
    .filter(client => client.poseSynced && clientVideoZone(client) === zone)
    .sort((a, b) => a.id - b.id)[0]

  if (candidate) {
    space.videoPlaylistRequests[zone] = now
    candidate.socket.send(encodeVideoPlaylistRequest({ zones: [zone] }))
  }
}

function applyVideoProgress(client: Client, entry: VideoProgressEntry) {
  const space = clientSpace(client)
  const queue = videoQueue(space, entry.zone)

  if (entry.zone !== clientVideoZone(client)) {
    throw new Error(`Invalid video progress zone ${entry.zone}`)
  }

  if (!queue) {
    requestMissingVideoPlaylist(space, entry.zone)
    return
  }

  if (entry.id !== queue.currentId) {
    sendVideoSync(client)
    return
  }

  client.video = { ...entry, updatedAt: Date.now() }
}

async function applyVideoEnded(client: Client, entry: VideoEndedEntry) {
  const space = clientSpace(client)
  const queue = videoQueue(space, entry.zone)

  if (entry.zone !== clientVideoZone(client)) {
    throw new Error(`Invalid video ended zone ${entry.zone}`)
  }

  if (!queue) {
    requestMissingVideoPlaylist(space, entry.zone)
    return
  }

  if (entry.id !== queue.currentId) {
    return
  }

  const order = videoPlaylist(space, entry.zone)
  const now = Date.now()
  const currentId = queue.nextId
  const nextId = randomVideoId(order.ids, new Set([currentId]))

  setVideoQueue(space, { zone: entry.zone, currentId, nextId, time: 0, updatedAt: now })
  clearClientVideoProgress(space, entry.zone)
  await saveVideoQueues(space)
  broadcastVideoSync(space, new Set([entry.zone]))
}

async function applyVideoPlaylist(client: Client, entries: VideoPlaylistEntry[]) {
  const space = clientSpace(client)
  const now = Date.now()
  const changedZones = new Set<VideoZone>()

  for (const entry of entries) {
    const current = space.videoPlaylistOrders.find(current => current.zone === entry.zone)
    const ids = uniqueVideoIds(entry.ids)
    const sourceKey = ids.join('\n')
    const queue = videoQueue(space, entry.zone)

    if (current && current.ids.join('\n') === sourceKey && queue) {
      continue
    }

    setVideoPlaylistOrder(space, entry.zone, ids)
    if (queue) {
      setRandomNextVideo(space, entry.zone, ids)
    }
    else {
      setRandomVideoQueue(space, entry.zone, now)
    }
    changedZones.add(entry.zone)
  }

  if (changedZones.size > 0) {
    await saveVideoPlaylists(space)
    await saveVideoQueues(space)
    broadcastVideoSync(space, changedZones)
  }
}

function initializeVideoQueuesFromPlaylists(space: SpaceState, now: number) {
  let changed = false

  for (const entry of space.videoPlaylistOrders) {
    if (!videoQueue(space, entry.zone)) {
      setRandomVideoQueue(space, entry.zone, now)
      changed = true
    }
  }

  return changed
}

function setVideoPlaylistOrder(space: SpaceState, zone: VideoZone, ids: string[]) {
  const sourceIds = space.kind === 'loft' && zone === 'loft' && space.musicSource
    ? [space.musicSource]
    : ids

  space.videoPlaylistOrders = [
    ...space.videoPlaylistOrders.filter(entry => entry.zone !== zone),
    { zone, ids, sourceIds },
  ]
}

function setRandomVideoQueue(space: SpaceState, zone: VideoZone, now: number) {
  const order = videoPlaylist(space, zone).ids
  const currentId = randomVideoId(order)
  const nextId = randomVideoId(order, new Set([currentId]))

  setVideoQueue(space, { zone, currentId, nextId, time: 0, updatedAt: now })
  clearClientVideoProgress(space, zone)
}

function setRandomNextVideo(space: SpaceState, zone: VideoZone, ids = videoPlaylist(space, zone).ids) {
  const queue = videoQueue(space, zone)!
  const nextId = randomVideoId(ids, new Set([queue.currentId]))

  setVideoQueue(space, { ...queue, nextId })
}

function setVideoQueue(space: SpaceState, entry: StoredVideoQueueEntry) {
  space.videoQueues = [
    ...space.videoQueues.filter(queue => queue.zone !== entry.zone),
    entry,
  ]
}

function videoQueue(space: SpaceState, zone: VideoZone) {
  return space.videoQueues.find(entry => entry.zone === zone)
}

function videoPlaylist(space: SpaceState, zone: VideoZone) {
  const order = space.videoPlaylistOrders.find(entry => entry.zone === zone)

  if (!order) {
    throw new Error(`Missing video playlist ${zone}`)
  }

  return order
}

function clientVideoZone(client: Client) {
  return clientSpace(client).kind === 'loft' ? 'loft' : roomVideoZone(client.room)
}

function roomVideoZone(room: number): VideoZone {
  return room === 1 ? 'inside' : room === 2 ? 'tent' : 'outside'
}

function validateVideoPlaylist(client: Client, entries: VideoPlaylistEntry[]) {
  const seen = new Set<string>()
  const space = clientSpace(client)

  for (const entry of entries) {
    if (!spacePlaylistSource(space, entry.zone)) {
      throw new Error(`Invalid video playlist zone ${entry.zone}`)
    }

    if (seen.has(entry.zone)) {
      throw new Error(`Duplicate video playlist zone ${entry.zone}`)
    }

    if (entry.ids.length > 255) {
      throw new Error(`Invalid video playlist length ${entry.ids.length}`)
    }

    const ids = uniqueVideoIds(entry.ids)

    if (ids.length < 2) {
      throw new Error(`Invalid video playlist length ${ids.length}`)
    }

    for (const id of ids) {
      if (!/^[\w-]{6,32}$/.test(id)) {
        throw new Error(`Invalid video playlist id ${id}`)
      }
    }

    seen.add(entry.zone)
  }

  return entries
}

function validateVideoProgress(entry: VideoProgressEntry) {
  if (!/^[\w-]{6,32}$/.test(entry.id)) {
    throw new Error(`Invalid video progress id ${entry.id}`)
  }

  if (!Number.isFinite(entry.time) || entry.time < 0 || entry.time > 86400) {
    throw new Error(`Invalid video progress time ${entry.time}`)
  }

  return entry
}

function validateVideoEnded(entry: VideoEndedEntry) {
  if (!/^[\w-]{6,32}$/.test(entry.id)) {
    throw new Error(`Invalid video ended id ${entry.id}`)
  }

  return entry
}

function validateBeachBalls(client: Client, balls: ReturnType<typeof createBeachBalls>) {
  const ids = new Set<number>()
  const space = clientSpace(client)

  for (const ball of balls) {
    const existing = space.beachBalls[ball.id]

    if (!existing || ids.has(ball.id)) {
      throw new Error(`Invalid beach ball ${ball.id}`)
    }

    ids.add(ball.id)
    if (ball.position[0] < outsideBounds.left || ball.position[0] > outsideBounds.right
      || ball.position[2] < outsideBounds.back || ball.position[2] > outsideBounds.front
      || ball.position[1] < -3 || ball.position[1] > 6)
    {
      throw new Error(`Invalid beach ball position ${ball.position[0]}, ${ball.position[1]}, ${ball.position[2]}`)
    }

    const speed = Math.hypot(ball.velocity[0], ball.velocity[1], ball.velocity[2])

    if (speed > 18) {
      throw new Error(`Invalid beach ball speed ${speed}`)
    }
  }

  return balls
}

function applyBeachBalls(client: Client, balls: ReturnType<typeof createBeachBalls>) {
  const now = Date.now()
  const applied: ReturnType<typeof createBeachBalls> = []
  const space = clientSpace(client)

  for (const ball of balls) {
    const authority = space.beachBallAuthorities[ball.id]!

    if (authority.client !== 0 && authority.client !== client.id && now < authority.until) {
      continue
    }

    authority.client = client.id
    authority.until = now + beachBallAuthorityDuration
    space.beachBalls[ball.id] = ball
    applied.push(ball)
  }

  return applied
}

function broadcastBeachBalls(space: SpaceState, balls = space.beachBalls) {
  const data = encodeBeachBalls({ balls })

  for (const client of spaceClients(space)) {
    client.socket.send(data)
  }
}

function validateGraffiti(splats: GraffitiSplat[]) {
  for (const splat of splats) {
    if (!Number.isInteger(splat.wall) || !Number.isInteger(splat.seed) || !Number.isInteger(splat.colorIndex)
      || !Number.isInteger(splat.radius) || !Number.isFinite(splat.x) || !Number.isFinite(splat.y)
      || splat.wall < 0 || splat.wall >= graffitiWallCount
      || splat.seed < 0 || splat.seed > 65535 || splat.colorIndex < 0 || splat.colorIndex >= graffitiColors.length
      || splat.radius < 0 || splat.radius > 255)
    {
      throw new Error('Invalid graffiti splat')
    }

    const wall = graffitiWallBounds(splat.wall)

    if (splat.x < wall.min || splat.x > wall.max || splat.y < wall.yMin || splat.y > wall.yMax) {
      throw new Error('Invalid graffiti splat')
    }
  }

  return splats.slice(0, 8)
}

async function saveGraffiti(splats: GraffitiSplat[]) {
  const saved: GraffitiSplat[] = []
  const insert = db.query(`
    INSERT INTO graffiti (id, wall, x, y, seed, color_index, radius)
    VALUES ($id, $wall, $x, $y, $seed, $colorIndex, $radius)
  `)
  const remove = db.query('DELETE FROM graffiti WHERE id = $id')

  for (const splat of splats) {
    const next = { ...splat, id: nextGraffitiId++ }

    graffitiSplats.push(next)
    saved.push(next)
    insert.run(next)
  }

  while (graffitiSplats.length > maxGraffitiSplats) {
    const removed = graffitiSplats.shift()!

    remove.run({ id: removed.id })
  }

  return saved
}

async function loadGraffitiSplats() {
  const splats = db.query<{
    id: number
    wall: number
    x: number
    y: number
    seed: number
    colorIndex: number
    radius: number
  }, []>(`
    SELECT id, wall, x, y, seed, color_index AS colorIndex, radius
    FROM graffiti
    ORDER BY id
  `).all()

  const removed = splats.splice(0, Math.max(0, splats.length - maxGraffitiSplats))
  const remove = db.query('DELETE FROM graffiti WHERE id = $id')

  for (const splat of removed) {
    remove.run({ id: splat.id })
  }

  return splats
}

async function loadBannedIps() {
  const rows = db.query<{ value: string }, []>('SELECT value FROM bans').all()

  return new Set(rows.map(row => row.value))
}

function saveBan(value: string) {
  db.query('INSERT OR IGNORE INTO bans (value) VALUES ($value)').run({ value })
}

async function applyAdminMessage(client: Client, packet: ReturnType<typeof decodeAdminMessage>) {
  const space = clientSpace(client)
  const globalAdmin = adminPass !== '' && packet.pass === adminPass
  const roomAdmin = !globalAdmin && await validRoomAdmin(space, packet.pass)

  console.log(`Admin command: command=${packet.command} target=${packet.id}`)

  if (!globalAdmin && !roomAdmin) {
    console.log(`Admin command rejected: invalid pass target=${packet.id}`)
    throw new Error('Invalid admin pass')
  }

  if (packet.command === 'ban') {
    await banClient(space, packet.id, globalAdmin)
  }
  else if (packet.command === 'banSubnet') {
    await banClientSubnet(space, packet.id, globalAdmin)
  }
  else if (packet.command === 'randomTrack') {
    await randomizeVideoTrack(space, space.kind === 'loft' ? 'loft' : roomVideoZone(packet.id))
  }
}

async function randomizeVideoTrack(space: SpaceState, zone: VideoZone) {
  const now = Date.now()

  if (!spacePlaylistSource(space, zone)) {
    console.log(`Admin random track skipped: no playlist ${zone}`)
    return
  }

  if (!space.videoPlaylistOrders.some(entry => entry.zone === zone)) {
    console.log(`Admin random track skipped: missing playlist order ${zone}`)
    return
  }

  if (videoQueue(space, zone)) {
    setRandomNextVideo(space, zone)
  }
  else {
    setRandomVideoQueue(space, zone, now)
  }

  const queue = videoQueue(space, zone)!

  console.log(`[video] random queued ${zone}: current=${queue.currentId} next=${queue.nextId}`)
  await saveVideoQueues(space)
  broadcastVideoSync(space, new Set([zone]))
}

function clearClientVideoProgress(space: SpaceState, zone: VideoZone) {
  for (const client of spaceClients(space)) {
    if (client.video?.zone === zone) {
      client.video = undefined
    }
  }
}

function uniqueVideoIds(ids: string[]) {
  return [...new Set(ids)]
}

function randomVideoId(ids: string[], exclude = new Set<string>()) {
  const uniqueIds = [...new Set(ids)]
  const choices = uniqueIds.filter(id => !exclude.has(id))

  if (uniqueIds.length === 0) {
    throw new Error('Missing video choices')
  }

  if (choices.length === 0) {
    return uniqueIds[0]!
  }

  return choices[Math.floor(Math.random() * choices.length)]!
}

async function banClient(space: SpaceState, id: number, globalAdmin: boolean) {
  const client = [...(globalAdmin ? clients.values() : spaceClients(space))].find(next => next.id === id)

  if (!client) {
    console.log(`Admin ban rejected: invalid target id=${id}`)
    throw new Error(`Invalid ban target ${id}`)
  }

  removeChatHistory(clientSpace(client), id)
  broadcastSpace(clientSpace(client), encodeModerationMessage({ command: 'deleteMessages', id }))

  const banned = globalAdmin
    ? [...clients.values()].filter(next => next.ip === client.ip)
    : [...spaceClients(space)].filter(next => next.ip === client.ip)

  if (globalAdmin) {
    bannedIps.add(client.ip)
    saveBan(client.ip)
  }
  else {
    saveLoftBan(space, client.ip)
  }
  console.log(`Admin ban: id=${id} ip=${client.ip}`)
  banClients(space, id, banned, globalAdmin)
}

async function banClientSubnet(space: SpaceState, id: number, globalAdmin: boolean) {
  const client = [...(globalAdmin ? clients.values() : spaceClients(space))].find(next => next.id === id)

  if (!client) {
    console.log(`Admin subnet ban rejected: invalid target id=${id}`)
    throw new Error(`Invalid ban target ${id}`)
  }

  removeChatHistory(clientSpace(client), id)
  broadcastSpace(clientSpace(client), encodeModerationMessage({ command: 'deleteMessages', id }))

  const subnet = ipSubnet(client.ip)
  const banned = globalAdmin
    ? [...clients.values()].filter(next => ipMatchesBan(next.ip, subnet))
    : [...spaceClients(space)].filter(next => ipMatchesBan(next.ip, subnet))

  if (globalAdmin) {
    bannedIps.add(subnet)
    saveBan(subnet)
  }
  else {
    saveLoftBan(space, subnet)
  }
  console.log(`Admin subnet ban: id=${id} subnet=${subnet}*`)
  banClients(space, id, banned, globalAdmin)
}

function ipSubnet(ip: string) {
  if (ip.includes(':')) {
    return ipv6Subnet(ip)
  }

  const parts = ip.split('.')

  if (parts.length !== 4) {
    throw new Error(`Invalid subnet ban ip ${ip}`)
  }

  return `${parts.slice(0, 3).join('.')}.`
}

function ipv6Subnet(ip: string) {
  return `${expandedIpv6(ip).slice(0, 4).join(':')}:`
}

function expandedIpv6(ip: string) {
  const sections = ip.toLowerCase().split('::')

  if (sections.length > 2) {
    throw new Error(`Invalid ipv6 ${ip}`)
  }

  const head = ipv6Parts(sections[0]!)
  const tail = ipv6Parts(sections[1] ?? '')
  const missing = 8 - head.length - tail.length

  if (missing < 0 || (sections.length === 1 && missing !== 0)) {
    throw new Error(`Invalid ipv6 ${ip}`)
  }

  return [
    ...head,
    ...Array.from({ length: missing }, () => '0000'),
    ...tail,
  ]
}

function ipv6Parts(section: string) {
  return section === ''
    ? []
    : section.split(':').map(part => {
      if (!/^[\da-f]{1,4}$/.test(part)) {
        throw new Error(`Invalid ipv6 part ${part}`)
      }

      return part.padStart(4, '0')
    })
}

function banClients(space: SpaceState, id: number, banned: Client[], globalAdmin: boolean) {
  for (const next of banned) {
    if (next.id !== id) {
      removeChatHistory(globalAdmin ? clientSpace(next) : space, next.id)
      if (globalAdmin) {
        broadcastSpace(clientSpace(next), encodeModerationMessage({ command: 'deleteMessages', id: next.id }))
      }
      else {
        broadcastSpace(space, encodeModerationMessage({ command: 'deleteMessages', id: next.id }))
      }
    }
  }

  setTimeout(() => {
    for (const next of banned) {
      removeClient(next)
      next.socket.close(1008, 'banned')
    }
  }, 100)
}

function broadcastGraffiti(splats: GraffitiSplat[]) {
  for (const client of clients.values()) {
    sendGraffitiSplats(client.socket, splats)
  }
}

function sendGraffitiSplats(socket: Bun.ServerWebSocket<SocketData>, splats: GraffitiSplat[]) {
  for (let i = 0; i < splats.length; i += graffitiPacketSplats) {
    socket.send(encodeGraffiti({ splats: splats.slice(i, i + graffitiPacketSplats) }))
  }
}

function syncRooms() {
  const now = Date.now()

  for (const client of clients.values()) {
    if (now - client.lastSeen > clientTimeout) {
      removeClient(client)
      client.socket.close(1001, 'timeout')
    }
  }

  for (const client of clients.values()) {
    sendRoomState(client)
  }

  broadcastOnline()
}

function touchInteraction(client: Client) {
  client.lastInteractionAt = Date.now()
}

function removeClient(client: Client) {
  if (!clients.delete(client.socket)) {
    return
  }

  const space = clientSpace(client)
  const zone = clientVideoZone(client)

  removeFromRoom(client)
  requestMissingVideoPlaylist(space, zone)
  broadcastOnline(space)
}

function broadcastOnline(space?: SpaceState) {
  if (!space) {
    for (const next of spaces.values()) {
      broadcastOnline(next)
    }

    return
  }

  const online = onlineCount(space)
  const data = encodeOnline(online)

  for (const client of spaceClients(space)) {
    client.socket.send(data)
  }
}

function onlineCount(space = mainSpace) {
  const now = Date.now()

  return [...spaceClients(space)]
    .filter(client => now - client.lastInteractionAt <= onlineActivityTimeout)
    .length
}

function logStats() {
  console.log(`[stats] online: ${onlineCount(mainSpace)}`)
}

function broadcastSpace(space: SpaceState, data: ArrayBuffer) {
  for (const client of spaceClients(space)) {
    client.socket.send(data)
  }
}

function broadcast(source: Client, data: ArrayBuffer) {
  const space = clientSpace(source)

  for (const client of space.rooms[source.room]!) {
    if (client !== source) {
      client.socket.send(data)
    }
  }
}

function messageView(message: string | Buffer) {
  if (typeof message === 'string') {
    throw new Error('Expected binary websocket message')
  }

  return new DataView(message.buffer, message.byteOffset, message.byteLength)
}
