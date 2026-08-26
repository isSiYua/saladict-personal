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

function ttsApi(): TTSApi | undefined {
  return (globalThis as any).chrome?.tts
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

class NaturalTTSManager {
  stop(): void {
    ttsApi()?.stop()
  }

  async speak(request: NaturalSpeechRequest): Promise<NaturalSpeechResult> {
    const text = sanitizeSpeechText(request.text)
    if (!text) throw new Error('No speakable text')
    const tts = ttsApi()
    if (!tts?.speak) {
      throw new Error('The browser TTS API is unavailable')
    }

    const lang = request.lang || detectSpeechLanguage(text)
    const voice = await bestVoice(lang)
    this.stop()

    try {
      return await this.speakOnce(text, lang, voice)
    } catch (error) {
      // A cloud voice can temporarily disappear or reject a long utterance.
      // Retry once with Edge's default language voice instead of hanging.
      if (voice) return this.speakOnce(text, lang, null)
      throw error
    }
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
