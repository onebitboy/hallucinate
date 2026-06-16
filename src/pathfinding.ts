import { outsideBounds } from './scene-data.ts'
import { isWalkable, isWalkableWithoutDuck } from './scene.ts'
import type { CircleBounds, Vec3 } from './types.ts'

type Node = {
  x: number
  z: number
  f: number
  g: number
  key: number
  parent?: Node
}
type PathOptions = {
  clearance?: number
  duck?: boolean
}
type Walkable = (x: number, z: number, outsideTree: CircleBounds, y: number, options?: { clearance?: number }) => boolean
type WalkableCache = Map<number, boolean>

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

export function findPath(from: Vec3, to: Vec3, outsideTree: CircleBounds, options?: PathOptions) {
  const y = to[1]
  const walkable = options?.duck === false ? isWalkableWithoutDuck : isWalkable
  const walkOptions = { clearance: options?.clearance }
  const walkableCache: WalkableCache = new Map()
  const start = nearestWalkableCell(from[0], from[2], outsideTree, y, walkable, walkOptions, walkableCache)
  const goal = nearestWalkableCell(to[0], to[2], outsideTree, y, walkable, walkOptions, walkableCache)
  const bounds = searchBounds()
  const open: Node[] = [{
    ...start,
    f: heuristic(start.x, start.z, goal.x, goal.z),
    g: 0,
    key: cellNumberKey(start.x, start.z),
  }]
  const scores = new Map<number, number>([[open[0]!.key, 0]])
  const closed = new Set<number>()

  while (open.length > 0) {
    const current = takeBest(open)

    if (current.g > scores.get(current.key)!) {
      continue
    }

    if (current.x === goal.x && current.z === goal.z) {
      return smoothPath(readPath(current, y), outsideTree, y, walkable, walkOptions, walkableCache)
    }

    closed.add(current.key)

    for (const [dx, dz, cost] of directions) {
      const x = current.x + dx
      const z = current.z + dz
      const key = cellNumberKey(x, z)

      if (closed.has(key) || !inSearchBounds(x, z, bounds)
        || !walkableCell(x, z, outsideTree, y, walkable, walkOptions, walkableCache)
        || (dx !== 0 && dz !== 0
          && (!walkableCell(current.x + dx, current.z, outsideTree, y, walkable, walkOptions, walkableCache)
            || !walkableCell(current.x, current.z + dz, outsideTree, y, walkable, walkOptions, walkableCache))))
      {
        continue
      }

      const g = current.g + cost

      if (scores.has(key) && g >= scores.get(key)!) {
        continue
      }

      scores.set(key, g)
      pushOpen(open, {
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

function nearestWalkableCell(
  x: number,
  z: number,
  outsideTree: CircleBounds,
  y: number,
  walkable: Walkable,
  options: { clearance?: number },
  walkableCache: WalkableCache,
) {
  const cell = {
    x: toCell(x),
    z: toCell(z),
  }

  if (walkableCell(cell.x, cell.z, outsideTree, y, walkable, options, walkableCache)) {
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

        if (walkableCell(next.x, next.z, outsideTree, y, walkable, options, walkableCache)) {
          return next
        }
      }
    }
  }

  throw new Error(`No walkable cell near ${x},${z}`)
}

function smoothPath(
  path: Vec3[],
  outsideTree: CircleBounds,
  y: number,
  walkable: Walkable,
  options: { clearance?: number },
  walkableCache: WalkableCache,
) {
  const next: Vec3[] = []
  let index = 0

  while (index < path.length - 1) {
    let target = path.length - 1

    while (target > index + 1
      && !clearPath(path[index]!, path[target]!, outsideTree, y, walkable, options))
    {
      target--
    }

    next.push(path[target]!)
    index = target
  }

  return next
}

function clearPath(
  from: Vec3,
  to: Vec3,
  outsideTree: CircleBounds,
  y: number,
  walkable: Walkable,
  options: { clearance?: number },
) {
  const dx = to[0] - from[0]
  const dz = to[2] - from[2]
  const count = Math.ceil(Math.hypot(dx, dz) / (step * 0.5))

  for (let i = 1; i <= count; i++) {
    const t = i / count

    if (!walkable(from[0] + dx * t, from[2] + dz * t, outsideTree, y, options)) {
      return false
    }
  }

  return true
}

function readPath(node: Node, y: number) {
  const path: Vec3[] = []
  let current: Node | undefined = node

  while (current) {
    path.unshift([current.x * step, y, current.z * step])
    current = current.parent
  }

  return path
}

function takeBest(open: Node[]) {
  const best = open[0]!
  const last = open.pop()!

  if (open.length === 0) {
    return best
  }

  open[0] = last
  let index = 0

  while (true) {
    const left = index * 2 + 1
    const right = left + 1
    let smallest = index

    if (left < open.length && open[left]!.f < open[smallest]!.f) {
      smallest = left
    }
    if (right < open.length && open[right]!.f < open[smallest]!.f) {
      smallest = right
    }
    if (smallest === index) {
      return best
    }

    const node = open[index]!

    open[index] = open[smallest]!
    open[smallest] = node
    index = smallest
  }
}

function pushOpen(open: Node[], node: Node) {
  open.push(node)
  let index = open.length - 1

  while (index > 0) {
    const parent = (index - 1) >> 1

    if (open[parent]!.f <= node.f) {
      return
    }

    open[index] = open[parent]!
    open[parent] = node
    index = parent
  }
}

function walkableCell(
  x: number,
  z: number,
  outsideTree: CircleBounds,
  y: number,
  walkable: Walkable,
  options: { clearance?: number },
  walkableCache: WalkableCache,
) {
  return x * step >= outsideBounds.left && x * step <= outsideBounds.right
    && z * step >= outsideBounds.back && z * step <= outsideBounds.front
    && walkablePoint(x * step, z * step, outsideTree, y, walkable, options, walkableCache)
}

function walkablePoint(
  x: number,
  z: number,
  outsideTree: CircleBounds,
  y: number,
  walkable: Walkable,
  options: { clearance?: number },
  cache: WalkableCache,
) {
  const key = cellNumberKey(toCell(x), toCell(z))
  const cached = cache.get(key)

  if (cached !== undefined) {
    return cached
  }

  const value = walkable(x, z, outsideTree, y, options)

  cache.set(key, value)

  return value
}

function toCell(value: number) {
  return Math.round(value / step)
}

function cellNumberKey(x: number, z: number) {
  return (x + 32768) * 65536 + z + 32768
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
