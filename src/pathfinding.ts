import { characterFloor } from './character-data.ts'
import { outsideBounds } from './scene-data.ts'
import { isWalkable } from './scene.ts'
import type { CircleBounds, Vec3 } from './types.ts'

type Node = {
  x: number
  z: number
  f: number
  g: number
  key: string
  parent?: Node
}

const step = 0.5
const directions = [
  [-1, 0, 1],
  [1, 0, 1],
  [0, -1, 1],
  [0, 1, 1],
  [-1, -1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [1, 1, Math.SQRT2],
] as const

export function findPath(from: Vec3, to: Vec3, outsideTree: CircleBounds) {
  const start = nearestWalkableCell(from[0], from[2], outsideTree)
  const goal = nearestWalkableCell(to[0], to[2], outsideTree)
  const bounds = searchBounds()
  const open: Node[] = [{
    ...start,
    f: heuristic(start.x, start.z, goal.x, goal.z),
    g: 0,
    key: cellKey(start.x, start.z),
  }]
  const scores = new Map<string, number>([[open[0]!.key, 0]])
  const closed = new Set<string>()

  while (open.length > 0) {
    const current = takeBest(open)

    if (current.g > scores.get(current.key)!) {
      continue
    }

    if (current.x === goal.x && current.z === goal.z) {
      return smoothPath(readPath(current), outsideTree)
    }

    closed.add(current.key)

    for (const [dx, dz, cost] of directions) {
      const x = current.x + dx
      const z = current.z + dz
      const key = cellKey(x, z)

      if (closed.has(key) || !inSearchBounds(x, z, bounds) || !walkableCell(x, z, outsideTree)
        || (dx !== 0 && dz !== 0
          && (!walkableCell(current.x + dx, current.z, outsideTree)
            || !walkableCell(current.x, current.z + dz, outsideTree))))
      {
        continue
      }

      const g = current.g + cost

      if (scores.has(key) && g >= scores.get(key)!) {
        continue
      }

      scores.set(key, g)
      open.push({
        x,
        z,
        f: g + heuristic(x, z, goal.x, goal.z),
        g,
        key,
        parent: current,
      })
    }
  }

  throw new Error(`No path from ${from[0]},${from[2]} to ${to[0]},${to[2]}`)
}

function nearestWalkableCell(x: number, z: number, outsideTree: CircleBounds) {
  const cell = {
    x: toCell(x),
    z: toCell(z),
  }

  if (walkableCell(cell.x, cell.z, outsideTree)) {
    return cell
  }

  for (let radius = 1; radius <= 16; radius++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) {
          continue
        }

        const next = {
          x: cell.x + dx,
          z: cell.z + dz,
        }

        if (walkableCell(next.x, next.z, outsideTree)) {
          return next
        }
      }
    }
  }

  throw new Error(`No walkable cell near ${x},${z}`)
}

function smoothPath(path: Vec3[], outsideTree: CircleBounds) {
  const next: Vec3[] = []
  let index = 0

  while (index < path.length - 1) {
    let target = path.length - 1

    while (target > index + 1 && !clearPath(path[index]!, path[target]!, outsideTree)) {
      target--
    }

    next.push(path[target]!)
    index = target
  }

  return next
}

function clearPath(from: Vec3, to: Vec3, outsideTree: CircleBounds) {
  const dx = to[0] - from[0]
  const dz = to[2] - from[2]
  const count = Math.ceil(Math.hypot(dx, dz) / (step * 0.5))

  for (let i = 1; i <= count; i++) {
    const t = i / count

    if (!isWalkable(from[0] + dx * t, from[2] + dz * t, outsideTree)) {
      return false
    }
  }

  return true
}

function readPath(node: Node) {
  const path: Vec3[] = []
  let current: Node | undefined = node

  while (current) {
    path.unshift([current.x * step, characterFloor, current.z * step])
    current = current.parent
  }

  return path
}

function takeBest(open: Node[]) {
  let best = 0

  for (let i = 1; i < open.length; i++) {
    if (open[i]!.f < open[best]!.f) {
      best = i
    }
  }

  return open.splice(best, 1)[0]!
}

function walkableCell(x: number, z: number, outsideTree: CircleBounds) {
  return x * step >= outsideBounds.left && x * step <= outsideBounds.right
    && z * step >= outsideBounds.back && z * step <= outsideBounds.front
    && isWalkable(x * step, z * step, outsideTree)
}

function toCell(value: number) {
  return Math.round(value / step)
}

function cellKey(x: number, z: number) {
  return `${x}:${z}`
}

function heuristic(x: number, z: number, goalX: number, goalZ: number) {
  return Math.hypot(goalX - x, goalZ - z)
}

function searchBounds() {
  return {
    left: toCell(outsideBounds.left),
    right: toCell(outsideBounds.right),
    back: toCell(outsideBounds.back),
    front: toCell(outsideBounds.front),
  }
}

function inSearchBounds(x: number, z: number, bounds: ReturnType<typeof searchBounds>) {
  return x >= bounds.left && x <= bounds.right && z >= bounds.back && z <= bounds.front
}
