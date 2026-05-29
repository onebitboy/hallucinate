import { characterFloor } from './character-data.ts'
import { resolvePlayerStyle } from './character-style.ts'
import { lengthSq, mix } from './math.ts'
import {
  angleToProtocol,
  decodeKeys,
  decodeLeave,
  decodeBeachBalls,
  decodeGraffiti,
  decodeOnline,
  decodeModerationMessage,
  decodeRoomState,
  decodeServerMessage,
  decodeServerMotion,
  decodeSpawn,
  decodeVideoState,
  encodeAdminMessage,
  encodeClientMessage,
  encodeClientMotion,
  encodeHeartbeat,
  encodeBeachBalls,
  encodeGraffiti,
  encodeKeys,
  encodeRoomChange,
  encodeVideoState,
  MESSAGE,
  modeToProtocol,
  protocolToAngle,
  protocolToMode,
  protocolToScene,
  protocolVersion,
  S_LEAVE,
  S_MOTION,
  S_ONLINE,
  S_ROOM_STATE,
  S_SPAWN,
  sceneToProtocol,
  type SpawnPacket,
  type VideoStateEntry,
  truncateMessage,
  BEACH_BALLS,
  GRAFFITI,
  MODERATION,
  VIDEO_STATE,
} from './protocol.ts'
import { collideRoom, isOutside, seatAt, walkHeight } from './scene.ts'
import type { BeachBall, CharacterMode, CircleBounds, GraffitiSplat, Player, Vec3 } from './types.ts'

export function createMultiplayer(options: {
  localPosition: Vec3
  localTurn: () => number
  localMoveAngle: () => number
  localInput: Vec3
  localMode: () => CharacterMode
  localIdleClipIndex: () => number
  localStyle: () => {
    topStyleIndex: number
    bottomStyleIndex: number
    hairIndex: number
    hairColorIndex: number
    skinColorIndex: number
    accessoryIndex: number
  }
  initialRoom: number
  onRoomState: (room: number) => void
  onMessage: (id: number, text: string) => void
  onDeleteMessages: (id: number) => void
  onLeave: (id: number) => void
  onOnlineCount: (count: number) => void
  onVideoState: (entries: VideoStateEntry[], preserveSameTrack: boolean) => void
  onBeachBalls: (balls: BeachBall[]) => void
  onGraffiti: (splats: GraffitiSplat[]) => void
  videoState: () => VideoStateEntry[]
}) {
  const players = new Map<number, Player>()
  let url: string
  if (location.protocol === 'https:') {
    url = `${location.origin.replace(/^http/, 'ws')}?protocol=${protocolVersion}`
  }
  else {
    url = `ws://${location.hostname}:3001?protocol=${protocolVersion}`
  }
  const heartbeatInterval = 5_000
  const videoSyncInterval = 10_000
  const reconnectDelay = 1_500
  let socket = connect()
  let heartbeat = 0
  let videoSync = 0
  let reconnect = 0
  let closed = false
  let connectedOnce = false
  let preserveVideoState = false
  const pending: ArrayBuffer[] = []
  let selfId = 0
  let room = options.initialRoom
  let lastKeys = -1
  let lastAngle = -1
  let lastMode = -1
  let lastHeight = Infinity

  function connect() {
    const next = new WebSocket(url)

    next.binaryType = 'arraybuffer'
    next.addEventListener('open', () => {
      preserveVideoState = connectedOnce
      connectedOnce = true
      clearTimeout(reconnect)
      heartbeat = setInterval(() => send(encodeHeartbeat()), heartbeatInterval)
      videoSync = setInterval(() => sendVideoState(), videoSyncInterval)
      room = options.initialRoom
      sendMotion()
      send(encodeRoomChange(room))
      flush()
    })
    next.addEventListener('close', event => {
      clearInterval(heartbeat)
      clearInterval(videoSync)

      if (event.code === 1012 && event.reason === 'version') {
        location.reload()
        return
      }

      if (!closed) {
        reconnect = setTimeout(() => {
          socket = connect()
        }, reconnectDelay)
      }
    })
    next.addEventListener('message', receive)

    return next
  }

  function receive(event: MessageEvent<ArrayBuffer>) {
    const view = new DataView(event.data as ArrayBuffer)
    const type = view.getUint8(0)

    if (type === S_ROOM_STATE) {
      const state = decodeRoomState(view)
      const previousSelfId = selfId
      const previousRoom = room
      const previousIds = new Set(players.keys())

      selfId = state.selfId
      room = state.room
      players.clear()

      for (const player of state.players) {
        if (player.id !== selfId && validRemotePose(player)) {
          players.set(player.id, createRemotePlayer(player))
          previousIds.delete(player.id)
        }
      }

      for (const id of previousIds) {
        options.onLeave(id)
      }

      if (selfId !== previousSelfId || room !== previousRoom) {
        options.onRoomState(room)
      }

      return
    }

    if (type === S_SPAWN) {
      const packet = decodeSpawn(view)

      if (packet.id !== selfId && validRemotePose(packet)) {
        players.set(packet.id, createRemotePlayer(packet))
      }

      return
    }

    if (type === S_MOTION) {
      const packet = decodeServerMotion(view)
      const player = players.get(packet.id)

      if (player && validRemotePose(packet)) {
        applyRemotePose(player, packet)
      }

      return
    }

    if (type === S_LEAVE) {
      const id = decodeLeave(view)

      players.delete(id)
      options.onLeave(id)
      return
    }

    if (type === S_ONLINE) {
      options.onOnlineCount(decodeOnline(view))
      return
    }

    if (type === VIDEO_STATE) {
      options.onVideoState(decodeVideoState(view).entries, preserveVideoState)
      preserveVideoState = false
      return
    }

    if (type === BEACH_BALLS) {
      options.onBeachBalls(decodeBeachBalls(view).balls)
      return
    }

    if (type === GRAFFITI) {
      options.onGraffiti(decodeGraffiti(view).splats)
      return
    }

    if (type === MESSAGE) {
      const message = decodeServerMessage(view)

      options.onMessage(message.id, message.text)
      return
    }

    if (type === MODERATION) {
      const message = decodeModerationMessage(view)

      if (message.command === 'deleteMessages') {
        options.onDeleteMessages(message.id)
      }
    }
  }

  function send(data: ArrayBuffer) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(data)
    }
  }

  function queue(data: ArrayBuffer) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(data)
    }
    else {
      pending.push(data)
    }
  }

  function flush() {
    while (pending.length) {
      socket.send(pending.shift()!)
    }
  }

  function sendMotion() {
    const mode = options.localMode()
    const protocolMode = modeToProtocol(mode)
    const seated = mode === 'manSitting' || mode === 'womanSitting'
    const keys = seated ? 0 : encodeKeys(options.localInput)
    const angle = angleToProtocol(keys === 0 ? options.localTurn() : options.localMoveAngle())
    const height = sceneToProtocol(options.localPosition[1])

    send(encodeClientMotion({
      x: sceneToProtocol(options.localPosition[0]),
      y: sceneToProtocol(options.localPosition[2]),
      height,
      keys,
      angle,
      idleClipIndex: options.localIdleClipIndex(),
      mode: protocolMode,
      style: options.localStyle(),
    }))
    lastKeys = keys
    lastAngle = angle
    lastMode = protocolMode
    lastHeight = height
  }

  function sendVideoState() {
    send(encodeVideoState({ entries: options.videoState() }))
  }

  return {
    players,
    get selfId() {
      return selfId
    },
    get room() {
      return room
    },
    sendRoomChange(nextRoom: number) {
      room = nextRoom
      send(encodeRoomChange(nextRoom))
    },
    sendMessage(text: string) {
      const next = truncateMessage(text)

      if (next) {
        queue(encodeClientMessage(next))
      }

      return next
    },
    sendAdmin(pass: string, command: 'ban', id: number) {
      send(encodeAdminMessage({ pass, command, id }))
    },
    sendMotion,
    sendBeachBalls(balls: BeachBall[]) {
      send(encodeBeachBalls({ balls }))
    },
    sendGraffiti(splats: GraffitiSplat[]) {
      send(encodeGraffiti({ splats }))
    },
    sendMotionIfKeysChanged() {
      const mode = options.localMode()
      const protocolMode = modeToProtocol(mode)
      const keys = mode === 'manSitting' || mode === 'womanSitting' ? 0 : encodeKeys(options.localInput)
      const angle = angleToProtocol(keys === 0 ? options.localTurn() : options.localMoveAngle())
      const height = sceneToProtocol(options.localPosition[1])

      if (keys !== lastKeys || protocolMode !== lastMode || height !== lastHeight || (keys !== 0 && angle !== lastAngle)) {
        sendMotion()
      }
    },
    close() {
      closed = true
      clearInterval(heartbeat)
      clearInterval(videoSync)
      clearTimeout(reconnect)
      socket.close()
    },
  }
}

export function updateRemotePlayers(players: Iterable<Player>, delta: number, outsideTree: CircleBounds) {
  for (const player of players) {
    const moving = lengthSq(player.input) > 0

    player.motionBlend = mix(player.motionBlend, moving ? 1 : 0, 1 - Math.exp(-8 * delta))
    if (player.mode === 'jump') {
      player.modeTime = (player.modeTime ?? 0) + delta
    }
    else if (player.mode !== 'manSitting' && player.mode !== 'womanSitting') {
      player.mode = player.motionBlend > 0.5 ? 'run' : 'stand'
      player.modeTime = undefined
    }

    if (moving) {
      player.position[0] += player.input[0] * delta * 5
      player.position[2] += player.input[2] * delta * 5
      collideRoom(player.position, outsideTree)
    }

    player.position[1] = seatedMode(player.mode)
      ? remoteSeatHeight(player)
      : player.position[1]
  }
}

function createRemotePlayer(packet: SpawnPacket): Player {
  const player: Player = {
    position: [protocolToScene(packet.x), protocolToScene(packet.height), protocolToScene(packet.y)],
    turn: protocolToAngle(packet.angle),
    motionBlend: packet.keys === 0 ? 0 : 1,
    mode: protocolToMode(packet.mode),
    modeTime: protocolToMode(packet.mode) === 'jump' ? 0 : undefined,
    idleClipIndex: packet.idleClipIndex,
    input: decodeKeys(packet.keys, packet.angle),
    nextDecision: 0,
    destination: {
      kind: 'random',
      outside: false,
      position: [0, characterFloor, 0],
    },
    style: packet.style,
    resolvedStyle: resolvePlayerStyle(packet.style),
    seed: packet.id,
  }

  return player
}

function applyRemotePose(player: Player, packet: SpawnPacket) {
  player.position[0] = protocolToScene(packet.x)
  player.position[1] = protocolToScene(packet.height)
  player.position[2] = protocolToScene(packet.y)
  player.turn = protocolToAngle(packet.angle)
  player.input = decodeKeys(packet.keys, packet.angle)
  player.motionBlend = packet.keys === 0 ? 0 : 1
  const mode = protocolToMode(packet.mode)

  player.modeTime = mode === 'jump'
    ? player.mode === 'jump'
      ? player.modeTime
      : 0
    : undefined
  player.mode = mode
  if (seatedMode(player.mode)) {
    player.position[1] = remoteSeatHeight(player)
  }
  player.idleClipIndex = packet.idleClipIndex
  player.style = packet.style
  player.resolvedStyle = resolvePlayerStyle(packet.style)
}

function validRemotePose(packet: SpawnPacket) {
  return !seatedMode(protocolToMode(packet.mode))
    || Boolean(seatAt([protocolToScene(packet.x), characterFloor, protocolToScene(packet.y)], new Set(), 0.46, true))
}

function seatedMode(mode: CharacterMode | undefined) {
  return mode === 'manSitting' || mode === 'womanSitting'
}

function remoteSeatHeight(player: Player) {
  return seatAt(player.position, new Set(), 0.46, true)!.position[1]
}
