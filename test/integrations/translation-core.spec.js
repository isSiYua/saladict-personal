const {
  createLookupClient,
  isGoogleServiceErrorText,
  normalizeSelectionText,
  parseDictionaryEntries,
  parseGoogleChromeTranslation,
  parseGoogleMobileTranslation
} = require('../../integrations/shared/translation-core')

function response(options = {}) {
  return {
    ok: options.ok !== false,
    status: options.status == null ? 200 : options.status,
    json: jest.fn(async () => options.json),
    text: jest.fn(async () => options.text || '')
  }
}

describe('shared translation core', () => {
  test('normalizes selections without leaking layout whitespace', () => {
    expect(normalizeSelectionText('  move\n to   another  ')).toBe(
      'move to another'
    )
  })

  test('parses Google tuple response without language metadata', () => {
    expect(parseGoogleChromeTranslation([['另一个', 'en']])).toBe('另一个')
    expect(parseGoogleChromeTranslation(['移动', ['另一个', 'en']])).toBe(
      '移动 另一个'
    )
  })

  test('rejects Google error documents and parses mobile HTML', () => {
    const errorPage =
      '<html><div id="af-error-page">Error 500 (Server Error)</div></html>'
    expect(isGoogleServiceErrorText(errorPage)).toBe(true)
    expect(parseGoogleMobileTranslation(errorPage)).toBe('')
    expect(
      parseGoogleMobileTranslation(
        '<div class="result-container">另一个 &amp; 不同的</div>'
      )
    ).toBe('另一个 & 不同的')
  })

  test('falls back to mobile transport after an invalid primary response', async () => {
    const fetchImpl = jest.fn(async url =>
      url.includes('clients5')
        ? response({ json: { unexpected: true } })
        : response({ text: '<div class="result-container">你好</div>' })
    )
    const client = createLookupClient({ fetchImpl })
    const result = await client.lookup('hello', { includeDictionary: false })
    expect(result.translatedText).toBe('你好')
    expect(result.translationProvider).toBe('Google Mobile')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  test('parses phonetic, audio, and bounded definitions', () => {
    expect(
      parseDictionaryEntries([
        {
          phonetics: [{ text: '/test/', audio: 'https://audio.test/test.mp3' }],
          meanings: [
            {
              partOfSpeech: 'noun',
              definitions: [
                { definition: 'first' },
                { definition: 'second' },
                { definition: 'third' },
                { definition: 'not included' }
              ]
            }
          ]
        }
      ])
    ).toEqual({
      phonetic: '/test/',
      audio: 'https://audio.test/test.mp3',
      meanings: [
        { partOfSpeech: 'noun', definitions: ['first', 'second', 'third'] }
      ]
    })
  })

  test('caches the combined result and avoids repeated network calls', async () => {
    const fetchImpl = jest.fn(async url => {
      if (url.includes('dictionaryapi')) {
        return response({ json: [{ meanings: [] }] })
      }
      return response({ json: ['测试'] })
    })
    const client = createLookupClient({ fetchImpl, now: () => 100 })
    await client.lookup('test')
    await client.lookup('test')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(client.cacheSize).toBe(1)
  })
})
