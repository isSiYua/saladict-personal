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
    const pause = jest.fn()
    const resume = jest.fn()
    const speak = jest.fn((utterance: SpeechSynthesisUtterance) => {
      if (utterance.onstart) {
        utterance.onstart({ type: 'start' } as SpeechSynthesisEvent)
      }
    })

    class FakeUtterance {
      text: string

      constructor(text = '') {
        this.text = text
      }

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
        pause,
        resume,
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
      expect(naturalTTSManager.togglePause()).toBe('paused')
      expect(pause).toHaveBeenCalledTimes(1)
      expect(naturalTTSManager.togglePause()).toBe('speaking')
      expect(resume).toHaveBeenCalledTimes(1)
    } finally {
      naturalTTSManager.stop()
      restoreGlobal('chrome', originalChrome)
      restoreGlobal('speechSynthesis', originalSpeech)
      restoreGlobal('SpeechSynthesisUtterance', originalUtterance)
    }
  })

  it('pauses and resumes Edge chrome.tts without restarting the utterance', async () => {
    const originalChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome')
    const pause = jest.fn()
    const resume = jest.fn()
    const stop = jest.fn()
    let onEvent: ((event: chrome.tts.TtsEvent) => void) | undefined
    const speak = jest.fn(
      (
        _text: string,
        options: chrome.tts.SpeakOptions,
        callback: () => void
      ) => {
        onEvent = options.onEvent
        callback()
        options.onEvent?.({
          type: 'start',
          charIndex: 0
        } as chrome.tts.TtsEvent)
      }
    )

    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        runtime: {},
        tts: {
          getVoices: (callback: (voices: chrome.tts.TtsVoice[]) => void) =>
            callback([
              {
                voiceName: 'Microsoft Natural English',
                lang: 'en-GB',
                remote: true
              }
            ]),
          pause,
          resume,
          speak,
          stop
        }
      }
    })

    try {
      await expect(
        naturalTTSManager.speak({ text: 'A deliberately long sentence.' })
      ).resolves.toMatchObject({
        voiceName: 'Microsoft Natural English',
        lang: 'en-GB',
        remote: true
      })
      expect(speak).toHaveBeenCalledTimes(1)

      expect(naturalTTSManager.togglePause()).toBe('paused')
      expect(pause).toHaveBeenCalledTimes(1)
      expect(speak).toHaveBeenCalledTimes(1)

      expect(naturalTTSManager.togglePause()).toBe('speaking')
      expect(resume).toHaveBeenCalledTimes(1)
      expect(speak).toHaveBeenCalledTimes(1)

      onEvent?.({ type: 'end', charIndex: 31 } as chrome.tts.TtsEvent)
      expect(naturalTTSManager.getState()).toBe('idle')
    } finally {
      naturalTTSManager.stop()
      restoreGlobal('chrome', originalChrome)
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
