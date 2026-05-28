import { characterFloor } from './character-data.ts'
import { resolvePlayerStyle } from './character-style.ts'
import { lengthSq, mix } from './math.ts'
import {
  angleToProtocol,
  decodeKeys,
  decodeLeave,
  decodeRoomState,
  decodeServerMessage,
  decodeServerMotion,
  decodeSpawn,
  encodeClientMessage,
  encodeClientMotion,
  encodeKeys,
  encodeRoomChange,
  MESSAGE,
  modeToProtocol,
  protocolToAngle,
  protocolToMode,
  protocolToScene,
  S_LEAVE,
  S_MOTION,
  S_ROOM_STATE,
  S_SPAWN,
  sceneToProtocol,
  type SpawnPacket,
  truncateMessage,
} from './protocol.ts'
import { collideRoom, seatAt, walkHeight } from './scene.ts'
import type { CharacterMode, CircleBounds, Player, Vec3 } from './types.ts'

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
  }
  initialRoom: number
  onRoomState: (room: number) => void
  onMessage: (id: number, text: string) => void
  onLeave: (id: number) => void
}) {
  const players = new Map<number, Player>()
  let url: string
  if (location.protocol === 'https:') {
    url = location.origin.replace(/^http/, 'ws')
  }
  else {
    url = `ws://${location.hostname}:3001`
  }
  const socket = new WebSocket(url)
  let selfId = 0
  let room = options.initialRoom
  let lastKeys = -1
  let lastAngle = -1
  let lastMode = -1

  socket.binaryType = 'arraybuffer'
  socket.addEventListener('open', () => {
    sendMotion()
    send(encodeRoomChange(room))
  })
  socket.addEventListener('message', event => {
    const view = new DataView(event.data as ArrayBuffer)
    const type = view.getUint8(0)

    if (type === S_ROOM_STATE) {
      const state = decodeRoomState(view)

      selfId = state.selfId
      room = state.room
      players.clear()

      for (const player of state.players) {
        if (player.id !== selfId) {
          players.set(player.id, createRemotePlayer(player))
        }
      }

      options.onRoomState(room)
      return
    }

    if (type === S_SPAWN) {
      const packet = decodeSpawn(view)

      if (packet.id !== selfId) {
        players.set(packet.id, createRemotePlayer(packet))
      }

      return
    }

    if (type === S_MOTION) {
      const packet = decodeServerMotion(view)
      const player = players.get(packet.id)

      if (player) {
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

    if (type === MESSAGE) {
      const message = decodeServerMessage(view)

      if (message.id === selfId || players.has(message.id)) {
        options.onMessage(message.id, message.text)
      }
    }
  })

  function send(data: ArrayBuffer) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(data)
    }
  }

  function sendMotion() {
    const mode = options.localMode()
    const protocolMode = modeToProtocol(mode)
    const seated = mode === 'manSitting' || mode === 'womanSitting'
    const keys = seated ? 0 : encodeKeys(options.localInput)
    const angle = angleToProtocol(keys === 0 ? options.localTurn() : options.localMoveAngle())

    send(encodeClientMotion({
      x: sceneToProtocol(options.localPosition[0]),
      y: sceneToProtocol(options.localPosition[2]),
      keys,
      angle,
      idleClipIndex: options.localIdleClipIndex(),
      mode: protocolMode,
      style: options.localStyle(),
    }))
    lastKeys = keys
    lastAngle = angle
    lastMode = protocolMode
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
        send(encodeClientMessage(next))
      }
    },
    sendMotion,
    sendMotionIfKeysChanged() {
      const mode = options.localMode()
      const protocolMode = modeToProtocol(mode)
      const keys = mode === 'manSitting' || mode === 'womanSitting' ? 0 : encodeKeys(options.localInput)
      const angle = angleToProtocol(keys === 0 ? options.localTurn() : options.localMoveAngle())

      if (keys !== lastKeys || protocolMode !== lastMode || (keys !== 0 && angle !== lastAngle)) {
        sendMotion()
      }
    },
    close() {
      socket.close()
    },
  }
}

export function updateRemotePlayers(players: Iterable<Player>, delta: number, outsideTree: CircleBounds) {
  for (const player of players) {
    const moving = lengthSq(player.input) > 0

    player.motionBlend = mix(player.motionBlend, moving ? 1 : 0, 1 - Math.exp(-8 * delta))
    if (player.mode !== 'manSitting' && player.mode !== 'womanSitting') {
      player.mode = player.motionBlend > 0.5 ? 'run' : 'stand'
    }

    if (moving) {
      player.position[0] += player.input[0] * delta * 5
      player.position[2] += player.input[2] * delta * 5
      collideRoom(player.position, outsideTree)
    }

    player.position[1] = seatedMode(player.mode)
      ? remoteSeatHeight(player)
      : walkHeight(player.position[0], player.position[1], player.position[2])
  }
}

function createRemotePlayer(packet: SpawnPacket): Player {
  const player: Player = {
    position: [protocolToScene(packet.x), characterFloor, protocolToScene(packet.y)],
    turn: protocolToAngle(packet.angle),
    motionBlend: packet.keys === 0 ? 0 : 1,
    mode: protocolToMode(packet.mode),
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
  player.position[2] = protocolToScene(packet.y)
  player.turn = protocolToAngle(packet.angle)
  player.input = decodeKeys(packet.keys, packet.angle)
  player.motionBlend = packet.keys === 0 ? 0 : 1
  player.mode = protocolToMode(packet.mode)
  player.position[1] = seatedMode(player.mode)
    ? remoteSeatHeight(player)
    : walkHeight(player.position[0], player.position[1], player.position[2])
  player.idleClipIndex = packet.idleClipIndex
  player.style = packet.style
  player.resolvedStyle = resolvePlayerStyle(packet.style)
}

function seatedMode(mode: CharacterMode | undefined) {
  return mode === 'manSitting' || mode === 'womanSitting'
}

function remoteSeatHeight(player: Player) {
  return seatAt(player.position, new Set(), 0.46, true)!.position[1]
}
