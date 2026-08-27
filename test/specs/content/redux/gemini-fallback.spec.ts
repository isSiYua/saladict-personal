import { shouldFallbackToGemini } from '@/content/redux/epics/searchStart.epic'

describe('DeepL to Gemini runtime fallback', () => {
  const key = 'gemini-free-key'

  it.each([
    ['missing result', null],
    ['missing key result', { credentialError: 'missing' }],
    ['invalid key result', { credentialError: 'invalid' }],
    ['quota result', { credentialError: 'quota' }],
    ['empty translation', { trans: { paragraphs: ['   '] } }]
  ])('falls back for %s', (_name, result) => {
    expect(shouldFallbackToGemini('deepl', result as any, key)).toBe(true)
  })

  it('keeps a successful DeepL translation primary', () => {
    expect(
      shouldFallbackToGemini(
        'deepl',
        { trans: { paragraphs: ['机器学习很有用。'] } },
        key
      )
    ).toBe(false)
  })

  it('does not send a fallback request without a Gemini key', () => {
    expect(
      shouldFallbackToGemini('deepl', { credentialError: 'quota' }, '')
    ).toBe(false)
  })

  it('does not apply DeepL fallback rules to another translator', () => {
    expect(shouldFallbackToGemini('google', null, key)).toBe(false)
  })
})
