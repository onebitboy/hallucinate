export const reactionEmojis = ['❤️', '🤩', '🤮'] as const
// dprint-ignore-line
export const pickerEmojis = [
  '😀', '😃', '😄', '😁', '😆', '😂', '🤣', '🙂', '🙃', '😉', '😊', '😇',
  '😍', '🥰', '😘', '😋', '😛', '😜', '🤪', '🤩', '🥳', '😎', '🥺', '😭',
  '😤', '😡', '🤬', '😱', '😳', '🥶', '😈', '💀', '🤡', '👻', '🤖', '🤮',
  '❤️', '🩷', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '💕', '💖', '💘',
  '🔥', '✨', '💫', '⭐', '🌟', '💥', '💯', '💦', '🫧', '🎉', '🎊', '🎵',
  '👍', '👎', '👏', '🙌', '🫶', '🤝', '🙏', '💪', '🤘', '✌️', '👌', '🖕',
  '🌈', '☀️', '🌙', '⚡', '🍄', '🌴', '🌺', '🍭', '🍌', '🍕', '🍦', '🍨',
  '🍺', '🍻', '🍷', '☕', '💊', '🚀',
] as const

const emojiPattern =
  /^(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:\p{Emoji_Modifier}|\uFE0E|\uFE0F)*(?:\u200D[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:\p{Emoji_Modifier}|\uFE0E|\uFE0F)*)*|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3)$/u

export function emojiReactionFromMessage(text: string) {
  const body = text.replace(/^<[^>\n]+> /, '').trim()

  return emojiPattern.test(body) ? body : undefined
}
