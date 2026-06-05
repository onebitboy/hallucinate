export function getDomElements() {
  const canvas = document.createElement('canvas')
  const djVideo = document.createElement('div')
  const chatForm = document.createElement('form')
  const nicknameInput = document.createElement('input')
  const chatInput = document.createElement('input')
  const chatSubmit = document.createElement('button')
  const chatBubble = document.createElement('div')
  const onlineIndicator = document.createElement('div')
  const onlineSelf = document.createElement('span')
  const onlineText = document.createElement('span')
  const onlineCount = document.createElement('div')
  const chatLog = document.createElement('div')
  const reactionButtons = document.createElement('div')
  const roomsButton = document.createElement('button')
  const supportLink = document.createElement('a')
  const intro = document.createElement('div')
  const introPanel = document.createElement('div')
  const introLogo = document.createElement('div')
  const introLogoTitle = document.createElement('div')
  const introLogoSubtext = document.createElement('div')
  const introNicknameInput = document.createElement('input')
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

  chatForm.id = 'chat-form'
  chatForm.className = 'absolute opacity-0'

  nicknameInput.id = 'nickname-input'
  nicknameInput.maxLength = 32
  nicknameInput.placeholder = 'nickname'
  nicknameInput.setAttribute('autocomplete', 'nickname')

  chatInput.id = 'chat-input'
  chatInput.maxLength = 120
  chatInput.placeholder = 'message...'
  chatInput.autocomplete = 'off'

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
  roomsButton.id = 'rooms-button'
  roomsButton.type = 'button'
  roomsButton.textContent = '🏘️'
  roomsButton.setAttribute('aria-label', 'rooms')

  supportLink.id = 'support-link'
  supportLink.href = 'https://buymeacoffee.com/stagas'
  supportLink.target = '_blank'
  supportLink.rel = 'noopener noreferrer'
  supportLink.textContent = '💊'

  intro.id = 'intro'
  introPanel.id = 'intro-panel'
  introLogo.id = 'intro-logo'
  introLogoTitle.id = 'intro-logo-title'
  introLogoSubtext.id = 'intro-logo-subtext'
  introNicknameInput.id = 'intro-nickname-input'
  introStart.id = 'intro-start'
  introGithub.id = 'intro-github'
  introGithubIcon.id = 'intro-github-icon'
  introTrack.id = 'intro-track'
  introBar.id = 'intro-bar'
  introProgress.id = 'intro-progress'
  introLogoTitle.textContent = 'hallucinate'
  introLogoSubtext.textContent = 'Massively Multiplayer Online Rave'
  introNicknameInput.maxLength = 32
  introNicknameInput.placeholder = 'nickname'
  introNicknameInput.setAttribute('autocomplete', 'nickname')
  introNicknameInput.setAttribute('enterkeyhint', 'done')
  introStart.type = 'button'
  introStart.textContent = 'enter'
  introGithub.href = 'https://github.com/stagas/hallucinate'
  introGithub.target = '_blank'
  introGithub.rel = 'noopener noreferrer'
  introGithub.setAttribute('aria-label', 'GitHub')
  introGithubIcon.src = '/github.svg'
  introGithubIcon.alt = ''
  introProgress.textContent = '0%'

  chatForm.append(nicknameInput, chatInput, chatSubmit)
  onlineCount.append(onlineSelf, onlineText)
  onlineIndicator.append(chatLog, onlineCount)
  introLogo.append(introLogoTitle, introLogoSubtext)
  introTrack.append(introBar)
  introPanel.append(introLogo, introTrack, introProgress, introNicknameInput, introStart)
  introGithub.append(introGithubIcon)
  intro.append(introPanel, introGithub)
  document.body.prepend(canvas, djVideo, chatForm, chatBubble, onlineIndicator, reactionButtons, roomsButton,
    supportLink, intro)

  return {
    canvas,
    djVideo,
    chatForm,
    nicknameInput,
    chatInput,
    chatBubble,
    chatLog,
    onlineCount,
    onlineIndicator,
    onlineSelf,
    onlineText,
    reactionButtons,
    roomsButton,
    supportLink,
    intro,
    introBar,
    introNicknameInput,
    introProgress,
    introStart,
  }
}
