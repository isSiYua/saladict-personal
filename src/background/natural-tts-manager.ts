export interface NaturalSpeechRequest {
  text: string
  lang?: string
}

export interface NaturalSpeechResult {
  voiceName?: string
  lang: string
  remote: boolean
}

const naturalVoiceName = /natural|online|neural|enhanced|premium/i
const lowQualityVoiceName = /compact|espeak|festival/i

interface TTSApi {
  getVoices(callback: (voices: chrome.tts.TtsVoice[]) => void): void
  stop(): void
  speak(
    utterance: string,
    options: chrome.tts.SpeakOptions,
    callback: () => void
  ): void
}

interface WebSpeechApi {
  cancel(): void
  getVoices(): SpeechSynthesisVoice[]
  speak(utterance: SpeechSynthesisUtterance): void
  addEventListener?: (
    type: 'voiceschanged',
    listener: EventListenerOrEventListenerObject
  ) => void
  removeEventListener?: (
    type: 'voiceschanged',
    listener: EventListenerOrEventListenerObject
  ) => void
}

function ttsApi(): TTSApi | undefined {
  return (globalThis as any).chrome?.tts
}

function webSpeechApi(): WebSpeechApi | undefined {
  const speech = (globalThis as any).speechSynthesis as WebSpeechApi | undefined
  return speech && typeof speech.speak === 'function' ? speech : undefined
}

function utteranceConstructor():
  | (new (text?: string) => SpeechSynthesisUtterance)
  | undefined {
  return (globalThis as any).SpeechSynthesisUtterance
}

function detectSpeechLanguage(text: string): string {
  if (/[぀-ヿ]/.test(text)) return 'ja-JP'
  if (/[가-힯]/.test(text)) return 'ko-KR'
  if (/[㐀-鿿]/.test(text)) return 'zh-CN'
  return 'en-GB'
}

/** Keep prose intact while preventing TTS from reading formulas and URLs as noise. */
export function sanitizeSpeechText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, ' ')
    .replace(/\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32768)
}

function getVoices(): Promise<chrome.tts.TtsVoice[]> {
  return new Promise(resolve => {
    const tts = ttsApi()
    if (!tts?.getVoices) {
      resolve([])
      return
    }
    let settled = false
    const finish = (voices: chrome.tts.TtsVoice[]) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(voices || [])
    }
    const timer = setTimeout(() => finish([]), 1500)
    tts.getVoices(finish)
  })
}

function scoreVoice(voice: chrome.tts.TtsVoice, lang: string): number {
  const wanted = lang.toLowerCase()
  const actual = String(voice.lang || '').toLowerCase()
  const name = String(voice.voiceName || '')
  let score = 0

  if (actual === wanted) score += 120
  else if (actual.split('-')[0] === wanted.split('-')[0]) score += 80
  else score -= 100

  // Edge marks cloud-backed voices as remote. Prefer those and the well-known
  // Natural/Online/Neural labels, while retaining an OS voice fallback.
  if (voice.remote) score += 60
  if (naturalVoiceName.test(name)) score += 80
  if (/microsoft/i.test(name)) score += 15
  if (lowQualityVoiceName.test(name)) score -= 80
  return score
}

async function bestVoice(lang: string): Promise<chrome.tts.TtsVoice | null> {
  const voices = await getVoices()
  const language = lang.toLowerCase().split('-')[0]
  return (
    voices
      .filter(
        voice =>
          voice.voiceName &&
          String(voice.lang || '')
            .toLowerCase()
            .split('-')[0] === language
      )
      .sort((a, b) => scoreVoice(b, lang) - scoreVoice(a, lang))[0] || null
  )
}

function scoreWebSpeechVoice(
  voice: SpeechSynthesisVoice,
  lang: string
): number {
  const wanted = lang.toLowerCase()
  const actual = String(voice.lang || '').toLowerCase()
  const name = String(voice.name || '')
  let score = 0

  if (actual === wanted) score += 120
  else if (actual.split('-')[0] === wanted.split('-')[0]) score += 80
  else score -= 100

  if (!voice.localService) score += 60
  if (naturalVoiceName.test(name)) score += 80
  if (lowQualityVoiceName.test(name)) score -= 80
  if (voice.default) score += 5
  return score
}

function getWebSpeechVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise(resolve => {
    const speech = webSpeechApi()
    if (!speech) {
      resolve([])
      return
    }

    const initial = speech.getVoices()
    if (initial.length) {
      resolve(initial)
      return
    }

    let settled = false
    const finish = (voices: SpeechSynthesisVoice[]) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      speech.removeEventListener?.('voiceschanged', onVoicesChanged)
      resolve(voices)
    }
    const onVoicesChanged = () => {
      const voices = speech.getVoices()
      if (voices.length) finish(voices)
    }
    const timer = setTimeout(() => finish(speech.getVoices()), 1500)
    speech.addEventListener?.('voiceschanged', onVoicesChanged)
  })
}

async function bestWebSpeechVoice(
  lang: string
): Promise<SpeechSynthesisVoice | null> {
  const language = lang.toLowerCase().split('-')[0]
  return (
    (await getWebSpeechVoices())
      .filter(
        voice =>
          String(voice.lang || '')
            .toLowerCase()
            .split('-')[0] === language
      )
      .sort(
        (a, b) => scoreWebSpeechVoice(b, lang) - scoreWebSpeechVoice(a, lang)
      )[0] || null
  )
}

class NaturalTTSManager {
  stop(): void {
    ttsApi()?.stop()
    webSpeechApi()?.cancel()
  }

  async speak(request: NaturalSpeechRequest): Promise<NaturalSpeechResult> {
    const text = sanitizeSpeechText(request.text)
    if (!text) throw new Error('No speakable text')
    const lang = request.lang || detectSpeechLanguage(text)
    this.stop()

    const tts = ttsApi()
    if (!tts?.speak) {
      return this.speakWithWebSpeech(text, lang)
    }

    const voice = await bestVoice(lang)

    try {
      return await this.speakOnce(text, lang, voice)
    } catch (error) {
      // A cloud voice can temporarily disappear or reject a long utterance.
      // Retry once with Edge's default language voice instead of hanging.
      if (voice) return this.speakOnce(text, lang, null)
      throw error
    }
  }

  private async speakWithWebSpeech(
    text: string,
    lang: string
  ): Promise<NaturalSpeechResult> {
    const speech = webSpeechApi()
    const Utterance = utteranceConstructor()
    if (!speech || !Utterance) {
      throw new Error('The browser TTS API is unavailable')
    }

    const voice = await bestWebSpeechVoice(lang)
    return new Promise((resolve, reject) => {
      const utterance = new Utterance(text)
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(startTimer)
        if (error) reject(error)
        else {
          resolve({
            voiceName: voice?.name,
            lang,
            remote: voice ? !voice.localService : false
          })
        }
      }

      utterance.lang = lang
      utterance.rate = 0.96
      utterance.pitch = 1
      if (voice) utterance.voice = voice
      utterance.onstart = () => finish()
      utterance.onend = () => finish()
      utterance.onerror = event =>
        finish(new Error(String((event as any).error || 'TTS failed')))

      const startTimer = setTimeout(
        () => finish(new Error('TTS did not start')),
        8000
      )

      try {
        speech.cancel()
        speech.speak(utterance)
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private speakOnce(
    text: string,
    lang: string,
    voice: chrome.tts.TtsVoice | null
  ): Promise<NaturalSpeechResult> {
    const tts = ttsApi()!
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        if (error) reject(error)
        else {
          resolve({
            voiceName: voice?.voiceName,
            lang,
            remote: !!voice?.remote
          })
        }
      }

      const startTimer = setTimeout(() => finish(), 8000)
      const options: chrome.tts.SpeakOptions = {
        lang,
        enqueue: false,
        rate: 0.96,
        pitch: 1,
        desiredEventTypes: ['start', 'error'],
        onEvent: event => {
          if (event.type === 'start') {
            clearTimeout(startTimer)
            finish()
          } else if (event.type === 'error') {
            clearTimeout(startTimer)
            finish(new Error(event.errorMessage || 'TTS failed'))
          }
        }
      }
      if (voice?.voiceName) options.voiceName = voice.voiceName

      tts.speak(text, options, () => {
        const error = (globalThis as any).chrome?.runtime?.lastError
        if (error) {
          clearTimeout(startTimer)
          finish(new Error(error.message))
        }
      })
    })
  }
}

export const naturalTTSManager = new NaturalTTSManager()
