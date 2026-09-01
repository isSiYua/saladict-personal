const {
  escapeMarkdown,
  renderErrorMarkdown,
  renderHoverMarkdown
} = require('../../integrations/vscode/hover-renderer')

describe('VS Code hover renderer', () => {
  test('renders the compact Saladict surface with safe command links', () => {
    const output = renderHoverMarkdown(
      {
        sourceText: 'another',
        translatedText: '另一个',
        translationProvider: 'Google',
        translationError: '',
        phonetic: '/əˈnʌðə(r)/',
        meanings: [{ partOfSpeech: 'adjective', definitions: ['different'] }]
      },
      { favorite: false }
    )
    expect(output).toContain('Saladict · another')
    expect(output).toContain('command:saladict.speak?')
    expect(output).toContain('另一个')
    expect(output).toContain('different')
    expect(output).toContain('来源：Google')
  })

  test('escapes Markdown from external dictionary data', () => {
    expect(escapeMarkdown('[unsafe](command:evil)')).not.toContain(
      '[unsafe](command:evil)'
    )
  })

  test('uses a specific message for oversized selections', () => {
    expect(renderErrorMarkdown({ code: 'SELECTION_TOO_LONG' })).toContain(
      '选中的内容太长'
    )
  })
})
