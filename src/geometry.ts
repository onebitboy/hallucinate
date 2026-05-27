import type { Vec3, Vertex } from './types.ts'


export function addBox(
  target: Vertex[],
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  color: Vec3,
  glow: number,
  strobe = 0,
) {
  const left = x - width / 2
  const right = x + width / 2
  const bottom = y - height / 2
  const top = y + height / 2
  const front = z + depth / 2
  const back = z - depth / 2

  addQuad(target, [left, bottom, front], [right, bottom, front], [right, top, front], [left, top, front], color, glow,
    strobe)
  addQuad(target, [right, bottom, back], [left, bottom, back], [left, top, back], [right, top, back], color, glow,
    strobe)
  addQuad(target, [left, bottom, back], [left, bottom, front], [left, top, front], [left, top, back], color, glow,
    strobe)
  addQuad(target, [right, bottom, front], [right, bottom, back], [right, top, back], [right, top, front], color, glow,
    strobe)
  addQuad(target, [left, top, front], [right, top, front], [right, top, back], [left, top, back], color, glow, strobe)
  addQuad(target, [left, bottom, back], [right, bottom, back], [right, bottom, front], [left, bottom, front], color,
    glow, strobe)
}

export function addDisc(
  target: Vertex[],
  center: Vec3,
  radiusX: number,
  radiusY: number,
  axis: 'y' | 'z',
  color: Vec3,
  glow: number,
) {
  const segments = 18

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const b = ((i + 1) / segments) * Math.PI * 2
    const pointA: Vec3 = axis === 'y'
      ? [center[0] + Math.cos(a) * radiusX, center[1], center[2] + Math.sin(a) * radiusY]
      : [center[0] + Math.cos(a) * radiusX, center[1] + Math.sin(a) * radiusY, center[2]]
    const pointB: Vec3 = axis === 'y'
      ? [center[0] + Math.cos(b) * radiusX, center[1], center[2] + Math.sin(b) * radiusY]
      : [center[0] + Math.cos(b) * radiusX, center[1] + Math.sin(b) * radiusY, center[2]]

    target.push(pack(center, color, glow), pack(pointA, color, glow), pack(pointB, color, glow))
  }
}

export function addQuad(
  target: Vertex[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
  color: [number, number, number],
  glow: number,
  strobe = 0,
) {
  target.push(
    [a[0], a[1], a[2], color[0], color[1], color[2], glow, strobe, 0, 0, 0],
    [b[0], b[1], b[2], color[0], color[1], color[2], glow, strobe, 0, 0, 0],
    [c[0], c[1], c[2], color[0], color[1], color[2], glow, strobe, 0, 0, 0],
    [a[0], a[1], a[2], color[0], color[1], color[2], glow, strobe, 0, 0, 0],
    [c[0], c[1], c[2], color[0], color[1], color[2], glow, strobe, 0, 0, 0],
    [d[0], d[1], d[2], color[0], color[1], color[2], glow, strobe, 0, 0, 0],
  )
}

export function addGrassQuad(
  target: Vertex[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
) {
  const color: Vec3 = [0.05, 0.34, 0.08]

  target.push(packGrass(a, color), packGrass(b, color), packGrass(c, color))
  target.push(packGrass(a, color), packGrass(c, color), packGrass(d, color))
}

export function pack(
  point: [number, number, number],
  color: [number, number, number],
  glow: number,
  strobe = 0,
  u = 0,
  v = 0,
  haze = 0,
): Vertex {
  return [point[0], point[1], point[2], color[0], color[1], color[2], glow, strobe, u, v, haze]
}

export function packGrass(point: [number, number, number], color: [number, number, number]): Vertex {
  return pack(point, color, 0, 0, point[0] * 0.08, point[2] * 0.08, 2)
}

export function packSmoke(
  center: [number, number, number],
  x: number,
  y: number,
  opacity: number,
  seed: number,
  u: number,
  v: number,
): Vertex {
  return [center[0], center[1], center[2], x, y, opacity, 0, seed, u, v, 0]
}
