import {
  ADMIN,
  BEACH_BALLS,
  C_HEARTBEAT,
  C_MOTION,
  C_ROOM_CHANGE,
  decodeClientMessage,
  decodeAdminMessage,
  decodeBeachBalls,
  decodeClientMotion,
  decodeGraffiti,
  decodeRoomChange,
  decodeVideoState,
  encodeLeave,
  encodeOnline,
  encodeRoomState,
  encodeServerMessage,
  encodeBeachBalls,
  encodeGraffiti,
  encodeServerMotion,
  encodeSpawn,
  encodeVideoState,
  MESSAGE,
  positionScale,
  protocolVersion,
  protocolToScene,
  roomCount,
  type SpawnPacket,
  type MotionPacket,
  type VideoStateEntry,
  truncateMessage,
  GRAFFITI,
  VIDEO_STATE,
} from './src/protocol.ts'
import { hairPalette, jewelPalette, skinPalette } from './src/character-data.ts'
import { accessoryPalette } from './src/character-style.ts'
import { createBeachBalls } from './src/beach-balls.ts'
import { graffitiColors, maxGraffitiSplats } from './src/graffiti.ts'
import { outsideBounds, roomBounds, videoStartTimes, videoTracks } from './src/scene-data.ts'
import { roomAt, seatAt } from './src/scene.ts'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { open } from 'lmdb'
import type { GraffitiSplat } from './src/types.ts'

type Client = {
  id: number
  ip: string
  lastSeen: number
  lastMotionAt: number
  poseSynced: boolean
  room: number
  socket: Bun.ServerWebSocket<SocketData>
  videoState?: VideoStateEntry[]
  pose: SpawnPacket
}

type SocketData = {
  ip: string
  protocolOk: boolean
}

const port = Number(process.env.PORT ?? 3001)
const dist = join(import.meta.dir, 'dist')
const rooms = Array.from({ length: roomCount }, () => new Set<Client>())
const clients = new Map<Bun.ServerWebSocket<SocketData>, Client>()
const heartbeatInterval = 10_000
const clientTimeout = 30_000
const maxConnectionsPerIp = 4
const maxClientSpeed = 8
const maxClientStep = 1.2
const maxHairIndex = 32
const memoryAssetMaxSize = 2 * 1024 * 1024
const memoryAssets = new Map<string, MemoryAsset>()
let videoState = initialVideoState()
let videoStateSynced = false
let beachBalls = createBeachBalls()
const beachBallAuthorities = createBeachBalls().map(() => ({ client: 0, until: 0 }))
const beachBallAuthorityDuration = 2000
const graffitiDbPath = process.env.CLUB_GRAFFITI_DB ?? join(import.meta.dir, 'data', 'graffiti.lmdb')
const graffitiDb = open<GraffitiSplat>({ path: graffitiDbPath, compression: true })
const banDbPath = process.env.CLUB_BAN_DB ?? join(import.meta.dir, 'data', 'bans.lmdb')
const banDb = open<string>({ path: banDbPath, compression: true })
const adminPass = process.env.ADMIN_PASS ?? ''
const bannedIps = await loadBannedIps()
let graffitiSplats = await loadGraffitiSplats()
let nextGraffitiId = (graffitiSplats.at(-1)?.id ?? 0) + 1
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

    if (bannedIps.has(ip)) {
      return new Response('Forbidden', { status: 403 })
    }

    if (ipConnections(ip) >= maxConnectionsPerIp) {
      return new Response('Too Many Connections', { status: 429 })
    }

    if (server.upgrade(request, {
      data: {
        ip,
        protocolOk: clientProtocolOk(url.searchParams.get('protocol')),
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
      const client: Client = {
        id,
        ip: socket.data.ip,
        lastSeen: Date.now(),
        lastMotionAt: Date.now(),
        poseSynced: false,
        room: 0,
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
      if (videoStateSynced) {
        sendVideoState(client)
      }
      sendBeachBalls(client)
      sendGraffiti(client)
      broadcastOnline()
      broadcast(client.room, encodeSpawn(client.pose), client)
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

          validateMotion(client, motion)
          client.pose = { id: client.id, ...motion }
          client.lastMotionAt = Date.now()
          client.poseSynced = true
          broadcast(client.room, encodeServerMotion(client.pose), client)
          return
        }

        if (type === C_ROOM_CHANGE) {
          changeRoom(client, decodeRoomChange(view))
          return
        }

        if (type === MESSAGE) {
          const text = truncateMessage(decodeClientMessage(view))
          const normalizedText = normalizeChatText(text)
          const slur = slurMatch(text)

          if (normalizedText && !binaryText(text) && !slur) {
            console.log(`Chat from ${client.ip}: ${text}`)
            broadcastAll(encodeServerMessage({ id: client.id, text }))
          }

          return
        }

        if (type === ADMIN) {
          await applyAdminMessage(decodeAdminMessage(view))
          return
        }

        if (type === VIDEO_STATE) {
          const nextVideoState = validateVideoState(decodeVideoState(view).entries)

          if (!client.poseSynced) {
            return
          }

          if (!videoStateSynced) {
            videoState = nextVideoState
            videoStateSynced = true
            client.videoState = nextVideoState
            broadcastVideoState()
            return
          }

          if (!videoIdsMatch(nextVideoState, videoState) && videoIdsMatch(nextVideoState, initialVideoState())) {
            videoState = nextVideoState
            client.videoState = nextVideoState
            broadcastVideoState()
            return
          }

          if (!videoIdsMatch(nextVideoState, videoState)) {
            sendVideoState(client)
            return
          }

          client.videoState = nextVideoState
          pickVideoState()
          return
        }

        if (type === BEACH_BALLS) {
          const appliedBalls = applyBeachBalls(client, validateBeachBalls(decodeBeachBalls(view).balls))

          if (appliedBalls.length > 0) {
            broadcastBeachBalls(appliedBalls)
          }

          return
        }

        if (type === GRAFFITI) {
          try {
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
        void e
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

console.log(`club multiplayer: ws://localhost:${server.port}`)
console.log(`club static: http://localhost:${server.port}`)

setInterval(syncRooms, heartbeatInterval)

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

  headers.set('content-type', file.type || contentType(path))
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
    type: file.type || contentType(path),
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
    new Response(asset.source).body!.pipeThrough(new CompressionStream(encoding === 'br' ? 'brotli' : 'gzip')),
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
  if (room < 0 || room >= roomCount) {
    throw new Error(`Invalid room ${room}`)
  }

  if (client.poseSynced && room !== clientPoseRoom(client)) {
    throw new Error(`Invalid room change ${room}`)
  }

  if (client.room === room) {
    sendRoomState(client)
    return
  }

  removeFromRoom(client)
  addToRoom(client, room)
  sendRoomState(client)
  broadcast(client.room, encodeSpawn(client.pose), client)
}

function addToRoom(client: Client, room: number) {
  client.room = room
  rooms[room]!.add(client)
}

function removeFromRoom(client: Client) {
  rooms[client.room]!.delete(client)
  broadcast(client.room, encodeLeave(client.id))
}

function validateMotion(client: Client, motion: MotionPacket) {
  validateMotionValues(motion)
  validateMotionStep(client, motion)
}

function binaryText(text: string) {
  return /^[01]+$/.test(text)
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
  'yid',
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
  'wop',
  'kraut',
  'polack',
  'mick',
  'redskin',
  'squaw',
  'injun',
  'jap',
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

function validateMotionValues(motion: MotionPacket) {
  const x = protocolToScene(motion.x)
  const z = protocolToScene(motion.y)

  if (motion.keys > 15 || (motion.keys & 0b0101) === 0b0101 || (motion.keys & 0b1010) === 0b1010) {
    throw new Error(`Invalid keys ${motion.keys}`)
  }

  if (motion.mode < 0 || motion.mode > 4) {
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

  if (x < outsideBounds.left || x > outsideBounds.right || z < outsideBounds.back || z > outsideBounds.front) {
    throw new Error(`Invalid position ${x}, ${z}`)
  }

  const height = protocolToScene(motion.height)

  if (height < -3 || height > 2.5) {
    throw new Error(`Invalid height ${height}`)
  }

  if ((motion.mode === 2 || motion.mode === 3) && !seatAt([x, 0, z], new Set(), 0.46, true)) {
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
  client.socket.send(encodeRoomState({
    selfId: client.id,
    room: client.room,
    players: [...rooms[client.room]!.values()].map(player => player.pose),
  }))
}

function sendVideoState(client: Client) {
  client.socket.send(encodeVideoState({ entries: videoState }))
}

function broadcastVideoState() {
  const data = encodeVideoState({ entries: videoState })

  for (const client of clients.values()) {
    client.socket.send(data)
  }
}

function sendBeachBalls(client: Client) {
  client.socket.send(encodeBeachBalls({ balls: beachBalls }))
}

function sendGraffiti(client: Client) {
  client.socket.send(encodeGraffiti({ splats: graffitiSplats }))
}

function pickVideoState() {
  const synced = [...clients.values()].filter(client => client.videoState)

  if (synced.length === 0) {
    return
  }

  videoState = synced[Math.floor(Math.random() * synced.length)]!.videoState!
}

function videoIdsMatch(left: VideoStateEntry[], right: VideoStateEntry[]) {
  for (const entry of left) {
    if (right.find(state => state.zone === entry.zone)!.id !== entry.id) {
      return false
    }
  }

  return true
}

function initialVideoState(): VideoStateEntry[] {
  return [
    { zone: 'inside', id: videoTracks.inside, time: videoStartTimes.inside },
    { zone: 'outside', id: videoTracks.outside, time: videoStartTimes.outside },
    { zone: 'tent', id: videoTracks.tent, time: videoStartTimes.tent },
  ]
}

function validateVideoState(entries: VideoStateEntry[]) {
  const seen = new Set<string>()

  for (const entry of entries) {
    if (seen.has(entry.zone)) {
      throw new Error(`Duplicate video zone ${entry.zone}`)
    }

    if (!/^[\w-]{6,32}$/.test(entry.id)) {
      throw new Error(`Invalid video id ${entry.id}`)
    }

    if (!Number.isFinite(entry.time) || entry.time < 0 || entry.time > 86400) {
      throw new Error(`Invalid video time ${entry.time}`)
    }

    seen.add(entry.zone)
  }

  if (seen.size !== roomCount) {
    throw new Error(`Invalid video state count ${seen.size}`)
  }

  return entries.map(entry => videoStateEntry(entry))
}

function videoStateEntry(entry: VideoStateEntry): VideoStateEntry {
  const id = videoTracks[entry.zone]
  const time = entry.id === id && entry.time >= 0.5 ? entry.time : videoStartTimes[entry.zone]

  return { zone: entry.zone, id, time }
}

function validateBeachBalls(balls: ReturnType<typeof createBeachBalls>) {
  const ids = new Set<number>()

  for (const ball of balls) {
    const existing = beachBalls[ball.id]

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

  for (const ball of balls) {
    const authority = beachBallAuthorities[ball.id]!

    if (authority.client !== 0 && authority.client !== client.id && now < authority.until) {
      continue
    }

    authority.client = client.id
    authority.until = now + beachBallAuthorityDuration
    beachBalls[ball.id] = ball
    applied.push(ball)
  }

  return applied
}

function broadcastBeachBalls(balls = beachBalls) {
  const data = encodeBeachBalls({ balls })

  for (const client of clients.values()) {
    client.socket.send(data)
  }
}

function validateGraffiti(splats: GraffitiSplat[]) {
  for (const splat of splats) {
    if (!Number.isInteger(splat.wall) || !Number.isInteger(splat.seed) || !Number.isInteger(splat.colorIndex)
      || !Number.isInteger(splat.radius) || !Number.isFinite(splat.x) || !Number.isFinite(splat.y)
      || splat.wall > 3 || splat.x < -30
      || splat.x > 30 || splat.y < -2 || splat.y > 4 || splat.seed > 65535
      || splat.colorIndex >= graffitiColors.length || splat.radius < 0 || splat.radius > 255)
    {
      throw new Error('Invalid graffiti splat')
    }
  }

  return splats.slice(0, 8)
}

async function saveGraffiti(splats: GraffitiSplat[]) {
  const saved: GraffitiSplat[] = []

  for (const splat of splats) {
    const next = { ...splat, id: nextGraffitiId++ }

    graffitiSplats.push(next)
    saved.push(next)
    await graffitiDb.put(next.id, next)
  }

  while (graffitiSplats.length > maxGraffitiSplats) {
    const removed = graffitiSplats.shift()!

    await graffitiDb.remove(removed.id)
  }

  return saved
}

async function loadGraffitiSplats() {
  const splats: GraffitiSplat[] = []

  for await (const { value } of graffitiDb.getRange()) {
    splats.push({ ...value, radius: value.radius ?? 96 })
  }

  splats.sort((a, b) => a.id - b.id)

  return splats.slice(-maxGraffitiSplats)
}

async function loadBannedIps() {
  const ips = new Set<string>()

  for await (const { value } of banDb.getRange()) {
    ips.add(value)
  }

  return ips
}

async function applyAdminMessage(packet: ReturnType<typeof decodeAdminMessage>) {
  if (adminPass === '' || packet.pass !== adminPass) {
    throw new Error('Invalid admin pass')
  }

  if (packet.command === 'ban') {
    await banClient(packet.id)
  }
}

async function banClient(id: number) {
  const client = [...clients.values()].find(next => next.id === id)

  if (!client) {
    throw new Error(`Invalid ban target ${id}`)
  }

  bannedIps.add(client.ip)
  await banDb.put(client.ip, client.ip)

  for (const next of [...clients.values()]) {
    if (next.ip === client.ip) {
      removeClient(next)
      next.socket.close(1008, 'banned')
    }
  }
}

function broadcastGraffiti(splats: GraffitiSplat[]) {
  const data = encodeGraffiti({ splats })

  for (const client of clients.values()) {
    client.socket.send(data)
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
}

function removeClient(client: Client) {
  if (!clients.delete(client.socket)) {
    return
  }

  removeFromRoom(client)
  broadcastOnline()
}

function broadcastOnline() {
  const data = encodeOnline(clients.size)

  for (const client of clients.values()) {
    client.socket.send(data)
  }
}

function broadcastAll(data: ArrayBuffer) {
  for (const client of clients.values()) {
    client.socket.send(data)
  }
}

function broadcast(room: number, data: ArrayBuffer, except?: Client) {
  for (const client of rooms[room]!) {
    if (client !== except) {
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
