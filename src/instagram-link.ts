export function createInstagramLink(label: string, id: string) {
  const link = document.createElement('a')
  const icon = document.createElement('img')

  link.href = instagramUrl(id)
  link.className = 'chat-instagram-link'
  link.title = `Instagram @${id}`
  icon.src = '/instagram.svg'
  icon.alt = ''
  link.append(icon, document.createTextNode(label))
  link.addEventListener('click', event => {
    event.preventDefault()
    openInstagramPopup(id)
  })

  return link
}

export function instagramUrl(id: string) {
  return `https://www.instagram.com/${encodeURIComponent(id)}/`
}

function openInstagramPopup(id: string) {
  const width = Math.min(520, Math.round(screen.availWidth * 0.86))
  const height = Math.min(720, Math.round(screen.availHeight * 0.86))
  const left = Math.round(screenX + Math.max(0, (outerWidth - width) / 2))
  const top = Math.round(screenY + Math.max(0, (outerHeight - height) / 2))
  const features = [
    'popup=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'toolbar=no',
    'menubar=no',
    'location=no',
    'status=no',
    'scrollbars=yes',
    'resizable=yes',
  ].join(',')

  window.open(instagramUrl(id), `instagram-${id}`, features)?.focus()
}
