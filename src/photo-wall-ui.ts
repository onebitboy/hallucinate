import { createDomWallProjection } from './dom-wall.ts'
import type { WallProjector } from './projection.ts'
import { outsidePhotoWall } from './scene-data.ts'
import type { Vec3 } from './types.ts'

type Camera = {
  center: Vec3
  eye: Vec3
}

type Photo = {
  createdAt: number
  timestamp: number
  url: string
}

type PhotoPage = {
  limit: number
  offset: number
  photos: Photo[]
  total: number
}

const refreshInterval = 30_000
const viewerMotion = matchMedia('(prefers-reduced-motion: reduce)')
const viewerMotionDuration = 560
const viewerSlideDuration = 420

export function createPhotoWallUi(element: HTMLElement, options: {
  admin: () => { enabled: boolean; pass: string }
  alternativeInput: () => boolean
  recoverFocus?: () => void
}) {
  const projection = createDomWallProjection(element, { opacity: '0.92' })
  const panel = document.createElement('div')
  const grid = document.createElement('div')
  const viewer = document.createElement('dialog')
  const viewerStage = document.createElement('div')
  const viewerPolaroid = document.createElement('div')
  const viewerImage = document.createElement('img')
  const viewerPrevious = document.createElement('button')
  const viewerNext = document.createElement('button')
  const viewerClose = document.createElement('button')
  const photoElements = new Map<number, HTMLImageElement>()
  let viewerAnimation: Animation | undefined
  let viewerClosing = false
  let viewerSlideBusy = false
  let viewerSourceRect: DOMRect | undefined
  let viewedPhoto: Photo | undefined
  let page: PhotoPage = { limit: 30, offset: 0, photos: [], total: 0 }
  let visible = false
  let loading = false
  let loadingPage: Promise<void> | undefined
  let loaded = false
  let refreshedAt = 0

  panel.id = 'photo-wall-panel'
  grid.id = 'photo-wall-grid'
  viewer.id = 'photo-viewer-dialog'
  viewerStage.id = 'photo-viewer-stage'
  viewerPolaroid.id = 'photo-viewer-polaroid'
  viewerImage.id = 'photo-viewer-image'
  viewerPrevious.id = 'photo-viewer-previous'
  viewerNext.id = 'photo-viewer-next'
  viewerClose.id = 'photo-viewer-close'
  viewerPrevious.className = 'photo-viewer-control photo-viewer-previous'
  viewerNext.className = 'photo-viewer-control photo-viewer-next'
  viewerClose.className = 'photo-viewer-control photo-viewer-close'
  viewerImage.alt = 'photo'
  viewerImage.className = 'photo-viewer-image'
  viewerPrevious.type = 'button'
  viewerPrevious.textContent = '👈'
  viewerPrevious.setAttribute('aria-label', 'previous photo')
  viewerNext.type = 'button'
  viewerNext.textContent = '👉'
  viewerNext.setAttribute('aria-label', 'next photo')
  viewerClose.type = 'button'
  viewerClose.textContent = '✕'
  viewerClose.setAttribute('aria-label', 'close photo')
  panel.append(grid)
  viewerPolaroid.append(viewerImage, viewerPrevious, viewerNext, viewerClose)
  viewerStage.append(viewerPolaroid)
  viewer.append(viewerStage)
  element.append(panel)
  document.body.append(viewer)

  viewerClose.addEventListener('click', () => {
    closeViewer()
  })
  viewerPrevious.addEventListener('click', () => {
    void moveViewer(-1)
  })
  viewerNext.addEventListener('click', () => {
    void moveViewer(1)
  })
  viewer.addEventListener('keydown', event => {
    const key = event.key.toLowerCase()
    const previousKey = options.alternativeInput() ? 'a' : 'j'
    const nextKey = options.alternativeInput() ? 'd' : 'l'

    event.stopPropagation()
    if (event.key === 'Escape' || key === 'x') {
      event.preventDefault()
      closeViewer()
      return
    }

    if (event.key === 'ArrowLeft' || key === previousKey) {
      event.preventDefault()
      void moveViewer(-1)
      return
    }

    if (event.key === 'ArrowRight' || key === nextKey) {
      event.preventDefault()
      void moveViewer(1)
    }
  })
  viewer.addEventListener('cancel', event => {
    event.preventDefault()
    closeViewer()
  })
  viewer.addEventListener('click', event => {
    if (event.target === viewer) {
      closeViewer()
    }
  })

  return {
    hide() {
      visible = false
      projection.hide()
      element.style.pointerEvents = 'none'
    },
    refresh,
    async refreshLatest() {
      await refresh()
    },
    async previewUrls() {
      if (!loaded) {
        await refresh()
      }

      return page.photos.slice(0, 9).map(photo => photo.url)
    },
    syncAdmin() {
      render()
    },
    update(camera: Camera, projector: WallProjector) {
      visible = projection.update(camera, projector, outsidePhotoWall)
      element.style.pointerEvents = visible ? 'auto' : 'none'

      if (visible && (!loaded || performance.now() - refreshedAt >= refreshInterval)) {
        void refresh()
      }
    },
  }

  async function refresh() {
    if (loadingPage) {
      await loadingPage
      return
    }

    loading = true
    loadingPage = refreshFirstPage()
    await loadingPage
  }

  async function loadMorePhotos() {
    if (loading || page.photos.length >= page.total) {
      return
    }

    loading = true
    try {
      const next = await fetchPhotoPage(page.photos.length)

      page = {
        ...next,
        offset: 0,
        photos: sortedPhotos([...page.photos, ...next.photos]),
      }
      loaded = true
      refreshedAt = performance.now()
      render()
    }
    catch (e) {
      console.error(e)
    }
    finally {
      loading = false
      syncViewedPhoto()
    }
  }

  async function refreshFirstPage() {
    try {
      const next = normalizePhotoPage(await fetchPhotoPage(0))

      page = loaded
        ? { ...next, photos: sortedPhotos([...next.photos, ...page.photos]).slice(0, next.total) }
        : next
      loaded = true
      refreshedAt = performance.now()
      render()
    }
    catch (e) {
      console.error(e)
    }
    finally {
      loading = false
      loadingPage = undefined
    }
  }

  function render() {
    grid.replaceChildren()
    photoElements.clear()

    for (let i = 0; i < page.photos.length; i++) {
      const photo = page.photos[i]!
      const item = document.createElement('div')
      const image = document.createElement('img')

      item.className = 'photo-wall-item'
      item.tabIndex = 0
      image.src = photo.url
      image.alt = new Date(photo.createdAt).toLocaleString()
      image.loading = i < 9 ? 'eager' : 'lazy'
      photoElements.set(photo.timestamp, image)
      item.append(image)
      item.addEventListener('click', () => {
        openViewer(photo, page.photos.indexOf(photo), image.getBoundingClientRect())
      })
      item.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return
        }

        event.preventDefault()
        openViewer(photo, page.photos.indexOf(photo), image.getBoundingClientRect())
      })

      grid.append(item)
    }

    grid.style.setProperty('--photo-wall-rows', String(Math.max(3, Math.ceil(page.photos.length / 3))))
  }

  function openViewer(
    photo: Photo,
    index = page.photos.findIndex(item => item.timestamp === photo.timestamp),
    sourceRect?: DOMRect,
    animate = true,
  )
  {
    viewerAnimation?.cancel()
    viewerClosing = false
    delete viewer.dataset.closing
    const tilt = setViewerPhoto(photo, index)
    if (!viewer.open) {
      viewer.showModal()
    }
    const targetSourceRect = sourceRect ?? photoElements.get(photo.timestamp)?.getBoundingClientRect()

    viewerSourceRect = targetSourceRect
    if (animate && targetSourceRect) {
      animateViewerFrom(targetSourceRect, tilt)
    }
    viewerClose.focus()
  }

  function closeViewer() {
    if (viewerSlideBusy || viewerClosing) {
      return
    }

    const sourceRect = viewerSourceRect

    if (sourceRect && !viewerMotion.matches) {
      viewerAnimation?.cancel()
      viewerAnimation = undefined
      viewerClosing = true
      viewer.dataset.closing = 'true'
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          animateViewerClose(sourceRect)
        })
      })
      return
    }

    closeViewerNow()
  }

  function closeViewerNow() {
    viewedPhoto = undefined
    viewerAnimation?.cancel()
    viewerAnimation = undefined
    viewerClosing = false
    viewerSlideBusy = false
    viewerSourceRect = undefined
    delete viewer.dataset.closing
    viewerPolaroid.style.visibility = ''
    viewerImage.removeAttribute('src')
    if (viewer.open) {
      viewer.close()
    }
    options.recoverFocus?.()
  }

  async function moveViewer(direction: -1 | 1) {
    if (!viewedPhoto || loading || viewerAnimation || viewerClosing || viewerSlideBusy) {
      return
    }

    viewerSlideBusy = true
    try {
      let index = page.photos.findIndex(photo => photo.timestamp === viewedPhoto!.timestamp)

      if (direction > 0 && index >= page.photos.length - 2 && page.photos.length < page.total) {
        await loadMorePhotos()
        index = page.photos.findIndex(photo => photo.timestamp === viewedPhoto!.timestamp)
      }

      const nextIndex = index + direction

      if (page.photos[nextIndex]) {
        await preloadPhoto(page.photos[nextIndex]!)
        animateViewerSwap(page.photos[nextIndex]!, nextIndex, direction)
        return
      }

      viewerSlideBusy = false
    }
    catch (e) {
      viewerSlideBusy = false
      console.error(e)
    }
  }

  function setViewerPhoto(photo: Photo, index: number) {
    viewedPhoto = photo
    viewerImage.src = photo.url
    viewerImage.alt = new Date(photo.createdAt).toLocaleString()

    const tilt = photoTilt(photo)

    viewerPolaroid.style.setProperty('--photo-viewer-tilt', `${tilt}deg`)
    syncViewerNav(index)

    const source = photoElements.get(photo.timestamp)

    viewerSourceRect = source?.getBoundingClientRect()

    return tilt
  }

  function syncViewerNav(index: number) {
    viewerPrevious.disabled = loading || index <= 0
    viewerNext.disabled = loading || index + 1 >= page.total
  }

  function syncViewedPhoto() {
    if (!viewedPhoto) {
      return
    }

    syncViewerNav(page.photos.findIndex(photo => photo.timestamp === viewedPhoto!.timestamp))
  }

  function animateViewerFrom(sourceRect: DOMRect, tilt: number) {
    if (viewerMotion.matches) {
      return
    }

    const targetRect = viewerPolaroid.getBoundingClientRect()
    const sourceCenterX = sourceRect.left + sourceRect.width * 0.5
    const sourceCenterY = sourceRect.top + sourceRect.height * 0.5
    const targetCenterX = targetRect.left + targetRect.width * 0.5
    const targetCenterY = targetRect.top + targetRect.height * 0.5
    const dx = sourceCenterX - targetCenterX
    const dy = sourceCenterY - targetCenterY
    const sx = sourceRect.width / targetRect.width
    const sy = sourceRect.height / targetRect.height

    viewerAnimation = viewerPolaroid.animate([
      {
        opacity: 0.72,
        transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotate(${tilt}deg)`,
      },
      {
        opacity: 1,
        transform: `translate(0, 0) scale(1, 1) rotate(${tilt}deg)`,
      },
    ], {
      duration: viewerMotionDuration,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    })
    viewerAnimation.addEventListener('finish', () => {
      viewerAnimation = undefined
    }, { once: true })
  }

  function animateViewerSwap(photo: Photo, index: number, direction: -1 | 1) {
    if (viewerMotion.matches) {
      setViewerPhoto(photo, index)
      viewerSlideBusy = false
      return
    }

    const currentRect = viewerPolaroid.getBoundingClientRect()
    const currentPhoto = viewedPhoto!
    const outgoing = viewerPolaroid.cloneNode(true) as HTMLElement
    const currentTilt = photoTilt(currentPhoto)
    const nextTilt = photoTilt(photo)
    const distance = Math.max(innerWidth, currentRect.width) + currentRect.width
    const incomingX = direction > 0 ? distance : -distance
    const outgoingX = -incomingX

    viewerAnimation?.cancel()
    prepareSlideClone(outgoing, currentRect)
    viewerStage.append(outgoing)
    viewerPolaroid.style.visibility = 'hidden'
    setViewerPhoto(photo, index)
    viewerPolaroid.getBoundingClientRect()
    viewerPolaroid.style.visibility = ''

    const outgoingSlide = outgoing.animate([
      { transform: `translateX(0) rotate(${currentTilt}deg)` },
      { transform: `translateX(${outgoingX}px) rotate(${currentTilt}deg)` },
    ], {
      duration: viewerSlideDuration,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    })
    const incomingAnimation = viewerPolaroid.animate([
      { transform: `translateX(${incomingX}px) rotate(${nextTilt}deg)` },
      { transform: `translateX(0) rotate(${nextTilt}deg)` },
    ], {
      duration: viewerSlideDuration,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    })

    viewerAnimation = outgoingSlide
    incomingAnimation.addEventListener('finish', () => {
      outgoing.remove()
      viewerAnimation = undefined
      viewerSlideBusy = false
      viewerClose.focus()
    }, { once: true })
  }

  function prepareSlideClone(slide: HTMLElement, rect: DOMRect) {
    slide.removeAttribute('id')
    slide.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'))
    slide.className = 'photo-viewer-polaroid-slide'
    slide.style.width = `${rect.width}px`
    slide.style.height = `${rect.height}px`
    slide.style.maxHeight = 'none'
    slide.style.pointerEvents = 'none'
  }

  function animateViewerClose(sourceRect: DOMRect) {
    const targetRect = viewerPolaroid.getBoundingClientRect()
    const sourceCenterX = sourceRect.left + sourceRect.width * 0.5
    const sourceCenterY = sourceRect.top + sourceRect.height * 0.5
    const targetCenterX = targetRect.left + targetRect.width * 0.5
    const targetCenterY = targetRect.top + targetRect.height * 0.5
    const dx = sourceCenterX - targetCenterX
    const dy = sourceCenterY - targetCenterY
    const sx = sourceRect.width / targetRect.width
    const sy = sourceRect.height / targetRect.height
    const tilt = viewedPhoto ? photoTilt(viewedPhoto) : 0

    viewerAnimation?.cancel()
    viewerAnimation = viewerPolaroid.animate([
      {
        opacity: 1,
        transform: `translate(0, 0) scale(1, 1) rotate(${tilt}deg)`,
      },
      {
        opacity: 0,
        transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotate(${tilt}deg)`,
      },
    ], {
      duration: viewerMotionDuration,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    })
    viewerAnimation.addEventListener('finish', closeViewerNow, { once: true })
  }
}

function photoTilt(photo: Photo) {
  const seed = Math.sin(photo.timestamp * 0.00037 + photo.createdAt * 0.000011) * 43758.5453123
  const unit = seed - Math.floor(seed)

  return unit * 5.6 - 2.8
}

async function preloadPhoto(photo: Photo) {
  const image = new Image()

  image.src = photo.url
  await image.decode()
}

async function fetchPhotoPage(offset: number) {
  const response = await fetch(`/api/photos?offset=${offset}`, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`Photo list failed ${response.status}`)
  }

  return await jsonApiResponse<PhotoPage>(response, 'Photo list')
}

function normalizePhotoPage(page: PhotoPage): PhotoPage {
  return {
    ...page,
    photos: sortedPhotos(page.photos),
  }
}

function sortedPhotos(photos: Photo[]) {
  const photosByTimestamp = new Map(photos.map(photo => [photo.timestamp, photo]))

  return [...photosByTimestamp.values()].sort((a, b) =>
    b.createdAt === a.createdAt ? b.timestamp - a.timestamp : b.createdAt - a.createdAt)
}

async function jsonApiResponse<T>(response: Response, label: string): Promise<T> {
  const type = response.headers.get('content-type') ?? ''

  if (!type.includes('application/json')) {
    throw new Error(`${label} returned ${type || 'unknown content-type'}`)
  }

  return await response.json() as T
}
