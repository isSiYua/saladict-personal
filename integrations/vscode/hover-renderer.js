'use strict'

function escapeMarkdown(value) {
  return String(value || '').replace(/[\\`*_{}[\]()<>#+.!|~-]/g, '\\$&')
}

function commandLink(label, command, args) {
  const query = encodeURIComponent(JSON.stringify(args || []))
  return `[${label}](command:${command}?${query})`
}

function renderHoverMarkdown(result, options = {}) {
  const favorite = Boolean(options.favorite)
  const lines = [
    `### Saladict · ${escapeMarkdown(result.sourceText)}`,
    `${commandLink('$(unmute) 发音', 'saladict.speak', [
      result.sourceText
    ])} · ${commandLink(
      favorite ? '$(star-full) 已收藏' : '$(star-empty) 收藏',
      'saladict.toggleFavorite',
      [result.sourceText]
    )}`,
    '---'
  ]

  if (result.phonetic) lines.push(`*${escapeMarkdown(result.phonetic)}*`, '')
  if (result.translatedText) {
    lines.push('**翻译**', '', escapeMarkdown(result.translatedText), '')
  }
  if (result.translationError) {
    lines.push('_翻译服务暂时不可用，已显示可用的词典释义。_', '')
  }

  if (Array.isArray(result.meanings) && result.meanings.length) {
    lines.push('**词典**', '')
    for (const meaning of result.meanings) {
      const heading = meaning.partOfSpeech
        ? `*${escapeMarkdown(meaning.partOfSpeech)}*`
        : '*释义*'
      lines.push(heading)
      for (const definition of meaning.definitions || []) {
        lines.push(`- ${escapeMarkdown(definition)}`)
      }
      lines.push('')
    }
  }

  if (result.translationProvider) {
    lines.push(`_来源：${escapeMarkdown(result.translationProvider)}_`)
  }
  return lines.join('\n').trim()
}

function renderErrorMarkdown(error) {
  const message =
    error && error.code === 'SELECTION_TOO_LONG'
      ? '选中的内容太长，请缩短选区后重试。'
      : '暂时无法取得翻译，请检查网络后重新划选。'
  return `### Saladict\n\n$(warning) ${message}`
}

module.exports = {
  commandLink,
  escapeMarkdown,
  renderErrorMarkdown,
  renderHoverMarkdown
}
