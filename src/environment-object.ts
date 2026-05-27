import { characterFloor } from './character-data.ts'
import { electricNavy, outsideMotif } from './constants.ts'
import { addBox, addDisc, addGrassQuad, addQuad, addTriangle, pack, packSmoke } from './geometry.ts'
import { add, mix, scale, subtract } from './math.ts'
import { backDoor, bartenderBar, bartenderStools, djBooth, djSpeakers, landscapeBounds, outsideBounds, outsideDjBooth,
  outsideCouches, outsideDjSpeakers, outsideHut, outsideHutBar, outsideHutBarStools, outsideHutDeckHeight,
  outsideVideoWall, roomBounds } from './scene-data.ts'
import { strobeTarget } from './strobe-object.ts'
import type { Bounds, StrobeLight, Vec3, Vertex, VideoZone } from './types.ts'

export function addRoom(target: Vertex[]) {
  const dark: [number, number, number] = [0.032, 0.032, 0.038]
  const wall: [number, number, number] = [0.025, 0.023, 0.028]
  const ceiling: [number, number, number] = [0.016, 0.016, 0.02]
  const doorLeft = backDoor.x - backDoor.width / 2
  const doorRight = backDoor.x + backDoor.width / 2

  addQuad(target, [-7, -2, 4], [7, -2, 4], [7, -2, -24], [-7, -2, -24], dark, 0)
  addQuad(target, [-7, 5, -24], [7, 5, -24], [7, 5, 4], [-7, 5, 4], ceiling, 0)
  addQuad(target, [-7, -2, -24], [-7, 5, -24], [-7, 5, 4], [-7, -2, 4], wall, 0)
  addQuad(target, [7, -2, 4], [7, 5, 4], [7, 5, -24], [7, -2, -24], wall, 0)
  addQuad(target, [-7, -2, -24], [7, -2, -24], [7, 5, -24], [-7, 5, -24], [0.028, 0.022, 0.028], 0)
  addOutside(target)
  addQuad(target, [doorLeft, -2, 4], [-7, -2, 4], [-7, 5, 4], [doorLeft, 5, 4], [0.028, 0.022, 0.028], 0)
  addQuad(target, [7, -2, 4], [doorRight, -2, 4], [doorRight, 5, 4], [7, 5, 4], [0.028, 0.022, 0.028], 0)
  addQuad(target, [doorRight, backDoor.height - 2, 4], [doorLeft, backDoor.height - 2, 4], [doorLeft, 5, 4], [doorRight,
    5, 4], [0.028, 0.022, 0.028], 0)
  addBox(target, doorLeft - 0.05, -2 + backDoor.height / 2, 4.035, 0.1, backDoor.height, 0.08, [0.025, 0.035, 0.023],
    0.04)
  addBox(target, doorRight + 0.05, -2 + backDoor.height / 2, 4.035, 0.1, backDoor.height, 0.08, [0.025, 0.035, 0.023],
    0.04)
  addBox(target, backDoor.x, -2 + backDoor.height + 0.05, 4.035, backDoor.width + 0.2, 0.1, 0.08, [0.025, 0.035, 0.023],
    0.04)
  addQuad(target, [doorRight, -2, 4], [doorLeft, -2, 4], [doorLeft, -2 + backDoor.height, 4], [doorRight,
    -2 + backDoor.height, 4], [0.001, 0.001, 0.001], 0, 9001)
  addOutsideVideoBackdrop(target)
  addDoorPerimeterStripes(target)
  addBartenderBar(target)
  addDjBooth(target)
}

function addOutsideVideoBackdrop(target: Vertex[]) {
  const wall = outsideVideoWall
  const left = wall.x - wall.width / 2
  const right = wall.x + wall.width / 2
  const bottom = wall.y - wall.height / 2
  const top = wall.y + wall.height / 2
  const color: Vec3 = [0.001, 0.001, 0.001]
  const z = wall.z - 0.5

  addQuad(target, [right, bottom, z], [left, bottom, z], [left, top, z], [right, top, z], color, 0)
}

function addDoorPerimeterStripes(target: Vertex[]) {
  const left = backDoor.x - backDoor.width / 2 - 0.14
  const right = backDoor.x + backDoor.width / 2 + 0.14
  const bottom = -1.82
  const top = -2 + backDoor.height + 0.18
  const width = right - left
  const height = top - bottom
  const glow = 3.2

  addDoorPerimeterFrame(target, roomBounds.front - 0.08, left, right, bottom, top, width, height, electricNavy, glow)
  addDoorPerimeterFrame(target, roomBounds.front + 0.08, left, right, bottom, top, width, height, [0.95, 0.02, 0.015],
    glow)
}

function addDoorPerimeterFrame(
  target: Vertex[],
  z: number,
  left: number,
  right: number,
  bottom: number,
  top: number,
  width: number,
  height: number,
  color: Vec3,
  glow: number,
) {
  addBox(target, left, bottom + height / 2, z, 0.11, height, 0.06, color, glow)
  addBox(target, right, bottom + height / 2, z, 0.11, height, 0.06, color, glow)
  addBox(target, left + width / 2, top, z, width + 0.11, 0.11, 0.06, color, glow)
}

function addBartenderBar(target: Vertex[]) {
  const body: Vec3 = [0.026, 0.016, 0.018]
  const top: Vec3 = [0.006, 0.006, 0.008]
  const metal: Vec3 = [0.055, 0.052, 0.052]
  const seat: Vec3 = [0.014, 0.012, 0.013]
  const bottle: Vec3 = [0.16, 0.028, 0.018]
  const y = -2

  addBox(target, bartenderBar.x, y + 0.38, bartenderBar.z, bartenderBar.width, 0.76, bartenderBar.depth, body, 0)
  addBox(target, bartenderBar.x, y + 0.8, bartenderBar.z - 0.03, bartenderBar.width + 0.24, 0.12,
    bartenderBar.depth + 0.32, top, 0)
  for (const shelfY of [0.98, 1.58]) {
    addBox(target, bartenderBar.x, y + shelfY, roomBounds.front - 0.18, bartenderBar.width + 0.12, 0.08, 0.16, top, 0)

    for (let i = 0; i < 8; i++) {
      const x = bartenderBar.x - 1.38 + i * 0.39
      const height = 0.27 + (i % 3) * 0.07
      addBox(target, x, y + shelfY + 0.06 + height / 2, roomBounds.front - 0.28, 0.1, height, 0.1, bottle, 0.18)
    }
  }

  for (const stool of bartenderStools) {
    addBox(target, stool.x, y + 0.27, stool.z, 0.06, 0.54, 0.06, metal, 0)
    addDisc(target, [stool.x, y + 0.56, stool.z], 0.2, 0.2, 'y', seat, 0)
    addDisc(target, [stool.x, y + 0.04, stool.z], 0.15, 0.15, 'y', metal, 0)
  }
}

function addOutside(target: Vertex[]) {
  const floor = -1.95

  addGrassQuad(target, [landscapeBounds.left, floor, landscapeBounds.front], [landscapeBounds.right, floor,
    landscapeBounds.front], [landscapeBounds.right, floor, roomBounds.front], [landscapeBounds.left, floor,
    roomBounds.front])
  addGrassQuad(target, [roomBounds.left, floor, roomBounds.front], [landscapeBounds.left, floor, roomBounds.front], [
    landscapeBounds.left,
    floor,
    roomBounds.back,
  ], [roomBounds.left, floor, roomBounds.back])
  addGrassQuad(target, [landscapeBounds.right, floor, roomBounds.front], [roomBounds.right, floor, roomBounds.front], [
    roomBounds.right,
    floor,
    roomBounds.back,
  ], [landscapeBounds.right, floor, roomBounds.back])
  addGrassQuad(target, [landscapeBounds.left, floor, roomBounds.back], [landscapeBounds.right, floor, roomBounds.back],
    [landscapeBounds.right, floor, landscapeBounds.back], [landscapeBounds.left, floor, landscapeBounds.back])
  addOpenAirHut(target, floor)
  addOutsideLounges(target, floor)
  addOutsideStage(target, floor)
  addDjBoothAt(target, outsideDjBooth, outsideDjSpeakers, -1, electricNavy, 3.2)
  addOutsideSkyLight(target)
}

function addOutsideLounges(target: Vertex[], floor: number) {
  for (const couch of outsideCouches) {
    addLowPolyCouch(target, couch, floor)
  }

  addBonfireBase(target, floor)
}

function addLowPolyCouch(
  target: Vertex[],
  couch: Bounds & { color: Vec3; face: 'east' | 'north' | 'south' | 'west' },
  floor: number,
) {
  const cushion = couch.color
  const shadow: Vec3 = [cushion[0] * 0.45, cushion[1] * 0.45, cushion[2] * 0.45]
  const trim: Vec3 = [0.035, 0.027, 0.024]
  const alongX = couch.width > couch.depth
  const width = couch.width
  const depth = couch.depth

  addBox(target, couch.x, floor + 0.19, couch.z, width, 0.24, depth, shadow, 0)
  addBox(target, couch.x, floor + 0.36, couch.z, width * 0.92, 0.2, depth * 0.82, cushion, 0)

  if (alongX) {
    const backZ = couch.z + (couch.face === 'north' ? -depth * 0.38 : depth * 0.38)

    addBox(target, couch.x, floor + 0.68, backZ, width, 0.64, 0.16, cushion, 0)
    addBox(target, couch.x - width * 0.45, floor + 0.48, couch.z, 0.18, 0.42, depth, shadow, 0)
    addBox(target, couch.x + width * 0.45, floor + 0.48, couch.z, 0.18, 0.42, depth, shadow, 0)
  }
  else {
    const backX = couch.x + (couch.face === 'east' ? -width * 0.38 : width * 0.38)

    addBox(target, backX, floor + 0.68, couch.z, 0.16, 0.64, depth, cushion, 0)
    addBox(target, couch.x, floor + 0.48, couch.z - depth * 0.45, width, 0.42, 0.18, shadow, 0)
    addBox(target, couch.x, floor + 0.48, couch.z + depth * 0.45, width, 0.42, 0.18, shadow, 0)
  }

  addBox(target, couch.x, floor + 0.08, couch.z, width * 0.72, 0.08, depth * 0.72, trim, 0)
}

function outsideBonfireCenter(): Vec3 {
  const couches = outsideCouches.slice(1, 3)
  const couchX = couches.reduce((total, couch) => total + couch.x, 0) / couches.length
  const x = couchX - 2.85
  const z = couches.reduce((total, couch) => total + couch.z, 0) / couches.length

  return [x, characterFloor + 0.02, z]
}

function addBonfireBase(target: Vertex[], floor: number) {
  const center = outsideBonfireCenter()

  addDisc(target, [center[0], floor + 0.03, center[2]], 0.72, 0.72, 'y', [0.32, 0.32, 0.34], 0)
}

function addBonfireFlame(target: Vertex[]) {
  const center = outsideBonfireCenter()
  const color: Vec3 = [1, 0.78, 0.05]
  const apex: Vec3 = [center[0], center[1] + 1.15, center[2]]
  const segments = 7
  const strobe = 777

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const b = ((i + 1) / segments) * Math.PI * 2
    const pointA: Vec3 = [center[0] + Math.cos(a) * 0.34, center[1], center[2] + Math.sin(a) * 0.34]
    const pointB: Vec3 = [center[0] + Math.cos(b) * 0.34, center[1], center[2] + Math.sin(b) * 0.34]

    target.push(
      pack(pointA, color, 3.4, strobe, 0, 0),
      pack(pointB, color, 3.4, strobe, 1, 0),
      pack(apex, color, 3.4, strobe, 0.5, 1),
    )
  }
}

function addOpenAirHut(target: Vertex[], floor: number) {
  const wood: Vec3 = [0.24, 0.13, 0.055]
  const darkWood: Vec3 = [0.11, 0.06, 0.032]
  const roof: Vec3 = [0.18, 0.052, 0.034]
  const trim: Vec3 = [0.032, 0.021, 0.014]
  const left = outsideHut.x - outsideHut.width / 2
  const right = outsideHut.x + outsideHut.width / 2
  const back = outsideHut.z - outsideHut.depth / 2
  const front = outsideHut.z + outsideHut.depth / 2
  const eave = 0.48
  const base = floor + outsideHutDeckHeight / 2
  const deckTop = floor + outsideHutDeckHeight
  const postTop = deckTop + 2.45
  const ridge = deckTop + 3.8
  const roofBottom = postTop + 0.08
  const ridgeZ = outsideHut.z

  addBox(target, outsideHut.x, base, outsideHut.z, outsideHut.width + 0.35, outsideHutDeckHeight, outsideHut.depth
    + 0.35, darkWood, 0)

  for (const x of [left + 0.18, right - 0.18]) {
    for (const z of [back + 0.18, front - 0.18]) {
      addBox(target, x, deckTop + 1.22, z, 0.22, 2.44, 0.22, wood, 0)
    }
  }

  addBox(target, outsideHut.x, postTop, back + 0.16, outsideHut.width, 0.16, 0.14, trim, 0)
  addBox(target, outsideHut.x, postTop, front - 0.16, outsideHut.width, 0.16, 0.14, trim, 0)
  addBox(target, left + 0.16, postTop, outsideHut.z, 0.14, 0.16, outsideHut.depth, trim, 0)

  addQuad(target, [left - eave, roofBottom, back - eave], [right + eave, roofBottom, back - eave], [right + eave,
    ridge, ridgeZ], [left - eave, ridge, ridgeZ], roof, 0)
  addQuad(target, [right + eave, roofBottom, front + eave], [left - eave, roofBottom, front + eave], [left - eave,
    ridge, ridgeZ], [right + eave, ridge, ridgeZ], roof, 0)
  addTriangle(target, [left - eave, roofBottom, front + eave], [left - eave, roofBottom, back - eave], [left - eave,
    ridge, ridgeZ], roof, 0)
  addBox(target, outsideHut.x, ridge, ridgeZ, outsideHut.width + eave * 2.1, 0.12, 0.12, trim, 0)
  addOpenAirHutBar(target, deckTop)
}

function addOpenAirHutBar(target: Vertex[], floor: number) {
  const body: Vec3 = [0.22, 0.12, 0.052]
  const top: Vec3 = [0.09, 0.045, 0.022]
  const shelf: Vec3 = [0.12, 0.065, 0.032]
  const bottle: Vec3 = [0.02, 0.18, 0.72]
  const seat: Vec3 = [0.16, 0.08, 0.035]
  const leg: Vec3 = [0.07, 0.04, 0.025]
  const glow = 0.35
  const shelfX = outsideHut.x - outsideHut.width / 2 + 0.18
  const shelfDepth = outsideHut.depth - 0.36

  addBox(target, outsideHutBar.x, floor + 0.38, outsideHutBar.z, outsideHutBar.width, 0.76, outsideHutBar.depth, body,
    0)
  addBox(target, outsideHutBar.x + 0.03, floor + 0.8, outsideHutBar.z, outsideHutBar.width + 0.32, 0.12,
    outsideHutBar.depth + 0.24, top, 0)

  for (const shelfY of [0.98, 1.58]) {
    addBox(target, shelfX, floor + shelfY, outsideHutBar.z, 0.16, 0.08, shelfDepth, shelf, 0)

    for (let i = 0; i < 9; i++) {
      const z = outsideHutBar.z - shelfDepth * 0.4 + i * shelfDepth * 0.1
      const height = 0.28 + (i % 3) * 0.07

      addBox(target, shelfX + 0.08, floor + shelfY + 0.06 + height / 2, z, 0.1, height, 0.1, bottle, glow)
    }
  }

  for (const stool of outsideHutBarStools) {
    addBox(target, stool.x, floor + 0.28, stool.z, 0.07, 0.56, 0.07, leg, 0)
    addDisc(target, [stool.x, floor + 0.58, stool.z], 0.2, 0.2, 'y', seat, 0)
    addDisc(target, [stool.x, floor + 0.05, stool.z], 0.15, 0.15, 'y', leg, 0)
  }
}

function addOutsideStage(target: Vertex[], floor: number) {
  const dark: Vec3 = [0.005, 0.008, 0.02]
  const z = outsideDjBooth.z + 2.15
  const width = 7.4
  const left = outsideDjBooth.x - width / 2
  const right = outsideDjBooth.x + width / 2
  const base = floor + 0.1
  const top = floor + 4.1
  const centerY = (base + top) / 2

  addBox(target, outsideDjBooth.x, floor + 0.04, z + 0.12, width + 1.2, 0.08, 1.55, dark, 0)
  addBox(target, left, centerY, z, 0.13, top - base, 0.13, electricNavy, 3.2)
  addBox(target, right, centerY, z, 0.13, top - base, 0.13, electricNavy, 3.2)
  addBox(target, outsideDjBooth.x, top, z, width, 0.13, 0.13, electricNavy, 3.2)
  addStageBeam(target, [left, base, z], [right, top, z], electricNavy)
  addStageBeam(target, [right, base, z], [left, top, z], electricNavy)
}

function addStageBeam(target: Vertex[], a: Vec3, b: Vec3, color: Vec3) {
  const center = scale(add(a, b), 0.5)
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0])
  const side: Vec3 = [-Math.sin(angle) * 0.06, Math.cos(angle) * 0.06, 0]

  addQuad(target, add(a, side), subtract(a, side), subtract(b, side), add(b, side), color, 2.4)
  addBox(target, center[0], center[1], center[2], length, 0.035, 0.035, color, 1.2)
}

function addOutsideSkyLight(target: Vertex[]) {
  const z = outsideBounds.front - 0.12

  if (outsideMotif === 'night') {
    return
  }

  addDisc(target, [10.5, 6.8, z], 1.0, 1.0, 'z', [1, 0.78, 0.22], 1.9)
}

function addDjBooth(target: Vertex[]) {
  addDjBoothAt(target, djBooth, djSpeakers, 1, [1, 0.03, 0.015], 0.45)
}

function addDjBoothAt(target: Vertex[], booth: Bounds, speakers: Bounds[], direction: number, accent: Vec3,
  accentGlow: number)
{
  const body: Vec3 = [0.026, 0.018, 0.021]
  const top: Vec3 = [0.006, 0.006, 0.008]
  const dark: Vec3 = [0.012, 0.011, 0.014]
  const cone: Vec3 = [0.05, 0.047, 0.043]
  const y = -2
  const scale = 0.75

  addBox(target, booth.x, y + 0.33, booth.z, booth.width, 0.66, booth.depth, body, 0)
  addBox(target, booth.x, y + 0.7, booth.z + direction * 0.045, booth.width + 0.38 * scale, 0.12,
    booth.depth + 0.28 * scale, top, 0)
  addBox(target, booth.x - 0.82 * scale, y + 0.81, booth.z + direction * 0.21, 0.645 * scale, 0.039, 0.465 * scale,
    dark, 0)
  addBox(target, booth.x + 0.82 * scale, y + 0.81, booth.z + direction * 0.21, 0.645 * scale, 0.039, 0.465 * scale,
    dark, 0)
  addDisc(target, [booth.x - 0.82 * scale, y + 0.84, booth.z + direction * 0.21], 0.27 * scale, 0.21 * scale, 'y',
    accent, accentGlow)
  addDisc(target, [booth.x + 0.82 * scale, y + 0.84, booth.z + direction * 0.21], 0.27 * scale, 0.21 * scale, 'y',
    accent, accentGlow)
  addBox(target, booth.x, y + 0.835, booth.z + direction * 0.24, 0.56 * scale, 0.045, 0.68 * scale, [0.035, 0.034,
    0.036], 0)

  for (const speaker of speakers) {
    addSpeakerStack(target, speaker, body, dark, cone, direction)
  }
}

function addSpeakerStack(target: Vertex[], bounds: Bounds, body: Vec3, dark: Vec3, cone: Vec3, direction: number) {
  const y = -2
  const front = bounds.z + direction * (bounds.depth / 2 + 0.012)

  addBox(target, bounds.x, y + 0.72, bounds.z, bounds.width, 1.44, bounds.depth, body, 0)
  addBox(target, bounds.x, y + 1.6, bounds.z, bounds.width * 0.82, 0.54, bounds.depth * 0.82, dark, 0)
  addDisc(target, [bounds.x, y + 0.9, front], 0.24, 0.24, 'z', cone, 0)
  addDisc(target, [bounds.x, y + 0.39, front], 0.165, 0.165, 'z', cone, 0)
  addDisc(target, [bounds.x, y + 1.6, front], 0.15, 0.15, 'z', cone, 0)
}

export function addWallStrips(target: Vertex[]) {
  let id = 101

  for (const z of [-2, -6, -10, -14, -18, -22]) {
    addSideStrip(target, -6.98, z, id++)
    addSideStrip(target, 6.98, z, id++)
  }

  for (const x of [-4.5, 0, 4.5]) {
    if (x !== 0) {
      addEndStrip(target, x, -23.98, id++)
    }

    if (x !== -4.5) {
      addEndStrip(target, x, 3.98, id++)
    }
  }

  addDjBoothStrip(target, djBooth, 1, [1, 0.03, 0.015], 2.15)
  addDjBoothStrip(target, outsideDjBooth, -1, electricNavy, 3.2)
  addBartenderBarStrip(target)
  addOutsideHutBarStrip(target)
  addOutsideHutRoofStrips(target)
  addBonfireFlame(target)
  addBartenderBottleGlow(target)
}

function addSideStrip(target: Vertex[], x: number, z: number, id: number) {
  addQuad(
    target,
    [x, -1.25, z - 0.24],
    [x, 3.75, z - 0.24],
    [x, 3.75, z - 0.09],
    [x, -1.25, z - 0.09],
    [0.22, 0.006, 0.004],
    0.08,
    id,
  )

  addQuad(
    target,
    [x, -1.25, z - 0.09],
    [x, 3.75, z - 0.09],
    [x, 3.75, z + 0.09],
    [x, -1.25, z + 0.09],
    [1, 0.03, 0.015],
    2.15,
    id,
  )

  addQuad(
    target,
    [x, -1.25, z + 0.09],
    [x, 3.75, z + 0.09],
    [x, 3.75, z + 0.24],
    [x, -1.25, z + 0.24],
    [0.22, 0.006, 0.004],
    0.08,
    id,
  )
}

function addEndStrip(target: Vertex[], x: number, z: number, id: number) {
  addQuad(
    target,
    [x - 0.24, -1.25, z],
    [x - 0.09, -1.25, z],
    [x - 0.09, 3.75, z],
    [x - 0.24, 3.75, z],
    [0.22, 0.006, 0.004],
    0.08,
    id,
  )

  addQuad(
    target,
    [x - 0.09, -1.25, z],
    [x + 0.09, -1.25, z],
    [x + 0.09, 3.75, z],
    [x - 0.09, 3.75, z],
    [1, 0.03, 0.015],
    2.15,
    id,
  )

  addQuad(
    target,
    [x + 0.09, -1.25, z],
    [x + 0.24, -1.25, z],
    [x + 0.24, 3.75, z],
    [x + 0.09, 3.75, z],
    [0.22, 0.006, 0.004],
    0.08,
    id,
  )
}

function addDjBoothStrip(target: Vertex[], booth: Bounds, direction: number, color: Vec3, glow: number) {
  const y = -1.54
  const z = booth.z + direction * 0.91
  const width = booth.width - 0.45
  const height = 0.07

  addBox(target, booth.x, y, z, width, height, 0.06, color, glow)
}

function addBartenderBarStrip(target: Vertex[]) {
  addBox(target, bartenderBar.x, -1.54, bartenderBar.z - bartenderBar.depth / 2 - 0.16, bartenderBar.width - 0.45, 0.07,
    0.06, [1, 0.03, 0.015], 2.15)
}

function addOutsideHutBarStrip(target: Vertex[]) {
  const x = outsideHutBar.x + outsideHutBar.width / 2 + 0.16
  const y = characterFloor + outsideHutDeckHeight + 0.46

  addBox(target, x, y, outsideHutBar.z, 0.06, 0.07, outsideHutBar.depth - 0.45, electricNavy, 3.2)
}

function addOutsideHutRoofStrips(target: Vertex[]) {
  const x = outsideHut.x + outsideHut.width / 2 + 0.5
  const back = outsideHut.z - outsideHut.depth / 2 - 0.48
  const front = outsideHut.z + outsideHut.depth / 2 + 0.48
  const deckTop = characterFloor + outsideHutDeckHeight
  const roofBottom = deckTop + 2.53
  const ridge = deckTop + 3.8
  const apex: Vec3 = [x, ridge, outsideHut.z]

  addWallBeam(target, [x, roofBottom, back], apex, electricNavy)
  addWallBeam(target, [x, roofBottom, front], apex, electricNavy)
}

function addWallBeam(target: Vertex[], a: Vec3, b: Vec3, color: Vec3) {
  const angle = Math.atan2(b[1] - a[1], b[2] - a[2])
  const side: Vec3 = [0, Math.cos(angle) * 0.06, -Math.sin(angle) * 0.06]

  addQuad(target, add(a, side), subtract(a, side), subtract(b, side), add(b, side), color, 2.4)
}

function addBartenderBottleGlow(target: Vertex[]) {
  const y = -2

  for (const shelfY of [0.98, 1.58]) {
    for (let i = 0; i < 8; i++) {
      const x = bartenderBar.x - 1.38 + i * 0.39
      const height = 0.27 + (i % 3) * 0.07

      addBox(target, x, y + shelfY + 0.06 + height / 2, roomBounds.front - 0.3, 0.1, height, 0.08, [1, 0.03, 0.015],
        0.72)
    }
  }
}

export function addRoomSmoke(target: Vertex[]) {
  for (let i = 0; i < 82; i++) {
    const seed = i + 1
    const x = mix(-5.4, 5.4, smokeRandom(seed * 11.7))
    const y = mix(-1.35, 1.4, smokeRandom(seed * 19.1) ** 1.8)
    const z = mix(-22.5, 1.8, smokeRandom(seed * 31.3))
    const width = mix(1.8, 5.1, smokeRandom(seed * 47.9))
    const height = mix(0.8, 2.35, smokeRandom(seed * 61.5))
    const opacity = mix(0.045, 0.12, smokeRandom(seed * 73.3))

    addSmokePatch(target, [x, y, z], width, height, opacity, seed)
  }
}

function addSmokePatch(
  target: Vertex[],
  center: [number, number, number],
  width: number,
  height: number,
  opacity: number,
  seed: number,
) {
  const left = -width / 2
  const right = width / 2
  const bottom = -height / 2
  const top = height / 2

  target.push(
    packSmoke(center, left, bottom, opacity, seed, 0, 0),
    packSmoke(center, right, bottom, opacity, seed, 1, 0),
    packSmoke(center, right, top, opacity, seed, 1, 1),
  )
  target.push(
    packSmoke(center, left, bottom, opacity, seed, 0, 0),
    packSmoke(center, right, top, opacity, seed, 1, 1),
    packSmoke(center, left, top, opacity, seed, 0, 1),
  )
}

function smokeRandom(seed: number) {
  const value = Math.sin(seed * 127.1) * 43758.5453123

  return value - Math.floor(value)
}

export function addCeilingBeams(target: Vertex[], time: number, strobeLights: StrobeLight[], videoZone: VideoZone) {
  for (const light of strobeLights) {
    if (light.zone !== videoZone) {
      continue
    }

    const hit = strobeTarget(light, time)

    addBeam(target, light, hit[0], hit[2])
    addFloorPool(target, light, hit[0], hit[2])
  }
}

function addBeam(target: Vertex[], light: StrobeLight, targetX: number, targetZ: number) {
  const shells = [
    { radiusX: light.zone === 'outside' ? 1.35 : 0.5, radiusZ: light.zone === 'outside' ? 1.85 : 0.68,
      glow: light.zone === 'outside' ? 0.7 : 0.42, color: light.color },
  ]
  const segments = 20

  for (let shell = 0; shell < shells.length; shell++) {
    const layer = shells[shell]!
    const offset = shell * Math.PI / segments
    const uvOffset = shell * 0.37

    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2 + offset
      const b = ((i + 1) / segments) * Math.PI * 2 + offset
      const uA = i / segments + uvOffset
      const uB = (i + 1) / segments + uvOffset
      const topA: [number, number, number] = [light.x + Math.cos(a) * 0.07, light.top, light.z + Math.sin(a) * 0.07]
      const topB: [number, number, number] = [light.x + Math.cos(b) * 0.07, light.top, light.z + Math.sin(b) * 0.07]
      const bottomA: [number, number, number] = [targetX + Math.cos(a) * layer.radiusX, light.floor,
        targetZ + Math.sin(a) * layer.radiusZ]
      const bottomB: [number, number, number] = [targetX + Math.cos(b) * layer.radiusX, light.floor,
        targetZ + Math.sin(b) * layer.radiusZ]

      target.push(
        pack(topA, layer.color, layer.glow * 0.18, light.id, uA, 0, 1),
        pack(topB, layer.color, layer.glow * 0.18, light.id, uB, 0, 1),
        pack(bottomB, layer.color, layer.glow, light.id, uB, 1, 1),
      )
      target.push(
        pack(topA, layer.color, layer.glow * 0.18, light.id, uA, 0, 1),
        pack(bottomB, layer.color, layer.glow, light.id, uB, 1, 1),
        pack(bottomA, layer.color, layer.glow, light.id, uA, 1, 1),
      )
    }
  }
}

function addFloorPool(target: Vertex[], light: StrobeLight, x: number, z: number) {
  const center: [number, number, number] = [x, light.floor + 0.02, z]
  const color = light.color
  const innerRadius = 0.82
  const outerRadiusX = 1.75
  const outerRadiusZ = 2.2
  const segments = 32

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const b = ((i + 1) / segments) * Math.PI * 2
    const innerA: [number, number, number] = [x + Math.cos(a) * innerRadius, light.floor + 0.02,
      z + Math.sin(a) * innerRadius]
    const innerB: [number, number, number] = [x + Math.cos(b) * innerRadius, light.floor + 0.02,
      z + Math.sin(b) * innerRadius]
    const edgeA: [number, number, number] = [x + Math.cos(a) * outerRadiusX, light.floor + 0.02,
      z + Math.sin(a) * outerRadiusZ]
    const edgeB: [number, number, number] = [x + Math.cos(b) * outerRadiusX, light.floor + 0.02,
      z + Math.sin(b) * outerRadiusZ]

    target.push(pack(center, color, 1.08, light.id), pack(innerA, color, 0.9, light.id),
      pack(innerB, color, 0.9, light.id))
    target.push(pack(innerA, color, 0.34, light.id), pack(edgeA, color, 0.08, light.id),
      pack(edgeB, color, 0.08, light.id))
    target.push(pack(innerA, color, 0.34, light.id), pack(edgeB, color, 0.08, light.id),
      pack(innerB, color, 0.34, light.id))
  }
}
