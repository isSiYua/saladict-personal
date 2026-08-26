import {
  naturalTTSManager,
  sanitizeSpeechText
} from '@/background/natural-tts-manager'

describe('Natural TTS text cleanup', () => {
  it('keeps prose while skipping formula and URL noise', () => {
    expect(
      sanitizeSpeechText(
        'We define $f(x)=x^2$ here. Read more at https://example.com/paper.'
      )
    ).toBe('We define here. Read more at')
  })

  it('supports long sentences within the browser API limit', () => {
    expect(
      sanitizeSpeechText('word '.repeat(10000)).length
    ).toBeLessThanOrEqual(32768)
  })

  it('falls back to Web Speech when Firefox has no chrome.tts API', async () => {
    const originalChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome')
    const originalSpeech = Object.getOwnPropertyDescriptor(
      globalThis,
      'speechSynthesis'
    )
    const originalUtterance = Object.getOwnPropertyDescriptor(
      globalThis,
      'SpeechSynthesisUtterance'
    )
    const voice = {
      default: true,
      lang: 'en-GB',
      localService: false,
      name: 'Firefox Natural English',
      voiceURI: 'firefox-natural'
    } as SpeechSynthesisVoice
    const cancel = jest.fn()
    const speak = jest.fn((utterance: SpeechSynthesisUtterance) => {
      if (utterance.onstart) {
        utterance.onstart({ type: 'start' } as SpeechSynthesisEvent)
      }
    })

    class FakeUtterance {
      constructor(public text = '') {}
      lang = ''
      rate = 1
      pitch = 1
      voice: SpeechSynthesisVoice | null = null
      onstart:
        | ((this: SpeechSynthesisUtterance, ev: Event) => any)
        | null = null
      onend: ((this: SpeechSynthesisUtterance, ev: Event) => any) | null = null
      onerror:
        | ((
            this: SpeechSynthesisUtterance,
            ev: SpeechSynthesisErrorEvent
          ) => any)
        | null = null
    }

    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: undefined
    })
    Object.defineProperty(globalThis, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel,
        getVoices: () => [voice],
        speak
      }
    })
    Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: FakeUtterance
    })

    try {
      await expect(
        naturalTTSManager.speak({ text: 'Firefox speaks naturally.' })
      ).resolves.toEqual({
        voiceName: 'Firefox Natural English',
        lang: 'en-GB',
        remote: true
      })
      expect(speak).toHaveBeenCalledTimes(1)
      expect(cancel).toHaveBeenCalled()
    } finally {
      restoreGlobal('chrome', originalChrome)
      restoreGlobal('speechSynthesis', originalSpeech)
      restoreGlobal('SpeechSynthesisUtterance', originalUtterance)
    }
  })
})

function restoreGlobal(
  key: string,
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor) Object.defineProperty(globalThis, key, descriptor)
  else delete (globalThis as any)[key]
}
