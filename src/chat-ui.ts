import { projectWallPointInto } from './projection.ts'
import type { ProjectedPoint, WallProjector } from './projection.ts'
import type { Vec3 } from './types.ts'

export function createChatUi(
  form: HTMLFormElement,
  input: HTMLInputElement,
  bubbleRoot: HTMLDivElement,
  position: Vec3,
) {
  let formX = Number.NaN
  let formY = Number.NaN
  const anchor: Vec3 = [0, 0, 0]
  const point: ProjectedPoint = { x: 0, y: 0 }
  let bubbleId = 0
  const bubbles = new Map<number, {
    element: HTMLDivElement
    owner: number
    position: Vec3
    hideAt: number
    x: number
    y: number
  }>()

  return {
    open() {
      input.value = ''
      form.dataset.open = 'true'
      input.focus()
    },
    submit() {
      const text = input.value.trim()

      form.dataset.open = 'false'
      input.blur()

      return text
    },
    show(id: number, text: string, bubblePosition: Vec3, stamp: number, color: string) {
      const key = ++bubbleId
      const bubble = createBubble(bubbleRoot, id, bubblePosition)

      bubble.element.textContent = text
      bubble.element.style.color = color
      bubble.position = bubblePosition
      bubble.hideAt = stamp + 4000
      bubbles.set(key, bubble)
    },
    remove(id: number) {
      for (const [key, bubble] of bubbles) {
        if (bubble.owner === id) {
          bubble.element.remove()
          bubbles.delete(key)
        }
      }
    },
    removeMessages(id: number) {
      this.remove(id)
    },
    removeLatest(id: number) {
      let latestKey = 0
      let latestHideAt = 0

      for (const [key, bubble] of bubbles) {
        if (bubble.owner === id && bubble.hideAt > latestHideAt) {
          latestKey = key
          latestHideAt = bubble.hideAt
        }
      }

      const bubble = bubbles.get(latestKey)

      if (bubble) {
        bubble.element.remove()
        bubbles.delete(latestKey)
      }
    },
    clear() {
      for (const bubble of bubbles.values()) {
        bubble.element.remove()
      }

      bubbles.clear()
    },
    update(projector: WallProjector, stamp: number) {
      if (form.dataset.open === 'true') {
        anchor[0] = position[0]
        anchor[1] = position[1] + 1.05
        anchor[2] = position[2]
        projectWallPointInto(anchor, projector, point)
        const x = Math.round(point.x)
        const y = Math.round(point.y - 68)

        if (x !== formX || y !== formY) {
          formX = x
          formY = y
          form.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`
        }
      }

      for (const [id, bubble] of bubbles) {
        if (stamp > bubble.hideAt) {
          bubble.element.remove()
          bubbles.delete(id)
          continue
        }

        anchor[0] = bubble.position[0]
        anchor[1] = bubble.position[1] + 1.05
        anchor[2] = bubble.position[2]
        projectWallPointInto(anchor, projector, point)
        const x = Math.round(point.x)
        const y = Math.round(point.y - 68)

        if (x !== bubble.x || y !== bubble.y) {
          bubble.x = x
          bubble.y = y
          bubble.element.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`
        }
      }
    },
  }
}

function createBubble(root: HTMLDivElement, owner: number, position: Vec3) {
  const element = document.createElement('div')
  const bubble = {
    element,
    owner,
    position,
    hideAt: 0,
    x: Number.NaN,
    y: Number.NaN,
  }

  element.className = 'chat-bubble'
  root.append(element)

  return bubble
}
