import { sanitizeSpeechText } from '@/background/natural-tts-manager'

describe('Natural TTS text cleanup', () => {
  it('keeps prose while skipping formula and URL noise', () => {
    expect(
      sanitizeSpeechText(
        'We define $f(x)=x^2$ here. Read more at https://example.com/paper.'
      )
    ).toBe('We define here. Read more at')
  })

  it('supports long sentences within the browser API limit', () => {
    expect(sanitizeSpeechText('word '.repeat(10000)).length).toBeLessThanOrEqual(
      32768
    )
  })
})
