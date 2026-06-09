import { createDomWallProjection } from './dom-wall.ts'
import { photoWallColumns, photoWallPaintedSlots, photoWallRows } from './photo-wall-data.ts'
import { projectedQuadTransform, type WallProjector } from './projection.ts'
import { outsidePhotoWall } from './scene-data.ts'
import type { Vec3 } from './types.ts'

type Camera = {
  center: Vec3
  eye: Vec3
}

export type Photo = {
  createdAt: number
  liked: boolean
  likes: number
  thumbnailUrl: string
  timestamp: number
  url: string
}

type PhotoPage = {
  limit: number
  offset: number
  photos: Photo[]
  total: number
}

type PhotoElement = {
  decodeId: number
  image: HTMLImageElement
  item: HTMLDivElement
  like: HTMLButtonElement
  photo?: Photo
  thumbnailUrl: string
}

const refreshInterval = 30_000
const hiddenPhotoWallOpacity = '0.01'
const parkedPhotoWallSize = 12
const photoLoadAheadSlots = photoWallPaintedSlots
const viewerMotion = matchMedia('(prefers-reduced-motion: reduce)')
const viewerMotionDuration = 560
const viewerSlideDuration = 420

export function createPhotoWallUi(element: HTMLElement, options: {
  admin: () => { enabled: boolean; pass: string }
  alternativeInput: () => boolean
  onLike?: (photo: Photo) => void
  recoverFocus?: () => void
}) {
  const parkedPhotoWallSizePx = `${parkedPhotoWallSize}px`
  const projection = createDomWallProjection(element, {
    hidden: {
      height: parkedPhotoWallSizePx,
      opacity: hiddenPhotoWallOpacity,
      transform: `translate3d(calc(100dvw - ${parkedPhotoWallSizePx}), calc(100dvh - ${parkedPhotoWallSizePx}), 0)`,
      width: parkedPhotoWallSizePx,
    },
    opacity: '0.92',
  })
  const panel = document.createElement('div')
  const grid = document.createElement('div')
  const viewer = document.createElement('dialog')
  const viewerStage = document.createElement('div')
  const viewerPolaroid = document.createElement('div')
  const viewerImage = document.createElement('img')
  const viewerPrevious = document.createElement('button')
  const viewerNext = document.createElement('button')
  const viewerLike = document.createElement('button')
  const viewerClose = document.createElement('button')
  const photoElements: PhotoElement[] = []
  const fullPhotoPreloads = new Map<string, Promise<void>>()
  let activePhotoIndexes = new Set<number>()
  let viewerOpenId = 0
  let viewerAnimation: Animation | undefined
  let viewerClosing = false
  let viewerSlideBusy = false
  let viewerSourceImage: HTMLImageElement | undefined
  let viewerSourceRect: DOMRect | undefined
  let viewedPhoto: Photo | undefined
  let page: PhotoPage = { limit: 30, offset: 0, photos: [], total: 0 }
  let visible = false
  let loading = false
  let loadingPage: Promise<void> | undefined
  let loaded = false
  let refreshedAt = 0
  let resetGridScroll = false

  panel.id = 'photo-wall-panel'
  grid.id = 'photo-wall-grid'
  viewer.id = 'photo-viewer-dialog'
  viewerStage.id = 'photo-viewer-stage'
  viewerPolaroid.id = 'photo-viewer-polaroid'
  viewerImage.id = 'photo-viewer-image'
  viewerPrevious.id = 'photo-viewer-previous'
  viewerNext.id = 'photo-viewer-next'
  viewerLike.id = 'photo-viewer-like'
  viewerClose.id = 'photo-viewer-close'
  viewerPrevious.className = 'photo-viewer-control photo-viewer-previous'
  viewerNext.className = 'photo-viewer-control photo-viewer-next'
  viewerLike.className = 'photo-viewer-control photo-viewer-like'
  viewerClose.className = 'photo-viewer-control photo-viewer-close'
  viewerImage.alt = 'photo'
  viewerImage.className = 'photo-viewer-image'
  viewerImage.decoding = 'async'
  viewerImage.loading = 'eager'
  viewerPrevious.type = 'button'
  viewerPrevious.textContent = '👈'
  viewerPrevious.setAttribute('aria-label', 'previous photo')
  viewerNext.type = 'button'
  viewerNext.textContent = '👉'
  viewerNext.setAttribute('aria-label', 'next photo')
  viewerLike.type = 'button'
  viewerLike.setAttribute('aria-label', 'like photo')
  viewerClose.type = 'button'
  viewerClose.textContent = '✕'
  viewerClose.setAttribute('aria-label', 'close photo')
  panel.append(grid)
  viewerPolaroid.append(viewerImage, viewerPrevious, viewerNext, viewerLike, viewerClose)
  viewerStage.append(viewerPolaroid)
  viewer.append(viewerStage)
  element.append(panel)
  document.body.append(viewer)

  grid.addEventListener('scroll', handlePhotoWallScroll)
  viewerClose.addEventListener('click', () => {
    closeViewer()
  })
  viewerPrevious.addEventListener('click', () => {
    void moveViewer(-1)
  })
  viewerNext.addEventListener('click', () => {
    void moveViewer(1)
  })
  viewerLike.addEventListener('click', () => {
    if (!viewedPhoto) {
      throw new Error('Missing viewed photo')
    }

    void likePhoto(viewedPhoto)
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
      resetGridScroll = true
      await refresh()
      resetPhotoWallScroll()
    },
    async previewUrls() {
      if (!loaded) {
        await refresh()
      }

      return page.photos.slice(0, 9).map(photo => photo.thumbnailUrl)
    },
    open(photo: Photo, sourceImage?: HTMLImageElement) {
      return openViewer(photo, page.photos.findIndex(item => item.timestamp === photo.timestamp), sourceImage)
    },
    syncAdmin() {
      render()
    },
    update(camera: Camera, projector: WallProjector) {
      const wasVisible = visible

      visible = projection.update(camera, projector, outsidePhotoWall)
      element.style.pointerEvents = visible ? 'auto' : 'none'

      if (visible && !wasVisible && !viewer.open) {
        resetPhotoWallScroll()
      }

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
      const scrollTop = grid.scrollTop
      const next = await fetchPhotoPage(page.photos.length)

      page = {
        ...next,
        offset: 0,
        photos: sortedPhotos([...page.photos, ...next.photos]),
      }
      loaded = true
      refreshedAt = performance.now()
      render(false, scrollTop)
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
      const shouldResetScroll = resetGridScroll || !loaded
      const next = normalizePhotoPage(await fetchPhotoPage(0))

      page = loaded
        ? { ...next, photos: sortedPhotos([...next.photos, ...page.photos]).slice(0, next.total) }
        : next
      loaded = true
      refreshedAt = performance.now()
      render(shouldResetScroll)
    }
    catch (e) {
      console.error(e)
    }
    finally {
      loading = false
      loadingPage = undefined
      resetGridScroll = false
    }
  }

  function render(resetScroll = false, scrollTop?: number) {
    if (resetScroll) {
      grid.scrollTop = 0
    }

    const count = Math.max(page.photos.length, page.total)

    for (let i = 0; i < count; i++) {
      const photo = page.photos[i]
      const element = photoElements[i] ?? createPhotoElement()

      photoElements[i] = element
      syncPhotoElement(element, photo)

      if (grid.children[i] !== element.item) {
        grid.insertBefore(element.item, grid.children[i] ?? null)
      }
    }

    for (let i = count; i < photoElements.length; i++) {
      const element = photoElements[i]!

      unloadPhotoElement(element)
      element.item.remove()
    }
    photoElements.length = count
    activePhotoIndexes = new Set([...activePhotoIndexes].filter(index => index < count))

    if (scrollTop !== undefined) {
      grid.scrollTop = scrollTop
    }

    requestAnimationFrame(() => {
      if (resetScroll) {
        resetPhotoWallScroll()
      }
      else if (scrollTop !== undefined) {
        grid.scrollTop = scrollTop
      }

      handlePhotoWallScroll()
    })
  }

  function resetPhotoWallScroll() {
    grid.scrollTop = 0
    requestAnimationFrame(() => {
      grid.scrollTop = 0
      requestAnimationFrame(() => grid.scrollTop = 0)
    })
  }

  function checkPhotoWallScroll() {
    const range = visiblePhotoRange()

    if (range.end + photoLoadAheadSlots >= page.photos.length
      || grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 192)
    {
      void loadMorePhotos()
    }
  }

  function handlePhotoWallScroll() {
    syncVisiblePhotos()
    checkPhotoWallScroll()
  }

  function syncVisiblePhotos() {
    const range = visiblePhotoRange()
    const nextIndexes = new Set<number>()

    for (let i = range.start; i < range.end; i++) {
      nextIndexes.add(i)
    }

    for (const index of activePhotoIndexes) {
      if (!nextIndexes.has(index)) {
        syncPhotoVisibility(index, false)
      }
    }
    for (const index of nextIndexes) {
      syncPhotoVisibility(index, true)
    }

    activePhotoIndexes = nextIndexes
  }

  function visiblePhotoRange() {
    const rowHeight = grid.clientHeight / photoWallRows
    const row = rowHeight > 0 ? Math.floor(grid.scrollTop / rowHeight) : 0
    const start = Math.max(0, row * photoWallColumns)

    return {
      end: Math.min(start + photoWallPaintedSlots, photoElements.length),
      start,
    }
  }

  function syncPhotoVisibility(index: number, active: boolean) {
    const element = photoElements[index]
    const photo = element?.photo

    if (!element) {
      throw new Error(`Missing photo wall element ${index}`)
    }

    element.item.tabIndex = active && photo ? 0 : -1
    if (active && photo) {
      loadPhotoElement(element, photo)
      return
    }

    unloadPhotoElement(element)
  }

  function createPhotoElement(): PhotoElement {
    const item = document.createElement('div')
    const image = document.createElement('img')
    const like = document.createElement('button')

    item.className = 'photo-wall-item'
    item.dataset.ready = 'false'
    item.tabIndex = -1
    like.type = 'button'
    like.className = 'photo-wall-like'
    like.setAttribute('aria-label', 'like photo')
    image.decoding = 'async'
    image.loading = 'eager'
    like.addEventListener('click', event => {
      const photo = photoElements.find(element => element.like === event.currentTarget)?.photo

      event.preventDefault()
      event.stopPropagation()
      if (!photo) {
        throw new Error('Missing liked photo')
      }

      void likePhoto(photo)
    })
    item.append(image, like)

    return { decodeId: 0, image, item, like, thumbnailUrl: '' }
  }

  function syncPhotoElement(element: PhotoElement, photo: Photo | undefined) {
    element.photo = photo

    if (!photo) {
      delete element.item.dataset.photo
      element.item.onclick = null
      element.item.onkeydown = null
      element.like.disabled = true
      element.image.alt = ''
      element.item.tabIndex = -1
      unloadPhotoElement(element)
      return
    }

    const alt = new Date(photo.createdAt).toLocaleString()

    element.item.dataset.photo = 'true'
    if (element.image.alt !== alt) {
      element.image.alt = alt
    }
    syncLikeButton(element.like, photo)
    element.item.onclick = () => {
      void openViewer(photo, page.photos.indexOf(photo), element.image)
    }
    element.item.onkeydown = event => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return
      }

      event.preventDefault()
      void openViewer(photo, page.photos.indexOf(photo), element.image)
    }
  }

  function loadPhotoElement(element: PhotoElement, photo: Photo) {
    if (element.thumbnailUrl === photo.thumbnailUrl) {
      return
    }

    element.thumbnailUrl = photo.thumbnailUrl
    element.decodeId++
    element.item.dataset.ready = 'false'
    const decodeId = element.decodeId

    element.image.onload = () => {
      if (element.decodeId === decodeId && element.thumbnailUrl === photo.thumbnailUrl) {
        element.item.dataset.ready = 'true'
      }
    }
    element.image.onerror = () => {
      console.error(new Error(`Photo wall image failed ${photo.thumbnailUrl}`))
    }
    element.image.src = photo.thumbnailUrl
  }

  function unloadPhotoElement(element: PhotoElement) {
    if (element.thumbnailUrl) {
      element.decodeId++
      element.thumbnailUrl = ''
      element.image.removeAttribute('src')
    }
    element.item.dataset.ready = 'false'
  }

  async function openViewer(
    photo: Photo,
    index = page.photos.findIndex(item => item.timestamp === photo.timestamp),
    sourceImage?: HTMLImageElement,
    animate = true,
  ) {
    const openId = ++viewerOpenId
    const targetSourceImage = sourceImage ?? photoElement(photo)?.image
    const targetSourceRect = targetSourceImage?.getBoundingClientRect()

    try {
      await preloadFullPhoto(photo)
    }
    catch (e) {
      console.error(e)
      return
    }
    if (openId !== viewerOpenId) {
      return
    }

    viewerAnimation?.cancel()
    viewerClosing = false
    delete viewer.dataset.closing
    let tilt: number
    try {
      tilt = await setViewerPhoto(photo, index)
    }
    catch (e) {
      console.error(e)
      return
    }
    if (openId !== viewerOpenId) {
      return
    }
    if (!viewer.open) {
      viewer.showModal()
    }

    viewerSourceRect = targetSourceRect
    viewerSourceImage = targetSourceImage
    if (animate && targetSourceImage) {
      const targetTransform = viewerTargetTransform(tilt)
      let sourceTransform = ''

      try {
        sourceTransform = prepareViewerAtSource(targetSourceImage)
      }
      catch (e) {
        console.error(e)
        viewerClose.focus()
        return
      }

      requestAnimationFrame(() => {
        if (openId !== viewerOpenId || !viewer.open || viewerClosing) {
          return
        }

        animateViewerFrom(sourceTransform, targetTransform)
      })
    }
    viewerClose.focus()
  }

  function closeViewer() {
    if (viewerSlideBusy || viewerClosing) {
      return
    }

    const sourceImage = viewerSourceImage

    if (sourceImage && !viewerMotion.matches) {
      const tilt = viewedPhoto ? photoTilt(viewedPhoto) : 0
      const targetTransform = viewerTargetTransform(tilt)
      let sourceTransform = ''

      try {
        sourceTransform = viewerSourceTransform(sourceImage)
      }
      catch (e) {
        console.error(e)
        closeViewerNow()
        return
      }

      viewerAnimation?.cancel()
      viewerAnimation = undefined
      viewerPolaroid.style.opacity = ''
      viewerPolaroid.style.transform = ''
      viewerPolaroid.style.transformOrigin = ''
      viewerClosing = true
      viewer.dataset.closing = 'true'
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          animateViewerClose(sourceTransform, targetTransform)
        })
      })
      return
    }

    closeViewerNow()
  }

  function closeViewerNow() {
    viewerOpenId++
    viewedPhoto = undefined
    viewerAnimation?.cancel()
    viewerAnimation = undefined
    viewerClosing = false
    viewerSlideBusy = false
    viewerSourceImage = undefined
    viewerSourceRect = undefined
    delete viewer.dataset.closing
    viewerPolaroid.style.visibility = ''
    viewerPolaroid.style.opacity = ''
    viewerPolaroid.style.transform = ''
    viewerPolaroid.style.transformOrigin = ''
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
        await preloadFullPhoto(page.photos[nextIndex]!)
        await animateViewerSwap(page.photos[nextIndex]!, nextIndex, direction)
        return
      }

      viewerSlideBusy = false
    }
    catch (e) {
      viewerSlideBusy = false
      console.error(e)
    }
  }

  async function setViewerPhoto(photo: Photo, index: number) {
    viewerImage.src = photo.url
    viewerImage.alt = new Date(photo.createdAt).toLocaleString()
    await viewerImage.decode()
    viewedPhoto = photo

    const tilt = photoTilt(photo)

    viewerPolaroid.style.setProperty('--photo-viewer-tilt', `${tilt}deg`)
    syncViewerNav(index)
    syncLikeButton(viewerLike, photo)
    preloadNeighborPhotos(index)
    syncViewerSource(photo)

    return tilt
  }

  async function likePhoto(photo: Photo) {
    const response = await fetch(`/api/photos/${photo.timestamp}/likes`, { method: 'POST' })

    if (!response.ok) {
      throw new Error(`Photo like failed ${response.status}`)
    }

    const like = await jsonApiResponse<Pick<Photo, 'liked' | 'likes'> & { added: boolean }>(response, 'Photo like')
    const next = updatePhotoLike(photo, like)

    if (like.added) {
      options.onLike?.(next)
    }
  }

  function updatePhotoLike(photo: Photo, like: Pick<Photo, 'liked' | 'likes'>) {
    const timestamp = photo.timestamp
    const index = page.photos.findIndex(photo => photo.timestamp === timestamp)
    const next = { ...(page.photos[index] ?? photo), ...like }

    if (index >= 0) {
      page.photos[index] = next
    }
    const element = photoElements.find(element => element.photo?.timestamp === timestamp)

    if (element) {
      element.photo = next
      syncLikeButton(element.like, next)
    }
    if (viewedPhoto?.timestamp === timestamp) {
      viewedPhoto = next
      syncLikeButton(viewerLike, next)
    }

    return next
  }

  function photoElement(photo: Photo) {
    return photoElements.find(element => element.photo?.timestamp === photo.timestamp)
  }

  function preloadNeighborPhotos(index: number) {
    const previous = page.photos[index - 1]
    const next = page.photos[index + 1]

    if (previous) {
      void preloadFullPhoto(previous).catch(e => console.error(e))
    }
    if (next) {
      void preloadFullPhoto(next).catch(e => console.error(e))
    }
  }

  function preloadFullPhoto(photo: Photo) {
    const existing = fullPhotoPreloads.get(photo.url)

    if (existing) {
      return existing
    }

    const next = preloadPhoto(photo).catch(e => {
      fullPhotoPreloads.delete(photo.url)
      throw e
    })

    fullPhotoPreloads.set(photo.url, next)

    return next
  }

  function syncViewerNav(index: number) {
    viewerPrevious.disabled = loading || index <= 0
    viewerNext.disabled = loading || index + 1 >= page.total
  }

  function syncViewedPhoto() {
    if (!viewedPhoto) {
      return
    }

    syncViewerSource(viewedPhoto)
    syncViewerNav(page.photos.findIndex(photo => photo.timestamp === viewedPhoto!.timestamp))
  }

  function syncViewerSource(photo: Photo) {
    const source = photoElement(photo)?.image

    viewerSourceImage = source
    viewerSourceRect = source?.getBoundingClientRect()
  }

  function animateViewerFrom(sourceTransform: string, targetTransform: string) {
    if (viewerMotion.matches) {
      return
    }

    viewerAnimation = viewerPolaroid.animate([
      {
        opacity: 0.72,
        transform: sourceTransform,
      },
      {
        opacity: 1,
        transform: targetTransform,
      },
    ], {
      duration: viewerMotionDuration,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    })
    viewerPolaroid.style.opacity = ''
    viewerPolaroid.style.transform = ''
    viewerAnimation.addEventListener('finish', () => {
      viewerPolaroid.style.transformOrigin = ''
      viewerAnimation = undefined
    }, { once: true })
  }

  function prepareViewerAtSource(sourceImage: HTMLImageElement) {
    if (viewerMotion.matches) {
      return ''
    }

    const transform = viewerSourceTransform(sourceImage)

    viewerPolaroid.style.opacity = '0.72'
    viewerPolaroid.style.transformOrigin = '0 0'
    viewerPolaroid.style.transform = transform

    return transform
  }

  function viewerSourceTransform(sourceImage: HTMLImageElement) {
    const targetRect = viewerImage.getBoundingClientRect()
    const sourceQuad = sourceImageQuad(sourceImage)
    const imageTransform = new DOMMatrix(projectedQuadTransform(targetRect.width, targetRect.height, sourceQuad))
    const polaroidRect = viewerPolaroid.getBoundingClientRect()
    const imageOffsetX = targetRect.left - polaroidRect.left
    const imageOffsetY = targetRect.top - polaroidRect.top

    imageTransform.translateSelf(-imageOffsetX, -imageOffsetY)

    return imageTransform.toString()
  }

  function viewerTargetTransform(tilt: number) {
    const rect = viewerPolaroid.getBoundingClientRect()
    const centerX = rect.width * 0.5
    const centerY = rect.height * 0.5

    return `translate(${centerX}px, ${centerY}px) rotate(${tilt}deg) translate(${-centerX}px, ${-centerY}px)`
  }

  function sourceImageQuad(sourceImage: HTMLImageElement) {
    const wallTransform = new DOMMatrix(getComputedStyle(element).transform)
    const x = sourceImage.offsetLeft + sourceImage.parentElement!.offsetLeft + grid.offsetLeft + panel.offsetLeft
    const y = sourceImage.offsetTop + sourceImage.parentElement!.offsetTop + grid.offsetTop + panel.offsetTop
      - grid.scrollTop
    const width = sourceImage.offsetWidth
    const height = sourceImage.offsetHeight

    return [
      matrixPoint(wallTransform, x, y + height),
      matrixPoint(wallTransform, x + width, y + height),
      matrixPoint(wallTransform, x + width, y),
      matrixPoint(wallTransform, x, y),
    ]
  }

  function matrixPoint(matrix: DOMMatrix, x: number, y: number) {
    const point = matrix.transformPoint({ x, y })
    const scale = point.w || 1

    return {
      x: point.x / scale,
      y: point.y / scale,
    }
  }

  async function animateViewerSwap(photo: Photo, index: number, direction: -1 | 1) {
    if (viewerMotion.matches) {
      await setViewerPhoto(photo, index)
      viewerSlideBusy = false
      return
    }

    const currentRect = viewerPolaroid.getBoundingClientRect()
    const currentPhoto = viewedPhoto!
    const outgoing = viewerPolaroid.cloneNode(true) as HTMLElement
    const currentTilt = photoTilt(currentPhoto)
    const distance = Math.max(innerWidth, currentRect.width) + currentRect.width
    const incomingX = direction > 0 ? distance : -distance
    const outgoingX = -incomingX

    viewerAnimation?.cancel()
    prepareSlideClone(outgoing, currentRect)
    viewerStage.append(outgoing)
    viewerPolaroid.style.visibility = 'hidden'
    let nextTilt: number
    try {
      nextTilt = await setViewerPhoto(photo, index)
    }
    catch (e) {
      outgoing.remove()
      viewerPolaroid.style.visibility = ''
      throw e
    }
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

  function animateViewerClose(sourceTransform: string, targetTransform: string) {
    viewerAnimation?.cancel()
    viewerPolaroid.style.transformOrigin = '0 0'
    viewerAnimation = viewerPolaroid.animate([
      {
        opacity: 1,
        transform: targetTransform,
      },
      {
        opacity: 0,
        transform: sourceTransform,
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
    b.createdAt === a.createdAt ? b.timestamp - a.timestamp : b.createdAt - a.createdAt
  )
}

function syncLikeButton(button: HTMLButtonElement, photo: Photo) {
  button.disabled = photo.liked
  button.dataset.liked = String(photo.liked)
  button.textContent = `❤️ ${photo.likes}`
}

async function jsonApiResponse<T>(response: Response, label: string): Promise<T> {
  const type = response.headers.get('content-type') ?? ''

  if (!type.includes('application/json')) {
    throw new Error(`${label} returned ${type || 'unknown content-type'}`)
  }

  return await response.json() as T
}
