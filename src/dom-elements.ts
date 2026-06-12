let domElements: DomElements | undefined

export function getDomElements() {
  domElements ??= createDomElements()

  return domElements
}

function createDomElements() {
  const canvas = document.createElement('canvas')
  const djVideo = document.createElement('div')
  const photoWall = document.createElement('div')
  const scheduleWall = document.createElement('div')
  const chatForm = document.createElement('form')
  const chatInput = document.createElement('input')
  const chatSubmit = document.createElement('button')
  const chatBubble = document.createElement('div')
  const onlineIndicator = document.createElement('div')
  const onlineSelf = document.createElement('span')
  const onlineText = document.createElement('span')
  const onlineCount = document.createElement('div')
  const chatLog = document.createElement('div')
  const reactionButtons = document.createElement('div')
  const sunglassesOverlay = document.createElement('div')
  const photoButton = document.createElement('button')
  const sunglassesButton = document.createElement('button')
  const perspectiveButton = document.createElement('button')
  const cameraButton = document.createElement('button')
  const breakdanceButton = document.createElement('button')
  const waveButton = document.createElement('button')
  const bubbleButton = document.createElement('button')
  const foamButton = document.createElement('button')
  const roomsButton = document.createElement('button')
  const supportLink = document.createElement('a')
  const merchCards = document.createElement('div')
  const maleTShirtLink = document.createElement('a')
  const femaleTShirtLink = document.createElement('a')
  const maleTShirtImage = document.createElement('img')
  const femaleTShirtImage = document.createElement('img')
  const intro = document.createElement('div')
  const introEffect = document.createElement('canvas')
  const introPanel = document.createElement('div')
  const introLogo = document.createElement('div')
  const introLogoTitle = document.createElement('div')
  const introLogoSubtext = document.createElement('div')
  const introNicknameField = document.createElement('label')
  const introNicknameIcon = document.createElement('img')
  const introNicknameInput = document.createElement('input')
  const introInstagramField = document.createElement('label')
  const introInstagramIcon = document.createElement('img')
  const introInstagramInput = document.createElement('input')
  const introStart = document.createElement('button')
  const introGithub = document.createElement('a')
  const introGithubIcon = document.createElement('img')
  const introTrack = document.createElement('div')
  const introBar = document.createElement('div')
  const introProgress = document.createElement('div')

  canvas.id = 'scene'
  canvas.className = 'block'
  canvas.tabIndex = -1

  djVideo.id = 'dj-video'
  djVideo.className = 'absolute border-0 opacity-0'

  photoWall.id = 'photo-wall'
  photoWall.className = 'absolute opacity-0'

  scheduleWall.id = 'schedule-wall'
  scheduleWall.className = 'absolute opacity-0'

  chatForm.id = 'chat-form'
  chatForm.className = 'absolute opacity-0'

  chatInput.id = 'chat-input'
  chatInput.maxLength = 120
  chatInput.placeholder = 'message...'
  chatInput.autocomplete = 'off'
  chatInput.enterKeyHint = 'send'

  chatSubmit.type = 'submit'
  chatSubmit.hidden = true

  chatBubble.id = 'chat-bubble'
  chatBubble.className = 'absolute left-0 top-0 z-20'

  onlineIndicator.id = 'online-indicator'
  onlineSelf.id = 'online-self'
  onlineText.id = 'online-text'
  onlineCount.id = 'online-count'
  onlineSelf.textContent = '<0>'
  onlineText.textContent = ' 0 online'
  chatLog.id = 'chat-log'
  reactionButtons.id = 'reaction-buttons'
  sunglassesOverlay.id = 'sunglasses-overlay'
  sunglassesOverlay.dataset.active = 'false'
  photoButton.id = 'photo-button'
  photoButton.type = 'button'
  photoButton.textContent = '📸'
  photoButton.setAttribute('aria-label', 'take photo')
  sunglassesButton.id = 'sunglasses-button'
  sunglassesButton.type = 'button'
  sunglassesButton.textContent = '😎'
  sunglassesButton.setAttribute('aria-label', 'sunglasses')
  sunglassesButton.setAttribute('aria-pressed', 'false')
  perspectiveButton.id = 'perspective-button'
  perspectiveButton.type = 'button'
  perspectiveButton.textContent = '👀'
  perspectiveButton.setAttribute('aria-label', 'view mode')
  perspectiveButton.setAttribute('aria-pressed', 'false')
  cameraButton.id = 'camera-button'
  cameraButton.type = 'button'
  cameraButton.textContent = '🖱️'
  cameraButton.setAttribute('aria-label', 'camera control')
  cameraButton.setAttribute('aria-pressed', 'false')
  breakdanceButton.id = 'breakdance-button'
  breakdanceButton.type = 'button'
  breakdanceButton.textContent = '🤸'
  breakdanceButton.setAttribute('aria-label', 'breakdance')
  waveButton.id = 'wave-button'
  waveButton.type = 'button'
  waveButton.textContent = '🙌'
  waveButton.setAttribute('aria-label', 'wave')
  bubbleButton.id = 'bubble-button'
  bubbleButton.type = 'button'
  bubbleButton.textContent = '🫧'
  bubbleButton.setAttribute('aria-label', 'bubbles')
  foamButton.id = 'foam-button'
  foamButton.type = 'button'
  foamButton.textContent = '🧼'
  foamButton.setAttribute('aria-label', 'foam')
  roomsButton.id = 'rooms-button'
  roomsButton.type = 'button'
  roomsButton.textContent = '🏘️'
  roomsButton.setAttribute('aria-label', 'rooms')

  supportLink.id = 'support-link'
  supportLink.href = 'https://buymeacoffee.com/stagas'
  supportLink.target = '_blank'
  supportLink.rel = 'noopener noreferrer'
  supportLink.textContent = '💊'

  merchCards.id = 'merch-cards'
  merchCards.dataset.open = 'false'
  maleTShirtLink.className = 'merch-card'
  maleTShirtLink.href = 'https://stagas.creator-spring.com/listing/hallucinate-male-t-shirt'
  maleTShirtLink.target = '_blank'
  maleTShirtLink.rel = 'noopener noreferrer'
  maleTShirtLink.setAttribute('aria-label', 'male t-shirt')
  femaleTShirtLink.className = 'merch-card'
  femaleTShirtLink.href = 'https://stagas.creator-spring.com/listing/hallucinate-female-t-shirt'
  femaleTShirtLink.target = '_blank'
  femaleTShirtLink.rel = 'noopener noreferrer'
  femaleTShirtLink.setAttribute('aria-label', 'female t-shirt')
  maleTShirtImage.src = '/male-t-shirt.jpg'
  maleTShirtImage.alt = 'male t-shirt'
  femaleTShirtImage.src = '/female-t-shirt.jpg'
  femaleTShirtImage.alt = 'female t-shirt'

  intro.id = 'intro'
  introEffect.id = 'intro-effect'
  introPanel.id = 'intro-panel'
  introLogo.id = 'intro-logo'
  introLogoTitle.id = 'intro-logo-title'
  introLogoSubtext.id = 'intro-logo-subtext'
  introNicknameField.id = 'intro-nickname-field'
  introNicknameIcon.id = 'intro-nickname-icon'
  introNicknameInput.id = 'intro-nickname-input'
  introInstagramField.id = 'intro-instagram-field'
  introInstagramIcon.id = 'intro-instagram-icon'
  introInstagramInput.id = 'intro-instagram-input'
  introStart.id = 'intro-start'
  introGithub.id = 'intro-github'
  introGithubIcon.id = 'intro-github-icon'
  introTrack.id = 'intro-track'
  introBar.id = 'intro-bar'
  introProgress.id = 'intro-progress'
  introLogoTitle.textContent = 'hallucinate'
  introLogoSubtext.textContent = 'Massively Multiplayer Online Rave'
  introNicknameField.setAttribute('aria-label', 'Nickname')
  introNicknameIcon.src = '/user.svg'
  introNicknameIcon.alt = ''
  introNicknameInput.maxLength = 32
  introNicknameInput.pattern = '[^<>\\n]+'
  introNicknameInput.placeholder = 'Your nickname (required)'
  introNicknameInput.required = true
  introNicknameInput.setAttribute('autocomplete', 'nickname')
  introNicknameInput.setAttribute('enterkeyhint', 'done')
  introInstagramField.setAttribute('aria-label', 'Instagram')
  introInstagramIcon.src = '/instagram.svg'
  introInstagramIcon.alt = ''
  introInstagramInput.maxLength = 30
  introInstagramInput.placeholder = 'Your Instagram id (optional)'
  introInstagramInput.autocomplete = 'username'
  introInstagramInput.setAttribute('enterkeyhint', 'done')
  introStart.type = 'button'
  introStart.textContent = 'enter'
  introGithub.href = 'https://github.com/stagas/hallucinate'
  introGithub.target = '_blank'
  introGithub.rel = 'noopener noreferrer'
  introGithub.setAttribute('aria-label', 'GitHub')
  introGithubIcon.src = '/github.svg'
  introGithubIcon.alt = ''
  introProgress.textContent = '0%'

  chatForm.append(chatInput, chatSubmit)
  onlineCount.append(onlineSelf, onlineText)
  onlineIndicator.append(chatLog, onlineCount)
  introTrack.append(introBar)
  maleTShirtLink.append(maleTShirtImage)
  femaleTShirtLink.append(femaleTShirtImage)
  merchCards.append(maleTShirtLink, femaleTShirtLink)
  introNicknameField.append(introNicknameIcon, introNicknameInput)
  introInstagramField.append(introInstagramIcon, introInstagramInput)
  introPanel.append(introTrack, introProgress, introNicknameField, introInstagramField, introStart)
  introGithub.append(introGithubIcon)
  intro.append(introEffect, introPanel, introGithub)
  document.body.prepend(canvas, djVideo, photoWall, scheduleWall, sunglassesOverlay, chatForm, chatBubble,
    onlineIndicator, reactionButtons, waveButton, bubbleButton, foamButton, breakdanceButton, sunglassesButton,
    perspectiveButton, cameraButton, photoButton, roomsButton, supportLink, merchCards, intro)

  return {
    canvas,
    djVideo,
    photoWall,
    scheduleWall,
    chatForm,
    chatInput,
    chatBubble,
    chatLog,
    onlineCount,
    onlineIndicator,
    onlineSelf,
    onlineText,
    reactionButtons,
    sunglassesOverlay,
    sunglassesButton,
    perspectiveButton,
    cameraButton,
    breakdanceButton,
    waveButton,
    bubbleButton,
    foamButton,
    photoButton,
    roomsButton,
    supportLink,
    merchCards,
    intro,
    introEffect,
    introBar,
    introInstagramInput,
    introNicknameInput,
    introProgress,
    introStart,
  }
}

export type DomElements = ReturnType<typeof createDomElements>
