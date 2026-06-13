export function galleryHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Hallucinate Gallery</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Black+And+White+Picture&family=Iansui&display=block" rel="stylesheet">
    <style>
      * {
        box-sizing: border-box;
        outline: none;
        user-select: none;
      }

      html {
        background: #050505;
        color: #f8fafc;
        color-scheme: dark;
        font-family: "Iansui", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        margin: 0;
        min-height: 100dvh;
        width: 100dvw;
      }

      main {
        margin: 0 auto;
        min-height: 100dvh;
        padding: 22px;
        width: min(1480px, 100dvw);
      }

      header {
        display: grid;
        gap: 12px;
        justify-items: center;
        margin-bottom: 18px;
        text-align: center;
      }

      #logo {
        align-items: baseline;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: center;
        line-height: 1;
      }

      #join-bar {
        display: grid;
        justify-items: center;
        margin-bottom: 18px;
        position: sticky;
        top: 12px;
        z-index: 20;
      }

      #logo-title,
      #logo-subtext {
        font-family: "Black And White Picture", "Iansui", ui-sans-serif, system-ui, sans-serif;
        font-weight: 400;
        letter-spacing: 0;
        margin: 0;
      }

      #logo-title {
        background: linear-gradient(180deg, rgb(8 32 116), rgb(0 196 255) 42%, rgb(255 32 48) 78%);
        background-clip: text;
        color: transparent;
        font-size: clamp(52px, 9dvw, 84px);
        line-height: 0.88;
        text-shadow: 0 0 26px rgb(255 0 0 / 0.24);
      }

      #logo-subtext {
        color: rgb(255 255 255 / 0.82);
        font-size: clamp(26px, 4.2dvw, 42px);
        line-height: 1;
        text-shadow: 0 0 12px rgb(255 0 0 / 0.35);
      }

      .join {
        align-content: center;
        background:
          linear-gradient(180deg, rgb(8 32 116), rgb(0 196 255) 42%, rgb(255 32 48) 78%),
          rgb(255 32 48);
        border: 1px solid rgb(255 255 255 / 0.28);
        border-bottom-color: rgb(255 255 255 / 0.1);
        border-radius: 7px;
        box-shadow:
          inset 0 1px 0 rgb(255 255 255 / 0.22),
          inset 0 -3px 0 rgb(0 0 0 / 0.34),
          0 3px 0 rgb(0 0 0 / 0.52),
          0 0 18px rgb(255 0 0 / 0.28),
          0 0 34px rgb(0 196 255 / 0.18);
        color: rgb(255 248 248);
        display: grid;
        font: 900 13px/1 "Iansui", ui-sans-serif, system-ui, sans-serif;
        height: 34px;
        letter-spacing: 0;
        min-width: 156px;
        padding: 0 16px;
        text-align: center;
        text-decoration: none;
        text-shadow:
          0 0 8px rgb(255 20 20 / 0.48),
          0 0 16px rgb(0 196 255 / 0.18);
        text-transform: uppercase;
      }

      .join:hover {
        background:
          linear-gradient(180deg, rgb(10 42 148), rgb(18 214 255) 42%, rgb(255 45 62) 78%),
          rgb(255 45 62);
        border-color: rgb(255 255 255 / 0.38);
      }

      .join:active {
        box-shadow:
          inset 0 1px 0 rgb(255 255 255 / 0.16),
          inset 0 -1px 0 rgb(0 0 0 / 0.34),
          0 1px 0 rgb(0 0 0 / 0.52),
          0 0 14px rgb(255 0 0 / 0.18);
        transform: translateY(2px);
      }

      #grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      }

      .photo {
        appearance: none;
        aspect-ratio: 1;
        background: #111;
        border: 1px solid #27272a;
        border-radius: 6px;
        cursor: zoom-in;
        display: block;
        overflow: hidden;
        padding: 0;
        position: relative;
        width: 100%;
      }

      .photo img {
        display: block;
        height: 100%;
        image-rendering: crisp-edges;
        image-rendering: pixelated;
        object-fit: cover;
        width: 100%;
      }

      .photo-like {
        background: rgb(0 0 0 / 0.62);
        border-radius: 999px;
        bottom: 7px;
        color: white;
        font-size: 13px;
        font-weight: 700;
        left: 7px;
        line-height: 1;
        padding: 7px 9px;
        pointer-events: none;
        position: absolute;
      }

      #status {
        color: #a1a1aa;
        display: grid;
        justify-items: center;
        min-height: 44px;
        padding: 18px 0 6px;
        text-align: center;
      }

      dialog {
        background: transparent;
        border: 0;
        height: 100dvh;
        max-height: 100dvh;
        max-width: none;
        margin: 0;
        overflow: hidden;
        padding: 0;
        position: fixed;
        inset: 0;
        width: 100dvw;
      }

      dialog[open] {
        display: block;
      }

      dialog::backdrop {
        background: rgb(0 0 0 / 0.82);
      }

      #viewer-stage {
        display: grid;
        height: 100dvh;
        overflow: hidden;
        place-items: center;
        position: fixed;
        inset: 0;
        touch-action: pan-y;
        width: 100dvw;
      }

      #viewer-polaroid,
      .viewer-polaroid-slide {
        background: #f8f4eb;
        border-radius: 3px;
        box-shadow:
          0 22px 70px rgb(0 0 0 / 0.58),
          0 5px 0 rgb(0 0 0 / 0.18);
        display: grid;
        gap: 14px;
        max-height: calc(100dvh - 56px);
        max-width: calc(100dvw - 72px);
        padding: 16px 16px 62px;
        position: relative;
        transform: rotate(var(--viewer-tilt, 1.4deg));
        width: max-content;
      }

      .viewer-polaroid-slide {
        left: 50%;
        pointer-events: none;
        position: absolute;
        top: 50%;
        transform-origin: center center;
        translate: -50% -50%;
      }

      #viewer-polaroid {
        transform-origin: center center;
        touch-action: pan-y;
      }

      #viewer-image,
      .viewer-image {
        background: #111;
        display: block;
        height: auto;
        image-rendering: crisp-edges;
        image-rendering: pixelated;
        max-height: min(520px, calc(100dvh - 134px));
        max-width: min(640px, calc(100dvw - 104px));
        object-fit: contain;
        width: auto;
      }

      .viewer-control {
        appearance: none;
        background: rgb(255 255 255 / 0.92);
        border: 1px solid rgb(0 0 0 / 0.18);
        border-radius: 999px;
        bottom: 14px;
        color: #111;
        cursor: pointer;
        font: inherit;
        font-size: 24px;
        font-weight: 760;
        height: 38px;
        line-height: 1;
        padding: 0;
        position: absolute;
        width: 38px;
      }

      .viewer-control:disabled {
        cursor: default;
        opacity: 0.25;
      }

      #previous,
      .viewer-previous {
        left: calc(50% - 52px);
        transform: translateX(-50%);
      }

      #like,
      .viewer-like {
        font-size: 17px;
        left: calc(50% + 52px);
        min-width: 52px;
        padding: 0 12px;
        transform: translateX(-50%);
        width: auto;
      }

      #next,
      .viewer-next {
        left: calc(50% + 104px);
        transform: translateX(-50%);
      }

      #close,
      .viewer-close {
        left: 50%;
        transform: translateX(-50%);
      }

      #close::before,
      #close::after,
      .viewer-close::before,
      .viewer-close::after {
        background: currentColor;
        content: "";
        height: 18px;
        left: 50%;
        position: absolute;
        top: 50%;
        width: 3px;
      }

      #close::before,
      .viewer-close::before {
        transform: translate(-50%, -50%) rotate(45deg);
      }

      #close::after,
      .viewer-close::after {
        transform: translate(-50%, -50%) rotate(-45deg);
      }

      @media (max-width: 640px) {
        main {
          padding: 14px;
        }

        header {
          align-items: start;
          flex-direction: column;
        }

        #grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        #viewer-polaroid {
          max-width: calc(100dvw - 28px);
          padding: 10px 10px 58px;
        }

        #viewer-image,
        .viewer-image {
          max-height: calc(100dvh - 126px);
          max-width: calc(100dvw - 48px);
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1 id="logo" aria-label="hallucinate Gallery">
          <span id="logo-title">hallucinate</span>
          <span id="logo-subtext">Gallery</span>
        </h1>
      </header>
      <div id="join-bar">
        <a class="join" href="/">JOIN THE RAVE</a>
      </div>
      <section id="grid" aria-label="photos"></section>
      <div id="status" role="status">Loading</div>
    </main>
    <dialog id="viewer">
      <div id="viewer-stage">
        <div id="viewer-polaroid">
          <img class="viewer-image" id="viewer-image" alt="photo">
          <button class="viewer-control viewer-previous" id="previous" type="button" aria-label="previous photo">👈</button>
          <button class="viewer-control viewer-like" id="like" type="button" aria-label="like photo"></button>
          <button class="viewer-control viewer-next" id="next" type="button" aria-label="next photo">👉</button>
          <button class="viewer-control viewer-close" id="close" type="button" aria-label="close photo"></button>
        </div>
      </div>
    </dialog>
    <script type="module">
      const grid = document.querySelector('#grid')
      const status = document.querySelector('#status')
      const viewer = document.querySelector('#viewer')
      const viewerStage = document.querySelector('#viewer-stage')
      const viewerImage = document.querySelector('#viewer-image')
      const viewerPolaroid = document.querySelector('#viewer-polaroid')
      const previous = document.querySelector('#previous')
      const next = document.querySelector('#next')
      const like = document.querySelector('#like')
      const close = document.querySelector('#close')
      const photos = []
      const elements = new Map()
      const preloads = new Map()
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          loadNextPage().catch(e => fail(e))
        }
      }, { rootMargin: '900px' })

      let loading = false
      let loadingPage
      let offset = 0
      let total = Number.POSITIVE_INFINITY
      let viewerAnimation
      let viewerSlideBusy = false
      let swipeStart
      let viewedPhoto

      observer.observe(status)
      close.addEventListener('click', () => closeViewer())
      previous.addEventListener('click', () => moveViewer(-1).catch(e => fail(e)))
      next.addEventListener('click', () => moveViewer(1).catch(e => fail(e)))
      like.addEventListener('click', () => {
        if (!viewedPhoto) {
          throw new Error('Missing viewed photo')
        }

        likePhoto(viewedPhoto).catch(e => fail(e))
      })
      viewer.addEventListener('cancel', event => {
        event.preventDefault()
        closeViewer()
      })
      viewer.addEventListener('click', event => {
        if (event.target === viewer || event.target.id === 'viewer-stage') {
          closeViewer()
        }
      })
      viewer.addEventListener('keydown', event => {
        if (event.key === 'Escape' || event.key.toLowerCase() === 'x') {
          event.preventDefault()
          closeViewer()
          return
        }

        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          moveViewer(-1).catch(e => fail(e))
          return
        }

        if (event.key === 'ArrowRight') {
          event.preventDefault()
          moveViewer(1).catch(e => fail(e))
        }
      })
      viewerStage.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'touch' || event.target instanceof HTMLButtonElement) {
          return
        }

        swipeStart = { id: event.pointerId, x: event.clientX, y: event.clientY }
        viewerStage.setPointerCapture(event.pointerId)
      })
      viewerStage.addEventListener('pointerup', event => {
        if (!swipeStart || event.pointerId !== swipeStart.id) {
          return
        }

        const x = event.clientX - swipeStart.x
        const y = event.clientY - swipeStart.y

        swipeStart = undefined
        if (Math.abs(x) < 46 || Math.abs(x) < Math.abs(y) * 1.4) {
          return
        }

        moveViewer(x < 0 ? 1 : -1).catch(e => fail(e))
      })
      viewerStage.addEventListener('pointercancel', event => {
        if (swipeStart?.id === event.pointerId) {
          swipeStart = undefined
        }
      })

      async function loadNextPage() {
        if (loadingPage) {
          return await loadingPage
        }

        if (offset >= total) {
          return
        }

        loadingPage = appendNextPage()
        await loadingPage
        loadingPage = undefined
      }

      async function appendNextPage() {
        loading = true
        renderStatus('Loading')
        const page = await fetchPhotoPage(offset)

        offset = page.offset + page.photos.length
        total = page.total
        for (const photo of page.photos) {
          photos.push(photo)
          grid.append(photoElement(photo))
        }

        renderStatus(offset < total ? 'Loading more' : (total ? '' : 'No photos yet'))
        loading = false
        syncViewerNav()
      }

      function photoElement(photo) {
        const button = document.createElement('button')
        const image = document.createElement('img')
        const badge = document.createElement('span')
        const date = new Date(photo.createdAt).toLocaleString()

        button.className = 'photo'
        button.type = 'button'
        button.setAttribute('aria-label', 'open photo from ' + date)
        badge.className = 'photo-like'
        image.alt = date
        image.decoding = 'async'
        image.loading = 'lazy'
        image.src = photo.thumbnailUrl
        image.onerror = () => console.error(new Error('Gallery thumbnail failed ' + photo.thumbnailUrl))
        button.addEventListener('click', () => openViewer(photo))
        button.append(image, badge)
        elements.set(photo.timestamp, { badge, button })
        syncPhotoElement(photo)

        return button
      }

      async function openViewer(photo) {
        await setViewerPhoto(photo)
        viewer.showModal()
      }

      function closeViewer() {
        if (viewer.open) {
          viewer.close()
        }
      }

      async function moveViewer(direction) {
        if (!viewedPhoto) {
          throw new Error('Missing viewed photo')
        }

        if (viewerAnimation || viewerSlideBusy) {
          return
        }

        viewerSlideBusy = true
        let index = photoIndex(viewedPhoto)

        try {
          if (direction > 0 && index >= photos.length - 2 && photos.length < total) {
            await loadNextPage()
            index = photoIndex(viewedPhoto)
          }

          const photo = photos[index + direction]

          if (photo) {
            await animateViewerSwap(photo, direction)
            return
          }

          viewerSlideBusy = false
        }
        catch (e) {
          viewerSlideBusy = false
          throw e
        }
      }

      async function setViewerPhoto(photo, syncNav = true) {
        const index = photoIndex(photo)
        const date = new Date(photo.createdAt).toLocaleString()
        const tilt = photoTilt(photo)

        viewerImage.src = photo.url
        viewerImage.alt = date
        viewerPolaroid.style.setProperty('--viewer-tilt', tilt + 'deg')
        viewedPhoto = photo
        syncLikeButton(like, photo)
        if (syncNav) {
          syncViewerNav()
        }
        preloadNeighbors(index)
        await viewerImage.decode()

        return tilt
      }

      async function animateViewerSwap(photo, direction) {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
          await setViewerPhoto(photo)
          viewerSlideBusy = false
          return
        }

        await preloadFullPhoto(photo)
        const currentRect = viewerPolaroid.getBoundingClientRect()
        const currentImageRect = viewerImage.getBoundingClientRect()
        const currentPhoto = viewedPhoto
        const outgoing = createOutgoingSlide(currentRect, currentImageRect)
        const currentTilt = photoTilt(currentPhoto)
        const distance = slideDistance(currentRect)
        const incomingX = direction > 0 ? distance : -distance
        const outgoingX = -incomingX

        viewerAnimation?.cancel()
        viewerStage.append(outgoing)
        outgoing.getBoundingClientRect()
        await animationFrame()
        viewerPolaroid.style.visibility = 'hidden'
        let nextTilt
        try {
          nextTilt = await setViewerPhoto(photo, false)
        }
        catch (e) {
          outgoing.remove()
          viewerPolaroid.style.visibility = ''
          viewerPolaroid.style.transform = ''
          throw e
        }
        viewerPolaroid.style.transform = 'translateX(' + incomingX + 'px) rotate(' + nextTilt + 'deg)'
        viewerPolaroid.getBoundingClientRect()
        viewerPolaroid.style.visibility = ''

        const outgoingSlide = outgoing.animate([
          { transform: 'translateX(0) rotate(' + currentTilt + 'deg)' },
          { transform: 'translateX(' + outgoingX + 'px) rotate(' + currentTilt + 'deg)' },
        ], {
          duration: 420,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        })
        const incomingAnimation = viewerPolaroid.animate([
          { transform: 'translateX(' + incomingX + 'px) rotate(' + nextTilt + 'deg)' },
          { transform: 'translateX(0) rotate(' + nextTilt + 'deg)' },
        ], {
          duration: 420,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        })

        viewerAnimation = outgoingSlide
        incomingAnimation.addEventListener('finish', () => {
          outgoing.remove()
          viewerAnimation = undefined
          viewerSlideBusy = false
          viewerPolaroid.style.transform = ''
          syncViewerNav()
          close.focus()
        }, { once: true })
      }

      function createOutgoingSlide(rect, imageRect) {
        const slide = document.createElement('div')
        const image = document.createElement('img')

        slide.className = 'viewer-polaroid-slide'
        slide.style.height = rect.height + 'px'
        slide.style.maxHeight = 'none'
        slide.style.maxWidth = 'none'
        slide.style.pointerEvents = 'none'
        slide.style.width = rect.width + 'px'
        image.className = 'viewer-image'
        image.alt = viewerImage.alt
        image.src = viewerImage.currentSrc || viewerImage.src
        image.style.height = imageRect.height + 'px'
        image.style.maxHeight = 'none'
        image.style.maxWidth = 'none'
        image.style.width = imageRect.width + 'px'
        slide.append(image)

        return slide
      }

      function slideDistance(rect) {
        const margin = 28
        const leftDistance = rect.right + margin
        const rightDistance = innerWidth - rect.left + margin

        return Math.max(leftDistance, rightDistance)
      }

      function animationFrame() {
        return new Promise(resolve => requestAnimationFrame(resolve))
      }

      async function likePhoto(photo) {
        const response = await fetch('/api/photos/' + photo.timestamp + '/likes', { method: 'POST' })

        if (!response.ok) {
          throw new Error('Photo like failed ' + response.status)
        }

        updatePhotoLike(photo, await response.json())
      }

      function updatePhotoLike(photo, like) {
        const index = photoIndex(photo)
        const nextPhoto = { ...photos[index], liked: like.liked, likes: like.likes }

        photos[index] = nextPhoto
        viewedPhoto = viewedPhoto?.timestamp === nextPhoto.timestamp ? nextPhoto : viewedPhoto
        syncPhotoElement(nextPhoto)
        syncLikeButton(like, nextPhoto)
      }

      function syncPhotoElement(photo) {
        const element = elements.get(photo.timestamp)

        element.badge.textContent = '❤️ ' + photo.likes
        element.badge.hidden = photo.likes === 0
      }

      function syncLikeButton(button, photo) {
        button.disabled = photo.liked
        button.textContent = '❤️ ' + photo.likes
      }

      function syncViewerNav() {
        if (!viewedPhoto) {
          previous.disabled = true
          next.disabled = true
          return
        }

        const index = photoIndex(viewedPhoto)

        previous.disabled = index <= 0
        next.disabled = index >= total - 1 && photos.length >= total
      }

      function preloadNeighbors(index) {
        for (const photo of [photos[index - 1], photos[index + 1]]) {
          if (photo && !preloads.has(photo.url)) {
            preloads.set(photo.url, preloadFullPhoto(photo).catch(e => {
              preloads.delete(photo.url)
              console.error(e)
            }))
          }
        }
      }

      function preloadFullPhoto(photo) {
        const existing = preloads.get(photo.url)

        if (existing) {
          return existing
        }

        const image = new Image()

        image.src = photo.url
        const preload = image.decode()
        preloads.set(photo.url, preload)

        return preload
      }

      function photoIndex(photo) {
        const index = photos.findIndex(item => item.timestamp === photo.timestamp)

        if (index < 0) {
          throw new Error('Missing gallery photo ' + photo.timestamp)
        }

        return index
      }

      function photoTilt(photo) {
        const seed = Math.sin(photo.timestamp * 0.00037 + photo.createdAt * 0.000011) * 43758.5453123
        const unit = seed - Math.floor(seed)

        return unit * 5.6 - 2.8
      }

      function fail(e) {
        console.error(e)
        renderStatus('Gallery failed to load')
        loading = false
        loadingPage = undefined
      }

      function renderStatus(text) {
        status.replaceChildren()
        if (text) {
          status.textContent = text
          return
        }

        const join = document.createElement('a')

        join.className = 'join'
        join.href = '/'
        join.textContent = 'JOIN THE RAVE'
        status.append(join)
      }

      async function fetchPhotoPage(offset) {
        const response = await fetch('/api/photos?offset=' + offset, { cache: 'no-store' })

        if (!response.ok) {
          throw new Error('Gallery photos failed ' + response.status)
        }

        return await response.json()
      }
    </script>
  </body>
</html>`
}
