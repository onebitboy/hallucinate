import { projectVisiblePointInto, projectWallPointInto } from './projection.ts'
import type { ProjectedPoint, WallProjector } from './projection.ts'
import { createInstagramLink } from './instagram-link.ts'
import { emojiReactionFromMessage } from './reactions.ts'
import type { Vec3 } from './types.ts'

type ChatBubble = {
  element: HTMLDivElement
  owner: number
  position: Vec3
  hideAt: number
  shownAt: number
  visible: boolean
  x: number
  y: number
  particles?: ReactionParticle[]
}

type ChatLabel = {
  color: string
  element: HTMLDivElement
  hideAt: number
  instagram: string
  owner: number
  position: Vec3
  text: string
  visible: boolean
  x: number
  y: number
}

type ReactionParticle = {
  delay: number
  element: HTMLSpanElement
  offsetX: number
  offsetY: number
  phase: number
  rise: number
  size: number
}

const bubbleDuration = 4000
const reactionParticleCount = 8
const reactionParticleDelay = 0.42
const reactionParticleDuration = 0.56

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
  const bubbles = new Map<number, ChatBubble>()
  const labels = new Map<number, ChatLabel>()

  return {
    isOpen() {
      return form.dataset.open === 'true'
    },
    open(focus = true) {
      input.value = ''
      form.dataset.open = 'true'
      if (focus) {
        input.focus()
      }
    },
    close() {
      input.value = ''
      form.dataset.open = 'false'
      input.blur()
      if (document.activeElement instanceof HTMLElement && form.contains(document.activeElement)) {
        document.activeElement.blur()
      }
    },
    toggle(focus = true) {
      if (form.dataset.open === 'true') {
        this.close()
      }
      else {
        this.open(focus)
      }
    },
    submit(close = true) {
      const text = input.value.trim()

      if (close) {
        this.close()
      }
      else {
        input.value = ''
        input.blur()
      }

      return text
    },
    show(id: number, text: string, bubblePosition: Vec3, stamp: number, color: string, labelText = '') {
      const label = labels.get(id)
      const reaction = emojiReactionFromMessage(text)
      const bubbleText = labelText ? `${labelText} ${text}` : text

      if (label) {
        label.element.textContent = bubbleText
        label.element.dataset.linked = 'false'
        label.element.dataset.speaking = 'true'
        label.hideAt = stamp + bubbleDuration
        label.element.style.color = color
        if (!reaction) {
          return
        }
      }

      const key = ++bubbleId
      const bubble = reaction
        ? createReactionBubble(bubbleRoot, id, bubblePosition, reaction, key)
        : createBubble(bubbleRoot, id, bubblePosition)

      if (!reaction) {
        bubble.element.textContent = bubbleText
        bubble.element.style.color = color
      }
      bubble.position = bubblePosition
      bubble.shownAt = stamp
      bubble.hideAt = stamp + bubbleDuration
      bubbles.set(key, bubble)
    },
    remove(id: number) {
      const label = labels.get(id)

      if (label) {
        label.element.remove()
        labels.delete(id)
      }

      for (const [key, bubble] of bubbles) {
        if (bubble.owner === id) {
          bubble.element.remove()
          bubbles.delete(key)
        }
      }
    },
    removeMessages(id: number) {
      for (const [key, bubble] of bubbles) {
        if (bubble.owner === id) {
          bubble.element.remove()
          bubbles.delete(key)
        }
      }

      const label = labels.get(id)

      if (label) {
        renderLabel(label)
        label.element.dataset.speaking = 'false'
        label.hideAt = 0
      }
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
      for (const label of labels.values()) {
        label.element.remove()
      }

      labels.clear()
      for (const bubble of bubbles.values()) {
        bubble.element.remove()
      }

      bubbles.clear()
    },
    setLabel(id: number, text: string, labelPosition: Vec3, color: string, instagram = '') {
      let label = labels.get(id)

      if (!text) {
        if (label) {
          label.element.remove()
          labels.delete(id)
        }

        return
      }

      if (!label) {
        label = createLabel(bubbleRoot, id, labelPosition)
        labels.set(id, label)
      }

      label.text = text
      label.instagram = instagram
      label.position = labelPosition
      if (label.color !== color) {
        label.color = color
        label.element.style.color = color
      }
      if (label.hideAt === 0) {
        if (label.element.textContent !== text || label.element.dataset.instagram !== instagram) {
          renderLabel(label)
        }
        label.element.dataset.speaking = 'false'
      }
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

      for (const label of labels.values()) {
        if (label.hideAt > 0 && stamp > label.hideAt) {
          renderLabel(label)
          label.element.dataset.speaking = 'false'
          label.hideAt = 0
        }

        positionElement(label, projector, point, anchor)
      }

      for (const [id, bubble] of bubbles) {
        if (stamp > bubble.hideAt) {
          bubble.element.remove()
          bubbles.delete(id)
          continue
        }

        positionElement(bubble, projector, point, anchor)

        if (bubble.particles) {
          updateReactionParticles(bubble, stamp)
        }
      }
    },
  }
}

function createLabel(root: HTMLDivElement, owner: number, position: Vec3): ChatLabel {
  const element = document.createElement('div')
  const label = {
    color: 'white',
    element,
    hideAt: 0,
    instagram: '',
    owner,
    position,
    text: '',
    visible: false,
    x: Number.NaN,
    y: Number.NaN,
  }

  element.className = 'chat-label'
  element.dataset.visible = 'false'
  root.append(element)

  return label
}

function renderLabel(label: ChatLabel) {
  label.element.replaceChildren(label.instagram
    ? createInstagramLink(label.text, label.instagram)
    : document.createTextNode(label.text))
  label.element.dataset.instagram = label.instagram
  label.element.dataset.linked = String(Boolean(label.instagram))
}

function createBubble(root: HTMLDivElement, owner: number, position: Vec3): ChatBubble {
  const element = document.createElement('div')
  const bubble = {
    element,
    owner,
    position,
    hideAt: 0,
    shownAt: 0,
    visible: false,
    x: Number.NaN,
    y: Number.NaN,
  }

  element.className = 'chat-bubble'
  element.dataset.visible = 'false'
  root.append(element)

  return bubble
}

function positionElement(
  item: { element: HTMLElement; position: Vec3; visible: boolean; x: number; y: number },
  projector: WallProjector,
  point: ProjectedPoint,
  anchor: Vec3,
) {
  anchor[0] = item.position[0]
  anchor[1] = item.position[1] + 1.05
  anchor[2] = item.position[2]
  if (!projectVisiblePointInto(anchor, projector, point)) {
    if (item.visible) {
      item.visible = false
      item.element.dataset.visible = 'false'
    }
    return
  }

  if (!item.visible) {
    item.visible = true
    item.element.dataset.visible = 'true'
  }
  const x = Math.round(point.x)
  const y = Math.round(point.y - 68)

  if (x !== item.x || y !== item.y) {
    item.x = x
    item.y = y
    item.element.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`
  }
}

function createReactionBubble(
  root: HTMLDivElement,
  owner: number,
  position: Vec3,
  reaction: string,
  key: number,
): ChatBubble {
  const element = document.createElement('div')
  const particles: ReactionParticle[] = []
  const bubble: ChatBubble = {
    element,
    owner,
    position,
    hideAt: 0,
    shownAt: 0,
    visible: false,
    x: Number.NaN,
    y: Number.NaN,
    particles,
  }

  element.className = 'chat-reaction'
  element.dataset.visible = 'false'
  for (let i = 0; i < reactionParticleCount; i++) {
    const particle = document.createElement('span')
    const seed = owner * 131 + key * 47 + i * 29

    particle.className = 'chat-reaction-particle'
    particle.textContent = reaction
    element.append(particle)
    particles.push({
      delay: reactionNoise(seed + 1) * reactionParticleDelay,
      element: particle,
      offsetX: reactionNoise(seed + 2) * 72 - 36,
      offsetY: reactionNoise(seed + 3) * 22,
      phase: reactionNoise(seed + 4) * Math.PI * 2,
      rise: 72 + reactionNoise(seed + 5) * 64,
      size: 0.72 + reactionNoise(seed + 6) * 0.62,
    })
  }

  root.append(element)

  return bubble
}

function updateReactionParticles(bubble: ChatBubble, stamp: number) {
  const progress = (stamp - bubble.shownAt) / (bubble.hideAt - bubble.shownAt)

  for (const particle of bubble.particles!) {
    const amount = Math.min(1, Math.max(0, (progress - particle.delay) / reactionParticleDuration))
    const x = particle.offsetX + Math.sin(amount * Math.PI * 2 + particle.phase) * 9
    const y = particle.offsetY - particle.rise * amount
    const opacity = amount < 0.08
      ? amount / 0.08
      : 1 - Math.max(0, (amount - 0.68) / 0.32)
    const scale = particle.size * (0.86 + amount * 0.28)

    particle.element.style.opacity = String(Math.max(0, opacity))
    particle.element.style.transform = `translate(-50%, -50%) translate(${Math.round(x)}px, ${Math.round(y)}px) scale(${
      scale.toFixed(3)
    })`
  }
}

function reactionNoise(seed: number) {
  const value = Math.sin(seed * 91.7) * 43758.5453123

  return value - Math.floor(value)
}
